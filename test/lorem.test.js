const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTextReplacer,
  parseWords,
  parseSelectors,
  escapeNames,
  missingLengths,
  describeLengths,
  gapFillExample,
  describeGapFill,
  readSiteSettings,
  countWords,
  keepsLength,
  WORDS_BY_LENGTH
} = require("../lorem.js");

/**
 * Deterministic stand-in for Math.random so failures reproduce.
 *
 * @param {number} seed Any 32-bit integer.
 * @returns {() => number} Returns numbers in [0, 1).
 */
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const replacer = options =>
  createTextReplacer({ random: seededRandom(1), ...options });

test("every word length up to the longest has a word", () => {
  // makeLetters relies on this to fill any gap without an infinite loop.
  for (let length = 1; length < WORDS_BY_LENGTH.length; length++) {
    assert.ok(WORDS_BY_LENGTH[length], `no word of length ${length}`);
  }
});

test("keeps symbols and replaces each word with one of the same length", () => {
  const output = replacer()("@username");
  assert.match(output, /^@[a-z]{8}$/);
  assert.notEqual(output, "@username");
  assert.ok(WORDS_BY_LENGTH[8].includes(output.slice(1)));
});

test("keeps the text's shape around punctuation and spacing", () => {
  const output = replacer()("jane.doe@acme.io, (555) 010-2299!");
  assert.match(output, /^[a-z]{4}\.[a-z]{3}@[a-z]{4}\.[a-z]{2}, \(\d{3}\) 0\d{2}-\d{4}!$/);
});

test("keeps per-letter casing", () => {
  const output = replacer()("John SMITH userName");
  assert.match(output, /^[A-Z][a-z]{3} [A-Z]{5} [a-z]{4}[A-Z][a-z]{3}$/);
});

test("maps the same word to the same replacement regardless of case", () => {
  const replace = replacer();
  const [first, second, third] = replace("alice Alice ALICE").split(" ");
  assert.equal(second, first[0].toUpperCase() + first.slice(1));
  assert.equal(third, first.toUpperCase());
  assert.equal(replace("alice"), first);
});

test("gives different words different replacements while words remain", () => {
  // Eight names fill the whole 3-letter list; random picks would collide.
  const names = ["amy", "bob", "cal", "dan", "eve", "fay", "gus", "hal"];
  const output = replacer()(names.join(" "));
  assert.equal(new Set(output.split(" ")).size, names.length);
});

test("treats accented letters as part of the word", () => {
  // "Müller" precomposed, "café" with a combining acute accent.
  const output = replacer()("Müller café");
  assert.match(output, /^[A-Z][a-z]{5} [a-z]{4}$/);
});

test("builds words longer than any in the list", () => {
  const output = replacer()("a".repeat(40));
  assert.match(output, /^[a-z]{40}$/);
});

