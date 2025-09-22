const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
const source = path.join(projectRoot, 'src/lib');
const destination = path.resolve(__dirname, '../shared-lib');
const tsconfigPath = path.resolve(__dirname, '../tsconfig.json');

if (!fs.existsSync(source)) {
  console.warn('[worker] Shared library source not found at', source);
  process.exit(0);
}

console.log('[worker] Copying shared lib to', destination);

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
      if (entry.name === '__tests__') continue;
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(source, destination);

if (fs.existsSync(tsconfigPath)) {
  console.log('[worker] Compiling shared lib to CJS ...');
  try {
    execSync('npx tsc --project tsconfig.json --outDir shared-lib/dist', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
    console.log('[worker] TypeScript compilation finished');
  } catch (error) {
    console.warn('[worker] TypeScript compilation failed:', error.message);
  }
}

console.log('[worker] Shared lib ready');
