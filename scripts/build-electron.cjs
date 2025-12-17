/**
 * Build script for OfficAttend Electron app
 * This script prepares and builds the Electron application
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log('🚀 Building OfficAttend Electron App...\n');

// Step 1: Check if icon exists, create placeholder if not
const iconPath = path.join(rootDir, 'electron', 'icon.ico');
if (!fs.existsSync(iconPath)) {
  console.log('📦 Creating placeholder icon...');
  execSync('node scripts/create-icon.cjs', { cwd: rootDir, stdio: 'inherit' });
}

// Step 2: Install dependencies
console.log('\n📦 Installing dependencies...');
execSync('npm install', { cwd: rootDir, stdio: 'inherit' });

// Step 3: Install Electron and electron-builder
console.log('\n📦 Installing Electron dependencies...');
execSync('npm install electron@28 electron-builder@24 --save-dev', { cwd: rootDir, stdio: 'inherit' });

// Step 4: Build the Vite frontend
console.log('\n🔨 Building frontend...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

// Step 5: Build Electron app
console.log('\n📦 Building Electron app...');
execSync('npx electron-builder --win', { cwd: rootDir, stdio: 'inherit' });

console.log('\n✅ Build complete! Check the "release" folder for the installer.');
