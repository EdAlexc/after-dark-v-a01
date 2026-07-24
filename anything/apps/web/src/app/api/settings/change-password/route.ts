import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return Response.json({ error: 'Current and new password are required' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return Response.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Use better-auth's changePassword endpoint via internal call
    const result = await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: await headers(),
    });

    if (!result) {
      return Response.json(
        { error: 'Failed to change password — check your current password' },
        { status: 400 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    return Response.json(
      { error: 'Current password is incorrect or another error occurred' },
      { status: 400 }
    );
  }
}
