import sql from '@/app/api/utils/sql';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT * FROM venue_profiles WHERE user_id = ${session.user.id} LIMIT 1
  `;

  return Response.json({ profile: rows[0] ?? null });
}

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const {
      venue_name,
      neighborhood,
      address,
      description,
      venue_type,
      capacity,
      music_genres,
      operating_hours,
      avatar_url,
      gallery_images,
      social_links,
    } = body;

    const existing =
      await sql`SELECT id FROM venue_profiles WHERE user_id = ${session.user.id} LIMIT 1`;

    let profile;
    if (existing.length) {
      const setClauses: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;

      const fields: Record<string, unknown> = {
        venue_name,
        neighborhood,
        address,
        description,
        venue_type,
        capacity: capacity ? Number(capacity) : undefined,
        music_genres: music_genres ? JSON.stringify(music_genres) : undefined,
        operating_hours: operating_hours ? JSON.stringify(operating_hours) : undefined,
        avatar_url,
        gallery_images: gallery_images ? JSON.stringify(gallery_images) : undefined,
        social_links: social_links ? JSON.stringify(social_links) : undefined,
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
        `UPDATE venue_profiles SET ${setClauses.join(', ')} WHERE user_id = $${idx} RETURNING *`,
        vals
      );
      profile = result[0];
    } else {
      const result = await sql`
        INSERT INTO venue_profiles (
          user_id, venue_name, neighborhood, address, description,
          venue_type, capacity, music_genres, operating_hours,
          avatar_url, gallery_images, social_links
        ) VALUES (
          ${session.user.id}, ${venue_name ?? null}, ${neighborhood ?? null},
          ${address ?? null}, ${description ?? null},
          ${venue_type ?? null}, ${capacity ? Number(capacity) : null},
          ${music_genres ? JSON.stringify(music_genres) : '[]'},
          ${operating_hours ? JSON.stringify(operating_hours) : '{}'},
          ${avatar_url ?? null},
          ${gallery_images ? JSON.stringify(gallery_images) : '[]'},
          ${social_links ? JSON.stringify(social_links) : '{}'}
        ) RETURNING *
      `;
      profile = result[0];
    }

    return Response.json({ profile });
  } catch (error) {
    console.error('Error updating venue profile:', error);
    return Response.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
