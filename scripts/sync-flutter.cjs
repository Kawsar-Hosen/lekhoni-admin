const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const rootDir = path.resolve(__dirname, '..');
const flutterBuildWeb = path.resolve(rootDir, '..', 'lekhoni_admin_web', 'build', 'web');
const flutterWeb = path.join(rootDir, 'flutter_web');
const dist = path.join(rootDir, 'dist');

if (!fs.existsSync(flutterBuildWeb)) {
  console.error('✗ lekhoni_admin_web/build/web not found. Please run flutter build web first.');
  process.exit(1);
}

console.log('--- Syncing fresh Flutter web build into lekhoni-admin ---');
copyDir(flutterBuildWeb, flutterWeb);
copyDir(flutterBuildWeb, dist);
console.log('✓ Successfully synced to flutter_web/ and dist/');
