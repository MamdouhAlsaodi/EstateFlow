/**
 * EF-601 — deterministic media byte fixtures for the domain/application
 * integration tests. Pure helpers only: importing this file registers no
 * node:test hooks.
 */

let crcTable;

function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function validPng(width, height) {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Uint8Array.from([
    ...Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    ...pngChunk("IHDR", ihdr),
    ...pngChunk("IEND", new Uint8Array(0)),
  ]);
}

export function validJpeg(width, height) {
  const h = (v) => Uint8Array.of((v >> 8) & 0xff, v & 0xff);
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...h(16),
    0x4a,
    0x46,
    0x49,
    0x46,
    0,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xc0,
    ...h(17),
    0x08,
    ...h(height),
    ...h(width),
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
    0xff,
    0xd9,
  ]);
}

export function validWebp(width, height) {
  const body = new Uint8Array(18); // 'VP8X' + size(4) + flags(4) + w(3) + h(3)
  const view = new DataView(body.buffer);
  body.set([0x56, 0x50, 0x38, 0x58], 0); // VP8X
  view.setUint32(4, 10); // chunk size
  const w1 = width - 1;
  const h1 = height - 1;
  body.set([w1 & 0xff, (w1 >> 8) & 0xff, (w1 >> 16) & 0xff], 12);
  body.set([h1 & 0xff, (h1 >> 8) & 0xff, (h1 >> 16) & 0xff], 15);
  const riff = new Uint8Array(12 + body.length);
  riff.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  new DataView(riff.buffer).setUint32(4, 4 + body.length, true);
  riff.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  riff.set(body, 12);
  return riff;
}

/** Minimal ISO-BMFF/MP4: ftyp box only — sniffable, dimension-free. */
export function validMp4(byteLength = 64) {
  const bytes = new Uint8Array(Math.max(byteLength, 16));
  bytes.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
  return bytes;
}
