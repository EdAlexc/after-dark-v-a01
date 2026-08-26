'use client';

/**
 * Public talent profile (S20) — the page behind the profile editor's Preview
 * button, every directory card, and the saved-talent rail (§5.3: "Venue
 * applicants → Talent profile → Messages"). Mirrors /venues/[id]: public
 * columns only, in-page empty state on 404, and a role-gated CTA — venues
 * message through the server-resolved talent_id anchor, so the talent's user
 * id never reaches the client. Social handles render as inert text, never as
 * user-supplied hrefs.
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  MessageSquare,
  Music,
  ShieldCheck,
  Star,
  User,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMyRole } from '@/lib/use-my-role';

interface TalentDetail {
  id: string;
  stage_name: string;
  pronouns: string | null;
  neighborhood: string | null;
  bio: string | null;
  primary_role: string | null;
  genres_vibes: string[] | null;
  hourly_rate_min: string | number | null;
  hourly_rate_max: string | number | null;
  avatar_url: string | null;
  portfolio_images: string[] | null;
  social_links: Record<string, unknown> | null;
  available_tonight: boolean | null;
  rating: string | number | null;
  rating_count: number | null;
  trust_score: number | null;
}

function rateBand(talent: TalentDetail): string | null {
  const min = talent.hourly_rate_min === null ? null : Number(talent.hourly_rate_min);
  const max = talent.hourly_rate_max === null ? null : Number(talent.hourly_rate_max);
  if (min !== null && max !== null) return `$${min.toFixed(0)}–$${max.toFixed(0)}/hr`;
  if (min !== null) return `from $${min.toFixed(0)}/hr`;
  if (max !== null) return `up to $${max.toFixed(0)}/hr`;
  return null;
}

export default function TalentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { role: myRole } = useMyRole();

  const { data, isPending, isError } = useQuery({
    queryKey: ['talent-detail', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/talent/${id}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json() as Promise<{ talent: TalentDetail }>;
    },
    retry: (count, error) => error.message !== 'not-found' && count < 2,
  });
  const talent = data?.talent;

  const message = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talent_id: id }),
      });
      const body = (await res.json().catch(() => null)) as
        | { conversation?: { id: string }; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? 'Could not open conversation');
      return body?.conversation?.id;
    },
    onSuccess: (conversationId) =>
      router.push(
        conversationId
          ? `/dashboard/venue/messages?c=${encodeURIComponent(conversationId)}`
          : '/dashboard/venue/messages'
      ),
    onError: (error: Error) => toast.error(error.message),
  });

  const socials = Object.entries(talent?.social_links ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
  );

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans">
      {/* Top bar */}
      <nav className="sticky top-0 z-40 bg-[#121212]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/" className="text-xl font-black tracking-tighter text-[#00FFCC]">
            AFTERDARK
          </Link>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {isPending ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-[#00FFCC] animate-spin" />
          </div>
        ) : isError || !talent ? (
          <div className="text-center py-24">
            <User className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-bold text-white/40">This profile is not listed.</p>
            <Link
              href="/search"
              className="inline-block mt-3 text-xs font-bold text-[#00FFCC] hover:underline"
            >
              Search AfterDark →
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* ── Main column ── */}
            <div className="lg:col-span-2 space-y-6">
              <header className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6 flex items-start gap-5">
                <div className="w-20 h-20 rounded-2xl bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {talent.avatar_url ? (
                    <img src={talent.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-9 h-9 text-[#00FFCC]/60" />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-black tracking-tight leading-tight">
                    {talent.stage_name}
                    {talent.pronouns && (
                      <span className="text-white/30 font-medium text-sm ml-2">
                        {talent.pronouns}
                      </span>
                    )}
                  </h1>
                  <p className="text-sm text-white/40 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-[#00FFCC] font-bold">
                      {talent.primary_role || 'Nightlife Talent'}
                    </span>
                    {talent.neighborhood && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> {talent.neighborhood}
                      </span>
                    )}
                  </p>
                  {talent.available_tonight && (
                    <p className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold text-[#00FFCC] bg-[#00FFCC]/10 border border-[#00FFCC]/20 rounded-full px-3 py-1">
                      <Zap className="w-3 h-3" /> Available tonight
                    </p>
                  )}
                </div>
              </header>

              {talent.bio && (
                <section className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                    About
                  </h2>
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                    {talent.bio}
                  </p>
                </section>
              )}

              {Array.isArray(talent.genres_vibes) && talent.genres_vibes.length > 0 && (
                <section className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                    <Music className="w-3.5 h-3.5" /> Vibes & genres
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {talent.genres_vibes.map((genre) => (
                      <span
                        key={genre}
                        className="text-xs px-3 py-1 rounded-full bg-[#00FFCC]/10 text-[#00FFCC] border border-[#00FFCC]/20"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {Array.isArray(talent.portfolio_images) && talent.portfolio_images.length > 0 && (
                <section className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                    Portfolio
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {talent.portfolio_images.slice(0, 6).map((image) => (
                      <img
                        key={image}
                        src={image}
                        alt=""
                        className="rounded-xl object-cover w-full h-32 border border-white/5"
                      />
                    ))}
                  </div>
                </section>
              )}

              {socials.length > 0 && (
                <section className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                    Digital presence
                  </h2>
                  {/* Handles render as inert text — user-supplied values never
                      become hrefs (stored-XSS posture, S15). */}
                  <dl className="space-y-1.5">
                    {socials.map(([network, handle]) => (
                      <div key={network} className="flex items-baseline gap-3 text-sm">
                        <dt className="text-white/30 capitalize w-24 flex-shrink-0">{network}</dt>
                        <dd className="text-white/70 truncate">{handle}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </div>

            {/* ── Rail ── */}
            <aside className="space-y-4">
              <div className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-black text-white">
                      {Number(talent.rating) > 0 ? Number(talent.rating).toFixed(1) : '—'}
                    </p>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center justify-center gap-1">
                      <Star className="w-3 h-3" /> Rating
                      {typeof talent.rating_count === 'number' && talent.rating_count > 0 && (
                        <span className="normal-case tracking-normal">
                          ({talent.rating_count})
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-white">
                      {typeof talent.trust_score === 'number' ? talent.trust_score : '—'}
                    </p>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Trust</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-white">{rateBand(talent) ?? '—'}</p>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Rate</p>
                  </div>
                </div>
              </div>

              {myRole === 'VENUE' && (
                <div className="rounded-2xl bg-[#1E1E1E] border border-[#00FFCC]/20 p-6">
                  <div className="flex items-center gap-2 text-[#00FFCC] text-xs font-black uppercase tracking-widest mb-2">
                    <MessageSquare className="w-4 h-4" /> Book this talent
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed mb-4">
                    Start a conversation with {talent.stage_name} about your next night.
                  </p>
                  <Button
                    disabled={message.isPending}
                    onClick={() => message.mutate()}
                    className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold"
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    {message.isPending ? 'Opening…' : 'Message'}
                  </Button>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/5 p-4">
                <ShieldCheck className="w-5 h-5 text-[#00FFCC] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/50 leading-relaxed">
                  All communications stay on the AfterDark platform — conversations are
                  rate-limited and reportable.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
