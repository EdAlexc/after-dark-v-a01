import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { VenueProfileUpdateSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { MediaError, sanitizeMediaField } from '@/app/api/utils/media';
import { buildUpdateByKey, jsonify } from '@/app/api/utils/sql-builder';
import { withRlsContext } from '@/app/api/utils/rls';

/** Media-carrying route: base64 data URLs until object storage lands (P3). */
const MAX_PROFILE_BODY_BYTES = 20_000_000;

export const GET = withRoute('venue.profile.get', async () => {
  const user = await authGuard.requireSession();
  const rows = await sql`
    SELECT * FROM venue_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  return Response.json({ profile: rows[0] ?? null });
});

export const PUT = withRoute('venue.profile.update', async (request) => {
  const user = await authGuard.requireRole('VENUE');
  const body = await parseBody(request, VenueProfileUpdateSchema, {
    maxBytes: MAX_PROFILE_BODY_BYTES,
  });

  // P4 (G11): strip EXIF/GPS from any raw uploads before storage.
  try {
    if (body.avatar_url !== undefined) {
      body.avatar_url = await sanitizeMediaField(body.avatar_url, 'avatar', user.id);
    }
    if (body.gallery_images) {
      body.gallery_images = await Promise.all(
        body.gallery_images.map((image) =>
          sanitizeMediaField(image, 'gallery', user.id).then((value) => value ?? '')
        )
      );
    }
  } catch (error) {
    if (error instanceof MediaError) throw ApiError.badRequest(error.message);
    throw error;
  }

  const existing = await sql`
    SELECT id FROM venue_profiles WHERE user_id = ${user.id} LIMIT 1
  `;

  let profile;
  if (existing.length > 0) {
    const statement = buildUpdateByKey({
      table: 'venue_profiles',
      keyColumn: 'user_id',
      keyValue: user.id,
      fields: {
        venue_name: body.venue_name,
        neighborhood: body.neighborhood,
        address: body.address,
        description: body.description,
        venue_type: body.venue_type,
        capacity: body.capacity,
        music_genres: jsonify(body.music_genres),
        operating_hours: jsonify(body.operating_hours),
        avatar_url: body.avatar_url,
        gallery_images: jsonify(body.gallery_images),
        social_links: jsonify(body.social_links),
        updated_at: new Date().toISOString(),
      },
    });
    // RLS (S2): write scoped by venue_profiles_owner_write via request context.
    const result = await withRlsContext<Record<string, unknown>[]>(
      user,
      sql(statement!.text, statement!.values)
    );
    profile = result[0];
  } else {
    const result = await withRlsContext<Record<string, unknown>[]>(
      user,
      sql`
        INSERT INTO venue_profiles (
          user_id, venue_name, neighborhood, address, description,
          venue_type, capacity, music_genres, operating_hours,
          avatar_url, gallery_images, social_links
        ) VALUES (
          ${user.id}, ${body.venue_name ?? null}, ${body.neighborhood ?? null},
          ${body.address ?? null}, ${body.description ?? null},
          ${body.venue_type ?? null}, ${body.capacity ?? null},
          ${jsonify(body.music_genres) ?? '[]'},
          ${jsonify(body.operating_hours) ?? '{}'},
          ${body.avatar_url ?? null},
          ${jsonify(body.gallery_images) ?? '[]'},
          ${jsonify(body.social_links) ?? '{}'}
        ) RETURNING *
      `
    );
    profile = result[0];
  }

  await auditLogger.record({
    actorId: user.id,
    action: 'profile.venue.update',
    entityType: 'venue_profile',
    entityId: String(profile?.id ?? ''),
    metadata: { changed: Object.keys(body) },
  });

  return Response.json({ profile });
});
