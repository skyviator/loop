export const PHOTO_LIMITS = {
  maxFiles: 3,
  maxSourceBytes: 12 * 1024 * 1024,
  variants: {
    original: { maxEdge: 2560, quality: 0.9 },
    display: { maxEdge: 1600, quality: 0.84 },
    thumbnail: { maxEdge: 360, quality: 0.8 },
  },
} as const;

export type PhotoVariantKind = keyof typeof PHOTO_LIMITS.variants;

export type ProcessedPhotoVariant = {
  kind: PhotoVariantKind;
  blob: Blob;
  contentType: "image/jpeg";
  byteSize: number;
  width: number;
  height: number;
};

export type ProcessedPhoto = {
  sourceName: string;
  variants: ProcessedPhotoVariant[];
};

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function dimensions(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
function canvasJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const size = dimensions(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser cannot prepare photos.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve({ blob, ...size }) : reject(new Error("Photo conversion failed.")),
      "image/jpeg",
      quality,
    );
  });
}

export function containsExifMetadata(bytes: Uint8Array) {
  for (let index = 0; index <= bytes.length - 6; index += 1) {
    if (bytes[index] === 0x45 && bytes[index + 1] === 0x78 && bytes[index + 2] === 0x69
      && bytes[index + 3] === 0x66 && bytes[index + 4] === 0 && bytes[index + 5] === 0) return true;
  }
  return false;
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  if (!acceptedTypes.has(file.type)) throw new Error(`${file.name} is not a supported JPEG, PNG, or WebP photo.`);
  if (file.size <= 0 || file.size > PHOTO_LIMITS.maxSourceBytes) throw new Error(`${file.name} must be smaller than 12 MB.`);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name} could not be decoded. Convert HEIC/HEIF photos to JPEG first.`);
  }

  try {
    const variants: ProcessedPhotoVariant[] = [];
    for (const [kind, limit] of Object.entries(PHOTO_LIMITS.variants) as Array<[PhotoVariantKind, { maxEdge: number; quality: number }]>) {
      const output = await canvasJpeg(bitmap, limit.maxEdge, limit.quality);
      variants.push({ kind, blob: output.blob, contentType: "image/jpeg", byteSize: output.blob.size, width: output.width, height: output.height });
    }
    return { sourceName: file.name, variants };
  } finally {
    bitmap.close();
  }
}
