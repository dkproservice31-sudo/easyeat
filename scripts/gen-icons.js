// Génère public/icon-192.png et public/icon-512.png
// Fond orange #FF6B35 + "EE" en blanc centré (bitmap 5x7 par lettre).
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ORANGE = [0xff, 0x6b, 0x35, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

// Glyphe E en 5 colonnes × 7 lignes
const E = [
  '11111',
  '10000',
  '10000',
  '11110',
  '10000',
  '10000',
  '11111',
];

function drawIcon(size) {
  const png = new PNG({ width: size, height: size });

  // Fond + cercle blanc optionnel ? On garde un carré arrondi en pur orange
  // pour simplicité (iOS/Android arrondissent automatiquement).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      png.data[idx] = ORANGE[0];
      png.data[idx + 1] = ORANGE[1];
      png.data[idx + 2] = ORANGE[2];
      png.data[idx + 3] = ORANGE[3];
    }
  }

  // "EE" : 5 + 2 + 5 = 12 colonnes, 7 lignes
  const cols = 12;
  const rows = 7;
  const scale = Math.floor(Math.min((size * 0.6) / cols, (size * 0.6) / rows));
  const textW = cols * scale;
  const textH = rows * scale;
  const offsetX = Math.floor((size - textW) / 2);
  const offsetY = Math.floor((size - textH) / 2);

  const drawE = (startCol) => {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (E[row][col] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = offsetX + (startCol + col) * scale + dx;
            const y = offsetY + row * scale + dy;
            const idx = (size * y + x) << 2;
            png.data[idx] = WHITE[0];
            png.data[idx + 1] = WHITE[1];
            png.data[idx + 2] = WHITE[2];
            png.data[idx + 3] = WHITE[3];
          }
        }
      }
    }
  };

  drawE(0);
  drawE(7); // 5 (lettre) + 2 (espace)

  return png;
}

const outDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const png = drawIcon(size);
  const out = path.join(outDir, `icon-${size}.png`);
  png.pack().pipe(fs.createWriteStream(out)).on('finish', () => {
    console.log(`wrote ${out}`);
  });
}
