// Wrapped in an IIFE because the popup injects this file on every activation;
// top-level `const`s would throw "already declared" on the second injection.
(function(root) {
  const WORDS = [
    "a", "e",
    "ad", "et", "id", "in", "ut",
    "aut", "est", "non", "qui", "rem", "sed", "sit", "vel",
    "amet", "anim", "aute", "duis", "eius", "elit", "enim", "esse", "iste",
    "iure", "modi", "nemo", "nisi", "odit", "quam", "quia", "quis", "sint",
    "sunt", "unde",
    "autem", "culpa", "dicta", "dolor", "error", "fugit", "illum", "ipsam",
    "ipsum", "irure", "lorem", "magna", "minim", "natus", "neque", "nihil",
    "nulla", "omnis", "porro", "sequi", "totam", "velit", "vitae",
    "beatae", "cillum", "dolore", "fugiat", "labore", "magnam", "mollit",
    "tempor", "veniam",
    "aliqua", "aliquam", "aliquip", "commodi", "commodo", "dolorem", "dolores",
    "eiusmod", "laboris", "laborum", "nostrud", "numquam", "officia", "quaerat",
    "ratione", "tempora", "ullamco",
    "corporis", "deserunt", "incidunt", "nesciunt", "occaecat", "pariatur",
    "proident", "quisquam", "suscipit", "voluptas",
    "consequat", "cupidatat", "excepteur", "explicabo", "inventore",
    "molestiae", "veritatis", "voluptate",
    "adipiscing", "architecto", "aspernatur", "doloremque", "incididunt",
    "laboriosam", "laudantium", "voluptatem",
    "accusantium", "consectetur", "consequatur",
    "consequuntur", "exercitation", "perspiciatis",
    "reprehenderit",
    "exercitationem"
  ];

  /**
   * Splits a word into letters, each keeping its combining marks, so
   * "नमस्ते" gives 4 letters and a cut never strands an accent.
   *
   * @param {string} word
   * @returns {string[]}
   */
  function splitLetters(word) {
    return word.match(/\p{L}\p{M}*/gu) || [];
  }

  /**
   * Splits text into characters as a reader sees them: each keeps its
   * combining marks, so "नमस्ते" is 4 characters, matching splitLetters.
   * Lengths for the length multiplier are counted this way.
   *
   * @param {string} text
   * @returns {string[]}
   */
  function splitChars(text) {
    return text.match(/\P{M}\p{M}*|\p{M}+/gsu) || [];
  }

  /**
   * Groups words by letter count.
   *
   * @param {string[]} words
   * @returns {string[][]} Sparse: index n lists every word with n letters.
   */
  function bucketByLength(words) {
    return words.reduce((buckets, word) => {
      const length = splitLetters(word).length;
      (buckets[length] = buckets[length] || []).push(word);
      return buckets;
    }, []);
  }

  const WORDS_BY_LENGTH = bucketByLength(WORDS);
  const MAX_WORD_LENGTH = WORDS_BY_LENGTH.length - 1;

  // Marks are included so "café" written with a combining accent stays one
  // word instead of splitting around the accent. parseWords matches the same.
  const WORD = /\p{L}[\p{L}\p{M}]*/gu;
  const TOKEN = new RegExp(`${WORD.source}|\\p{Nd}+`, "gu");
  const LETTER = /\p{L}/gu;
  const DIGIT = /^\p{Nd}$/u;

  /**
   * Counts the space-separated words in `text` that hold a letter or digit,
   * so "Order #00421 shipped" is 3 and a handle like "z0ylent" is 1.
   *
   * @param {string} text
   * @returns {number}
   */
  function countWords(text) {
    return text.split(/\s+/).filter(word => /[\p{L}\p{Nd}]/u.test(word)).length;
  }

  /**
   * Whether content keeps its length despite the length multiplier,
   * because its word count is outside the popup's limits. Both limits are
   * inclusive, so with an "at least 5" limit, 5 words resize.
   *
   * @param {number} wordCount Words in the content, from countWords.
   * @param {number} minWords Fewest words that resize. 0 is no limit.
   * @param {number} maxWords Most words that resize. 0 is no limit.
   * @returns {boolean}
   */
  function keepsLength(wordCount, minWords, maxWords) {
    return wordCount < minWords || (maxWords > 0 && wordCount > maxWords);
  }

  /**
   * Finds the zero of a digit's script, so "٧" gives "٠" and "７" gives "０".
   * Unicode guarantees every script's digits are contiguous runs of 0-9, so
   * the offset from the start of the run, modulo 10, is the digit's value.
   *
   * @param {string} digit One \p{Nd} character.
   * @returns {number} The code point of that script's zero.
   */
  function zeroOf(digit) {
    const codePoint = digit.codePointAt(0);
    let runStart = codePoint;
    while (DIGIT.test(String.fromCodePoint(runStart - 1))) {
      runStart--;
    }
    return codePoint - ((codePoint - runStart) % 10);
  }

  /**
   * Pulls the distinct words out of pasted text, so "Neon, NEON & chrome!"
   * gives ["neon", "chrome"].
   *
   * @param {string} text Any text.
   * @returns {string[]} Lowercase, in first-seen order. Empty when `text`
   *   has no letters.
   */
  function parseWords(text) {
    const words = text.normalize("NFC").toLowerCase().match(WORD);
    return [...new Set(words || [])];
  }

  /**
   * Returns the browser's own form of one CSS selector list, or null when
   * the text is not one. Parsing it as a rule, rather than with
   * querySelector, rejects text such as `[title="x` or `.a /*` that is only
   * valid because CSS closes it at the end, and would swallow whatever
   * selector is joined after it.
   *
   * @param {string} selector
   * @returns {string | null}
   */
  function normalizeSelector(selector) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.insertRule(`${selector} {}`);
      // At-rules such as "@media x" parse but have no selectorText.
      return sheet.cssRules[0].selectorText || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Escapes a class or ID name for use in a selector, as CSS.escape does.
   * Written out because Node, which runs the tests, has no CSS.escape.
   *
   * @param {string} name A raw name, such as "md:flex" or "w-[200px]".
   * @returns {string} Such as md\:flex or w-\[200px\].
   */
  function escapeName(name) {
    const chars = [...name];
    return chars
      .map((char, i) => {
        const code = char.codePointAt(0);
        const isDigit = code >= 0x30 && code <= 0x39;
        if (code === 0) {
          return "\uFFFD";
        }
        if (
          code <= 0x1f ||
          code === 0x7f ||
          (i === 0 && isDigit) ||
          (i === 1 && isDigit && chars[0] === "-")
        ) {
          return `\\${code.toString(16)} `;
        }
        if (i === 0 && char === "-" && chars.length === 1) {
          return "\\-";
        }
        if (code >= 0x80 || /[-_0-9A-Za-z]/.test(char)) {
          return char;
        }
        return `\\${char}`;
      })
      .join("");
  }

  /**
   * Reads a line as raw class and ID names, so a Tailwind class copied from
   * the page, such as ".md:space-x-2" or ".w-[200px]", becomes a selector
   * that matches it. A dot between two digits, or any "." or "#" inside
   * brackets, stays in the name, so ".space-y-0.5" and ".bg-[#1da1f2]" are
   * each one class.
   *
   * @param {string} line
   * @returns {string | null} The escaped selector, or null when the line is
   *   not only .class and #id parts.
   */
  function escapeNames(line) {
    if (!/^[.#]/.test(line) || /[\s,\\]/.test(line)) {
      return null;
    }
    const parts = [];
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "[" || char === "(") {
        depth++;
      } else if ((char === "]" || char === ")") && depth > 0) {
        depth--;
      }
      const isNameStart =
        depth === 0 &&
        (char === "." || char === "#") &&
        !(char === "." && /\d/.test(line[i - 1] || "") && /\d/.test(line[i + 1] || ""));
      if (isNameStart) {
        parts.push({ prefix: char, name: "" });
      } else {
        parts[parts.length - 1].name += char;
      }
    }
    if (parts.some(part => !part.name)) {
      return null;
    }
    return parts.map(part => part.prefix + escapeName(part.name)).join("");
  }

  /**
   * Reads a selector list: one CSS selector per line, blank lines ignored.
   * A line that is not valid CSS but is only .class and #id parts is
   * retried with its names escaped. A valid line keeps its CSS meaning, so
   * ".btn:hover" stays a hover selector.
   *
   * @param {string} text
   * @param {(selector: string) => string | null} [normalize] Tests inject a
   *   fake; the default needs a browser.
   * @returns {{selectors: string[], invalid: string[]}} Valid selectors in
   *   normalized form, safe to join with ", ", and the lines that are not.
   */
  function parseSelectors(text, normalize = normalizeSelector) {
    const selectors = [];
    const invalid = [];
    for (const line of text.split("\n")) {
      const selector = line.trim();
      if (!selector) {
        continue;
      }
      const escaped = escapeNames(selector);
      const normalized =
        normalize(selector) || (escaped !== null ? normalize(escaped) : null);
      if (normalized) {
        selectors.push(normalized);
      } else {
        invalid.push(selector);
      }
    }
    return { selectors, invalid };
  }

  /**
   * Lists the word lengths `words` has no word for, from 1 up to the longer
   * of its own longest word and the default list's longest. Page words of
   * those lengths are filled according to the `gapFill` option.
   *
   * @param {string[]} words Custom words. Empty means the default list.
   * @returns {number[]} Ascending. Empty for the default list.
   */
  function missingLengths(words) {
    const buckets = bucketByLength(words);
    const longest = Math.max(buckets.length - 1, MAX_WORD_LENGTH);
    const missing = [];
    for (let length = 1; words.length && length <= longest; length++) {
      if (!buckets[length]) {
        missing.push(length);
      }
    }
    return missing;
  }

  /**
   * Writes lengths as readable ranges, so [1, 2, 3, 7, 12] gives
   * "1–3, 7 or 12".
   *
   * @param {number[]} lengths Ascending, at least one.
   * @returns {string}
   */
  function describeLengths(lengths) {
    const ranges = [];
    for (const length of lengths) {
      const last = ranges[ranges.length - 1];
      if (last && last[1] === length - 1) {
        last[1] = length;
      } else {
        ranges.push([length, length]);
      }
    }
    const parts = ranges.map(([from, to]) =>
      from === to ? `${from}` : `${from}–${to}`
    );
    return parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`
      : parts[0];
  }

  const UPPERCASE = /^\p{Lu}$/u;

  /**
   * Creates a replacer that swaps words for lorem ipsum words and digits for
   * random digits, keeping punctuation, spacing, casing and token lengths.
   *
   * The replacer remembers every token it has seen. The same word or number
   * gets the same replacement each time, so a name repeated across the page
   * stays recognizable as one person. Make a new replacer per activation so
   * the mapping cannot be correlated across screenshots.
   *
   * @param {object} [options]
   * @param {number} [options.lengthMultiplier=1] Scales how much text each
   *   call returns, in characters. Below 1, whole words are dropped from the
   *   end; text whose first word alone is too long keeps just that word,
   *   shortened. Above 1, words sized like the text's own are added before
   *   its trailing punctuation. 0 returns "".
   * @param {() => number} [options.random=Math.random] Source of numbers in
   *   [0, 1). Tests inject a seeded one.
   * @param {string[]} [options.words=[]] Lowercase words to use instead of
   *   the default list, e.g. from parseWords. Empty means the default list.
   * @param {"bend" | "default" | "closest"} [options.gapFill="bend"] What to
   *   do for a length `words` has no word for. "bend" cuts a longer custom
   *   word to fit. "default" uses a default word of that length, and bends
   *   past the default list's longest. "closest" uses the nearest-length
   *   custom word, so text width can change. Unknown values act as "bend".
   * @param {(method: "default" | "closest" | "cut" | "joined") => void}
   *   [options.onGapFill] Told how each gap was filled: "cut" when a longer
   *   word is cut down, "joined" when a token needs several words run
   *   together. Lets the popup describe what happened without copying
   *   these rules.
   * @returns {(text: string, call?: {lengthMultiplier?: number}) => string}
   *   Replaces every token in `text`. `call.lengthMultiplier` overrides the
   *   replacer's for this text only, such as 1 to keep a short label's
   *   length, while sharing the same mapping. Updates the replacer's
   *   internal mapping and throws nothing.
   */
  function createTextReplacer({
    lengthMultiplier = 1,
    random = Math.random,
    words = [],
    gapFill = "bend",
    onGapFill = () => {}
  } = {}) {
    const replacements = new Map();
    const usedWords = new Set();
    const buckets = words.length ? bucketByLength(words) : WORDS_BY_LENGTH;
    const longest = buckets.length - 1;
    // Longer tokens, such as hashes, are built from run-together words of at
    // most this length.
    const chunkLength =
      gapFill === "default" ? Math.max(longest, MAX_WORD_LENGTH) : longest;

    /**
     * Picks a word from `bucket`. Words not yet handed out are preferred, so
     * different names map to different words while the list lasts.
     *
     * @param {string[]} bucket Non-empty.
     * @returns {string} Records the word in `usedWords`.
     */
    function pickFrom(bucket) {
      const unused = bucket.filter(word => !usedWords.has(word));
      const pool = unused.length ? unused : bucket;
      const word = pool[Math.floor(random() * pool.length)];
      usedWords.add(word);
      return word;
    }

    /**
     * Finds the bucket nearest to `length`, preferring the shorter on a tie
     * so text does not grow.
     *
     * @param {number} length Between 1 and chunkLength.
     * @returns {string[]}
     */
    function closestBucket(length) {
      for (let distance = 1; ; distance++) {
        const bucket = buckets[length - distance] || buckets[length + distance];
        if (bucket) {
          return bucket;
        }
      }
    }

    /**
     * Picks a word for `length` letters, filling gaps in the list per
     * `gapFill`.
     *
     * @param {number} length Between 1 and chunkLength.
     * @returns {string[]} The word's letters. Exactly `length` of them,
     *   except with "closest".
     */
    function pickWord(length) {
      if (buckets[length]) {
        return splitLetters(pickFrom(buckets[length]));
      }
      if (gapFill === "default" && WORDS_BY_LENGTH[length]) {
        onGapFill("default");
        return splitLetters(pickFrom(WORDS_BY_LENGTH[length]));
      }
      if (gapFill === "closest") {
        onGapFill("closest");
        return splitLetters(pickFrom(closestBucket(length)));
      }
      // A longer word always exists: length never exceeds chunkLength, and
      // in "default" mode every length up to the default longest is covered.
      let longer = length + 1;
      while (!buckets[longer]) {
        longer++;
      }
      onGapFill("cut");
      return splitLetters(pickFrom(buckets[longer])).slice(0, length);
    }

    /**
     * Builds a lowercase string of `length` letters. Lengths beyond
     * chunkLength, such as hashes and tokens, become run-together words.
     *
     * @param {number} length Any non-negative integer.
     * @returns {string} Exactly `length` letters, except with "closest".
     */
    function makeLetters(length) {
      // Counts down the source length, not the output, so a "closest" word
      // shorter than its chunk is not topped up with a second word.
      const letters = [];
      if (length > chunkLength) {
        onGapFill("joined");
      }
      for (let remaining = length; remaining > 0; ) {
        const chunk = Math.min(remaining, chunkLength);
        letters.push(...pickWord(chunk));
        remaining -= chunk;
      }
      return letters.join("");
    }

    /**
     * Builds `length` random digits in the same script as `digits`. Leading
     * zeros are kept, and the first non-zero digit stays non-zero, so "007"
     * stays "00x" and "42" never turns into "07".
     *
     * @param {string} digits The original digits, in any script.
     * @param {number} length Any non-negative integer.
     * @returns {string}
     */
    function makeDigits(digits, length) {
      const source = [...digits];
      const zeros = source.map(zeroOf);
      const values = source.map((digit, i) => digit.codePointAt(0) - zeros[i]);
      const firstNonZero = values.findIndex(value => value !== 0);
      let result = "";
      for (let i = 0; i < length; i++) {
        const zero = zeros[Math.min(i, zeros.length - 1)];
        let value;
        if (firstNonZero === -1 || i < firstNonZero) {
          value = 0;
        } else {
          const lowest = i === firstNonZero ? 1 : 0;
          value = Math.floor(lowest + random() * (10 - lowest));
        }
        result += String.fromCodePoint(zero + value);
      }
      return result;
    }

    /**
     * Copies the per-letter casing of `source` onto `letters`, so "UserName"
     * comes out as "LoreMips". Letters beyond the end of `source` are
     * uppercase only when the whole source is.
     *
     * @param {string[]} source The original letters.
     * @param {string} letters Lowercase replacement letters.
     * @returns {string}
     */
    function matchCase(source, letters) {
      const isUpper = source.map(letter => UPPERCASE.test(letter));
      const restIsUpper = source.length > 1 && isUpper.every(Boolean);
      return splitLetters(letters)
        .map((letter, i) =>
          (i < source.length ? isUpper[i] : restIsUpper)
            ? letter.toUpperCase()
            : letter
        )
        .join("");
    }

    /**
     * Returns the replacement for one token, reusing an earlier one if the
     * token was seen before at the same length.
     *
     * @param {string} token A run of letters or a run of digits.
     * @param {number} [length] Letters or digits wanted. Defaults to the
     *   token's own, which keeps the page's shape.
     * @returns {string}
     */
    function replaceToken(token, length) {
      const letters = token.match(LETTER);
      const sourceLength = letters ? letters.length : [...token].length;
      // Lowercase key so "Alice" and "alice" map to the same word. A
      // shortened token gets its own key so it is consistent too.
      let key = letters ? token.toLowerCase() : token;
      if (length === undefined) {
        length = sourceLength;
      } else if (length !== sourceLength) {
        key += `\u0000${length}`;
      }
      if (!replacements.has(key)) {
        replacements.set(
          key,
          letters ? makeLetters(length) : makeDigits(token, length)
        );
      }
      const replacement = replacements.get(key);
      return letters ? matchCase(letters, replacement) : replacement;
    }

    /**
     * Cuts replaced text to about `target` characters at a word boundary, so
     * the words that remain keep their size. A first word that alone is too
     * long is shortened by shortenWord instead of being dropped.
     *
     * @param {{token: string, start: number, end: number}[]} pieces Replaced
     *   tokens, in order, with their position in `replaced`. At least one.
     * @param {string[]} replaced The replaced text's characters.
     * @param {number} target Characters wanted, below replaced.length.
     * @returns {string}
     */
    function shrink(pieces, replaced, target) {
      // Words are space-separated, as in countWords, so a handle such as
      // "z0ylent" or "user_name" is one word and is never cut in two.
      const wordEnds = pieces.filter(
        (piece, i) =>
          i === pieces.length - 1 ||
          /\s/u.test(replaced.slice(piece.end, pieces[i + 1].start).join(""))
      );
      const firstWordEnd = wordEnds[0].end;
      if (firstWordEnd > target) {
        return shortenWord(
          pieces.filter(piece => piece.end <= firstWordEnd),
          replaced,
          firstWordEnd - target
        );
      }
      // Closest word end to the target; the shorter one on a tie.
      const best = wordEnds.reduce((best, piece) =>
        Math.abs(piece.end - target) < Math.abs(best.end - target) ? piece : best
      );
      return replaced.slice(0, best.end).join("");
    }

    /**
     * Shortens a word's pieces, longest first, one character at a time, so
     * "z0ylent" keeps its letters-digit-letters shape as something like
     * "a0ad". Each piece keeps at least one character, so a word made of
     * many one-character pieces, like "a1b2c3", may not shrink at all.
     *
     * @param {{token: string, start: number, end: number}[]} word The
     *   word's pieces, in order. At least one.
     * @param {string[]} replaced The replaced text's characters.
     * @param {number} overshoot Characters to remove.
     * @returns {string} Everything up to the end of the word.
     * Side effects: shortened pieces get their own entries in the
     *   replacer's mapping, through replaceToken.
     */
    function shortenWord(word, replaced, overshoot) {
      const original = word.map(piece => piece.end - piece.start);
      // Lowering every piece to at most `cap` removes this many characters.
      const removedAt = cap =>
        original.reduce((sum, length) => sum + Math.max(0, length - cap), 0);
      // Smallest cap that removes no more than the overshoot. Found by
      // binary search, not by trimming one character at a time, which took
      // seconds on long unbroken text such as a data URI.
      let low = 1;
      let high = original.reduce((max, length) => Math.max(max, length), 1);
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (removedAt(middle) <= overshoot) {
          high = middle;
        } else {
          low = middle + 1;
        }
      }
      const cap = low;
      const lengths = original.map(length => Math.min(length, cap));
      // The cap removes slightly too little; take one more from the first
      // pieces at the cap, as trimming the longest first would.
      let left = cap > 1 ? overshoot - removedAt(cap) : 0;
      for (let i = 0; left > 0 && i < lengths.length; i++) {
        if (lengths[i] === cap) {
          lengths[i]--;
          left--;
        }
      }
      let text = "";
      let position = 0;
      word.forEach((piece, i) => {
        text += replaced.slice(position, piece.start).join("");
        text +=
          lengths[i] === piece.end - piece.start
            ? replaced.slice(piece.start, piece.end).join("")
            : replaceToken(piece.token, lengths[i]);
        position = piece.end;
      });
      return text;
    }

    /**
     * Adds words to replaced text until it is `target` characters long. The
     * words are sized like the text's own and go before its trailing
     * punctuation, so "thanks John!" grows to "dolor modi sit amet!".
     *
     * @param {number[]} sourceLetterCounts Letter count of each word in the
     *   original text. Text without words is returned unchanged.
     * @param {string[]} replaced The replaced text's characters.
     * @param {number} lastTokenEnd Where the trailing punctuation starts.
     * @param {number} target Characters wanted, above replaced.length.
     * @param {boolean} isUpper Whether added words should be uppercase.
     * @returns {string}
     */
    function grow(sourceLetterCounts, replaced, lastTokenEnd, target, isUpper) {
      const added = [];
      let remaining = target - replaced.length;
      // Each added word needs a space and at least one letter.
      while (sourceLetterCounts.length && remaining >= 2) {
        let length =
          sourceLetterCounts[Math.floor(random() * sourceLetterCounts.length)];
        // Size the last word to land exactly on the target rather than leave
        // a gap too small for another word.
        if (remaining - (length + 1) < 2) {
          length = remaining - 1;
        }
        const word = makeLetters(length);
        added.push(isUpper ? word.toUpperCase() : word);
        remaining -= splitLetters(word).length + 1;
      }
      if (!added.length) {
        return replaced.join("");
      }
      return (
        replaced.slice(0, lastTokenEnd).join("") +
        " " +
        added.join(" ") +
        replaced.slice(lastTokenEnd).join("")
      );
    }

    return (text, { lengthMultiplier: multiplier = lengthMultiplier } = {}) => {
      const pieces = [];
      const sourceLetterCounts = [];
      const replaced = [];
      let sourceIndex = 0;
      for (const match of text.matchAll(TOKEN)) {
        replaced.push(...splitChars(text.slice(sourceIndex, match.index)));
        const replacement = splitChars(replaceToken(match[0]));
        pieces.push({
          token: match[0],
          start: replaced.length,
          end: replaced.length + replacement.length
        });
        replaced.push(...replacement);
        const letters = match[0].match(LETTER);
        if (letters) {
          sourceLetterCounts.push(letters.length);
        }
        sourceIndex = match.index + match[0].length;
      }
      replaced.push(...splitChars(text.slice(sourceIndex)));

      const target = Math.round(splitChars(text).length * multiplier);
      if (target === 0) {
        return "";
      }
      // At 1x the text keeps its shape, even where "closest" changed it.
      if (!pieces.length || multiplier === 1 || target === replaced.length) {
        return replaced.join("");
      }
      if (target < replaced.length) {
        return shrink(pieces, replaced, target);
      }
      const sourceLetters = text.match(LETTER) || [];
      const isUpper =
        sourceLetters.length > 1 &&
        sourceLetters.every(letter => UPPERCASE.test(letter));
      return grow(
        sourceLetterCounts,
        replaced,
        pieces[pieces.length - 1].end,
        target,
        isUpper
      );
    };
  }

  // A familiar word for each length, so the popup's example reads like a
  // real page. Index n - 1 holds the n-letter word.
  const EXAMPLE_WORDS = [
    "a", "to", "the", "name", "email", "street", "account", "username",
    "passwords", "newsletter", "information", "subscription",
    "configuration", "administration"
  ];

  /**
   * Shows what `gapFill` does with `words`, using a word of a length they
   * are missing, such as "username" becoming "netrunne" with "bend".
   *
   * @param {string[]} words Custom words, e.g. from parseWords.
   * @param {"bend" | "default" | "closest"} gapFill
   * @returns {{source: string, result: string,
   *   method: "default" | "closest" | "cut" | "joined"} | null}
   *   `method` is how the replacer reported filling the gap; see
   *   createTextReplacer's onGapFill. Null when `words`
   *   has no gaps to fill. The same inputs always give the same result, so
   *   switching options does not reshuffle the example.
   */
  function gapFillExample(words, gapFill) {
    const missing = missingLengths(words);
    if (!missing.length) {
      return null;
    }
    // Closest to 6 letters, a typical word; the shorter one on a tie.
    const length = missing.reduce((best, candidate) =>
      Math.abs(candidate - 6) < Math.abs(best - 6) ? candidate : best
    );
    const source = EXAMPLE_WORDS[length - 1] || "x".repeat(length);
    const methods = new Set();
    const replace = createTextReplacer({
      words,
      gapFill,
      random: () => 0,
      onGapFill: method => methods.add(method)
    });
    const result = replace(source);
    // Joining is the step a reader most needs explained; otherwise there is
    // only one way the single gap was filled.
    const method = methods.has("joined") ? "joined" : [...methods][0];
    return { source, result, method };
  }

  const GAP_FILL_SOURCES = {
    default: "Borrowed from the lorem ipsum list.",
    cut: "Cut from a longer word in your text.",
    closest: "The closest-length word in your text.",
    joined: "Shorter words joined together, since no word is long enough."
  };

  /**
   * Explains how a gap-fill example was made and what it does to width.
   * The width part comes from the example itself, so it is true however
   * the gap was filled.
   *
   * @param {{source: string, result: string,
   *   method: "default" | "closest" | "cut" | "joined"}} example From
   *   gapFillExample.
   * @returns {string} Such as "The closest-length word in your text. 1
   *   letter shorter, so text width changes."
   */
  function describeGapFill({ source, result, method }) {
    // Letters, not code points, as everywhere else: "नमस्ते" is 4 letters.
    const lengthChange = splitLetters(result).length - splitLetters(source).length;
    const letters = Math.abs(lengthChange) === 1 ? "letter" : "letters";
    const direction = lengthChange < 0 ? "shorter" : "longer";
    const width = lengthChange
      ? `${Math.abs(lengthChange)} ${letters} ${direction}, so text width changes.`
      : "Text width stays the same.";
    return [GAP_FILL_SOURCES[method], width].filter(Boolean).join(" ");
  }

  // Every setting is remembered per site: class names and the right amount
  // of text differ from site to site.
  const SITE_SETTINGS_PREFIX = "loremizerSite:";

  /**
   * Reads a site's saved popup settings. A site without a record starts
   * from what earlier versions saved, so nothing is lost: replacement words
   * were global, and selector lists were already per site.
   *
   * @param {string} site A hostname, or "" for pages without one.
   * @param {(key: string) => string | null} getItem Reads storage, such as
   *   localStorage.getItem. Passed in so tests need no browser.
   * @returns {object} Values keyed by input name. Settings never saved are
   *   left out, so the popup keeps its defaults for them.
   * @throws {SyntaxError} When the site's own record is not valid JSON.
   */
  function readSiteSettings(site, getItem) {
    const saved = getItem(SITE_SETTINGS_PREFIX + site);
    if (saved) {
      return JSON.parse(saved);
    }
    const settings = {};
    // Parsed on its own so a corrupt global record cannot cost this site
    // its lists, which the first save would then make permanent.
    try {
      const { customWords, gapFill } = JSON.parse(getItem("loremizerWordSettings")) || {};
      Object.assign(
        settings,
        customWords !== undefined && { customWords },
        gapFill !== undefined && { gapFill }
      );
    } catch (e) {
      // Fall back to the popup's default words.
    }
    for (const [name, prefix] of [["onlySelectors", "loremizerOnly:"], ["skipSelectors", "loremizerSkip:"]]) {
      const list = getItem(prefix + site);
      if (list !== null) {
        settings[name] = list;
      }
    }
    return settings;
  }

  const api = {
    createTextReplacer,
    parseWords,
    parseSelectors,
    escapeNames,
    missingLengths,
    describeLengths,
    gapFillExample,
    describeGapFill,
    readSiteSettings,
    SITE_SETTINGS_PREFIX,
    countWords,
    keepsLength,
    WORDS_BY_LENGTH
  };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.loremizerText = api;
  }
})(globalThis);
