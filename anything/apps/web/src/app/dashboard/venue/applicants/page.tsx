'use client';

/**
 * Venue applicant review (P3.2, wireframe p10 side panel) — real applications
 * to the venue's gigs with the talent's public card and Shortlist / Hire /
 * Reject actions. Hiring flips the gig to FILLED and creates the P7 shift in
 * one server-side transaction.
 */

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, Loader2, MapPin, Music, Star, Users, XCircle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DashboardSidebar from '@/components/DashboardSidebar';
import { NotificationsBell } from '@/components/NotificationsBell';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/gigs';

interface VenueApplication {
  id: string;
  gig_id: string;
  status: 'PENDING' | 'SHORTLISTED' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
  proposed_rate_cents: number | null;
  cover_message: string | null;
  created_at: string;
  gig_title: string;
  start_time: string | null;
  base_rate: string | null;
  stage_name: string | null;
  primary_role: string | null;
  talent_neighborhood: string | null;
  hourly_rate_min: string | null;
  hourly_rate_max: string | null;
  avatar_url: string | null;
  genres_vibes: string[] | null;
}

const STATUS_ORDER: VenueApplication['status'][] = [
  'PENDING',
  'SHORTLISTED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
];

export default function VenueApplicantsPage() {
  const qc = useQueryClient();
  const [gigFilter, setGigFilter] = useState<string>('all');

  const { data, isPending } = useQuery({
    queryKey: ['venue-applications'],
    queryFn: async () => {
      const res = await fetch('/api/venue/applications');
      if (!res.ok) throw new Error('Failed to load applications');
      return res.json() as Promise<{ applications: VenueApplication[] }>;
    },
  });

  const transition = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Action failed');
      }
      return status;
    },
    onSuccess: (status) => {
      toast.success(
        status === 'HIRED'
          ? 'Hired! The gig is now filled and a shift was scheduled.'
          : `Application ${status.toLowerCase()}`
      );
      void qc.invalidateQueries({ queryKey: ['venue-applications'] });
      void qc.invalidateQueries({ queryKey: ['venue-gigs'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const applications = useMemo(() => data?.applications ?? [], [data]);
  const gigs = useMemo(() => {
    const map = new Map<string, string>();
    for (const application of applications) map.set(application.gig_id, application.gig_title);
    return [...map.entries()];
  }, [applications]);

  const visible = applications
    .filter((application) => gigFilter === 'all' || application.gig_id === gigFilter)
    .sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    );

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Applicants</h1>
            <p className="text-xs text-white/40">
              {isPending
                ? 'Loading…'
                : `${applications.filter((a) => a.status === 'PENDING').length} pending review`}
            </p>
          </div>
          <NotificationsBell role="venue" />
        </header>

        {/* Gig filter */}
        {gigs.length > 1 && (
          <div className="px-6 py-3 border-b border-white/5 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setGigFilter('all')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap transition-colors',
                gigFilter === 'all'
                  ? 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/30'
                  : 'bg-[#1E1E1E] text-white/50 border-white/10 hover:text-white'
              )}
            >
              All gigs
            </button>
            {gigs.map(([id, title]) => (
              <button
                key={id}
                onClick={() => setGigFilter(id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap transition-colors',
                  gigFilter === id
                    ? 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/30'
                    : 'bg-[#1E1E1E] text-white/50 border-white/10 hover:text-white'
                )}
              >
                {title}
              </button>
            ))}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">
          {isPending ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-[#00FFCC] animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-white/40 font-semibold">No applications yet</p>
              <p className="text-white/20 text-sm mt-1">
                Publish gigs and applications land here for review.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-w-4xl">
              {visible.map((application) => (
                <Card
                  key={application.id}
                  className={cn(
                    'bg-[#1E1E1E] border-white/5 transition-colors',
                    application.status === 'PENDING' && 'border-[#00FFCC]/10'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Talent avatar */}
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                        {application.avatar_url ? (
                          <img
                            src={application.avatar_url}
                            alt={application.stage_name ?? 'Talent'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Star className="w-5 h-5 text-[#00FFCC]" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-white">
                              {application.stage_name ?? 'Talent'}
                            </p>
                            <p className="text-xs text-[#00FFCC] font-bold">
                              {application.primary_role ?? 'Nightlife Talent'}
                            </p>
                          </div>
                          <span className="text-lg font-black text-white flex-shrink-0">
                            {application.proposed_rate_cents !== null
                              ? `$${(application.proposed_rate_cents / 100).toFixed(0)}`
                              : `$${Number(application.base_rate ?? 0).toFixed(0)}`}
                            <span className="text-xs font-normal text-white/40">/hr</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40 mt-1.5">
                          <span className="font-semibold text-white/60">
                            {application.gig_title}
                          </span>
                          {formatDate(application.start_time) && (
                            <span>{formatDate(application.start_time)}</span>
                          )}
                          {application.talent_neighborhood && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {application.talent_neighborhood}
                            </span>
                          )}
                          {(application.genres_vibes ?? []).slice(0, 3).map((genre) => (
                            <span key={genre} className="flex items-center gap-1">
                              <Music className="w-2.5 h-2.5" />
                              {genre}
                            </span>
                          ))}
                        </div>

                        {application.cover_message && (
                          <p className="text-xs text-white/50 mt-2 leading-relaxed line-clamp-2">
                            “{application.cover_message}”
                          </p>
                        )}

                        {/* Actions per status */}
                        <div className="flex items-center gap-2 mt-3">
                          {application.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                disabled={transition.isPending}
                                onClick={() =>
                                  transition.mutate({ id: application.id, status: 'SHORTLISTED' })
                                }
                                className="bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 font-bold text-xs h-7"
                              >
                                Shortlist
                              </Button>
                              <Button
                                size="sm"
                                disabled={transition.isPending}
                                onClick={() =>
                                  transition.mutate({ id: application.id, status: 'HIRED' })
                                }
                                className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs h-7"
                              >
                                <CheckCheck className="w-3.5 h-3.5 mr-1" /> Hire
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={transition.isPending}
                                onClick={() =>
                                  transition.mutate({ id: application.id, status: 'REJECTED' })
                                }
                                className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-xs h-7"
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Pass
                              </Button>
                            </>
                          )}
                          {application.status === 'SHORTLISTED' && (
                            <>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">
                                Shortlisted
                              </span>
                              <Button
                                size="sm"
                                disabled={transition.isPending}
                                onClick={() =>
                                  transition.mutate({ id: application.id, status: 'HIRED' })
                                }
                                className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs h-7"
                              >
                                <CheckCheck className="w-3.5 h-3.5 mr-1" /> Hire
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={transition.isPending}
                                onClick={() =>
                                  transition.mutate({ id: application.id, status: 'REJECTED' })
                                }
                                className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-xs h-7"
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Pass
                              </Button>
                            </>
                          )}
                          {application.status === 'HIRED' && (
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#00FFCC]/10 text-[#00FFCC] border border-[#00FFCC]/30">
                              Hired — shift scheduled
                            </span>
                          )}
                          {application.status === 'REJECTED' && (
                            <>
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                                Passed
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={transition.isPending}
                                onClick={() =>
                                  transition.mutate({ id: application.id, status: 'SHORTLISTED' })
                                }
                                className="text-white/40 hover:text-white text-xs h-7"
                              >
                                <Undo2 className="w-3.5 h-3.5 mr-1" /> Reconsider
                              </Button>
                            </>
                          )}
                          {application.status === 'WITHDRAWN' && (
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/5 text-white/30 border border-white/5">
                              Withdrawn by talent
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
