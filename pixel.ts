import { PNG } from "pngjs";
import Bottleneck from "bottleneck";

const neck = new Bottleneck({
  maxConcurrent: 1,
  minTime: 3000,
});

async function setPixelColor(
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
) {
  return await fetch("https://place.danieldb.uk/set_pixel_color", {
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ x, y, r, g, b }),
    method: "POST",
  });
}

// // read 64x64.png using bun file
const file = await Bun.file("corgi.png").arrayBuffer();
const png = PNG.sync.read(Buffer.from(file));

console.log({ width: png.width, height: png.height });

// set each pixel color
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const idx = (png.width * y + x) << 2;
    const r = png.data[idx];
    const g = png.data[idx + 1];
    const b = png.data[idx + 2];
    neck.schedule(setPixelColor, x, y, r, g, b);
  }
}
