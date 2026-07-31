import { authGuard } from '@/app/api/utils/auth-guard';
import { auth } from '@/lib/auth';
import { withRoute } from '@/app/api/utils/route-kit';
import { headers } from 'next/headers';

/**
 * Session probe. 401 signed out, 403 with the reason when suspended (S4 —
 * the suspended page reads that message), else the caller's own session.
 * Suspension goes through authGuard so the answer matches every other route.
 */
export const GET = withRoute('session.get', async () => {
  await authGuard.requireSession();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return Response.json({ user: session.user, session: session.session });
});
