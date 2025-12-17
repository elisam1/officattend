#!/usr/bin/env node
/**
 * Package OfficAttend for distribution
 * Creates a zip file ready to share with others
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const DIST_NAME = 'officattend-dist';
const DIST_PATH = path.join(ROOT, DIST_NAME);

console.log('📦 Packaging OfficAttend for distribution...\n');

// Files and folders to include
const INCLUDE = [
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.js',
  'start.bat',
  'INSTALL.md',
  'README.md',
  'public',
  'src',
  'server',
  'scripts'
];

// Clean previous dist
if (fs.existsSync(DIST_PATH)) {
  fs.rmSync(DIST_PATH, { recursive: true });
}
fs.mkdirSync(DIST_PATH);

// Copy files
console.log('Copying files...');
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  const dest = path.join(DIST_PATH, item);
  
  if (!fs.existsSync(src)) {
    console.log(`  ⚠️  Skipping ${item} (not found)`);
    continue;
  }
  
  if (fs.statSync(src).isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
  console.log(`  ✓ ${item}`);
}

// Remove data.json from server folder (fresh install should have empty data)
const dataJson = path.join(DIST_PATH, 'server', 'data.json');
if (fs.existsSync(dataJson)) {
  fs.unlinkSync(dataJson);
  console.log('  ✓ Removed server/data.json (fresh start)');
}

// Create empty data.json template
fs.writeFileSync(dataJson, JSON.stringify({ companies: [], sessions: [] }, null, 2));
console.log('  ✓ Created empty server/data.json');

console.log('\n✅ Distribution package created at:', DIST_PATH);
console.log('\n📋 Next steps:');
console.log('   1. Zip the "officattend-dist" folder');
console.log('   2. Share the zip file with your workplace/mum\'s office');
console.log('   3. They need to:');
console.log('      - Install Node.js from https://nodejs.org');
console.log('      - Extract the zip');
console.log('      - Double-click start.bat (or run: npm install && npm start)');
console.log('\n');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      // Skip node_modules and other dev folders
      if (item === 'node_modules' || item === '.git' || item === 'dist') continue;
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
