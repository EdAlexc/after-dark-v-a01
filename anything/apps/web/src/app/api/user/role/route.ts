import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import sql from '@/app/api/utils/sql';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = (await request.json()) as {
      role?: string;
      subRole?: string;
      stageName?: string;
      venueName?: string;
      neighborhood?: string;
    };

    const { role, subRole: _subRole, stageName, venueName, neighborhood } = body;

    if (!role || !['TALENT', 'VENUE', 'ADMIN'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Update the role on the user record
    await sql`
      UPDATE "user"
      SET role = ${role}, "updatedAt" = NOW()
      WHERE id = ${userId}
    `;

    // Create the role-specific profile
    if (role === 'TALENT') {
      // Check if profile already exists
      const existing = await sql`SELECT id FROM talent_profiles WHERE user_id = ${userId} LIMIT 1`;
      if (existing.length > 0) {
        await sql`
          UPDATE talent_profiles
          SET stage_name = ${stageName ?? ''}, neighborhood = ${neighborhood ?? ''}, updated_at = NOW()
          WHERE user_id = ${userId}
        `;
      } else {
        await sql`
          INSERT INTO talent_profiles (user_id, stage_name, neighborhood, profile_completion_pct)
          VALUES (${userId}, ${stageName ?? ''}, ${neighborhood ?? ''}, ${stageName ? 20 : 10})
        `;
      }
    } else if (role === 'VENUE') {
      const existing = await sql`SELECT id FROM venue_profiles WHERE user_id = ${userId} LIMIT 1`;
      if (existing.length > 0) {
        await sql`
          UPDATE venue_profiles
          SET venue_name = ${venueName ?? ''}, updated_at = NOW()
          WHERE user_id = ${userId}
        `;
      } else {
        await sql`
          INSERT INTO venue_profiles (user_id, venue_name, description)
          VALUES (${userId}, ${venueName ?? ''}, ${''})
        `;
      }
    }

    return Response.json({ success: true, role });
  } catch (err) {
    console.error('POST /api/user/role error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await sql`
      SELECT id, name, email, role FROM "user" WHERE id = ${session.user.id} LIMIT 1
    `;

    return Response.json({ user: rows[0] ?? null });
  } catch (err) {
    console.error('GET /api/user/role error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
