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
