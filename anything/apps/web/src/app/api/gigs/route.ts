import sql from '@/app/api/utils/sql';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const neighborhood = searchParams.get('neighborhood');
  const role = searchParams.get('role');
  const minRate = searchParams.get('minRate');
  const maxRate = searchParams.get('maxRate');
  const status = searchParams.get('status') ?? 'PUBLISHED';
  const tonightOnly = searchParams.get('tonightOnly') === 'true';

  let query = `
    SELECT g.*, vp.venue_name, vp.address, vp.rating as venue_rating
    FROM gigs g
    JOIN venue_profiles vp ON g.venue_id = vp.id
    WHERE g.status = $1
  `;
  const values: (string | number)[] = [status];
  let idx = 2;

  if (tonightOnly) {
    query += ` AND DATE(g.start_time) = CURRENT_DATE`;
  }
  if (neighborhood) {
    query += ` AND LOWER(vp.address) LIKE LOWER($${idx})`;
    values.push(`%${neighborhood}%`);
    idx++;
  }
  if (role) {
    query += ` AND LOWER(g.role_needed) LIKE LOWER($${idx})`;
    values.push(`%${role}%`);
    idx++;
  }
  if (minRate) {
    query += ` AND g.base_rate >= $${idx}`;
    values.push(Number(minRate));
    idx++;
  }
  if (maxRate) {
    query += ` AND g.base_rate <= $${idx}`;
    values.push(Number(maxRate));
    idx++;
  }

  query += ` ORDER BY g.created_at DESC LIMIT 50`;

  try {
    const gigs = await sql(query, values);
    return Response.json({ gigs });
  } catch (error) {
    console.error('Error fetching gigs:', error);
    return Response.json({ error: 'Failed to fetch gigs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      title,
      role_needed,
      description,
      start_time,
      end_time,
      base_rate,
      tips_included = false,
      status = 'DRAFT',
    } = body;

    // Get the venue profile for this user
    const venueRows = await sql`
      SELECT id FROM venue_profiles WHERE user_id = ${session.user.id} LIMIT 1
    `;

    if (!venueRows.length) {
      return Response.json({ error: 'No venue profile found' }, { status: 400 });
    }

    const venue_id = venueRows[0].id;

    const result = await sql`
      INSERT INTO gigs (venue_id, title, role_needed, description, start_time, end_time, base_rate, tips_included, status)
      VALUES (${venue_id}, ${title}, ${role_needed}, ${description}, ${start_time}, ${end_time}, ${base_rate}, ${tips_included}, ${status})
      RETURNING *
    `;

    return Response.json({ gig: result[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating gig:', error);
    return Response.json({ error: 'Failed to create gig' }, { status: 500 });
  }
}
