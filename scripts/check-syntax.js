const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['api', 'lib'];
const files = roots.flatMap(root => fs.readdirSync(path.join(process.cwd(), root))
  .filter(file => file.endsWith('.js'))
  .map(file => path.join(root, file)));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}
console.log(`Syntax check passed for ${files.length} server files.`);

const { parse } = require('@babel/parser');
function browserFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return browserFiles(file);
    return /\.(?:js|mjs)$/.test(entry.name) ? [file] : [];
  });
}

const clientFiles = browserFiles(path.join(process.cwd(), 'js'));
for (const file of clientFiles) {
  try {
    parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module' });
  } catch (error) {
    console.error(`${path.relative(process.cwd(), file)}: ${error.message}`);
    process.exit(1);
  }
}
console.log(`Syntax check passed for ${clientFiles.length} browser files.`);
