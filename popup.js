// Must match default_title in manifest.json.
const TITLE_APPLY = "l0remizer+";
const TITLE_REMOVE = "Remove l0remizer+";

// Firefox exposes promise-returning APIs on `browser`; Chrome MV3 returns
// promises from `chrome`. Picking one avoids per-browser callback branches.
const ext = globalThis.browser || globalThis.chrome;

async function getCurrentTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * @param {number} tabId
 * @returns {Promise<string>} The tab's action title: TITLE_APPLY while
 *   loremizer is off in the tab, TITLE_REMOVE while it is on.
 */
function getIconTitle(tabId) {
  return ext.action.getTitle({ tabId });
}

/**
 * Runs loremizer in the tab, or undoes it if it is already active there.
 * The per-tab action title records which state the tab is in.
 *
 * @param {chrome.tabs.Tab} tab The active tab.
 * @returns {Promise<void>}
 * @throws When the browser refuses script injection on activation, e.g. on
 *   its own pages or extension stores. The tab stays off. On deactivation the
 *   tab is switched off even if the page refuses, so it can never get stuck.
 * Side effects: injects lorem.js and script.js, swaps the action icon and
 * title, toggles the popup UI.
 */
async function toggle(tab) {
  const target = { tabId: tab.id };
  const title = await getIconTitle(tab.id);
  if (title === TITLE_APPLY) {
    await ext.scripting.executeScript({
      target,
      files: ["lorem.js", "script.js"]
    });
    await ext.scripting.executeScript({
      target,
      func: settings => window.loremiscous(settings),
      args: [collectSettings()]
    });

    await ext.action.setIcon({ tabId: tab.id, path: "icons/on.png" });
    await ext.action.setTitle({ tabId: tab.id, title: TITLE_REMOVE });
    onActivation();
  } else {
    try {
      // loremiscous is gone if the tab navigated since activation.
      await ext.scripting.executeScript({
        target,
        func: () => window.loremiscous && window.loremiscous()
      });
    } catch (e) {
      // The tab navigated to a page that refuses scripts, so there is
      // nothing on it to undo. Switching off anyway keeps it from sticking.
      console.log("Nothing to undo on this page", e);
    }

    await ext.action.setIcon({ tabId: tab.id, path: "icons/off.png" });
    await ext.action.setTitle({ tabId: tab.id, title: TITLE_APPLY });
    onDeactivation();
  }
}

/**
 * Swaps the tab's replacements for a fresh random set, using the popup's
 * current settings, without a separate deactivate and activate.
 *
 * @param {chrome.tabs.Tab} tab The active tab.
 * @returns {Promise<void>}
 * @throws When the browser refuses script injection, e.g. on its own pages.
 * Side effects: injects lorem.js and script.js if needed, and rewrites the
 *   page's replacements.
 */
async function reroll(tab) {
  const target = { tabId: tab.id };
  // Injected again in case the tab navigated since activation.
  await ext.scripting.executeScript({ target, files: ["lorem.js", "script.js"] });
  await ext.scripting.executeScript({
    target,
    func: settings => window.loremiscous.reroll(settings),
    args: [collectSettings()]
  });
}

const CONTROL_BUTTONS = [activateBtn, deactivateBtn, rerollBtn];

/**
 * Runs a button's action on the active tab with every control locked.
 *
 * @param {HTMLButtonElement} button The button that was clicked.
 * @param {(tab: chrome.tabs.Tab) => Promise<void>} action
 * @returns {Promise<void>}
 * Side effects: disables the controls meanwhile, shows #errorMessage if the
 *   action fails, and moves focus to a visible control if the clicked one
 *   was hidden or disabled.
 */
async function runLocked(button, action) {
  // A second click while the first is injecting would loremize the page
  // twice, and undo would then restore the first pass's lorem text.
  CONTROL_BUTTONS.forEach(control => (control.disabled = true));
  errorMessage.hidden = true;
  try {
    await action(await getCurrentTab());
  } catch (e) {
    console.log("Couldn't run on this page", e);
    errorMessage.hidden = false;
  } finally {
    CONTROL_BUTTONS.forEach(control => (control.disabled = false));
    // Disabling drops focus, and ▶ and ⏸ swap places, so keyboard users
    // would otherwise land back at the top of the popup.
    if (document.activeElement === document.body || !document.activeElement) {
      const visible = CONTROL_BUTTONS.filter(control => control.offsetParent !== null);
      (visible.includes(button) ? button : visible[0])?.focus();
    }
  }
}
/**
 * Locks or unlocks the options. Settings only apply on activation, so they
 * are inert while active: dimmed, and unreachable by mouse or keyboard.
 *
 * @param {boolean} isActive
 * @returns {void}
 * Side effects: toggles body.is-active and `inert` on every .option-wrap.
 */
