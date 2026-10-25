// Receipt photos (DESIGN §6.9, D-10, D-43, D-50). The photo is shrunk in
// the browser to 1200 px on the longer side and saved as JPEG at quality
// 0.7 (a 3–5 MB phone photo becomes about 100–150 KB, still easy to read),
// then uploaded to the private "receipts" bucket.

export const RECEIPT_BUCKET = "receipts";
export const RECEIPT_MAX_SIDE = 1200;
export const RECEIPT_JPEG_QUALITY = 0.7;
// The bucket refuses anything bigger (the migration sets the same limit).
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
// A signed URL works for this many seconds; the photo is never public.
export const RECEIPT_URL_SECONDS = 300;

export function receiptPath(userId: string, transactionId: string): string {
  return `${userId}/${transactionId}.jpg`;
}

// The size to draw the photo at: the longer side at most 1200 px, the same
// shape, never bigger than it was.
export function scaledSize(width: number, height: number, maxSide = RECEIPT_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function checkPhotoType(type: string): string | null {
  return type.startsWith("image/") ? null : "Choose a photo (for example JPEG or PNG).";
}

export function checkShrunkSize(bytes: number): string | null {
  return bytes > MAX_RECEIPT_BYTES ? "This photo is still over 5 MB after shrinking. Try another photo." : null;
}
