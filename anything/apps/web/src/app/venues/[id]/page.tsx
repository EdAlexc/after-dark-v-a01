'use client';

/**
 * Public venue detail (S19) — the page a private-party inquiry starts from.
 * The inquiry CTA posts the PUBLIC venue_profiles.id; the server resolves the
 * venue's user id (conversations.create venue anchor), so auth ids never ride
 * the client. Wired for the PARTY persona but equally usable by talent.
 */

import React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Loader2,
  MapPin,
  MessageSquare,
  Music,
  PartyPopper,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMyRole } from '@/lib/use-my-role';

interface VenueDetail {
  id: string;
  venue_name: string;
  neighborhood: string | null;
  address: string | null;
  description: string | null;
  venue_type: string | null;
  capacity: number | null;
  music_genres: string[] | null;
  avatar_url: string | null;
  gallery_images: string[] | null;
  rating: string | number | null;
  rating_count: number | null;
  gigs_hosted: number;
  open_gigs: number;
  /** S20 D3 — null under the 3-inbound-conversation floor. */
  response_rate: number | null;
}

export default function VenueDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { role: myRole } = useMyRole();

  const { data, isPending, isError } = useQuery({
    queryKey: ['venue', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/venues/${id}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('Failed to load venue');
      return res.json() as Promise<{ venue: VenueDetail }>;
    },
    retry: (count, error) => error.message !== 'not-found' && count < 2,
  });
  const venue = data?.venue;

  const inquire = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: id }),
      });
      if (res.status === 401) throw new Error('signin');
      const body = (await res.json().catch(() => null)) as
        | { conversation?: { id: string }; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? 'Could not open conversation');
      return body?.conversation?.id;
    },
    onSuccess: (conversationId) => {
      const inbox = myRole === 'TALENT' ? '/dashboard/talent/messages' : '/dashboard/party/messages';
      router.push(
        conversationId ? `${inbox}?c=${encodeURIComponent(conversationId)}` : inbox
      );
    },
    onError: (error: Error) => {
      if (error.message === 'signin') {
        router.push(`/account/signin?callbackUrl=${encodeURIComponent(`/venues/${id}`)}`);
        return;
      }
      toast.error(error.message);
    },
  });

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans">
      {/* Top bar */}
      <nav className="sticky top-0 z-40 bg-[#121212]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/" className="text-xl font-black tracking-tighter text-[#00FFCC]">
            AFTERDARK
          </Link>
          <Link
            href="/venues"
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All venues
          </Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {isPending ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-[#00FFCC] animate-spin" />
          </div>
        ) : isError || !venue ? (
          <div className="text-center py-24">
            <Building2 className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-bold text-white/40">This venue is not listed.</p>
            <Link
              href="/venues"
              className="inline-block mt-3 text-xs font-bold text-[#00FFCC] hover:underline"
            >
              Browse all venues →
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* ── Main column ── */}
            <div className="lg:col-span-2 space-y-6">
              <header className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6 flex items-start gap-5">
                <div className="w-20 h-20 rounded-2xl bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {venue.avatar_url ? (
                    <img src={venue.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-9 h-9 text-[#00FFCC]/60" />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-black tracking-tight leading-tight">
                    {venue.venue_name}
                  </h1>
                  <p className="text-sm text-white/40 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {venue.venue_type && <span>{venue.venue_type}</span>}
                    {venue.neighborhood && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> {venue.neighborhood}
                      </span>
                    )}
                    {venue.capacity ? (
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> Up to {venue.capacity} guests
                      </span>
                    ) : null}
                  </p>
                  {venue.address && (
                    <p className="text-xs text-white/30 mt-2">{venue.address}</p>
                  )}
                </div>
              </header>

              {venue.description && (
                <section className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                    About the venue
                  </h2>
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                    {venue.description}
                  </p>
                </section>
              )}

              {Array.isArray(venue.music_genres) && venue.music_genres.length > 0 && (
                <section className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">
                    <Music className="w-3.5 h-3.5" /> Sound & vibe
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {venue.music_genres.map((genre) => (
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

              {Array.isArray(venue.gallery_images) && venue.gallery_images.length > 0 && (
                <section className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                    Gallery
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {venue.gallery_images.slice(0, 6).map((image) => (
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
            </div>

            {/* ── Inquiry rail ── */}
            <aside className="space-y-4">
              <div className="rounded-2xl bg-[#1E1E1E] border border-white/5 p-6">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-black text-white">
                      {Number(venue.rating) > 0 ? Number(venue.rating).toFixed(1) : '—'}
                    </p>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider flex items-center justify-center gap-1">
                      <Star className="w-3 h-3" /> Rating
                      {typeof venue.rating_count === 'number' && venue.rating_count > 0 && (
                        <span className="normal-case tracking-normal">({venue.rating_count})</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-white">{venue.gigs_hosted}</p>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">
                      Gigs hosted
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-white">{venue.open_gigs}</p>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">Open gigs</p>
                  </div>
                </div>
                {/* S20 D3 — only rendered past the 3-inbound-thread floor. */}
                {typeof venue.response_rate === 'number' && (
                  <p className="mt-4 pt-4 border-t border-white/5 text-center text-xs text-white/50">
                    Responds to{' '}
                    <span className="text-white font-bold">{venue.response_rate}%</span> of
                    inquiries (last 90 days)
                  </p>
                )}
              </div>

              {myRole !== 'VENUE' && (
                <div className="rounded-2xl bg-[#1E1E1E] border border-[#00FFCC]/20 p-6">
                  <div className="flex items-center gap-2 text-[#00FFCC] text-xs font-black uppercase tracking-widest mb-2">
                    <PartyPopper className="w-4 h-4" /> Private parties
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed mb-4">
                    Planning a birthday, launch, or celebration? Start a conversation with{' '}
                    {venue.venue_name} about hosting your night.
                  </p>
                  <Button
                    disabled={inquire.isPending}
                    onClick={() => inquire.mutate()}
                    className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold"
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    {inquire.isPending ? 'Opening…' : 'Inquire about a private party'}
                  </Button>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/5 p-4">
                <ShieldCheck className="w-5 h-5 text-[#00FFCC] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/50 leading-relaxed">
                  All communications stay on the AfterDark platform — inquiries are rate-limited
                  and reportable.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/5 p-4">
                <Calendar className="w-5 h-5 text-white/30 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Nightlife professional?{' '}
                  <Link href="/search?q=dj&type=gigs" className="text-[#00FFCC] hover:underline">
                    Browse this week&apos;s open gigs
                  </Link>{' '}
                  instead.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
