// PNG encoder, written from scratch with Node's standard library only.
// Encodes an opaque RGB image as a PNG (color type 2, bit depth 8).
// Deterministic: same pixels in, same bytes out, every run.
import { deflateSync } from "node:zlib";

// CRC-32 (IEEE 802.3) table, built once at module load.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encode an RGBA pixel buffer as a PNG.
 * `rgba` is width * height * 4 bytes (R, G, B, A), row-major, top to bottom.
 * Alpha is dropped: the image is rendered opaque, so color type 2 (RGB) is used.
 * Scanlines use filter 0 (None); zlib level 9 keeps the file small and deterministic.
 */
export function encodePNG(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = truecolor RGB
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const rowBytes = width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rawOff = y * (rowBytes + 1);
    raw[rawOff] = 0; // filter type 0: None
    const srcOff = y * width * 4;
    for (let x = 0; x < width; x++) {
      const s = srcOff + x * 4;
      const d = rawOff + 1 + x * 3;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
    }
  }

  const idat = deflateSync(raw, { level: 9 });
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
