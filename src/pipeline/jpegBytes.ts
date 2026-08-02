export async function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality)
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function jpegBytesToImageData(bytes: Uint8Array): Promise<ImageData> {
  const blob = new Blob([bytes.slice()], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Finds the byte offset where compressed scan data begins, right after the last
// Start-Of-Scan (FFDA) marker's header. Everything before this is the JPEG "header"
// (APP0/quantization/Huffman tables etc.) and must be preserved untouched so the
// file stays openable; mutation happens only after this point.
export function findScanDataStart(bytes: Uint8Array): number {
  let i = 2; // skip SOI (FFD8)
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      return i + 2 + len;
    }
    if (marker === 0xd9) break; // EOI with no scan found
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    i += 2 + len;
  }
  // Fallback: preserve a conservative fixed header size.
  return Math.min(bytes.length, 400);
}

// A literal 0xFF inside entropy-coded scan data means "a marker follows" unless it is
// byte-stuffed as FF 00 (or is a restart marker, FFD0-FFD7). A byte-domain mutation can
// produce a bare 0xFF, which makes decoders hard-fail the whole image rather than
// corrupting it locally.
//
// This only neutralizes 0xFF bytes that are ACTUALLY invalid — it leaves legitimate
// stuffing and restart markers intact. An earlier version rewrote every 0xFF in the
// region, which guaranteed decodability but destroyed the effect: on a typical frame
// that touched ~37 valid stuffed pairs spread evenly across the image versus the ~11
// bytes the glitch itself changes, so the collateral damage swamped the effect and
// flattened the picture uniformly instead of letting corruption cascade from a point.
export function sanitizeScanRegion(bytes: Uint8Array, start: number, end: number): Uint8Array {
  for (let i = start; i < end; i++) {
    if (bytes[i] !== 0xff) continue;
    const next = i + 1 < end ? bytes[i + 1] : -1;
    const isStuffed = next === 0x00;
    const isRestart = next >= 0xd0 && next <= 0xd7;
    if (!isStuffed && !isRestart) bytes[i] = 0xfe;
  }
  return bytes;
}

// End Of Image marker (FFD9) usually terminates the file; keep it intact when present
// so mutated bytes never overwrite the very end of the stream.
export function findScanDataEnd(bytes: Uint8Array): number {
  if (bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    return bytes.length - 2;
  }
  return bytes.length;
}
