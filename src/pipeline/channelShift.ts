import type { ChannelShiftParams } from '../types';

const CHANNEL_INDEX: Record<ChannelShiftParams['channel'], number> = { red: 0, green: 1, blue: 2 };

export function channelShift(src: ImageData, params: ChannelShiftParams): ImageData {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data);
  const ci = CHANNEL_INDEX[params.channel];
  const dx = Math.round(params.dx);
  const dy = Math.round(params.dy);

  for (let y = 0; y < height; y++) {
    const sy = ((y - dy) % height + height) % height;
    for (let x = 0; x < width; x++) {
      const sx = ((x - dx) % width + width) % width;
      const srcO = (sy * width + sx) * 4 + ci;
      const dstO = (y * width + x) * 4 + ci;
      out[dstO] = data[srcO];
    }
  }

  return new ImageData(out, width, height);
}
