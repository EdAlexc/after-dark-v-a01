'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ShieldCheck,
  Users,
  DollarSign,
  Flag,
  Download,
  Ban,
  Undo2,
  Eye,
  ScrollText,
  Activity,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── API types ────────────────────────────────────────────────────────────────

interface Overview {
  users: Array<{ role: string; count: number; suspended: number }>;
  reports: Array<{ status: string; severity: string; count: number }>;
  gigs: Array<{ status: string; count: number }>;
  payouts: Array<{ status: string; count: number; net_cents: string | number }>;
  activeShifts: number;
  stripeConfigured: boolean;
}

interface AdminReport {
  id: number;
  entity_type: string;
  entity_id: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'REVIEWING' | 'CLOSED';
  created_at: string;
  reporter_email: string | null;
  resolution_note: string | null;
}

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  open_reports: number;
}

interface AdminGig {
  id: string;
  title: string;
  role_needed: string | null;
  status: string;
  start_time: string | null;
  venue_name: string | null;
  venue_email: string;
  applicant_count: number;
  open_reports: number;
}

interface AuditLog {
  id: number;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

const SEVERITY_STYLE: Record<AdminReport['severity'], string> = {
  HIGH: 'bg-red-500/15 text-red-400 border-red-500/30',
  MEDIUM: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  LOW: 'bg-white/5 text-white/50 border-white/10',
};

const REPORT_STATUS_STYLE: Record<AdminReport['status'], string> = {
  OPEN: 'text-yellow-400',
  REVIEWING: 'text-[#00FFCC]',
  CLOSED: 'text-white/40',
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'users' | 'gigs'>('users');
  const [userFilter, setUserFilter] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const { data: overview, isError: overviewError } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error(res.status === 403 ? 'Admin access required' : 'Failed');
      return res.json() as Promise<Overview>;
    },
    retry: false,
  });

  const { data: reportsData } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const res = await fetch('/api/admin/reports');
      if (!res.ok) throw new Error('Failed to load reports');
      return res.json() as Promise<{ reports: AdminReport[] }>;
    },
    enabled: Boolean(overview),
    refetchInterval: 30_000,
  });
  const reports = reportsData?.reports ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['admin-users', userFilter, flaggedOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userFilter) params.set('q', userFilter);
      if (flaggedOnly) params.set('flagged', 'true');
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error('Failed to load users');
      return res.json() as Promise<{ users: AdminUser[] }>;
    },
    enabled: Boolean(overview) && tab === 'users',
  });

  const { data: gigsData } = useQuery({
    queryKey: ['admin-gigs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/gigs');
      if (!res.ok) throw new Error('Failed to load gigs');
      return res.json() as Promise<{ gigs: AdminGig[] }>;
    },
    enabled: Boolean(overview) && tab === 'gigs',
  });

  const { data: auditData } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit-logs');
      if (!res.ok) throw new Error('Failed to load audit log');
      return res.json() as Promise<{ logs: AuditLog[] }>;
    },
    enabled: Boolean(overview),
    refetchInterval: 20_000,
  });

  const reportTransition = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'REVIEWING' | 'CLOSED' }) => {
      const note =
        status === 'CLOSED'
          ? (window.prompt('Resolution note (kept on the report):') ?? undefined)
          : undefined;
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution_note: note }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Transition failed');
      }
    },
    onSuccess: () => {
      toast.success('Report updated');
      void qc.invalidateQueries({ queryKey: ['admin-reports'] });
      void qc.invalidateQueries({ queryKey: ['admin-overview'] });
      void qc.invalidateQueries({ queryKey: ['admin-audit'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const suspendUser = useMutation({
    mutationFn: async ({ id, suspend }: { id: string; suspend: boolean }) => {
      let reason: string | undefined;
      if (suspend) {
        reason = window.prompt('Reason (shown to the user):') ?? undefined;
        if (!reason) throw new Error('A reason is required to suspend');
      }
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: suspend, reason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Update failed');
      }
      return suspend;
    },
    onSuccess: (suspend) => {
      toast.success(suspend ? 'Account suspended' : 'Account reinstated');
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-audit'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const takedownGig = useMutation({
    mutationFn: async (id: string) => {
      const reason = window.prompt('Takedown reason (sent to the venue):') ?? undefined;
      const res = await fetch(`/api/admin/gigs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', reason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Takedown failed');
      }
    },
    onSuccess: () => {
      toast.success('Gig removed');
      void qc.invalidateQueries({ queryKey: ['admin-gigs'] });
      void qc.invalidateQueries({ queryKey: ['admin-audit'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // KPI derivations
  const totalUsers = (overview?.users ?? []).reduce((sum, row) => sum + row.count, 0);
  const suspendedUsers = (overview?.users ?? []).reduce((sum, row) => sum + row.suspended, 0);
  const openReports = (overview?.reports ?? [])
    .filter((row) => row.status !== 'CLOSED')
    .reduce((sum, row) => sum + row.count, 0);
  const highOpen = (overview?.reports ?? [])
    .filter((row) => row.status !== 'CLOSED' && row.severity === 'HIGH')
    .reduce((sum, row) => sum + row.count, 0);
  const heldPayouts = (overview?.payouts ?? []).find((row) => row.status === 'HELD');

  if (overviewError) {
    return (
      <div className="min-h-screen bg-[#121212] text-white flex items-center justify-center p-8">
        <Card className="bg-[#1E1E1E] border-red-500/20 max-w-md">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="font-bold mb-1">Admin access required</p>
            <p className="text-sm text-white/40 mb-4">
              This surface is restricted to moderation staff. Admin is granted out-of-band only.
            </p>
            <Link href="/">
              <Button variant="outline" className="bg-transparent border-white/10 text-white/70">
                Back to AfterDark
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="admin" />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-10">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#00FFCC]" /> Admin Moderation
            </h1>
            <p className="text-xs text-white/40">
              Every action here is audited under your admin identity.
            </p>
          </div>
          <a href="/api/admin/audit-logs?format=csv" download>
            <Button
              size="sm"
              variant="outline"
              className="bg-transparent border-white/10 text-white/70 hover:bg-white/5 hover:text-white text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export Audit Log
            </Button>
          </a>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* KPI cards (wireframe p1) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-[#1E1E1E] border-white/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Users className="w-5 h-5 text-[#00FFCC]" />
                  <span className="text-xs text-white/40">{suspendedUsers} suspended</span>
                </div>
                <p className="text-2xl font-black">{totalUsers}</p>
                <p className="text-xs text-white/40">Total Users</p>
              </CardContent>
            </Card>
            <Card
              className={cn(
                'bg-[#1E1E1E]',
                highOpen > 0 ? 'border-red-500/30' : 'border-white/5'
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Flag className={cn('w-5 h-5', highOpen > 0 ? 'text-red-400' : 'text-[#00FFCC]')} />
                  {highOpen > 0 && (
                    <span className="text-xs font-bold text-red-400">{highOpen} HIGH</span>
                  )}
                </div>
                <p className="text-2xl font-black">{openReports}</p>
                <p className="text-xs text-white/40">Active Disputes</p>
              </CardContent>
            </Card>
            <Card className="bg-[#1E1E1E] border-white/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <DollarSign className="w-5 h-5 text-[#00FFCC]" />
                  <span
                    className={cn(
                      'text-xs font-bold',
                      overview?.stripeConfigured ? 'text-green-400' : 'text-white/40'
                    )}
                  >
                    {overview?.stripeConfigured ? 'Stripe live' : 'Stripe not configured'}
                  </span>
                </div>
                <p className="text-2xl font-black">
                  ${(Number(heldPayouts?.net_cents ?? 0) / 100).toFixed(0)}
                </p>
                <p className="text-xs text-white/40">
                  In Escrow ({heldPayouts?.count ?? 0} payouts)
                </p>
              </CardContent>
            </Card>
            <Card className="bg-[#1E1E1E] border-white/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Activity className="w-5 h-5 text-[#00FFCC]" />
                </div>
                <p className="text-2xl font-black">{overview?.activeShifts ?? 0}</p>
                <p className="text-xs text-white/40">Shifts Live Now</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* LEFT 2/3: triage + management */}
            <div className="xl:col-span-2 space-y-8">
              {/* Reports Triage */}
              <section id="reports">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-[#00FFCC]" /> Reports Triage
                </h2>
                <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden">
                  {reports.length === 0 ? (
                    <CardContent className="p-8 text-center text-sm text-white/40">
                      No reports. Quiet night.
                    </CardContent>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {reports.map((report) => (
                        <div key={report.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={cn(
                                  'text-[10px] font-black px-2 py-0.5 rounded-full border uppercase',
                                  SEVERITY_STYLE[report.severity]
                                )}
                              >
                                {report.severity}
                              </span>
                              <span className="text-xs text-white/40 uppercase">
                                {report.entity_type}
                              </span>
                              <span
                                className={cn(
                                  'text-[11px] font-bold',
                                  REPORT_STATUS_STYLE[report.status]
                                )}
                              >
                                {report.status}
                              </span>
                            </div>
                            <p className="text-sm text-white/80 truncate">{report.reason}</p>
                            <p className="text-[11px] text-white/30 mt-0.5">
                              #{report.id} · by {report.reporter_email ?? 'deleted user'} ·{' '}
                              {when(report.created_at)}
                              {report.resolution_note ? ` · note: ${report.resolution_note}` : ''}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {report.status === 'OPEN' && (
                              <Button
                                size="sm"
                                disabled={reportTransition.isPending}
                                onClick={() =>
                                  reportTransition.mutate({ id: report.id, status: 'REVIEWING' })
                                }
                                className="bg-[#00FFCC]/15 text-[#00FFCC] hover:bg-[#00FFCC]/25 border border-[#00FFCC]/20 text-xs font-bold"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" /> Review
                              </Button>
                            )}
                            {report.status !== 'CLOSED' && (
                              <Button
                                size="sm"
                                disabled={reportTransition.isPending}
                                onClick={() =>
                                  reportTransition.mutate({ id: report.id, status: 'CLOSED' })
                                }
                                className="bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 text-xs font-bold"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Close
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </section>

              {/* User & Gig Management */}
              <section id="management">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#00FFCC]" /> User &amp; Gig Management
                  </h2>
                  <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                    {(['users', 'gigs'] as const).map((key) => (
                      <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={cn(
                          'px-3 py-1 rounded-md text-xs font-bold capitalize transition-colors',
                          tab === key ? 'bg-[#00FFCC] text-black' : 'text-white/50 hover:text-white'
                        )}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>

                {tab === 'users' && (
                  <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden">
                    <div className="p-3 border-b border-white/5 flex gap-2">
                      <input
                        value={userFilter}
                        onChange={(event) => setUserFilter(event.target.value)}
                        placeholder="Search email or name…"
                        className="flex-1 bg-[#121212] border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#00FFCC]/50"
                      />
                      <button
                        onClick={() => setFlaggedOnly((value) => !value)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                          flaggedOnly
                            ? 'bg-red-500/15 text-red-400 border-red-500/30'
                            : 'bg-white/5 text-white/50 border-white/10'
                        )}
                      >
                        Flagged
                      </button>
                    </div>
                    <div className="divide-y divide-white/5">
                      {(usersData?.users ?? []).map((user) => (
                        <div key={user.id} className="p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">
                              {user.name ?? 'Unnamed'}{' '}
                              <span className="text-white/40 font-normal">{user.email}</span>
                            </p>
                            <p className="text-[11px] text-white/30">
                              {user.role ?? 'no role'} · joined {when(user.created_at)}
                              {user.open_reports > 0 && (
                                <span className="text-red-400 font-bold">
                                  {' '}
                                  · {user.open_reports} open report
                                  {user.open_reports > 1 ? 's' : ''}
                                </span>
                              )}
                              {user.suspended_at && (
                                <span className="text-red-400 font-bold">
                                  {' '}
                                  · suspended: {user.suspended_reason ?? 'no reason'}
                                </span>
                              )}
                            </p>
                          </div>
                          {user.role !== 'ADMIN' &&
                            (user.suspended_at ? (
                              <Button
                                size="sm"
                                disabled={suspendUser.isPending}
                                onClick={() => suspendUser.mutate({ id: user.id, suspend: false })}
                                className="bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 text-xs font-bold"
                              >
                                <Undo2 className="w-3.5 h-3.5 mr-1" /> Reinstate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                disabled={suspendUser.isPending}
                                onClick={() => suspendUser.mutate({ id: user.id, suspend: true })}
                                className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 text-xs font-bold"
                              >
                                <Ban className="w-3.5 h-3.5 mr-1" /> Suspend
                              </Button>
                            ))}
                        </div>
                      ))}
                      {(usersData?.users ?? []).length === 0 && (
                        <p className="p-6 text-center text-sm text-white/40">No matching users.</p>
                      )}
                    </div>
                  </Card>
                )}

                {tab === 'gigs' && (
                  <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden">
                    <div className="divide-y divide-white/5">
                      {(gigsData?.gigs ?? []).map((gig) => (
                        <div key={gig.id} className="p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/gigs/${gig.id}`}
                              className="text-sm font-bold hover:text-[#00FFCC] truncate block"
                            >
                              {gig.title}
                            </Link>
                            <p className="text-[11px] text-white/30">
                              {gig.venue_name ?? gig.venue_email} · {gig.status} ·{' '}
                              {gig.applicant_count} applicant{gig.applicant_count === 1 ? '' : 's'}
                              {gig.open_reports > 0 && (
                                <span className="text-red-400 font-bold">
                                  {' '}
                                  · {gig.open_reports} report{gig.open_reports > 1 ? 's' : ''}
                                </span>
                              )}
                            </p>
                          </div>
                          {gig.status !== 'CANCELLED' && (
                            <Button
                              size="sm"
                              disabled={takedownGig.isPending}
                              onClick={() => takedownGig.mutate(gig.id)}
                              className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 text-xs font-bold"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" /> Take Down
                            </Button>
                          )}
                        </div>
                      ))}
                      {(gigsData?.gigs ?? []).length === 0 && (
                        <p className="p-6 text-center text-sm text-white/40">No gigs.</p>
                      )}
                    </div>
                  </Card>
                )}
              </section>
            </div>

            {/* RIGHT 1/3: audit feed */}
            <div className="space-y-6">
              <section id="audit">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-[#00FFCC]" /> Audit Log
                </h2>
                <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden">
                  <div className="divide-y divide-white/5 max-h-[540px] overflow-y-auto">
                    {(auditData?.logs ?? []).map((log) => (
                      <div key={log.id} className="p-3">
                        <p className="text-xs font-bold text-white/80">{log.action}</p>
                        <p className="text-[11px] text-white/30 break-all">
                          {log.actor_id} → {log.entity_type}
                          {log.entity_id ? ` ${log.entity_id.slice(0, 13)}…` : ''} ·{' '}
                          {when(log.created_at)}
                        </p>
                      </div>
                    ))}
                    {(auditData?.logs ?? []).length === 0 && (
                      <p className="p-6 text-center text-sm text-white/40">No events yet.</p>
                    )}
                  </div>
                </Card>
                <p className="text-[11px] text-white/30 mt-2">
                  Newest 50 events; use Export for the filtered CSV (capped at 10,000 rows).
                </p>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
