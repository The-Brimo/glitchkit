import type { JpegLoopParams } from '../types';

// Generation-loss loop: re-encode the image as a low-quality JPEG N times. Artifacts
// compound each pass; "drive" adds a small saturation/contrast boost per pass, which is
// what pushes the classic deep-fried look instead of plain blur.
export async function jpegLoop(input: HTMLCanvasElement, params: JpegLoopParams): Promise<HTMLCanvasElement> {
  const iterations = Math.max(1, Math.min(40, Math.round(params.iterations)));
  const quality = Math.max(0.01, Math.min(0.6, params.quality / 100));
  const drive = Math.max(0, Math.min(100, params.drive)) / 100;

  let current = input;
  for (let i = 0; i < iterations; i++) {
    const blob: Blob = await new Promise((resolve, reject) =>
      current.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg encode failed'))), 'image/jpeg', quality)
    );
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = input.width;
    c.height = input.height;
    const ctx = c.getContext('2d')!;
    if (drive > 0) {
      ctx.filter = `saturate(${1 + drive * 0.25}) contrast(${1 + drive * 0.12})`;
    }
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close();
    current = c;
  }
  return current;
}
