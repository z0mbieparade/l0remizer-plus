const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/**
 * Loads lorem.js and script.js into a fake page holding one iframe and one
 * 300×200 image, with
 * idle callbacks queued until flush() so tests control when they run.
 *
 * @returns {{loremiscous: Function, iframe: object, img: object,
 *   flush: () => void}}
 */
function loadPage() {
  const iframe = { style: { filter: "" } };
  const img = { width: 300, height: 200, src: "original.png" };
  const elements = { iframe: [iframe], img: [img] };
  const queue = new Map();
  let nextId = 1;
  const context = vm.createContext({
    window: {},
    document: { querySelectorAll: selector => elements[selector] || [] },
    requestIdleCallback: callback => {
      queue.set(nextId, callback);
      return nextId++;
    },
    cancelIdleCallback: id => queue.delete(id)
  });
  for (const file of ["lorem.js", "script.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  const flush = () => {
    for (const [id, callback] of [...queue]) {
      queue.delete(id);
      callback();
    }
  };
  return { loremiscous: context.window.loremiscous, iframe, img, flush };
}

const settings = { replaceIframe: true };

test("deactivating before the page is idle cancels the pending changes", () => {
  const { loremiscous, iframe, flush } = loadPage();
  loremiscous(settings);
  loremiscous();
  flush();
  assert.equal(iframe.style.filter, "");
});

test("new replacements apply once, so deactivating restores the original", () => {
  const { loremiscous, iframe, flush } = loadPage();
  loremiscous(settings);
  flush();
  assert.equal(iframe.style.filter, "blur(4px)");
  loremiscous.reroll(settings);
  // Before the first reroll's pass has run, as with a quick second click.
  loremiscous.reroll(settings);
  flush();
  assert.equal(iframe.style.filter, "blur(4px)");
  loremiscous();
  assert.equal(iframe.style.filter, "");
});

test("new replacements on an inactive page activate it", () => {
  const { loremiscous, iframe, flush } = loadPage();
  loremiscous.reroll(settings);
  flush();
  assert.equal(iframe.style.filter, "blur(4px)");
  loremiscous();
  assert.equal(iframe.style.filter, "");
});

test("new replacements load a different placeholder image", () => {
  const { loremiscous, img, flush } = loadPage();
  loremiscous({ replaceImage: true });
  flush();
  const first = img.src;
  assert.match(first, /^https:\/\/picsum\.photos\/300\/200\?random=\d+$/);
  loremiscous.reroll({ replaceImage: true });
  flush();
  // Browsers reuse an image loaded under the same URL, so it must differ.
  assert.notEqual(img.src, first);
  loremiscous();
  assert.equal(img.src, "original.png");
});
