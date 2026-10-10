const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// popup.js reads the toolbar title to tell whether a tab is on or off. If it
// stops matching the manifest's default, every tab looks "on" and Activate
// only ever tries to undo.
test("popup.js's off-state title matches the manifest's default title", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const titleApply = read("popup.js").match(/const TITLE_APPLY = "([^"]*)";/);
  assert.ok(titleApply, "TITLE_APPLY not found in popup.js");
  assert.equal(titleApply[1], manifest.action.default_title);
});

// Browsers scale a mismatched icon silently, so a wrong file only shows up as
// a blurry icon on the extensions page.
test("each manifest icon is the size it is declared as", () => {
  const { icons } = JSON.parse(read("manifest.json"));
  for (const [size, file] of Object.entries(icons)) {
    if (size === "16") {
      continue; // Shares the 38px toolbar icon, which browsers scale down.
    }
    const png = fs.readFileSync(path.join(__dirname, "..", file));
    // A PNG's width and height are big-endian at bytes 16 and 20.
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [+size, +size], file);
  }
});