test("keeps digit count, zero and leading zeros", () => {
  const output = replacer()("0 items, order #00421, 1984");
  assert.match(output, /^0 [a-z]{5}, [a-z]{5} #00[1-9]\d\d, [1-9]\d{3}$/);
});

/**
 * Replaces `text` at 1x and at `multiplier` with identically seeded
 * replacers, so the two outputs can be compared word for word.
 *
 * @param {string} text
 * @param {number} multiplier
 * @returns {{full: string, scaled: string}}
 */
function atBothLengths(text, multiplier) {
  return {
    full: replacer()(text),
    scaled: replacer({ lengthMultiplier: multiplier })(text)
  };
}

test("below 1x drops whole words from the end instead of shrinking each", () => {
  // 5 words, 36 characters; 0.5x aims for 18.
  const { full, scaled } = atBothLengths("Please confirm your shipping address", 0.5);
  assert.ok(full.startsWith(scaled), `${scaled} is not a prefix of ${full}`);
  assert.match(scaled, /^[A-Z][a-z]+( [a-z]+)*$/);
  assert.ok(Math.abs(scaled.length - 18) <= 4, scaled);
});

test("below 1x cuts at the word end closest to the target", () => {
  // Word ends at 6, 9, 12 and 22 characters; 0.5x aims for 11.
  const { full, scaled } = atBothLengths("Signed in as @username", 0.5);
  assert.equal(scaled, full.slice(0, 12));
});

test("below 1x prefers the shorter cut on a tie", () => {
  // Word ends at 3 and 7 characters; 8 × 0.625 aims for 5, 2 from each.
  assert.match(replacer({ lengthMultiplier: 0.625 })("abc def!"), /^[a-z]{3}$/);
});

test("below 1x shortens a lone word that cannot fit", () => {
  assert.match(replacer({ lengthMultiplier: 0.5 })("Settings"), /^[A-Z][a-z]{3}$/);
  assert.match(replacer({ lengthMultiplier: 0.5 })("@username"), /^@[a-z]{4}$/);
});

test("a shortened word maps consistently too", () => {
  const replace = replacer({ lengthMultiplier: 0.5 });
  const first = replace("Settings");
  assert.equal(replace("settings"), first.toLowerCase());
});

test("above 1x adds words before trailing punctuation", () => {
  const { full, scaled } = atBothLengths("thanks John!", 2);
  assert.equal(scaled.length, 24);
  assert.ok(scaled.startsWith(full.slice(0, -1) + " "), scaled);
  assert.match(scaled, /^[a-z]{6} [A-Z][a-z]{3}( [a-z]+)+!$/);
});

test("above 1x keeps uppercase text uppercase", () => {
  assert.match(replacer({ lengthMultiplier: 2 })("HELLO WORLD"), /^[A-Z ]{22}$/);
});

test("above 1x leaves text without words alone", () => {
  assert.match(replacer({ lengthMultiplier: 2 })("$1,299"), /^\$[1-9],\d{3}$/);
});

test("0x empties the text", () => {
  assert.equal(replacer({ lengthMultiplier: 0 })("Hello, 12!"), "");
});

test("replaces digits in other scripts with digits in the same script", () => {
  const output = replacer()("٠٩١٢ ０９０ ۹۱");
  assert.match(output, /^٠[١-٩][٠-٩]{2} ０[１-９][０-９] [۱-۹][۰-۹]$/);
});

test("parses distinct lowercase words from pasted text", () => {
  assert.deepEqual(parseWords("Neon, NEON & chrome! 2077"), ["neon", "chrome"]);
  assert.deepEqual(parseWords("123 --"), []);
});

test("lists the lengths custom words are missing", () => {
  assert.deepEqual(
    missingLengths(["ice", "neon", "chrome", "netrunner"]),
    [1, 2, 5, 7, 8, 10, 11, 12, 13, 14]
  );
  assert.deepEqual(missingLengths([]), []);
});

test("describes lengths as ranges", () => {
  assert.equal(describeLengths([1, 2, 3, 7, 12]), "1–3, 7 or 12");
  assert.equal(describeLengths([4]), "4");
});

test("uses only custom words for lengths they cover", () => {
  const words = ["neon", "data", "grid", "chrome"];
  const output = replacer({ words })("abcd efgh ijkl mnopqr");
  for (const word of output.split(" ")) {
    assert.ok(words.includes(word), word);
  }
});

const gapWords = ["neon", "netrunner"];

test("bend cuts a longer custom word to fit a missing length", () => {
  assert.equal(replacer({ words: gapWords, gapFill: "bend" })("username"), "netrunne");
  assert.equal(replacer({ words: ["neon"], gapFill: "bend" })("abcdefghij"), "neonneonne");
});

test("default fills a missing length from the default list", () => {
  const output = replacer({ words: gapWords, gapFill: "default" })("username");
  assert.ok(WORDS_BY_LENGTH[8].includes(output), output);
});

test("closest uses the nearest-length custom word", () => {
  const replace = replacer({ words: gapWords, gapFill: "closest" });
  assert.equal(replace("username"), "netrunner");
  assert.equal(replace("ab"), "neon");
});

test("closest prefers the shorter word on a tie so text does not grow", () => {
  const output = replacer({ words: ["neon", "chrome"], gapFill: "closest" })("abcde");
  assert.equal(output, "neon");
});

test("keeps combining marks with their letter in pasted words", () => {
  // "नमस्ते" is 4 letters, two of them carrying a mark.
  assert.deepEqual(parseWords("नमस्ते İstanbul"), ["नमस्ते", "i̇stanbul"]);
  assert.ok(!missingLengths(["नमस्ते"]).includes(4));
  assert.equal(replacer({ words: ["नमस्ते"] })("abcd"), "नमस्ते");
  assert.equal(replacer({ words: ["नमस्ते"] })("abc"), "नमस्");
});

test("closest does not top up a shorter word with another", () => {
  assert.equal(replacer({ words: gapWords, gapFill: "closest" })("abcdef"), "neon");
});

const longWord = "incomprehensibilities"; // 21 letters

test("lists missing lengths past the default list's longest", () => {
  const missing = missingLengths([longWord]);
  assert.ok(missing.includes(20));
  assert.ok(!missing.includes(21));
});

test("default bends lengths past the default list's longest", () => {
  const output = replacer({ words: [longWord], gapFill: "default" })("a".repeat(17));
  assert.equal(output, longWord.slice(0, 17));
});

test("above 1x counts a letter with its marks as one character", () => {
  // 9 characters × 2 = 18, with "नमस्ते" counting as 4.
  const output = replacer({ words: ["नमस्ते"], lengthMultiplier: 2 })("abcd efgh");
  assert.equal(output.match(/\P{M}\p{M}*/gu).length, 18);
});

test("reads one selector per line and separates out invalid ones", () => {
  // Stands in for the browser's parser: "!" marks an invalid selector.
  const normalize = selector => (selector.includes("!") ? null : `<${selector}>`);
  const { selectors, invalid } = parseSelectors(
    "  .site-header \n\n#main-nav\nbad!\n   \n[data-x=\"1\"]",
    normalize
  );
  assert.deepEqual(selectors, ["<.site-header>", "<#main-nav>", '<[data-x="1"]>']);
  assert.deepEqual(invalid, ["bad!"]);
});

test("treats every line as invalid when no browser parser is available", () => {
  // Node has no CSSStyleSheet, so the default must fail closed, not throw.
  assert.deepEqual(parseSelectors(".a\n#b").invalid, [".a", "#b"]);
});

test("escapes raw class and ID names copied from a page", () => {
  assert.equal(
    escapeNames(".flex.items-center.space-x-1.md:space-x-2.flex-wrap"),
    ".flex.items-center.space-x-1.md\\:space-x-2.flex-wrap"
  );
  assert.equal(escapeNames(".w-[200px]#main"), ".w-\\[200px\\]#main");
  assert.equal(escapeNames(".2xl:p-4"), ".\\32 xl\\:p-4");
  // A dot between digits is part of the name.
  assert.equal(escapeNames(".space-y-0.5.flex"), ".space-y-0\\.5.flex");
  // "." and "#" inside brackets are part of an arbitrary value.
  assert.equal(escapeNames(".bg-[#1da1f2].p-2"), ".bg-\\[\\#1da1f2\\].p-2");
  assert.equal(escapeNames(".top-[.5rem]"), ".top-\\[\\.5rem\\]");
});

test("does not reinterpret lines that are more than class and ID names", () => {
  assert.equal(escapeNames("nav .item"), null);
  assert.equal(escapeNames(".a, .b"), null);
  assert.equal(escapeNames(".md\\:flex"), null);
  assert.equal(escapeNames(".a..b"), null);
});

test("retries an invalid line with its names escaped", () => {
  // Stands in for the browser's parser: an unescaped ":" is invalid.
  const normalize = selector => (/(^|[^\\]):/.test(selector) ? null : selector);
  const { selectors, invalid } = parseSelectors(".md:flex\nnav :x", normalize);
  assert.deepEqual(selectors, [".md\\:flex"]);
  assert.deepEqual(invalid, ["nav :x"]);
});

test("keeps a valid line's CSS meaning instead of escaping it", () => {
  const acceptAll = selector => selector;
  assert.deepEqual(parseSelectors(".btn:hover", acceptAll).selectors, [".btn:hover"]);
});

test("the gap example uses a missing length and follows the chosen option", () => {
  const words = ["neon", "chrome", "netrunner", "data", "ice"];
  // Missing 1, 2, 5, 7, 8, 10–14; 5 is closest to a typical 6 letters.
  assert.deepEqual(gapFillExample(words, "bend"), {
    source: "email",
    result: "chrom",
    method: "cut"
  });
  assert.equal(gapFillExample(words, "closest").result, "neon");
  const fallback = gapFillExample(words, "default").result;
  assert.ok(WORDS_BY_LENGTH[5].includes(fallback), fallback);
});

test("the gap example is stable and absent without gaps", () => {
  // Two 6-letter words to bend from, so a random pick would vary.
  const words = ["neon", "chrome", "sprawl"];
  const first = gapFillExample(words, "bend");
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(gapFillExample(words, "bend"), first);
  }
  assert.equal(gapFillExample([], "bend"), null);
});

