// This script uploads the latest.yml and installer to a remote update server or GitHub Releases.
// Customize UPLOAD_URL and authentication as needed for your deployment.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// === CONFIGURATION ===
// Set your update server or GitHub Release upload URL here
const UPLOAD_URL = process.env.OFFICATTEND_UPDATE_URL || 'https://your-update-server/upload';
const RELEASE_DIR = path.join(__dirname, '..', 'release');

function uploadFile(filePath, fieldName = 'file') {
  const fileName = path.basename(filePath);
  const fileStream = fs.createReadStream(filePath);
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`
      // Add authentication headers if needed
    }
  };
  const req = https.request(UPLOAD_URL, options, res => {
    console.log(`${fileName} upload status: ${res.statusCode}`);
    res.on('data', d => process.stdout.write(d));
  });
  fileStream.pipe(req);
  req.on('error', e => {
    console.error(`Failed to upload ${fileName}:`, e);
  });
  req.on('close', () => {
    console.log(`${fileName} upload complete.`);
  });
}

function main() {
  if (!fs.existsSync(RELEASE_DIR)) {
    console.error('Release directory not found. Build the app first.');
    process.exit(1);
  }
  const files = fs.readdirSync(RELEASE_DIR).filter(f => f.endsWith('.exe') || f === 'latest.yml');
  if (files.length === 0) {
    console.error('No installer or latest.yml found in release directory.');
    process.exit(1);
  }
  for (const file of files) {
    uploadFile(path.join(RELEASE_DIR, file));
  }
}

main();
