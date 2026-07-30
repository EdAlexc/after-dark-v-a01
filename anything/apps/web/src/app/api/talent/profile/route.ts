import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { TalentProfileUpdateSchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';
import { buildUpdateByKey, jsonify, stripUndefined } from '@/app/api/utils/sql-builder';
import { computeTalentProfileCompletion } from '@/app/api/utils/profile-completion';
import { MediaError, sanitizeMediaField } from '@/app/api/utils/media';
import { ApiError } from '@/app/api/utils/route-kit';

/** Media-carrying route; raw uploads are processed by the P4 pipeline below. */
const MAX_PROFILE_BODY_BYTES = 12_000_000;

export const GET = withRoute('talent.profile.get', async () => {
  const user = await authGuard.requireSession();
  const rows = await sql`
    SELECT * FROM talent_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  return Response.json({ profile: rows[0] ?? null });
});

export const PUT = withRoute('talent.profile.update', async (request) => {
  const user = await authGuard.requireRole('TALENT');
  const body = await parseBody(request, TalentProfileUpdateSchema, {
    maxBytes: MAX_PROFILE_BODY_BYTES,
  });

  // P4 (G11): any raw base64 media is EXIF/GPS-stripped and resized before
  // it can reach the database; processed values pass through untouched.
  try {
    if (body.avatar_url !== undefined) {
      body.avatar_url = await sanitizeMediaField(body.avatar_url, 'avatar', user.id);
    }
    if (body.portfolio_images) {
      body.portfolio_images = await Promise.all(
        body.portfolio_images.map((image) =>
          sanitizeMediaField(image, 'portfolio', user.id).then((value) => value ?? '')
        )
      );
    }
  } catch (error) {
    if (error instanceof MediaError) throw ApiError.badRequest(error.message);
    throw error;
  }

  // Completion % must reflect the whole profile, not just this request's
  // fields — partial updates (e.g. toggling available_tonight) merge over the
  // stored row before scoring, otherwise they'd clobber the pct down to 0.
  const existing = await sql`
    SELECT id, stage_name, pronouns, neighborhood, bio, primary_role,
           genres_vibes, hourly_rate_min, hourly_rate_max, social_links, avatar_url
    FROM talent_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  const merged = { ...(existing[0] ?? {}), ...stripUndefined(body) };
  const profile_completion_pct = computeTalentProfileCompletion(merged);

  let profile;
  if (existing.length > 0) {
    const statement = buildUpdateByKey({
      table: 'talent_profiles',
      keyColumn: 'user_id',
      keyValue: user.id,
      fields: {
        stage_name: body.stage_name,
        pronouns: body.pronouns,
        neighborhood: body.neighborhood,
        bio: body.bio,
        primary_role: body.primary_role,
        genres_vibes: jsonify(body.genres_vibes),
        hourly_rate_min: body.hourly_rate_min,
        hourly_rate_max: body.hourly_rate_max,
        social_links: jsonify(body.social_links),
        avatar_url: body.avatar_url,
        portfolio_images: jsonify(body.portfolio_images),
        available_tonight: body.available_tonight,
        profile_completion_pct,
        updated_at: new Date().toISOString(),
      },
    });
    const result = await sql(statement!.text, statement!.values);
    profile = result[0];
  } else {
    const result = await sql`
      INSERT INTO talent_profiles (
        user_id, stage_name, pronouns, neighborhood, bio,
        primary_role, genres_vibes, hourly_rate_min, hourly_rate_max,
        social_links, avatar_url, portfolio_images, available_tonight,
        profile_completion_pct
      ) VALUES (
        ${user.id}, ${body.stage_name ?? null}, ${body.pronouns ?? null}, ${body.neighborhood ?? null},
        ${body.bio ?? null}, ${body.primary_role ?? null},
        ${jsonify(body.genres_vibes) ?? '[]'},
        ${body.hourly_rate_min ?? null}, ${body.hourly_rate_max ?? null},
        ${jsonify(body.social_links) ?? '{}'},
        ${body.avatar_url ?? null},
        ${jsonify(body.portfolio_images) ?? '[]'},
        ${body.available_tonight ?? false},
        ${profile_completion_pct}
      ) RETURNING *
    `;
    profile = result[0];
  }

  await auditLogger.record({
    actorId: user.id,
    action: 'profile.talent.update',
    entityType: 'talent_profile',
    entityId: String(profile?.id ?? ''),
    metadata: { changed: Object.keys(body) },
  });

  return Response.json({ profile });
});