test("the gap hint describes what actually filled the gap", () => {
  const hint = (text, gapFill) =>
    describeGapFill(gapFillExample(parseWords(text), gapFill));
  assert.match(hint("neon chrome netrunner", "bend"), /^Cut from a longer word/);
  // Nothing longer than 3 letters to cut, so words are joined.
  assert.equal(
    hint("a to the", "bend"),
    "Shorter words joined together, since no word is long enough. Text width stays the same."
  );
  assert.match(hint("neon chrome netrunner", "default"), /^Borrowed from the lorem ipsum/);
  assert.equal(
    hint("neon chrome netrunner", "closest"),
    "The closest-length word in your text. 1 letter shorter, so text width changes."
  );
});

test("default bends past the lorem ipsum list, and the hint says so", () => {
  // Every length 1–14 covered, plus 16; only 15 is missing.
  const words = [...WORDS_BY_LENGTH.slice(1).map(bucket => bucket[0]), "q".repeat(16)];
  const example = gapFillExample(words, "default");
  assert.equal(example.result, "q".repeat(15));
  assert.match(describeGapFill(example), /^Cut from a longer word/);
});

test("the gap hint counts a letter with its marks once", () => {
  // "नमस्ते" is 4 letters but 6 code points.
  assert.equal(
    describeGapFill({ source: "email", result: "नमस्ते", method: "closest" }),
    "The closest-length word in your text. 1 letter shorter, so text width changes."
  );
  assert.equal(
    describeGapFill({ source: "email", result: "netrunner", method: "closest" }),
    "The closest-length word in your text. 4 letters longer, so text width changes."
  );
});

