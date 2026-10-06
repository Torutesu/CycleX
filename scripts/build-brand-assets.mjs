import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

// Run from the repository root after editing the two SVG brand sources.
const mark = await readFile("public/brand/mark.svg");
await sharp("public/brand/share.svg").png().toFile("public/brand/share.png");
await sharp(mark).resize(180, 180).png().toFile("src/app/apple-icon.png");
await writeFile("src/app/icon.svg", mark);

const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => sharp(mark).resize(size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
