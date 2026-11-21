// news-image-20261121 round 4 — "THE WORLD TODAY", Saturday 21 November 2026.
//
// The entry image (entry.png beside this file) is a newspaper front page
// summing up the day's world news: Russia's biggest barrage on Ukraine
// (400+ drones, 110 missiles; missiles land in Poland), the AI sell-off
// pushing the S&P 500 into correction, a magnitude 6.8 quake in Peru,
// COP31 running past its deadline, Gen Z protests across 25 European
// countries, and the Basra power-station fire in Iraq.
//
// This program writes that image to /output/entry.png (or to the directory
// named by MAKEFUN_OUTPUT_DIR when run outside the grader). It is
// deliberately boring: it validates the bundled image against the
// competition's gate rules, copies it byte for byte, then verifies the
// copy, so two runs always produce identical bytes. Standard library only,
// no network, no clock, no randomness anywhere in the output path.

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

// Competition gate limits (see competition.yaml / RULES.txt).
const MAX_BYTES = 1_048_576; // 1 MiB
const MAX_DIMENSION = 1024; // px on either side
const SOURCE_NAME = 'entry.png';
const OUTPUT_NAME = 'entry.png';

// PNG signature (8 bytes) and the JPEG start-of-image marker (2 bytes).
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOI = Buffer.from([0xff, 0xd8]);

function fail(message: string): never {
  throw new Error(`news-image-20261121: ${message}`);
}

// Read the width and height out of a PNG's IHDR chunk (bytes 16..24).
function pngDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail('not a PNG file: bad signature');
  }
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') {
    fail('not a PNG file: first chunk is not IHDR');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// Walk JPEG markers until a start-of-frame segment gives the dimensions.
// SOF0 (0xC0), SOF1 (0xC1) and SOF2 (0xC2, progressive) all carry them;
// DHT, JPGn and RSTn markers have no length field and are skipped by kind.
function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 4 || !bytes.subarray(0, 2).equals(JPEG_SOI)) {
    fail('not a JPEG file: bad SOI marker');
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      fail(`not a JPEG file: expected marker at offset ${offset}`);
    }
    const marker = bytes[offset + 1];
    // Standalone markers carry no segment: skip them and keep scanning.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) {
      fail('not a JPEG file: truncated segment');
    }
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (length < 7) fail('not a JPEG file: short SOF segment');
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  fail('not a JPEG file: no start-of-frame segment found');
}

function imageDimensions(bytes: Buffer): { kind: string; width: number; height: number } {
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const { width, height } = pngDimensions(bytes);
    return { kind: 'PNG', width, height };
  }
  if (bytes.subarray(0, 2).equals(JPEG_SOI)) {
    const { width, height } = jpegDimensions(bytes);
    return { kind: 'JPEG', width, height };
  }
  fail('entry image is neither PNG nor JPEG (unrecognised magic bytes)');
}

// Validate the bundled image against every gate rule the scorer checks.
function validateSource(path: string): Buffer {
  if (!existsSync(path)) fail(`bundled image missing: ${path}`);
  const stats = statSync(path);
  if (!stats.isFile()) fail(`bundled image is not a regular file: ${path}`);
  if (stats.size > MAX_BYTES) {
    fail(`bundled image is ${stats.size} bytes, over the ${MAX_BYTES} byte limit`);
  }
  const bytes = readFileSync(path);
  if (bytes.length !== stats.size) fail('bundled image changed while reading it');
  const { kind, width, height } = imageDimensions(bytes);
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    fail(`image is ${width}x${height}, over the ${MAX_DIMENSION}x${MAX_DIMENSION} limit`);
  }
  if (width === 0 || height === 0) fail('image has a zero dimension');
  return bytes;
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function main(): void {
  const sourcePath = resolve(new URL(`./${SOURCE_NAME}`, import.meta.url).pathname);
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const outputPath = join(resolve(outputDir), OUTPUT_NAME);

  const bytes = validateSource(sourcePath);
  const { kind, width, height } = imageDimensions(bytes);

  // Refuse to copy a file onto itself: that would destroy the bundled
  // image if the output directory ever pointed back at the repository.
  if (resolve(sourcePath) === resolve(outputPath)) {
    fail(`output path ${outputPath} is the bundled image itself`);
  }

  mkdirSync(outputDir, { recursive: true });
  copyFileSync(sourcePath, outputPath);

  // The copy must be byte-identical: re-read it, compare hashes, and
  // re-parse its dimensions so a truncated write cannot slip through.
  const written = readFileSync(outputPath);
  if (!written.equals(bytes)) {
    fail('written file differs from the bundled image');
  }
  const writtenDims = imageDimensions(written);
  if (writtenDims.width !== width || writtenDims.height !== height) {
    fail('written file dimensions differ from the bundled image');
  }

  console.log(
    `wrote ${outputPath}: ${kind} ${width}x${height}, ${bytes.length} bytes, ` +
      `sha256 ${sha256Hex(bytes)}`,
  );
}

main();
