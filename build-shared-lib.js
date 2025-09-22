const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;
const srcDir = path.join(root, 'src/lib');
const distDir = path.join(root, 'dist/shared-lib');
const tsconfigPath = path.join(root, 'tsconfig.shared-lib.json');

if (!fs.existsSync(srcDir)) {
  console.error('[build] Shared lib source missing at', srcDir);
  process.exit(1);
}

if (!fs.existsSync(tsconfigPath)) {
  console.error('[build] Shared lib tsconfig missing at', tsconfigPath);
  process.exit(1);
}

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

console.log('[build] Compiling shared lib to dist/shared-lib ...');
execSync(`npx tsc --project ${tsconfigPath}`, {
  stdio: 'inherit',
});

console.log('[build] Shared lib compiled');
