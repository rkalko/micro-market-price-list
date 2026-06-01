#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const url = process.argv[2];
const outBase = process.argv[3] ?? "qr/qr-price-list";

if (!url || !/^https?:\/\/\S+$/i.test(url)) {
  console.error("Usage: node scripts/generate-qr.js https://USER.github.io/REPO/ [qr/qr-price-list]");
  process.exit(1);
}

const QR = {
  totalCodewords: [0, 26, 44, 70, 100, 134, 172],
  eccCodewordsPerBlockM: [0, 10, 16, 26, 18, 24, 16],
  blocksM: [0, 1, 1, 1, 2, 2, 4],
  alignment: {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34]
  }
};

const textBytes = new TextEncoder().encode(url);
const version = pickVersion(textBytes.length);
const qr = makeQr(textBytes, version);
const svg = renderSvg(qr, 8);
const png = renderPng(qr, 12);
const signSvg = renderSignSvg(qr, url);

const svgPath = resolve(`${outBase}.svg`);
const pngPath = resolve(`${outBase}.png`);
const signPath = resolve(`${outBase}-sign.svg`);
mkdirSync(dirname(svgPath), { recursive: true });
mkdirSync(dirname(pngPath), { recursive: true });
mkdirSync(dirname(signPath), { recursive: true });
writeFileSync(svgPath, svg);
writeFileSync(pngPath, png);
writeFileSync(signPath, signSvg);

console.log(`QR created for ${url}`);
console.log(svgPath);
console.log(pngPath);
console.log(signPath);

function pickVersion(byteLength) {
  for (let version = 1; version <= 6; version += 1) {
    const dataCodewords = QR.totalCodewords[version] - QR.eccCodewordsPerBlockM[version] * QR.blocksM[version];
    const availableBits = dataCodewords * 8;
    const requiredBits = 4 + 8 + byteLength * 8;
    if (requiredBits <= availableBits) return version;
  }

  throw new Error("URL is too long for the built-in QR generator. Use a shorter Pages URL.");
}

function makeQr(bytes, version) {
  const size = version * 4 + 17;
  const dataCodewords = QR.totalCodewords[version] - QR.eccCodewordsPerBlockM[version] * QR.blocksM[version];
  const data = makeDataCodewords(bytes, version, dataCodewords);
  const codewords = addErrorCorrection(data, version);
  let best = null;

  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = makeBlankMatrix(size);
    drawFunctionPatterns(matrix, version);
    drawCodewords(matrix, codewords, mask);
    drawFormatBits(matrix, mask);
    const score = penaltyScore(matrix.modules);
    if (!best || score < best.score) best = { ...matrix, mask, score };
  }

  return best.modules;
}

function makeBlankMatrix(size) {
  return {
    modules: Array.from({ length: size }, () => Array(size).fill(false)),
    reserved: Array.from({ length: size }, () => Array(size).fill(false))
  };
}

function setFunction(matrix, x, y, dark) {
  matrix.modules[y][x] = dark;
  matrix.reserved[y][x] = true;
}

function drawFunctionPatterns(matrix, version) {
  const size = matrix.modules.length;
  drawFinder(matrix, 3, 3);
  drawFinder(matrix, size - 4, 3);
  drawFinder(matrix, 3, size - 4);

  for (let i = 0; i < size; i += 1) {
    if (!matrix.reserved[6][i]) setFunction(matrix, i, 6, i % 2 === 0);
    if (!matrix.reserved[i][6]) setFunction(matrix, 6, i, i % 2 === 0);
  }

  for (const x of QR.alignment[version]) {
    for (const y of QR.alignment[version]) {
      if (matrix.reserved[y][x]) continue;
      drawAlignment(matrix, x, y);
    }
  }

  setFunction(matrix, 8, size - 8, true);

  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      setFunction(matrix, 8, i, false);
      setFunction(matrix, i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    setFunction(matrix, size - 1 - i, 8, false);
    setFunction(matrix, 8, size - 1 - i, false);
  }
}

function drawFinder(matrix, cx, cy) {
  const size = matrix.modules.length;
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(matrix, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignment(matrix, cx, cy) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(matrix, cx + dx, cy + dy, distance !== 1);
    }
  }
}

