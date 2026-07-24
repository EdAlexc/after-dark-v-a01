import sql from '@/app/api/utils/sql';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT * FROM talent_profiles WHERE user_id = ${session.user.id} LIMIT 1
  `;

  if (!rows.length) {
    // Return empty profile so UI can upsert
    return Response.json({ profile: null });
  }

  return Response.json({ profile: rows[0] });
}

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const {
      stage_name,
      pronouns,
      neighborhood,
      bio,
      primary_role,
      genres_vibes,
      hourly_rate_min,
      hourly_rate_max,
      social_links,
      avatar_url,
      portfolio_images,
    } = body;

    // Calculate completion pct
    let filled = 0;
    const total = 9;
    if (stage_name) filled++;
    if (pronouns) filled++;
    if (neighborhood) filled++;
    if (bio) filled++;
    if (primary_role) filled++;
    if (genres_vibes?.length) filled++;
    if (hourly_rate_min || hourly_rate_max) filled++;
    if (social_links && Object.values(social_links).some(Boolean)) filled++;
    if (avatar_url) filled++;
    const profile_completion_pct = Math.round((filled / total) * 100);

    const existing =
      await sql`SELECT id FROM talent_profiles WHERE user_id = ${session.user.id} LIMIT 1`;

    let profile;
    if (existing.length) {
      const setClauses: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;

      const fields: Record<string, unknown> = {
        stage_name,
        pronouns,
        neighborhood,
        bio,
        primary_role,
        genres_vibes: genres_vibes ? JSON.stringify(genres_vibes) : undefined,
        hourly_rate_min,
        hourly_rate_max,
        social_links: social_links ? JSON.stringify(social_links) : undefined,
        avatar_url,
        portfolio_images: portfolio_images ? JSON.stringify(portfolio_images) : undefined,
        profile_completion_pct,
        updated_at: new Date().toISOString(),
      };

      for (const [key, val] of Object.entries(fields)) {
        if (val !== undefined) {
          setClauses.push(`"${key}" = $${idx}`);
          vals.push(val);
          idx++;
        }
      }

      vals.push(session.user.id);
      const result = await sql(
        `UPDATE talent_profiles SET ${setClauses.join(', ')} WHERE user_id = $${idx} RETURNING *`,
        vals
      );
      profile = result[0];
    } else {
      const result = await sql`
        INSERT INTO talent_profiles (
          user_id, stage_name, pronouns, neighborhood, bio,
          primary_role, genres_vibes, hourly_rate_min, hourly_rate_max,
          social_links, avatar_url, portfolio_images, profile_completion_pct
        ) VALUES (
          ${session.user.id}, ${stage_name ?? null}, ${pronouns ?? null}, ${neighborhood ?? null},
          ${bio ?? null}, ${primary_role ?? null},
          ${genres_vibes ? JSON.stringify(genres_vibes) : '[]'},
          ${hourly_rate_min ?? null}, ${hourly_rate_max ?? null},
          ${social_links ? JSON.stringify(social_links) : '{}'},
          ${avatar_url ?? null},
          ${portfolio_images ? JSON.stringify(portfolio_images) : '[]'},
          ${profile_completion_pct}
        ) RETURNING *
      `;
      profile = result[0];
    }

    return Response.json({ profile });
  } catch (error) {
    console.error('Error updating talent profile:', error);
    return Response.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
