import sql from '@/app/api/utils/sql';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT id, name, email, image, recovery_email, phone, social_links, totp_enabled
    FROM "user"
    WHERE id = ${session.user.id}
    LIMIT 1
  `;

  if (!rows.length) return Response.json({ error: 'User not found' }, { status: 404 });

  return Response.json({ settings: rows[0] });
}

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, recovery_email, phone, social_links, image } = body;

    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    const fields: Record<string, unknown> = {
      name,
      recovery_email,
      phone,
      image,
      social_links: social_links ? JSON.stringify(social_links) : undefined,
      updatedAt: new Date().toISOString(),
    };

    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        setClauses.push(`"${key}" = $${idx}`);
        vals.push(val);
        idx++;
      }
    }

    if (!setClauses.length) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    vals.push(session.user.id);
    const result = await sql(
      `UPDATE "user" SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, email, image, recovery_email, phone, social_links, totp_enabled`,
      vals
    );

    return Response.json({ settings: result[0] });
  } catch (error) {
    console.error('Error updating settings:', error);
    return Response.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