function makeDataCodewords(bytes, version, dataCodewords) {
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacityBits = dataCodewords * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8) bits.push(0);

  const result = [];
  for (let i = 0; i < bits.length; i += 8) result.push(bitsToByte(bits.slice(i, i + 8)));
  for (let pad = 0xec; result.length < dataCodewords; pad = pad === 0xec ? 0x11 : 0xec) {
    result.push(pad);
  }
  return result;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) bits.push(((value >>> i) & 1) === 1);
}

function bitsToByte(bits) {
  return bits.reduce((value, bit) => (value << 1) | (bit ? 1 : 0), 0);
}

function addErrorCorrection(data, version) {
  const blockCount = QR.blocksM[version];
  const eccLength = QR.eccCodewordsPerBlockM[version];
  const blockLength = data.length / blockCount;
  const generator = reedSolomonGenerator(eccLength);
  const blocks = [];

  for (let i = 0; i < blockCount; i += 1) {
    const block = data.slice(i * blockLength, (i + 1) * blockLength);
    blocks.push({ data: block, ecc: reedSolomonRemainder(block, generator) });
  }

  const result = [];
  for (let i = 0; i < blockLength; i += 1) {
    for (const block of blocks) result.push(block.data[i]);
  }
  for (let i = 0; i < eccLength; i += 1) {
    for (const block of blocks) result.push(block.ecc[i]);
  }
  return result;
}

function reedSolomonGenerator(degree) {
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    result = polyMultiply(result, [1, gfPow(2, i)]);
  }
  return result;
}

function reedSolomonRemainder(data, generator) {
  const result = Array(generator.length - 1).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i += 1) {
      result[i] ^= gfMultiply(generator[i + 1], factor);
    }
  }
  return result;
}

function polyMultiply(left, right) {
  const result = Array(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      result[i + j] ^= gfMultiply(left[i], right[j]);
    }
  }
  return result;
}

function gfMultiply(x, y) {
  let result = 0;
  while (y) {
    if (y & 1) result ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    y >>>= 1;
  }
  return result;
}

function gfPow(x, power) {
  let result = 1;
  for (let i = 0; i < power; i += 1) result = gfMultiply(result, x);
  return result;
}

function drawCodewords(matrix, codewords, mask) {
  const size = matrix.modules.length;
  const bits = [];
  for (const codeword of codewords) appendBits(bits, codeword, 8);

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vert = 0; vert < size; vert += 1) {
      const y = upward ? size - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (matrix.reserved[y][x]) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex] : false;
        matrix.modules[y][x] = bit !== maskBit(mask, x, y);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function maskBit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2 + (x * y) % 3) === 0;
    case 6: return (((x * y) % 2 + (x * y) % 3) % 2) === 0;
    case 7: return (((x + y) % 2 + (x * y) % 3) % 2) === 0;
    default: throw new Error("Unknown mask");
  }
}

function drawFormatBits(matrix, mask) {
  const size = matrix.modules.length;
  const bits = formatBits(mask);
  const positionsA = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  const positionsB = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8], [8, size - 8],
    [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4],
    [8, size - 3], [8, size - 2], [8, size - 1]
  ];

  for (let i = 0; i < 15; i += 1) {
    const bit = ((bits >>> i) & 1) === 1;
    matrix.modules[positionsA[i][1]][positionsA[i][0]] = bit;
    matrix.modules[positionsB[i][1]][positionsB[i][0]] = bit;
  }
}

function formatBits(mask) {
  let data = mask;
  let rem = data << 10;
  const generator = 0x537;
  for (let i = 14; i >= 10; i -= 1) {
    if (((rem >>> i) & 1) !== 0) rem ^= generator << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function penaltyScore(modules) {
  const size = modules.length;
  let score = 0;

  for (let y = 0; y < size; y += 1) score += runPenalty(modules[y]);
  for (let x = 0; x < size; x += 1) score += runPenalty(modules.map((row) => row[x]));

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (modules[y][x + 1] === color && modules[y + 1][x] === color && modules[y + 1][x + 1] === color) score += 3;
    }
  }

  const finderLike = "10111010000";
  const finderLikeReverse = "00001011101";
  for (let y = 0; y < size; y += 1) {
    const row = modules[y].map((value) => value ? "1" : "0").join("");
    score += patternPenalty(row, finderLike) + patternPenalty(row, finderLikeReverse);
  }
  for (let x = 0; x < size; x += 1) {
    const column = modules.map((row) => row[x] ? "1" : "0").join("");
    score += patternPenalty(column, finderLike) + patternPenalty(column, finderLikeReverse);
  }

  const dark = modules.flat().filter(Boolean).length;
  const percent = dark * 100 / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function runPenalty(values) {
  let score = 0;
  let runColor = values[0];
  let runLength = 1;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] === runColor) {
      runLength += 1;
      if (runLength === 5) score += 3;
      else if (runLength > 5) score += 1;
    } else {
      runColor = values[i];
      runLength = 1;
    }
  }
  return score;
}

