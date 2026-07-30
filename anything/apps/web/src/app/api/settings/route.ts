import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { parseBody } from '@/app/api/utils/validation';
import { SettingsUpdateSchema } from '@/app/api/utils/schemas';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { buildUpdateByKey, jsonify } from '@/app/api/utils/sql-builder';

/** Media-carrying route: avatar may be a base64 data URL for now. */
const MAX_SETTINGS_BODY_BYTES = 3_000_000;

// twoFactorEnabled is the better-auth twoFactor plugin's column (camelCase,
// hence quoted). It is read-only here — enabling/disabling goes through the
// plugin's own password-verified endpoints, never this route.
const SETTINGS_COLUMNS =
  'id, name, email, image, recovery_email, phone, social_links, "twoFactorEnabled"';

export const GET = withRoute('settings.get', async () => {
  const user = await authGuard.requireSession();
  const rows = await sql`
    SELECT id, name, email, image, recovery_email, phone, social_links, "twoFactorEnabled"
    FROM "user"
    WHERE id = ${user.id}
    LIMIT 1
  `;
  if (rows.length === 0) throw ApiError.notFound('User not found');
  return Response.json({ settings: rows[0] });
});

export const PUT = withRoute('settings.update', async (request) => {
  const user = await authGuard.requireSession();
  const body = await parseBody(request, SettingsUpdateSchema, {
    maxBytes: MAX_SETTINGS_BODY_BYTES,
  });

  const statement = buildUpdateByKey({
    table: 'user',
    keyColumn: 'id',
    keyValue: user.id,
    returning: SETTINGS_COLUMNS,
    fields: {
      name: body.name,
      recovery_email: body.recovery_email,
      phone: body.phone,
      image: body.image,
      social_links: jsonify(body.social_links),
      updatedAt: new Date().toISOString(),
    },
  });
  // `updatedAt` is always set, so only a fully-empty body reaches null.
  if (!statement || Object.keys(body).length === 0) {
    throw ApiError.badRequest('No fields to update');
  }

  const result = await sql(statement.text, statement.values);

  await auditLogger.record({
    actorId: user.id,
    action: 'settings.update',
    entityType: 'user',
    entityId: user.id,
    metadata: { changed: Object.keys(body) },
  });

  return Response.json({ settings: result[0] });
});