function setActive(isActive) {
  document.body.classList.toggle("is-active", isActive);
  document.querySelectorAll(".option-wrap").forEach(option => {
    option.inert = isActive;
  });
}
function onActivation() {
  setActive(true);
}
function onDeactivation() {
  setActive(false);
}

activateBtn.addEventListener("click", () => runLocked(activateBtn, toggle));
deactivateBtn.addEventListener("click", () => runLocked(deactivateBtn, toggle));
rerollBtn.addEventListener("click", () => runLocked(rerollBtn, reroll));
/**
 * Shows the text length slider's value beside it.
 *
 * @returns {void}
 * Side effects: sets #textLengthMultiplierValue's text.
 */
function updateLengthReadout() {
  textLengthMultiplierValue.textContent = `${textLengthMultiplierInput.value}x`;
}

textLengthMultiplierInput.addEventListener("input", updateLengthReadout);

/**
 * Warns when the word limits leave nothing to resize, since the length
 * multiplier would then silently do nothing.
 *
 * @returns {void}
 * Side effects: updates #wordLimitsError.
 */
function updateWordLimitsError() {
  // An empty or 0 "At most" is no limit, so it cannot conflict.
  const maxWords = Number(maxWordsInput.value);
  const conflict = maxWords > 0 && Number(minWordsInput.value) > maxWords;
  setLiveText(
    wordLimitsError,
    conflict ? "\u201cAt least\u201d is more than \u201cAt most\u201d, so no text will be resized." : ""
  );
}

minWordsInput.addEventListener("input", updateWordLimitsError);
maxWordsInput.addEventListener("input", updateWordLimitsError);
/**
 * Reads every setting in the popup.
 *
 * @returns {object} Values keyed by input name: booleans for checkboxes,
 *   strings for everything else, and the checked radio's value.
 */
function collectSettings() {
  return [
    ...document.querySelectorAll('input[type="checkbox"]'),
    ...document.querySelectorAll("[data-setting]"),
    ...document.querySelectorAll('input[type="radio"]:checked')
  ].reduce((settings, input) => {
    settings[input.name] = input.type === "checkbox" ? input.checked : input.value;
    return settings;
  }, {});
}

/**
 * Fills the popup's controls from saved settings.
 *
 * @param {object} settings Values keyed by input name. Checkboxes take
 *   booleans; radios select the option with the matching value.
 * @returns {void}
 * Side effects: changes control values, refreshes the gap message, and
 *   shows or hides #textSettings to match the restored toggles.
 */
function setUi(settings) {
  for (let name in settings) {
    const el = document.querySelector(`[name=${name}]`);
    // A setting saved by a version that had it, since removed.
    if (!el) {
      continue;
    }
    if (el.type === "checkbox") {
      el.checked = settings[name];
    } else if (el.type === "radio") {
      const option = document.querySelector(
        `[name=${name}][value="${CSS.escape(settings[name])}"]`
      );
      if (option) {
        option.checked = true;
      }
    } else {
      el.value = settings[name];
    }
  }
  updateLengthReadout();
  updateWordLimitsError();
  updateGapUi();
  updateTextSettingsVisibility();
}

const replaceTextInput = document.querySelector('input[name="replaceText"]');
const replaceInputInput = document.querySelector('input[name="replaceInput"]');

/**
 * Hides the text length and replacement words while nothing uses them.
 * Form fields share the page text's replacer, so either toggle needs them.
 *
 * @returns {void}
 * Side effects: shows or hides #textSettings.
 */
function updateTextSettingsVisibility() {
  textSettings.hidden = !replaceTextInput.checked && !replaceInputInput.checked;
}

replaceTextInput.addEventListener("change", updateTextSettingsVisibility);
replaceInputInput.addEventListener("change", updateTextSettingsVisibility);

/**
 * Sets a live region's text only when it changes. Some screen readers
 * announce a live region whenever it is written to, even with the same
 * text, so rewriting it on every keystroke would repeat it.
 *
 * @param {HTMLElement} region An aria-live element.
 * @param {string} text
 * @returns {void}
 * Side effects: may replace the region's text.
 */
function setLiveText(region, text) {
  if (region.textContent !== text) {
    region.textContent = text;
  }
}

/**
 * Shows which word lengths the pasted words are missing, and the choice of
 * how to fill them, only when some are missing.
 *
 * @returns {void}
 * Side effects: updates #gapMessage and shows or hides #gapFillFieldset.
 */
