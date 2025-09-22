const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '../../src/lib');
const destination = path.resolve(__dirname, '../shared-lib');

if (!fs.existsSync(source)) {
  console.warn('[worker] Shared library source not found at', source);
  process.exit(0);
}

if (fs.existsSync(destination)) {
  fs.rmSync(destination, { recursive: true, force: true });
}

fs.mkdirSync(destination, { recursive: true });

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(source, destination);
console.log('[worker] Copied shared lib to', destination);