/**
 * Stands in for localStorage.getItem.
 *
 * @param {object} items Stored values keyed by storage key.
 * @returns {(key: string) => string | null}
 */
const storage = items => key => (key in items ? items[key] : null);

test("a site's saved settings win over older saved data", () => {
  const getItem = storage({
    "loremizerSite:a.com": JSON.stringify({ replaceText: false }),
    loremizerWordSettings: JSON.stringify({ customWords: "neon" })
  });
  assert.deepEqual(readSiteSettings("a.com", getItem), { replaceText: false });
});

test("a new site starts from the old global words and its old lists", () => {
  const getItem = storage({
    loremizerWordSettings: JSON.stringify({ customWords: "neon", gapFill: "closest" }),
    "loremizerOnly:a.com": "main",
    "loremizerSkip:b.com": ".other-site"
  });
  assert.deepEqual(readSiteSettings("a.com", getItem), {
    customWords: "neon",
    gapFill: "closest",
    onlySelectors: "main"
  });
});

test("settings never saved are left out so the popup keeps its defaults", () => {
  assert.deepEqual(readSiteSettings("a.com", storage({})), {});
});

test("a corrupt global words record does not cost a site its lists", () => {
  const getItem = storage({ loremizerWordSettings: "{", "loremizerOnly:a.com": "main" });
  assert.deepEqual(readSiteSettings("a.com", getItem), { onlySelectors: "main" });
});

