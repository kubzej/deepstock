/**
 * Generate PWA icons from SVG
 * Run with: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');

// Read SVG
const svgPath = join(publicDir, 'deepstock.svg');
const svg = readFileSync(svgPath);

// Generate icons at different sizes
const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-192x192.png', size: 192 },
  { name: 'favicon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

async function generateIcons() {
  console.log('Generating PWA icons...');

  for (const { name, size } of sizes) {
    const outputPath = join(publicDir, name);

    await sharp(svg).resize(size, size).png().toFile(outputPath);

    console.log(`✓ ${name} (${size}x${size})`);
  }

  console.log('\nDone! Icons saved to public/');
}

generateIcons().catch(console.error);
