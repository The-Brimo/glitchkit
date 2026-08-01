import type { Document } from '../types';

// Export per the design spec: PNG for lossless output, JPEG when the chain ends in a
// byte-level step (whose look is inherently JPEG-domain anyway), and the full parameter
// recipe embedded in the file's metadata — a PNG tEXt chunk or a JPEG COM segment — so
// any output can be traced back to its settings.

const JPEG_ENDING_TYPES = new Set(['databend', 'byteops', 'jpegloop']);

export function buildRecipe(doc: Document): string {
  // Strip snapshots (recursive/huge) and the base64 image payload; keep the name.
  const { snapshots: _snapshots, imageDataURL: _imageDataURL, ...rest } = doc;
  return JSON.stringify({ app: 'glitchkit', recipeVersion: 1, ...rest });
}

// PNG tEXt requires Latin-1; escaping non-ASCII as \uXXXX keeps the JSON valid and the
// chunk spec-compliant no matter what an imported file was named.
function toAsciiJson(json: string): string {
  return json.replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

// Inserts a tEXt chunk (keyword "glitchkit") immediately after IHDR.
export function pngWithRecipe(png: Uint8Array, recipeJson: string): Uint8Array {
  const ihdrLen = readU32(png, 8);
  const insertAt = 8 + 12 + ihdrLen; // signature + IHDR (len/type/data/crc)

  const payload = 'glitchkit\0' + toAsciiJson(recipeJson);
  const payloadBytes = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) payloadBytes[i] = payload.charCodeAt(i) & 0xff;

  const chunk = new Uint8Array(12 + payloadBytes.length);
  writeU32(chunk, 0, payloadBytes.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // 'tEXt'
  chunk.set(payloadBytes, 8);
  writeU32(chunk, 8 + payloadBytes.length, crc32(chunk.subarray(4, 8 + payloadBytes.length)));

  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(png.subarray(insertAt), insertAt + chunk.length);
  return out;
}

// Inserts a COM (comment) segment immediately after SOI.
export function jpegWithRecipe(jpeg: Uint8Array, recipeJson: string): Uint8Array {
  const comment = new TextEncoder().encode('glitchkit ' + recipeJson);
  if (comment.length > 65533 - 2) throw new Error('recipe too large for a JPEG comment');
  const seg = new Uint8Array(4 + comment.length);
  seg[0] = 0xff;
  seg[1] = 0xfe;
  const len = comment.length + 2;
  seg[2] = (len >> 8) & 0xff;
  seg[3] = len & 0xff;
  seg.set(comment, 4);

  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, 2), 0); // SOI
  out.set(seg, 2);
  out.set(jpeg.subarray(2), 2 + seg.length);
  return out;
}

export function exportFilename(doc: Document, ext: string): string {
  if (doc.sourceMode === 'imported') {
    const stem =
      (doc.imageName || 'image')
        .replace(/\.[^.]+$/, '')
        .replace(/[^\w-]+/g, '_')
        .slice(0, 40) || 'image';
    return `glitchkit-${stem}.${ext}`;
  }
  return `glitchkit-${doc.generator}-s${doc.seed}-${doc.palette}.${ext}`;
}

export async function exportImage(doc: Document, canvas: HTMLCanvasElement): Promise<{ blob: Blob; filename: string }> {
  const lastEnabled = [...doc.chain].reverse().find((s) => s.enabled);
  const asJpeg = !!lastEnabled && JPEG_ENDING_TYPES.has(lastEnabled.type);
  const type = asJpeg ? 'image/jpeg' : 'image/png';

  const raw: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export encode failed'))), type, asJpeg ? 0.95 : undefined)
  );
  const bytes = new Uint8Array(await raw.arrayBuffer());
  const recipe = buildRecipe(doc);
  const withMeta = asJpeg ? jpegWithRecipe(bytes, recipe) : pngWithRecipe(bytes, recipe);

  return { blob: new Blob([withMeta.slice()], { type }), filename: exportFilename(doc, asJpeg ? 'jpg' : 'png') };
}