function updateGapUi() {
  const { parseWords, missingLengths, describeLengths } = loremizerText;
  const words = parseWords(customWordsInput.value);
  const missing = missingLengths(words);
  if (customWordsInput.value.trim() && !words.length) {
    setLiveText(gapMessage, "That text has no words, so lorem ipsum will be used.");
  } else if (missing.length) {
    setLiveText(gapMessage, `Your words have no ${describeLengths(missing)}-letter words.`);
  } else {
    setLiveText(gapMessage, "");
  }
  gapFillFieldset.hidden = !missing.length;
  updateGapExample(words);
}

/**
 * Shows what the selected gap option does, e.g. "username → netrunne".
 *
 * @param {string[]} words The parsed replacement words.
 * @returns {void}
 * Side effects: replaces the contents of #gapExample.
 */
function updateGapExample(words) {
  const gapFill = document.querySelector('input[name="gapFill"]:checked').value;
  const example = loremizerText.gapFillExample(words, gapFill);
  if (!example) {
    setLiveText(gapExample, "");
    return;
  }
  const hint = `. ${loremizerText.describeGapFill(example)}`;
  // Same reason as setLiveText, which cannot build the <code> elements.
  if (gapExample.textContent === `Example: ${example.source} → ${example.result}${hint}`) {
    return;
  }
  // textContent, not innerHTML: the result comes from pasted text.
  const source = document.createElement("code");
  source.textContent = example.source;
  const result = document.createElement("code");
  result.textContent = example.result;
  gapExample.replaceChildren("Example: ", source, " → ", result, hint);
}

customWordsInput.addEventListener("input", updateGapUi);
gapFillFieldset.addEventListener("change", () => {
  updateGapExample(loremizerText.parseWords(customWordsInput.value));
});

const SELECTOR_LISTS = [
  { input: onlySelectorsInput, error: onlySelectorsError },
  { input: skipSelectorsInput, error: skipSelectorsError }
];

/**
 * Shows which lines of a selector list are not valid CSS selectors.
 *
 * @param {{input: HTMLTextAreaElement, error: HTMLElement}} list
 * @returns {void}
 * Side effects: updates the list's error text.
 */
function updateSelectorError({ input, error }) {
  const { invalid } = loremizerText.parseSelectors(input.value);
  setLiveText(
    error,
    invalid.length
      ? `These aren't valid CSS selectors and will be ignored: ${invalid.join(", ")}. ` +
          "Escape symbols in class names with \\, as in .md\\:flex."
      : ""
  );
}

SELECTOR_LISTS.forEach(list => {
  list.input.addEventListener("input", () => updateSelectorError(list));
});

/**
 * @param {chrome.tabs.Tab} tab The active tab. Its url is readable because
 *   opening the popup grants activeTab.
 * @returns {string} The tab's hostname, or "" when its url is not
 *   readable, e.g. on a browser page. Those pages share one record.
 */
function siteOf(tab) {
  try {
    return new URL(tab.url).hostname;
  } catch (e) {
    return "";
  }
}

// Read from the manifest so a version bump happens in one place.
versionLabel.textContent = `v${ext.runtime.getManifest().version}`;

/**
 * Loads the active tab's site's settings into the popup, then saves every
 * later edit to that site.
 *
 * @returns {Promise<void>}
 * Side effects: names the site, fills every control, attaches the save
 *   listeners, and marks the popup active if loremizer is on in the tab.
 *   Leaves the popup inert until it is done.
 */
async function loadPopup() {
  const tab = await getCurrentTab();
  const title = await getIconTitle(tab.id);
  const site = siteOf(tab);
  siteLabel.textContent = site ? `Settings for ${site}` : "Settings for this page";
  try {
    setUi(loremizerText.readSiteSettings(site, key => localStorage.getItem(key)));
  } catch (e) {
    console.log("Couldn't restore this site's settings", e);
  }
  SELECTOR_LISTS.forEach(updateSelectorError);

  // Attached only now, after the site's record is read, so the popup's
  // defaults can never be saved over it.
  const save = () =>
    localStorage.setItem(
      loremizerText.SITE_SETTINGS_PREFIX + site,
      JSON.stringify(collectSettings())
    );
  document.addEventListener("input", save);
  document.addEventListener("change", save);

  if (title === TITLE_REMOVE) {
    onActivation();
  }
}

// Inert until the site's settings load: an edit or Activate click before
// then would be overwritten, or would apply the defaults instead.
document.body.inert = true;
loadPopup()
  .catch(e => console.log("Couldn't load this tab's settings", e))
  .finally(() => {
    document.body.inert = false;
  });
