import { squareCrop } from "@/lib/avatar";
import { scaledSize } from "@/lib/receipts";

// Shrinks a photo in the browser before upload (D-50). The photo's own
// rotation (EXIF) is applied, so it is never saved sideways. Browser-only
// (canvas); the sizes come from tested functions in src/lib.

async function draw(
  file: File,
  size: (bitmap: ImageBitmap) => { sx: number; sy: number; sw: number; sh: number; width: number; height: number },
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { sx, sy, sw, sh, width, height } = size(bitmap);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No JPEG"))), "image/jpeg", quality),
  );
}

// The whole photo, the longer side at most `maxSide`.
export function shrinkPhoto(file: File, maxSide: number, quality: number): Promise<Blob> {
  return draw(
    file,
    (bitmap) => ({ sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height, ...scaledSize(bitmap.width, bitmap.height, maxSide) }),
    quality,
  );
}

// The middle square of the photo, `side` × `side` (or smaller if the photo is).
export function squarePhoto(file: File, side: number, quality: number): Promise<Blob> {
  return draw(
    file,
    (bitmap) => {
      const crop = squareCrop(bitmap.width, bitmap.height);
      const out = Math.min(side, crop.side);
      return { sx: crop.x, sy: crop.y, sw: crop.side, sh: crop.side, width: out, height: out };
    },
    quality,
  );
}