function patternPenalty(line, pattern) {
  let score = 0;
  let index = line.indexOf(pattern);
  while (index !== -1) {
    score += 40;
    index = line.indexOf(pattern, index + 1);
  }
  return score;
}

function renderSvg(modules, scale) {
  const quiet = 4;
  const size = modules.length + quiet * 2;
  const cells = [];

  for (let y = 0; y < modules.length; y += 1) {
    for (let x = 0; x < modules.length; x += 1) {
      if (modules[y][x]) cells.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * scale}" height="${size * scale}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#fff"/>
  <g fill="#111">${cells.join("")}</g>
</svg>
`;
}

function renderSignSvg(modules, url) {
  const qrSize = 620;
  const quiet = 4;
  const modulesWithQuiet = modules.length + quiet * 2;
  const cell = qrSize / modulesWithQuiet;
  const qrX = 230;
  const qrY = 500;
  const cells = [];

  for (let y = 0; y < modules.length; y += 1) {
    for (let x = 0; x < modules.length; x += 1) {
      if (!modules[y][x]) continue;
      cells.push(
        `<rect x="${(qrX + (x + quiet) * cell).toFixed(3)}" y="${(qrY + (y + quiet) * cell).toFixed(3)}" width="${cell.toFixed(3)}" height="${cell.toFixed(3)}"/>`
      );
    }
  }

  const safeUrl = escapeXml(url);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1530" viewBox="0 0 1080 1530">
  <rect width="1080" height="1530" fill="#f7f3ea"/>
  <rect x="70" y="70" width="940" height="1390" rx="34" fill="#fffaf0" stroke="#ded6c8" stroke-width="3"/>
  <rect x="110" y="110" width="860" height="295" rx="28" fill="#0f766e"/>
  <text x="540" y="205" text-anchor="middle" fill="#fffaf0" font-family="Arial, sans-serif" font-size="52" font-weight="700" letter-spacing="4">МИКРОМАРКЕТ</text>
  <text x="540" y="315" text-anchor="middle" fill="#fffaf0" font-family="Arial, sans-serif" font-size="94" font-weight="900">Прайс-лист</text>
  <text x="540" y="438" text-anchor="middle" fill="#1f2523" font-family="Arial, sans-serif" font-size="42" font-weight="700">Отсканируйте QR-код</text>
  <rect x="198" y="468" width="684" height="684" rx="30" fill="#ffffff" stroke="#ded6c8" stroke-width="3"/>
  <g fill="#111111">${cells.join("")}</g>
  <text x="540" y="1238" text-anchor="middle" fill="#1f2523" font-family="Arial, sans-serif" font-size="42" font-weight="800">Актуальные цены на телефоне</text>
  <text x="540" y="1302" text-anchor="middle" fill="#68716c" font-family="Arial, sans-serif" font-size="28">Продукты, снеки и напитки</text>
  <text x="540" y="1382" text-anchor="middle" fill="#0b4f4a" font-family="Arial, sans-serif" font-size="23">${safeUrl}</text>
</svg>
`;
}

function renderPng(modules, scale) {
  const quiet = 4;
  const size = (modules.length + quiet * 2) * scale;
  const rows = [];

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(size + 1);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const moduleX = Math.floor(x / scale) - quiet;
      const moduleY = Math.floor(y / scale) - quiet;
      const dark = moduleX >= 0 && moduleY >= 0 && moduleX < modules.length && moduleY < modules.length && modules[moduleY][moduleX];
      row[x + 1] = dark ? 0 : 255;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
