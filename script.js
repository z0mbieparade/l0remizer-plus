window.loremiscous =
  window.loremiscous ||
  (function() {
    const env = globalThis.browser || globalThis.chrome;
    var operations = [];
    // Set on each activation from the popup's selector lists. Every
    // replacement changes only elements inside onlySelector, when set, and
    // never elements inside skipSelector.
    let onlySelector = "";
    let skipSelector = "";
    // Set on each activation. Content outside these word counts keeps its
    // length whatever the multiplier, so labels and names stay realistic.
    // 0 means no limit.
    let minWordsToResize = 0;
    let maxWordsToResize = 0;

    /**
     * @param {number} wordCount Words in the text being replaced.
     * @returns {{lengthMultiplier?: number}} Replacer call options: 1x for
     *   content outside the word limits, else the replacer's own.
     */
    function lengthFor(wordCount) {
      return loremizerText.keepsLength(wordCount, minWordsToResize, maxWordsToResize)
        ? { lengthMultiplier: 1 }
        : {};
    }

    function addOperation(fn) {
      operations.push(fn);
    }

    /**
     * @param {Element | null} element
     * @returns {boolean} Whether the selector lists let `element` change.
     */
    function isInScope(element) {
      if (!element) {
        return false;
      }
      if (onlySelector && !element.closest(onlySelector)) {
        return false;
      }
      return !(skipSelector && element.closest(skipSelector));
    }

    /**
     * @param {string} selector
     * @returns {Element[]} Elements matching `selector` that may change.
     */
    function findElements(selector) {
      return [...document.querySelectorAll(selector)].filter(isInScope);
    }

    // Never reset, so no two placeholders on a page share a URL.
    let placeholderCount = 0;

    /**
     * Builds a placeholder image URL. Each call is unique: browsers reuse an
     * image already loaded under the same URL, so a repeated URL would show
     * the same picture for same-sized images and survive New replacements.
     *
     * @param {number} [width] Pixels; 0 or missing gives a 200px square.
     * @param {number} [height] Pixels.
     * @returns {string}
     * Side effects: advances placeholderCount.
     */
    function placeholderUrl(width, height) {
      const size = width && height ? `${width}/${height}` : "200";
      return `https://picsum.photos/${size}?random=${++placeholderCount}`;
    }

    function replaceImgs() {
      findElements("img").forEach(i => {
        const lastValue = i.src;
        addOperation(() => (i.src = lastValue));
        // Rendered size, else natural size; 0 for an image that never loaded.
        i.src = placeholderUrl(i.width, i.height);
      });
    }

    function handleIframes() {
      var iframes = findElements("iframe");
      iframes.forEach(iframe => {
        const lastValue = iframe.style.filter;
        addOperation(() => (iframe.style.filter = lastValue));
        iframe.style.filter = "blur(4px)";
      });
    }

    /**
     * Fills form fields with dummy values that match their names.
     *
     * @param {(text: string, call?: {lengthMultiplier?: number}) => string}
     *   replace From createTextReplacer; used for fields without a
     *   recognized name.
     * @returns {void}
     * Side effects: sets input and textarea values, which can fire page
     * handlers, and records an undo operation for each.
     */
    function handleFormInputs(replace) {
      var inputs = findElements("input, textarea");
      inputs.forEach(input => {
        const lastValue = input.value;
        addOperation(() => (input.value = lastValue));
        const inputName = input.name || "";
        if (inputName.match(/(first-name|firstname|first_name)/)) {
          input.value = "John";
        } else if (inputName.match(/(last-name|lastname|last_name)/)) {
          input.value = "Doe";
        } else if (inputName.match(/name/)) {
          input.value = "John Doe";
        } else if (input.type === "email" || inputName.match(/mail/)) {
          input.value = "johndoe@gmail.com";
        } else if (input.type === "tel" || inputName.match(/(phone|mobile)/)) {
          input.value = "0113246327846";
        } else {
          const value = input.value || "Lorem ipsum dolor";
          input.value = replace(value, lengthFor(loremizerText.countWords(value)));
        }
      });
    }

    function replaceBgImgs() {
      var tags = findElements("*");
      var numTags = tags.length;
      let computedStyles;
      for (var i = 0; i < numTags; i++) {
        const tag = tags[i];
        computedStyles = window.getComputedStyle(tag);
        if (computedStyles.backgroundImage !== "none") {
          const lastValue = computedStyles.backgroundImage;
          addOperation(() => (tag.style.backgroundImage = lastValue));
          tag.style.backgroundImage = `url(${placeholderUrl()})`;
        }
      }
    }

    function getTextNodesIn(elem, filterFn) {
      var textNodes = [];
      if (elem) {
        for (var nodes = elem.childNodes, i = nodes.length; i--; ) {
          var node = nodes[i],
            nodeType = node.nodeType;
          if (nodeType == 3) {
            if (!filterFn || filterFn(node, elem)) {
              textNodes.push(node);
            }
          } else if (
            node.tagName !== "SCRIPT" &&
            node.tagName !== "STYLE" &&
            (nodeType == 1 || nodeType == 9 || nodeType == 11)
          ) {
            textNodes = textNodes.concat(getTextNodesIn(node, filterFn));
          }
        }
      }
      return textNodes;
    }

    /**
     * Replaces every visible text node with same-shaped lorem text.
     *
     * @param {(text: string, call?: {lengthMultiplier?: number}) => string}
     *   replace From createTextReplacer.
     * @returns {void}
     * Side effects: rewrites text nodes, collapsing their whitespace, and
     * records an undo operation for each.
     */
    function replaceText(replace) {
      var nodes = getTextNodesIn(document.body).filter(
        n => n.nodeValue.match(/\S/) && isInScope(n.parentElement)
      );
      nodes.forEach(n => {
        const lastValue = n.nodeValue;
        addOperation(() => (n.nodeValue = lastValue));
        // Each text piece is counted on its own. Counting to the nearest
        // block grouped an inline label, such as a chat nick, with the long
        // text beside it, so the label resized. The cost: a sentence split
        // by a link or bold word is judged in parts.
        n.nodeValue = replace(
          n.nodeValue.replace(/\s+/g, " "),
          lengthFor(loremizerText.countWords(n.nodeValue))
        );
      });
    }

    function replaceTextWithScribble() {
      // font-family is inherited, so not matching a skipped element is not
      // enough: it would inherit the scribble font from its parent. Each
      // skipped element's own font is pinned inline, read before the
      // scribble style exists, and inline !important beats the stylesheet.
      if (skipSelector) {
        const pinned = [...document.querySelectorAll(skipSelector)].map(
          element => [element, getComputedStyle(element).fontFamily]
        );
        pinned.forEach(([element, fontFamily]) => {
          const lastValue = element.style.getPropertyValue("font-family");
          const lastPriority = element.style.getPropertyPriority("font-family");
          addOperation(() =>
            element.style.setProperty("font-family", lastValue, lastPriority)
          );
          element.style.setProperty("font-family", fontFamily, "important");
        });
      }
      // Descendants of a skipped element inherit its pinned font, or keep
      // their own, because this rule never matches them. Elements outside
      // onlySelector need no pinning: inheritance only flows inward.
      const scribbled =
        [
          onlySelector && `:is(:is(${onlySelector}), :is(${onlySelector}) *)`,
          skipSelector && `:not(:is(${skipSelector}), :is(${skipSelector}) *)`
        ].join("") || "*";
      const style = document.createElement("style");
      style.textContent = `
				@font-face {
					font-family: "Redacted Script";
					src: url("${env.runtime.getURL("fonts/redacted-script-regular.woff")}");
				}
				${scribbled}, ${scribbled}::after, ${scribbled}::before {
					font-family: 'Redacted Script'!important;
				}
			`;
      document.head.appendChild(style);
      addOperation(() => style.remove());
    }

    // Idle callbacks scheduled by apply that have not run yet. Undo cancels
    // them; otherwise one could run after undo and leave the page changed.
    let pending = [];
    let isActive = false;

    /**
     * Schedules one replacement for when the page is idle.
     *
     * @param {() => void} replacement
     * @returns {void}
     * Side effects: adds to `pending` until the callback runs.
     */
    function schedule(replacement) {
      const id = requestIdleCallback(() => {
        pending = pending.filter(other => other !== id);
        replacement();
      });
      pending.push(id);
    }

    /**
     * Restores everything apply changed, including replacements still
     * waiting to run.
     *
     * @returns {void}
     * Side effects: cancels pending callbacks and reverts the page.
     */
    function undo() {
      pending.forEach(cancelIdleCallback);
      pending = [];
      operations.forEach(op => op());
      operations = [];
      isActive = false;
    }

    /**
     * Applies loremizer to the page with a fresh replacer.
     *
     * @param {object} options The popup's settings, keyed by input name.
     * @returns {void}
     * Side effects: schedules each enabled replacement on idle callbacks.
     */
    function apply(options) {
      isActive = true;
      [onlySelector, skipSelector] = ["onlySelectors", "skipSelectors"].map(
        name =>
          loremizerText.parseSelectors(options[name] || "").selectors.join(", ")
      );
      // One replacer per activation, shared by page text and form fields,
      // so a name stays consistent everywhere on the page but differs from
      // the last screenshot.
      const replace = loremizerText.createTextReplacer({
        words: loremizerText.parseWords(options["customWords"] || ""),
        gapFill: options["gapFill"],
        lengthMultiplier: Number(options["textLengthMultiplier"])
      });
      minWordsToResize = Number(options["minWordsToResize"]) || 0;
      maxWordsToResize = Number(options["maxWordsToResize"]) || 0;
      if (options["replaceText"]) {
        schedule(() => replaceText(replace));
      }
      if (options["replaceTextWithScribble"]) {
        schedule(replaceTextWithScribble);
      }
      if (options["replaceImage"]) {
        schedule(replaceImgs);
      }
      if (options["replaceBgImage"]) {
        schedule(replaceBgImgs);
      }
      if (options["replaceIframe"]) {
        schedule(handleIframes);
      }
      // TODO: Replacing form control values can trigger unexpected behavior.
      if (options["replaceInput"]) {
        schedule(() => handleFormInputs(replace));
      }
    }

    /**
     * Applies loremizer to the page, or undoes it if already applied.
     *
     * @param {object} [options] The popup's settings, keyed by input name.
     *   Ignored when undoing.
     * @returns {void}
     * Side effects: see apply and undo.
     */
    function runLoremiscous(options) {
      if (isActive) {
        undo();
      } else {
        apply(options);
      }
    }

    /**
     * Swaps the page's replacements for a fresh random set, whether or not
     * loremizer is already applied.
     *
     * @param {object} options The popup's settings, keyed by input name.
     * @returns {void}
     * Side effects: see apply and undo.
     */
    runLoremiscous.reroll = options => {
      undo();
      apply(options);
    };
    return runLoremiscous;
  })();

// Firefox returns a script's last value to executeScript and rejects the call
// when that value is a function, as the assignment above would be.
undefined;
