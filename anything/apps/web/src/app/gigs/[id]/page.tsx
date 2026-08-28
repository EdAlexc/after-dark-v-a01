'use client';

/**
 * Public gig detail + application panel (wireframe p4, P1.2 + P3 live
 * applications). Payout hero, about, venue card (with the S20 D3 response
 * rate), the 5% fee estimator, real Submit/Withdraw, and "Inquire" opening a
 * P5 conversation. S20: single-pin location map for geocoded gigs, with the
 * neighborhood as the address fallback.
 */

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  /** S20 D3 — null under the 3-inbound-conversation floor. */
  venue_response_rate?: number | null;
}

// MapLibre touches window — never SSR it (same pattern as browse).
const GigsMap = dynamic(() => import('@/components/GigsMap'), { ssr: false });

interface MyApplication {
  id: string;
  status: 'PENDING' | 'SHORTLISTED' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
  proposed_rate_cents: number | null;
}

interface GigDetailResponse {
  gig: GigDetail;
  isOwner: boolean;
  myApplication: MyApplication | null;
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
  const router = useRouter();
  const qc = useQueryClient();
  const gigId = params?.id;
  const [coverMessage, setCoverMessage] = useState('');

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

  const apply = useMutation({
    mutationFn: async () => {
      const parsed = Number(proposedRate);
      const proposedCents =
        proposedRate.trim() !== '' && Number.isFinite(parsed) && parsed > 0
          ? Math.round(parsed * 100)
          : null;
      const res = await fetch(`/api/gigs/${gigId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposed_rate_cents: proposedCents, cover_message: coverMessage }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 401) throw new Error('signin');
      if (res.status === 403) throw new Error('Only talent accounts can apply');
      if (!res.ok) throw new Error(body?.error ?? 'Could not submit application');
      return body;
    },
    onSuccess: () => {
      toast.success('Application submitted!');
      void qc.invalidateQueries({ queryKey: ['gig', gigId] });
    },
    onError: (error: Error) => {
      if (error.message === 'signin') {
        router.push(`/account/signin?callbackUrl=${encodeURIComponent(`/gigs/${gigId}`)}`);
        return;
      }
      toast.error(error.message);
    },
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/applications/${data?.myApplication?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'WITHDRAWN' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not withdraw');
      }
    },
    onSuccess: () => {
      toast.success('Application withdrawn');
      void qc.invalidateQueries({ queryKey: ['gig', gigId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const inquire = useMutation({
    mutationFn: async () => {
      // The server resolves the venue side from the gig anchor, so venue
      // user ids never travel through the client.
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gig_id: gigId }),
      });
      if (res.status === 401) throw new Error('signin');
      const body = (await res.json().catch(() => null)) as
        | { conversation?: { id: string }; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? 'Could not open conversation');
      return body?.conversation?.id;
    },
    onSuccess: (conversationId) =>
      router.push(
        conversationId
          ? `/dashboard/talent/messages?c=${encodeURIComponent(conversationId)}`
          : '/dashboard/talent/messages'
      ),
    onError: (error: Error) => {
      if (error.message === 'signin') {
        router.push(`/account/signin?callbackUrl=${encodeURIComponent(`/gigs/${gigId}`)}`);
        return;
      }
      toast.error(error.message);
    },
  });

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
              {/* Age requirement (G12) — only worth showing when above the 18 floor. */}
              {Number(gig.age_requirement) === 21 && (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-full border border-orange-400/30 bg-orange-400/10 text-orange-300 uppercase">
                  21+ only
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
                <p className="text-white/45 text-sm italic">
                  The venue hasn't added a description yet — inquire for details.
                </p>
              )}
              {gig.tips_included && (
                <p className="mt-4 flex items-center gap-2 text-sm text-green-400 font-semibold">
                  <DollarSign className="w-4 h-4" /> Cash tips included on top of the base rate
                </p>
              )}
              {Number(gig.age_requirement) === 21 && (
                <p className="mt-3 flex items-center gap-2 text-sm text-orange-300 font-semibold">
                  <ShieldCheck className="w-4 h-4" /> You must be 21 or older to work this gig
                </p>
              )}
            </CardContent>
          </Card>

          {/* Location (S20 F6): address with the neighborhood as fallback, and a
              single-pin map when the server geocoded the gig (lat/lng are always
              server-written — never client input). */}
          {(gig.address || gig.venue_neighborhood) && (
            <Card className="bg-[#1E1E1E] border-white/5">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold mb-3">Location</h2>
                <p className="text-white/60 text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#00FFCC] flex-shrink-0" />
                  {gig.address ?? gig.venue_neighborhood}
                </p>
                {typeof gig.lat === 'number' && typeof gig.lng === 'number' ? (
                  <div className="mt-4">
                    <GigsMap
                      gigs={[gig]}
                      className="h-56"
                      showSummary={false}
                      interactive={false}
                      maxZoom={15}
                    />
                  </div>
                ) : (
                  !gig.address && (
                    <p className="text-white/40 text-xs mt-2">
                      Exact address shared after you&apos;re hired.
                    </p>
                  )
                )}
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
                    {typeof gig.venue_response_rate === 'number' && (
                      <span>Responds to {gig.venue_response_rate}% of inquiries</span>
                    )}
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

        {/* ── Application panel (P3 live) ── */}
        <div className="space-y-4">
          <Card className="bg-[#1E1E1E] border-white/5 lg:sticky lg:top-20">
            <CardContent className="p-6 space-y-5">
              <h2 className="text-lg font-bold">Apply for this gig</h2>

              {data?.myApplication && data.myApplication.status !== 'WITHDRAWN' ? (
                /* Already applied — show state + withdraw */
                <div className="space-y-4">
                  <div
                    className={cn(
                      'rounded-xl border p-4 text-sm font-bold flex items-center gap-2',
                      data.myApplication.status === 'HIRED'
                        ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                        : data.myApplication.status === 'REJECTED'
                          ? 'bg-red-500/10 border-red-500/20 text-red-400'
                          : 'bg-green-400/10 border-green-400/20 text-green-400'
                    )}
                  >
                    ✓{' '}
                    {data.myApplication.status === 'PENDING'
                      ? 'Application submitted'
                      : data.myApplication.status === 'SHORTLISTED'
                        ? 'You are shortlisted!'
                        : data.myApplication.status === 'HIRED'
                          ? 'You are hired for this gig 🎉'
                          : 'Application not selected'}
                  </div>
                  {data.myApplication.proposed_rate_cents !== null && (
                    <p className="text-xs text-white/40">
                      Your proposed rate: $
                      {(data.myApplication.proposed_rate_cents / 100).toFixed(2)}/hr
                    </p>
                  )}
                  {(data.myApplication.status === 'PENDING' ||
                    data.myApplication.status === 'SHORTLISTED') && (
                    <Button
                      variant="outline"
                      disabled={withdraw.isPending}
                      onClick={() => withdraw.mutate()}
                      className="w-full border-white/10 text-white/50 hover:text-red-400 hover:border-red-500/30 text-xs"
                    >
                      Withdraw application
                    </Button>
                  )}
                </div>
              ) : (
                <>
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
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/35 transition-all"
                    />
                    <p className="text-[11px] text-white/45 mt-1.5">
                      Leave blank to accept the venue's base rate.
                    </p>
                  </div>

                  {/* Cover message */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-white/40 block mb-2">
                      Cover message
                    </label>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      placeholder="Why you're the right fit for this night…"
                      value={coverMessage}
                      onChange={(e) => setCoverMessage(e.target.value)}
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/35 transition-all resize-none"
                    />
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
                    disabled={apply.isPending || gig.status !== 'PUBLISHED'}
                    onClick={() => apply.mutate()}
                    className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold disabled:opacity-40"
                  >
                    {apply.isPending
                      ? 'Submitting…'
                      : gig.status !== 'PUBLISHED'
                        ? 'This gig is no longer open'
                        : 'Submit Application'}
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                disabled={inquire.isPending}
                onClick={() => inquire.mutate()}
                className="w-full border-white/10 text-white/70 hover:text-white hover:bg-white/5 text-sm"
              >
                {inquire.isPending ? 'Opening…' : 'Inquire about this gig'}
              </Button>

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
