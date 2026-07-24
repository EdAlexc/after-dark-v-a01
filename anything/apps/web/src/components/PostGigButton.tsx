'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

export function PostGigButton({ className }: { className?: string }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const handleClick = () => {
    if (isPending) return;
    if (session?.user) {
      router.push('/dashboard/venue/create-gig');
    } else {
      router.push('/account/signin?callbackUrl=/dashboard/venue/create-gig');
    }
  };

  return (
    <Button onClick={handleClick} className={className}>
      <Zap className="w-4 h-4 fill-current mr-2" />
      Post a Gig
    </Button>
  );
}
