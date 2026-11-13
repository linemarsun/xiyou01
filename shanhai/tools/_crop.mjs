// 临时裁图：按 shot 模式品红外框定位画布并裁掉边框。用完即删。
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [, , input, output] = process.argv;
const png = PNG.sync.read(readFileSync(input));
const { width, height, data } = png;
const isMagenta = (x, y) => {
  const i = (y * width + x) * 4;
  return data[i] > 235 && data[i + 1] < 30 && data[i + 2] > 235;
};
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (!isMagenta(x, y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
if (maxX < 0) throw new Error('未找到品红边框');
const midY = Math.floor((minY + maxY) / 2);
const midX = Math.floor((minX + maxX) / 2);
let border = 0;
while (minX + border <= maxX && isMagenta(minX + border, midY)) border++;
let borderY = 0;
while (minY + borderY <= maxY && isMagenta(midX, minY + borderY)) borderY++;
const t = Math.max(border, borderY);
const x0 = minX + t, y0 = minY + t;
const w = maxX - minX + 1 - t * 2, h = maxY - minY + 1 - t * 2;
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
console.log(JSON.stringify({ input, output, source: [width, height], bbox: [minX, minY, maxX, maxY], border: t, cropped: [w, h] }));
