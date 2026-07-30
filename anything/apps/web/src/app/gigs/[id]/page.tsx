'use client';

/**
 * Public gig detail + application panel (wireframe p4, P1.2).
 * Payout hero, about, venue card, and the 5% marketplace-fee estimator.
 * Submitting applications lands in P2 — the estimator is live, the submit
 * button says so honestly. Map view is deferred (Technical Backlog #1).
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  MapPin,
  DollarSign,
  Building2,
  ShieldCheck,
  Zap,
  CalendarDays,
  Loader2,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  type ApiGig,
  feeBreakdown,
  formatDate,
  formatRate,
  formatTimeRange,
  gigHours,
  gigRate,
  gigUrgency,
} from '@/lib/gigs';

interface GigDetail extends ApiGig {
  venue_description?: string | null;
  venue_type?: string | null;
  capacity?: number | null;
  venue_gigs_hosted?: number;
}

interface GigDetailResponse {
  gig: GigDetail;
  isOwner: boolean;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-white/10 text-white/60 border-white/10' },
  PUBLISHED: { label: 'Open', className: 'bg-green-400/10 text-green-400 border-green-400/20' },
  FILLED: { label: 'Filled', className: 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/20' },
  COMPLETED: { label: 'Completed', className: 'bg-white/10 text-white/60 border-white/10' },
  CANCELLED: { label: 'Cancelled', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function GigDetailPage() {
  const params = useParams<{ id: string }>();
  const gigId = params?.id;

  const { data, isPending, isError } = useQuery({
    queryKey: ['gig', gigId],
    enabled: Boolean(gigId),
    queryFn: async () => {
      const res = await fetch(`/api/gigs/${gigId}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('Failed to load gig');
      return res.json() as Promise<GigDetailResponse>;
    },
    retry: (count, error) => error.message !== 'not-found' && count < 2,
  });

  const gig = data?.gig;
  const baseRate = gig ? gigRate(gig) : null;
  const [proposedRate, setProposedRate] = useState<string>('');

  const effectiveRate = useMemo(() => {
    const parsed = Number(proposedRate);
    if (proposedRate.trim() !== '' && Number.isFinite(parsed) && parsed > 0) return parsed;
    return baseRate ?? 0;
  }, [proposedRate, baseRate]);

  const hours = gig ? gigHours(gig.start_time, gig.end_time) : null;
  const estimate = feeBreakdown(effectiveRate, hours ?? 1);

  if (isPending) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FFCC] animate-spin" />
      </div>
    );
  }

  if (isError || !gig) {
    return (
      <div className="min-h-screen bg-[#121212] text-white flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-2xl font-black">Gig not found</p>
        <p className="text-white/40 text-sm text-center max-w-sm">
          This gig may have been removed, unpublished, or the link is wrong.
        </p>
        <Link href="/dashboard/talent/browse">
          <Button className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold">
            Browse open gigs
          </Button>
        </Link>
      </div>
    );
  }

  const urgency = gigUrgency(gig);
  const statusBadge = STATUS_BADGES[gig.status];

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans">
      {/* Top bar */}
      <nav className="sticky top-0 z-40 bg-[#121212]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/dashboard/talent/browse"
            className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Browse
          </Link>
          <Link href="/" className="text-lg font-black tracking-tighter text-[#00FFCC]">
            AFTERDARK
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Main column ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {statusBadge && (
                <span
                  className={cn(
                    'text-[11px] font-black px-2.5 py-1 rounded-full border uppercase',
                    statusBadge.className
                  )}
                >
                  {statusBadge.label}
                </span>
              )}
              {urgency === 'HOT' && (
                <span className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-red-500 text-white uppercase">
                  <Zap className="w-3 h-3 fill-current" /> Hot — starts soon
                </span>
              )}
              {data?.isOwner && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-[#00FFCC]/30 bg-[#00FFCC]/10 text-[#00FFCC]">
                  Your listing
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">{gig.title}</h1>
            <p className="text-[#00FFCC] font-bold">
              {gig.role_needed || 'Nightlife Talent'}
              {gig.venue_name ? ` · ${gig.venue_name}` : ''}
            </p>
          </div>

          {/* Payout hero */}
          <Card className="bg-gradient-to-br from-[#00FFCC]/15 via-[#1E1E1E] to-[#1E1E1E] border-[#00FFCC]/20">
            <CardContent className="p-6 flex flex-wrap items-center gap-x-10 gap-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-1">
                  Base Rate
                </p>
                <p className="text-4xl font-black text-white">
                  {formatRate(gig)}
                </p>
              </div>
              {hours !== null && baseRate !== null && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-1">
                    Est. Shift Payout
                  </p>
                  <p className="text-2xl font-black text-[#00FFCC]">
                    ${(baseRate * hours).toFixed(0)}
                    <span className="text-sm font-bold text-white/40 ml-1.5">
                      {hours.toFixed(1)}h
                    </span>
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-1.5 text-sm text-white/60 min-w-[200px]">
                {formatDate(gig.start_time) && (
                  <span className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-[#00FFCC]" />
                    {formatDate(gig.start_time)}
                  </span>
                )}
                {formatTimeRange(gig.start_time, gig.end_time) && (
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#00FFCC]" />
                    {formatTimeRange(gig.start_time, gig.end_time)}
                  </span>
                )}
                {(gig.venue_neighborhood || gig.address) && (
                  <span className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#00FFCC]" />
                    {gig.venue_neighborhood ?? gig.address}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* About */}
          <Card className="bg-[#1E1E1E] border-white/5">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold mb-3">About this gig</h2>
              {gig.description ? (
                <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line">
                  {gig.description}
                </p>
              ) : (
                <p className="text-white/30 text-sm italic">
                  The venue hasn't added a description yet — inquire for details.
                </p>
              )}
              {gig.tips_included && (
                <p className="mt-4 flex items-center gap-2 text-sm text-green-400 font-semibold">
                  <DollarSign className="w-4 h-4" /> Cash tips included on top of the base rate
                </p>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          {gig.address && (
            <Card className="bg-[#1E1E1E] border-white/5">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold mb-3">Location</h2>
                <p className="text-white/60 text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#00FFCC] flex-shrink-0" />
                  {gig.address}
                </p>
                <p className="text-white/20 text-xs mt-2">Map view coming soon.</p>
              </CardContent>
            </Card>
          )}

          {/* Venue card */}
          <Card className="bg-[#1E1E1E] border-white/5">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold mb-4">About the venue</h2>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {gig.venue_avatar_url ? (
                    <img
                      src={gig.venue_avatar_url}
                      alt={gig.venue_name ?? 'Venue'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building2 className="w-6 h-6 text-[#00FFCC]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white">{gig.venue_name ?? 'Venue'}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-white/40">
                    {gig.venue_type && <span>{gig.venue_type}</span>}
                    {typeof gig.capacity === 'number' && gig.capacity > 0 && (
                      <span>Capacity {gig.capacity}</span>
                    )}
                    {gig.venue_rating != null && (
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        {Number(gig.venue_rating).toFixed(1)}
                      </span>
                    )}
                    <span>{gig.venue_gigs_hosted ?? 0} gigs hosted</span>
                  </div>
                  {gig.venue_description && (
                    <p className="text-white/50 text-sm mt-3 leading-relaxed line-clamp-3">
                      {gig.venue_description}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Application panel ── */}
        <div className="space-y-4">
          <Card className="bg-[#1E1E1E] border-white/5 lg:sticky lg:top-20">
            <CardContent className="p-6 space-y-5">
              <h2 className="text-lg font-bold">Apply for this gig</h2>

              {/* Proposed rate */}
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-white/40 block mb-2">
                  Your proposed rate ($/hr)
                </label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  placeholder={baseRate !== null ? String(baseRate) : 'e.g. 150'}
                  value={proposedRate}
                  onChange={(e) => setProposedRate(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
                />
                <p className="text-[11px] text-white/30 mt-1.5">
                  Leave blank to accept the venue's base rate.
                </p>
              </div>

              {/* Fee estimator */}
              <div className="rounded-xl bg-[#121212] border border-white/5 p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between text-white/50">
                  <span>
                    {hours !== null
                      ? `Estimated total (${hours.toFixed(1)}h)`
                      : 'Estimated total (per hour)'}
                  </span>
                  <span className="font-bold text-white">${estimate.gross.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-white/50">
                  <span>Marketplace fee (5%)</span>
                  <span className="font-bold text-red-400">−${estimate.fee.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="font-bold text-white/70">Your estimated net</span>
                  <span className="text-lg font-black text-[#00FFCC]">
                    ${estimate.net.toFixed(2)}
                  </span>
                </div>
              </div>

              <Button
                disabled
                className="w-full bg-[#00FFCC]/20 text-[#00FFCC]/50 font-bold cursor-not-allowed"
                title="Applications open in the next release"
              >
                Submit Application — coming soon
              </Button>
              <p className="text-[11px] text-white/30 text-center -mt-2">
                Applications are almost here. Until then, venues list contact details in the gig
                description.
              </p>

              {/* Escrow note */}
              <div className="flex items-start gap-3 rounded-xl bg-[#00FFCC]/5 border border-[#00FFCC]/15 p-4">
                <ShieldCheck className="w-5 h-5 text-[#00FFCC] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/50 leading-relaxed">
                  <span className="text-white/80 font-bold">Safety first.</span> Payments are held
                  in escrow via Stripe Connect and released 24 hours after gig completion.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
