const fs = require("fs");
const vm = require("vm");

const fullCode = fs.readFileSync("js/views/siklus-karyawan.js", "utf8");

for (let i = 1; i <= 5; i++) {
  const code = fullCode + "\n" + "}".repeat(i);
  try {
    new vm.SourceTextModule(code);
    console.log(`Adding ${i} closing brace(s) to the end of the file makes it parse cleanly!`);
    break;
  } catch (e) {
    console.log(`Adding ${i} brace(s) failed: ${e.message}`);
  }
}
