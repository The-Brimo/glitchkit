/**
 * Pulls the embedded recipe back out of a file glitchkit exported.
 *
 * Mirrors what pipeline/exportImage.ts writes: a PNG `tEXt` chunk with the
 * keyword "glitchkit", or a JPEG COM segment prefixed "glitchkit ". Also
 * accepts a bare .json file so recipes can be shared as text.
 *
 * This layer only locates and decodes bytes — it never trusts what it finds.
 * The string it returns goes straight into coerceRecipe.
 */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const KEYWORD = 'glitchkit';

export class NoRecipeFoundError extends Error {}

export async function readRecipeFromFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isPng(bytes)) return readFromPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readFromJpeg(bytes);

  // Assume JSON — let the validator decide whether it is really a recipe.
  const text = new TextDecoder().decode(bytes).trim();
  if (text.startsWith('{')) return text;

  throw new NoRecipeFoundError('That file is not a PNG, JPEG, or JSON recipe.');
}

function isPng(b: Uint8Array): boolean {
  return PNG_MAGIC.every((v, i) => b[i] === v);
}

function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function readFromPng(bytes: Uint8Array): string {
  let offset = 8; // skip signature

  while (offset + 8 <= bytes.length) {
    const length = readU32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;

    if (dataStart + length > bytes.length) break;

    if (type === 'tEXt') {
      const data = bytes.subarray(dataStart, dataStart + length);
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = latin1(data.subarray(0, nul));
        if (keyword === KEYWORD) {
          // tEXt is Latin-1; the writer escaped non-ASCII as \uXXXX inside the
          // JSON, so JSON.parse restores the original characters downstream.
          return latin1(data.subarray(nul + 1));
        }
      }
    }

    if (type === 'IEND') break;
    offset = dataStart + length + 4; // + CRC
  }

  throw new NoRecipeFoundError('That PNG has no glitchkit recipe embedded in it.');
}

function readFromJpeg(bytes: Uint8Array): string {
  let offset = 2; // skip SOI

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];

    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan or end of image — no metadata past here.
    if (marker === 0xda || marker === 0xd9) break;

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];

    if (marker === 0xfe) {
      const text = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 2 + length));
      if (text.startsWith(KEYWORD + ' ')) return text.slice(KEYWORD.length + 1);
    }

    offset += 2 + length;
  }

  throw new NoRecipeFoundError('That JPEG has no glitchkit recipe embedded in it.');
}

function latin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
