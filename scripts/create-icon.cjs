// This script creates placeholder icon files for Electron build
// For production, replace with actual .ico file (256x256 recommended)

const fs = require('fs');
const path = require('path');

// Create a 256x256 32-bit BMP icon for OfficAttend

function createIcon() {
  const size = 256;
  
  // Create pixel data (BGRA format, bottom-up)
  const pixelData = [];
  
  for (let y = size - 1; y >= 0; y--) {  // Bottom-up
    for (let x = 0; x < size; x++) {
      const centerX = size / 2;
      const centerY = size / 2;
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      const outerRadius = size * 0.42;
      const innerRadius = size * 0.24;
      
      if (dist >= innerRadius && dist <= outerRadius) {
        // Ring - teal gradient
        const t = (dist - innerRadius) / (outerRadius - innerRadius);
        const r = Math.round(20 + t * 30);
        const g = Math.round(150 - t * 50);
        const b = Math.round(200 - t * 30);
        pixelData.push(b, g, r, 255);  // BGRA
      } else if (dist < innerRadius) {
        // Inner circle - dark teal
        pixelData.push(120, 80, 10, 255);  // BGRA
      } else {
        // Outside - transparent
        pixelData.push(0, 0, 0, 0);  // BGRA transparent
      }
    }
  }
  
  // AND mask (1 bit per pixel, padded to 4-byte rows)
  const andMaskRowBytes = Math.ceil(size / 8);
  const andMaskRowPadded = Math.ceil(andMaskRowBytes / 4) * 4;
  const andMask = Buffer.alloc(andMaskRowPadded * size, 0);
  
  // Build BMP DIB header (BITMAPINFOHEADER - 40 bytes)
  const dibHeader = Buffer.alloc(40);
  dibHeader.writeUInt32LE(40, 0);           // Header size
  dibHeader.writeInt32LE(size, 4);          // Width
  dibHeader.writeInt32LE(size * 2, 8);      // Height (doubled for XOR+AND mask)
  dibHeader.writeUInt16LE(1, 12);           // Color planes
  dibHeader.writeUInt16LE(32, 14);          // Bits per pixel
  dibHeader.writeUInt32LE(0, 16);           // Compression (BI_RGB)
  dibHeader.writeUInt32LE(pixelData.length + andMask.length, 20);  // Image size
  dibHeader.writeInt32LE(0, 24);            // X pixels per meter
  dibHeader.writeInt32LE(0, 28);            // Y pixels per meter  
  dibHeader.writeUInt32LE(0, 32);           // Colors used
  dibHeader.writeUInt32LE(0, 36);           // Important colors
  
  const imageData = Buffer.concat([dibHeader, Buffer.from(pixelData), andMask]);
  
  // ICO header (6 bytes)
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);            // Reserved
  icoHeader.writeUInt16LE(1, 2);            // Type (1 = ICO)
  icoHeader.writeUInt16LE(1, 4);            // Number of images
  
  // ICO directory entry (16 bytes)
  const icoEntry = Buffer.alloc(16);
  icoEntry[0] = 0;                          // Width (0 means 256)
  icoEntry[1] = 0;                          // Height (0 means 256)
  icoEntry[2] = 0;                          // Color palette size
  icoEntry[3] = 0;                          // Reserved
  icoEntry.writeUInt16LE(1, 4);             // Color planes
  icoEntry.writeUInt16LE(32, 6);            // Bits per pixel
  icoEntry.writeUInt32LE(imageData.length, 8);   // Image data size
  icoEntry.writeUInt32LE(22, 12);           // Image data offset (6 + 16 = 22)
  
  return Buffer.concat([icoHeader, icoEntry, imageData]);
}

console.log('Creating 256x256 icon...');
const ico = createIcon();

const electronDir = path.join(__dirname, '..', 'electron');
if (!fs.existsSync(electronDir)) {
  fs.mkdirSync(electronDir, { recursive: true });
}

fs.writeFileSync(path.join(electronDir, 'icon.ico'), ico);
console.log(`Created icon.ico (${(ico.length / 1024).toFixed(1)} KB) in electron folder`);
console.log('Note: For best results, replace with a professionally designed icon');
