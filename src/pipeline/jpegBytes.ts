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

// A literal 0xFF byte inside entropy-coded scan data means "marker follows" to a JPEG
// decoder unless it's stuffed with a trailing 0x00. Byte-domain mutations can easily
// produce a bare 0xFF, which makes browsers hard-fail the whole decode instead of just
// corrupting nearby pixels. Neutralizing every 0xFF in the scan region (mutated or not)
// keeps the stream structurally valid while still preserving the glitch's effect on
// the surrounding bytes.
export function sanitizeScanRegion(bytes: Uint8Array, start: number, end: number): Uint8Array {
  for (let i = start; i < end; i++) {
    if (bytes[i] === 0xff) bytes[i] = 0xfe;
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
