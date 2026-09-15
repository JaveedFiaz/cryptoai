const fs = require('fs');
const zlib = require('zlib');

function createPng(size, text = 'CSP') {
  const width = size;
  const height = size;

  // Uncompressed RGBA buffer
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type: 0 (None)
    for (let x = 0; x < width; x++) {
      // Calculate distance from center for circular background
      const cx = width / 2;
      const cy = height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = size * 0.44;

      if (dist <= radius) {
        // Gradient dark background (#131722 to #0b0e14) with cyan accent border
        if (dist >= radius - (size * 0.04)) {
          // Cyan border (#00d2ff)
          rawData[offset++] = 0;   // R
          rawData[offset++] = 210; // G
          rawData[offset++] = 255; // B
          rawData[offset++] = 255; // A
        } else {
          // Candlestick bar in center or Dark Blue background (#10141f)
          const inCandleWick = Math.abs(x - cx) < (size * 0.02) && y > (height * 0.25) && y < (height * 0.75);
          const inCandleBody = Math.abs(x - cx) < (size * 0.12) && y > (height * 0.38) && y < (height * 0.62);

          if (inCandleBody || inCandleWick) {
            // Neon Green (#00e676)
            rawData[offset++] = 0;
            rawData[offset++] = 230;
            rawData[offset++] = 118;
            rawData[offset++] = 255;
          } else {
            // Dark Card
            rawData[offset++] = 19;
            rawData[offset++] = 23;
            rawData[offset++] = 34;
            rawData[offset++] = 255;
          }
        }
      } else {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  // Compress IDAT
  const idatData = zlib.deflateSync(rawData);

  // Helper to build chunk
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const body = Buffer.concat([typeBuf, data]);

    // CRC32 calculation
    let crc = 0 ^ (-1);
    for (let i = 0; i < body.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ body[i]) & 0xFF];
    }
    crc = (crc ^ (-1)) >>> 0;
    crcBuf.writeUInt32BE(crc, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Precompute CRC table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  crcTable[n] = c;
}

// Generate icon-192.png and icon-512.png
fs.writeFileSync('icon-192.png', createPng(192));
fs.writeFileSync('icon-512.png', createPng(512));
console.log('Generated icon-192.png and icon-512.png successfully!');
