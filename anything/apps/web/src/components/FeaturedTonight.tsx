'use client';

/**
 * Landing "Featured Tonight" rail (P1.4) — real published gigs from
 * GET /api/gigs. Prefers gigs starting tonight; falls back to the next
 * upcoming published gigs so the landing never looks empty while venues
 * are still ramping up. Server-side the data comes from buildGigsListQuery,
 * so only PUBLISHED gigs can ever appear here.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Music, Clock, CreditCard, MapPin, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  type ApiGig,
  type GigListResponse,
  formatDate,
  formatRate,
  formatTime,
} from '@/lib/gigs';

const FEATURED_COUNT = 3;

async function fetchGigs(params: string): Promise<GigListResponse> {
  const res = await fetch(`/api/gigs${params}`);
  if (!res.ok) throw new Error('Failed to load gigs');
  return res.json() as Promise<GigListResponse>;
}

function FeaturedGigCard({ gig, tonight }: { gig: ApiGig; tonight: boolean }) {
  return (
    <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden group cursor-pointer hover:border-[#00FFCC]/30 transition-all">
      <Link href={`/gigs/${gig.id}`} className="block">
        <div className="aspect-[4/3] relative overflow-hidden">
          {gig.venue_avatar_url ? (
            <img
              src={gig.venue_avatar_url}
              alt={gig.venue_name ?? gig.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#00FFCC]/25 via-[#1E1E1E] to-[#121212] flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
              <span className="text-6xl font-black text-[#00FFCC]/30 select-none">
                {(gig.venue_name ?? gig.title).charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {gig.venue_neighborhood && (
            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold border border-white/10 flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-[#00FFCC]" />
              {gig.venue_neighborhood}
            </div>
          )}
          <div className="absolute bottom-4 right-4 bg-[#00FFCC] text-black px-3 py-1 rounded-full text-xs font-black uppercase">
            {tonight ? 'Tonight' : 'Featured'}
          </div>
        </div>
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-bold group-hover:text-[#00FFCC] transition-colors line-clamp-1">
              {gig.title}
            </h3>
          </div>
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2 text-white/60 text-sm">
              <Music className="w-4 h-4 text-[#00FFCC]" />
              <span>
                {gig.role_needed || 'Nightlife Talent'}
                {gig.venue_name ? ` · ${gig.venue_name}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 text-white/60 text-sm">
              <Clock className="w-4 h-4 text-[#00FFCC]" />
              <span>
                {formatTime(gig.start_time)
                  ? `${tonight ? 'Starts' : formatDate(gig.start_time)} ${formatTime(gig.start_time)}`
                  : 'Time TBD'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-white/60 text-sm">
              <CreditCard className="w-4 h-4 text-[#00FFCC]" />
              <span className="font-bold text-white">{formatRate(gig)}</span>
            </div>
          </div>
          <Button className="w-full bg-white/5 hover:bg-white/10 border border-white/10">
            View Details
          </Button>
        </CardContent>
      </Link>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden">
      <div className="aspect-[4/3] bg-white/[0.03] animate-pulse" />
      <CardContent className="p-6 space-y-3">
        <div className="h-5 w-3/4 rounded bg-white/[0.05] animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-white/[0.04] animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-white/[0.04] animate-pulse" />
      </CardContent>
    </Card>
  );
}

export function FeaturedTonight() {
  const tonightQuery = useQuery({
    queryKey: ['gigs', 'featured-tonight'],
    queryFn: () => fetchGigs('?tonightOnly=true'),
    staleTime: 60_000,
  });

  const tonightGigs = tonightQuery.data?.gigs ?? [];
  const needFallback = tonightQuery.isSuccess && tonightGigs.length === 0;

  const upcomingQuery = useQuery({
    queryKey: ['gigs', 'featured-upcoming'],
    queryFn: () => fetchGigs(''),
    enabled: needFallback,
    staleTime: 60_000,
  });

  const isTonight = tonightGigs.length > 0;
  const gigs = (isTonight ? tonightGigs : upcomingQuery.data?.gigs ?? []).slice(0, FEATURED_COUNT);
  const loading = tonightQuery.isPending || (needFallback && upcomingQuery.isPending);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: FEATURED_COUNT }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (gigs.length === 0) {
    return (
      <Card className="bg-[#1E1E1E] border-white/5">
        <CardContent className="py-16 flex flex-col items-center text-center gap-3">
          <CalendarDays className="w-10 h-10 text-[#00FFCC]/30" />
          <p className="text-white/60 font-bold">Tonight's lineups are coming</p>
          <p className="text-white/30 text-sm max-w-sm">
            Venues are posting new gigs all the time. Create a profile and be first in line when
            they drop.
          </p>
          <Link href="/account/signup" className="mt-2">
            <Button className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold">
              Join AfterDark
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {gigs.map((gig) => (
        <FeaturedGigCard key={gig.id} gig={gig} tonight={isTonight} />
      ))}
    </div>
  );
}
