import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { UploadSchema } from '@/app/api/utils/schemas';
import { MediaError, MediaUnavailableError, processImage, storeImage } from '@/app/api/utils/media';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

const uploadLimiter = getRateLimiter('media-upload', { windowMs: 60 * 60 * 1000, max: 30 });

/**
 * POST /api/upload (P4) — the single door for user media.
 *
 * Every byte is validated (magic-byte decode), EXIF/GPS-stripped, and resized
 * before storage; the response URL points at *processed* bytes only. Stores to
 * Vercel Blob when configured, else returns an inline data URL (dev fallback).
 */
export const POST = withRoute('media.upload', async (request) => {
  const user = await authGuard.requireSession();
  await enforceRateLimit(uploadLimiter, clientKey(request, user.id));

  const body = await parseBody(request, UploadSchema, { maxBytes: 8_000_000 });

  try {
    const processed = await processImage(body.dataUrl);
    const stored = await storeImage(processed, body.purpose, user.id);
    // S15 audit-coverage: media is PII creation (G11) — on the trail like
    // every other PII write. Metadata stays content-free (no URLs, no bytes).
    await auditLogger.record({
      actorId: user.id,
      action: 'media.upload',
      entityType: 'media',
      metadata: { purpose: body.purpose, storage: stored.storage },
    });
    return Response.json(
      {
        url: stored.url,
        storage: stored.storage,
        width: processed.width,
        height: processed.height,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof MediaUnavailableError) {
      throw ApiError.serviceUnavailable(error.message);
    }
    if (error instanceof MediaError) throw ApiError.badRequest(error.message);
    throw error;
  }
});
