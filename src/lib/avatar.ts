// The profile photo (D-50): one small square JPEG per user in the private
// "avatars" bucket, at {user_id}/avatar.jpg. The browser crops the middle
// square and shrinks it to 256 × 256 px (about 15–25 KB) before upload.

export const AVATAR_BUCKET = "avatars";
export const AVATAR_SIDE = 256;
export const AVATAR_JPEG_QUALITY = 0.8;
// A signed URL for the photo works this many seconds; the photo is never public.
export const AVATAR_URL_SECONDS = 60 * 60;

export function avatarPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

// The middle square of a photo: where it starts and how big it is.
export function squareCrop(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side };
}
