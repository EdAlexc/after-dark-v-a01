'use client';

/**
 * Talent "My Applications" (P3.3) — real data from /api/talent/applications:
 * status chips, gig context, withdraw. Replaces the old MOCK_APPLICATIONS page.
 */

import React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, MapPin, Loader2, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DashboardSidebar from '@/components/DashboardSidebar';
import { NotificationsBell } from '@/components/NotificationsBell';
import { cn } from '@/lib/utils';
import { formatDate, formatTimeRange } from '@/lib/gigs';

interface Application {
  id: string;
  gig_id: string;
  status: 'PENDING' | 'SHORTLISTED' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
  proposed_rate_cents: number | null;
  cover_message: string | null;
  created_at: string;
  gig_title: string;
  role_needed: string | null;
  start_time: string | null;
  end_time: string | null;
  base_rate: string | null;
  gig_status: string;
  venue_name: string | null;
  venue_neighborhood: string | null;
}

const STATUS_CHIPS: Record<Application['status'], { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-white/5 text-white/50 border-white/10' },
  SHORTLISTED: {
    label: 'Shortlisted',
    className: 'bg-green-400/10 text-green-400 border-green-400/20',
  },
  HIRED: { label: 'Hired 🎉', className: 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/30' },
  REJECTED: { label: 'Not selected', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  WITHDRAWN: { label: 'Withdrawn', className: 'bg-white/5 text-white/45 border-white/5' },
};

export default function TalentApplicationsPage() {
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ['talent-applications'],
    queryFn: async () => {
      const res = await fetch('/api/talent/applications');
      if (!res.ok) throw new Error('Failed to load applications');
      return res.json() as Promise<{ applications: Application[] }>;
    },
  });

  const withdraw = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/applications/${id}`, {
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
      void qc.invalidateQueries({ queryKey: ['talent-applications'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const applications = data?.applications ?? [];

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">My Applications</h1>
            <p className="text-xs text-white/40">
              {isPending ? 'Loading…' : `${applications.length} total`}
            </p>
          </div>
          <NotificationsBell role="talent" />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {isPending ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-[#00FFCC] animate-spin" />
            </div>
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-white/40 font-semibold">No applications yet</p>
              <p className="text-white/40 text-sm mt-1 mb-4">
                Find tonight's gigs and put yourself forward.
              </p>
              <Link href="/dashboard/talent/browse">
                <Button className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-sm">
                  Browse gigs
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3 max-w-3xl">
              {applications.map((application) => {
                const chip = STATUS_CHIPS[application.status];
                return (
                  <Card
                    key={application.id}
                    className="bg-[#1E1E1E] border-white/5 hover:border-white/10 transition-colors"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/gigs/${application.gig_id}`}
                            className="text-sm font-black text-white hover:text-[#00FFCC] transition-colors"
                          >
                            {application.gig_title}
                          </Link>
                          <p className="text-xs text-[#00FFCC] font-bold">
                            {application.role_needed || 'Nightlife Talent'}
                            {application.venue_name ? ` · ${application.venue_name}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40 mt-2">
                            {formatDate(application.start_time) && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(application.start_time)} ·{' '}
                                {formatTimeRange(application.start_time, application.end_time)}
                              </span>
                            )}
                            {application.venue_neighborhood && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {application.venue_neighborhood}
                              </span>
                            )}
                            <span>
                              {application.proposed_rate_cents !== null
                                ? `Asked $${(application.proposed_rate_cents / 100).toFixed(0)}/hr`
                                : 'At base rate'}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <span
                            className={cn(
                              'text-[11px] font-bold px-2.5 py-1 rounded-full border',
                              chip.className
                            )}
                          >
                            {chip.label}
                          </span>
                          {(application.status === 'PENDING' ||
                            application.status === 'SHORTLISTED') && (
                            <button
                              disabled={withdraw.isPending}
                              onClick={() => withdraw.mutate(application.id)}
                              className="text-[11px] text-white/45 hover:text-red-400 flex items-center gap-1 transition-colors"
                            >
                              <XCircle className="w-3 h-3" /> Withdraw
                            </button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
