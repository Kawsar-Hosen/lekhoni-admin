const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
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

console.log('--- Preparing Lekhoni Admin Flutter Web Build for Deployment ---');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const flutterDir = path.join(rootDir, 'flutter_web');
const publicDir = path.join(rootDir, 'public');

// 1. Clean dist
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Copy Flutter Web build files
if (fs.existsSync(flutterDir)) {
  copyDir(flutterDir, distDir);
  console.log('✓ Successfully copied Flutter Web build to dist/');
} else {
  console.error('✗ Error: flutter_web directory not found!');
  process.exit(1);
}

// 3. Copy Cloudflare Pages routing files (_redirects, _headers, icons)
if (fs.existsSync(publicDir)) {
  const publicFiles = fs.readdirSync(publicDir);
  for (const file of publicFiles) {
    const src = path.join(publicDir, file);
    const dest = path.join(distDir, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dest);
      console.log(`✓ Copied ${file} to dist/`);
    }
  }
}

// 4. Guarantee SPA fallback for Cloudflare Pages
const redirectsPath = path.join(distDir, '_redirects');
if (!fs.existsSync(redirectsPath)) {
  fs.writeFileSync(redirectsPath, '/* /index.html 200\n');
  console.log('✓ Created fallback _redirects for Cloudflare Pages');
}

console.log('=== Deployment Build Ready in dist/ ===');
