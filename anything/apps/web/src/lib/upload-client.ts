/**
 * Client-side door to POST /api/upload (P4) — the fix for the "can't save my
 * profile photo" bug: the old flow inlined the raw FileReader data URL into
 * profile/settings PUTs, so any photo over ~1.4 MB blew the server's payload
 * caps with an unexplained generic toast. Every picker now goes through the
 * upload pipeline instead (validated, EXIF/GPS-stripped, resized server-side)
 * and stores only the returned URL; failures carry the server's message.
 */

export type UploadPurpose = 'avatar' | 'portfolio' | 'gallery' | 'attachment';

/** Matches the UI promise ("Max 5MB") and fits /api/upload's 8MB body cap
 *  with base64 overhead (≈ 4/3×) to spare. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class UploadError extends Error {}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new UploadError('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate → read → upload; resolves to the stored (processed) image URL.
 * Throws UploadError with a user-facing message on any failure.
 */
export async function uploadImageFile(file: File, purpose: UploadPurpose): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new UploadError('Please choose an image file (PNG or JPG)');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError('Image is too large — 5MB max');
  }
  const dataUrl = await readAsDataUrl(file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, purpose }),
  });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !body?.url) {
    throw new UploadError(body?.error ?? 'Upload failed — please try again');
  }
  return body.url;
}
