const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Firefox passes each injected file's last value back to executeScript and
// rejects the call if that value cannot be structured-cloned, e.g. a function.
for (const file of ["lorem.js", "script.js"]) {
  test(`${file} ends on a value Firefox can return to the popup`, () => {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const context = vm.createContext({
      window: {},
      document: { querySelectorAll: () => [] }
    });
    assert.equal(vm.runInContext(source, context), undefined);
    // The popup injects both files again on every activation.
    assert.equal(vm.runInContext(source, context), undefined);
  });
}
