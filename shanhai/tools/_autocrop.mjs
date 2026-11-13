// 临时裁图：自动按背景色（取左上角像素）求非背景范围并裁剪，留 8px 边。用完即删。
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [, , input, output] = process.argv;
const png = PNG.sync.read(readFileSync(input));
const { width, height, data } = png;
const px = (x, y) => {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};
const bg = px(2, 2);
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b] = px(x, y);
    if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) <= 12) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
if (maxX < 0) throw new Error('全图与背景同色');
const pad = 8;
const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
const x1 = Math.min(width - 1, maxX + pad), y1 = Math.min(height - 1, maxY + pad);
const w = x1 - x0 + 1, h = y1 - y0 + 1;
const out = new PNG({ width: w, height: h });
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const si = ((y0 + y) * width + (x0 + x)) * 4;
    const di = (y * w + x) * 4;
    out.data[di] = data[si];
    out.data[di + 1] = data[si + 1];
    out.data[di + 2] = data[si + 2];
    out.data[di + 3] = 255;
  }
}
writeFileSync(output, PNG.sync.write(out));
console.log(JSON.stringify({ input, output, source: [width, height], bbox: [minX, minY, maxX, maxY], cropped: [w, h] }));
