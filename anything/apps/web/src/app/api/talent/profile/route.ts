import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { TalentProfileUpdateSchema } from '@/app/api/utils/schemas';
import { withRoute } from '@/app/api/utils/route-kit';
import { buildUpdateByKey, jsonify } from '@/app/api/utils/sql-builder';
import { computeTalentProfileCompletion } from '@/app/api/utils/profile-completion';

/** Media-carrying route: base64 data URLs until object storage lands (P3). */
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

  const profile_completion_pct = computeTalentProfileCompletion(body);

  const existing = await sql`
    SELECT id FROM talent_profiles WHERE user_id = ${user.id} LIMIT 1
  `;

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
        social_links, avatar_url, portfolio_images, profile_completion_pct
      ) VALUES (
        ${user.id}, ${body.stage_name ?? null}, ${body.pronouns ?? null}, ${body.neighborhood ?? null},
        ${body.bio ?? null}, ${body.primary_role ?? null},
        ${jsonify(body.genres_vibes) ?? '[]'},
        ${body.hourly_rate_min ?? null}, ${body.hourly_rate_max ?? null},
        ${jsonify(body.social_links) ?? '{}'},
        ${body.avatar_url ?? null},
        ${jsonify(body.portfolio_images) ?? '[]'},
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