test("a corrupt site record throws so the popup can report it", () => {
  const getItem = storage({ "loremizerSite:a.com": "{" });
  assert.throws(() => readSiteSettings("a.com", getItem), SyntaxError);
});

test("a per-call multiplier overrides the replacer's for that text only", () => {
  const replace = replacer({ lengthMultiplier: 0.5 });
  const kept = replace("Settings", { lengthMultiplier: 1 });
  assert.match(kept, /^[A-Z][a-z]{7}$/);
  assert.match(replace("Settings"), /^[A-Z][a-z]{3}$/);
  // Same mapping either way, so a name stays the same word everywhere.
  assert.equal(replace("settings", { lengthMultiplier: 1 }), kept.toLowerCase());
});

test("counts space-separated words that hold a letter or digit", () => {
  assert.equal(countWords("Order #00421 shipped"), 3);
  assert.equal(countWords("Café — 2 items!"), 3);
  assert.equal(countWords("  — !"), 0);
});

test("content outside the word limits keeps its length", () => {
  assert.equal(keepsLength(4, 5, 0), true);
  assert.equal(keepsLength(5, 5, 0), false); // "at least 5" includes 5
  assert.equal(keepsLength(50, 5, 50), false); // "at most 50" includes 50
  assert.equal(keepsLength(51, 5, 50), true);
  assert.equal(keepsLength(1000, 0, 0), false); // 0 is no limit
});

test("a handle mixing letters and digits counts as one word", () => {
  assert.equal(countWords("z0ylent"), 1);
  assert.equal(countWords("hey z0ylent, check this"), 4);
});

test("below 1x never cuts inside a word made of letters and digits", () => {
  const replace = replacer({ lengthMultiplier: 0.5 });
  // 7 characters aims for 4; the nick keeps its letter-digit-letters shape.
  assert.match(replace("z0ylent"), /^[a-z]0[a-z]{2}$/);
  // 24 characters aims for 12; the only cuts are between words.
  assert.match(replace("hi z0ylent there friend"), /^[a-z]{2} [a-z]0[a-z]{5}$/);
});

test("below 1x never cuts inside a handle joined by punctuation", () => {
  const replace = replacer({ lengthMultiplier: 0.5 });
  // Aiming for 8 and 7: cutting after "user" or "jane" would be closer, but
  // the handle stays whole.
  assert.match(replace("hi user_name ab"), /^[a-z]{2} [a-z]{4}_[a-z]{4}$/);
  assert.match(replace("hi jane.doe a"), /^[a-z]{2} [a-z]{4}\.[a-z]{3}$/);
  // A handle that alone is too long shrinks but keeps its "_".
  assert.match(replace("user_name hi"), /^[a-z]+_[a-z]+$/);
});

test("a long single word shrinks across its pieces, keeping each one", () => {
  // 7 characters at 0.2x aims for 1: each piece keeps one character.
  assert.match(replacer({ lengthMultiplier: 0.2 })("z0ylent"), /^[a-z]0[a-z]$/);
  // Ten one-character pieces cannot shrink without losing the word's shape.
  assert.match(replacer({ lengthMultiplier: 0.5 })("a1b2c3d4e5"), /^([a-z]\d){5}$/);
});

test("shrinking long unbroken text stays fast", () => {
  // 96,000 characters with no spaces, like a data URI. Trimming one
  // character at a time took over 2 seconds; the page freezes meanwhile.
  const text = "abcd12".repeat(16000);
  const start = Date.now();
  const output = replacer({ lengthMultiplier: 0.5 })(text);
  assert.equal(output.length, text.length / 2);
  assert.ok(Date.now() - start < 1000, `took ${Date.now() - start}ms`);
});
