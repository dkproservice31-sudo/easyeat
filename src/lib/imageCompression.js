// Compression d'image côté client (web / PWA). Redimensionne à max 1600px
// sur le plus grand côté puis convertit en JPEG qualité 0.85.
// Si le résultat dépasse 4 MB (ex: photo 12 MP ultra détaillée), on
// retente en cascade à 0.7 puis 0.55. Retourne { base64, sizeKB, originalSizeKB }.
// base64 est la chaîne pure, sans le préfixe "data:image/jpeg;base64,".

const MAX_DIMENSION = 1600;
const MAX_SIZE_BYTES = 4 * 1024 * 1024;
const QUALITY_STEPS = [0.85, 0.7, 0.55];

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossible de lire l'image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsDataURL(file);
  });
}

function drawResized(img, maxDim) {
  const { width, height } = img;
  const ratio = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function base64FromDataUrl(dataUrl) {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

// onProgress(message) est appelé à partir de la deuxième tentative
// pour informer l'user que la compression continue (sinon il peut croire
// que l'app a freezé).
export async function compressImage(file, onProgress) {
  if (!file) throw new Error('Aucune image fournie.');
  if (typeof document === 'undefined') {
    throw new Error('Compression non supportée sur cet environnement.');
  }
  const originalSizeKB = Math.round(file.size / 1024);
  const img = await loadImageFromFile(file);
  const canvas = drawResized(img, MAX_DIMENSION);

  for (let i = 0; i < QUALITY_STEPS.length; i++) {
    const quality = QUALITY_STEPS[i];
    if (i > 0 && onProgress) onProgress('On compresse ton image...');
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = base64FromDataUrl(dataUrl);
    const sizeBytes = Math.floor((base64.length * 3) / 4);
    if (sizeBytes <= MAX_SIZE_BYTES) {
      return {
        base64,
        sizeKB: Math.round(sizeBytes / 1024),
        originalSizeKB,
      };
    }
  }
  throw new Error('Image trop grande, prends une photo moins nette.');
}
