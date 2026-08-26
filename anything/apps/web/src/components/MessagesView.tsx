'use client';

/**
 * Shared two-pane messaging UI (P5, wireframe p6) used by both role routes.
 * Conversation list + thread with TEXT / RATE_PROPOSAL / SYSTEM messages,
 * accept-rate flow, image attachments (P4 pipeline server-side), gig-in-focus
 * rail, and Report Conversation. Polling via TanStack Query (SSE deferred).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CircleDollarSign,
  Flag,
  ImagePlus,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardSidebar from '@/components/DashboardSidebar';
import { NotificationsBell } from '@/components/NotificationsBell';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth-client';

interface Conversation {
  id: string;
  gig_id: string | null;
  kind: 'GIG' | 'PARTY_INQUIRY';
  other_name: string | null;
  gig_title: string | null;
  gig_status: string | null;
  gig_base_rate: string | null;
  gig_start_time: string | null;
  last_content: string | null;
  last_kind: string | null;
  last_at: string | null;
  unread_count: number;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  kind: 'TEXT' | 'RATE_PROPOSAL' | 'SYSTEM';
  rate_cents: number | null;
  attachment_url: string | null;
  created_at: string;
}

export function MessagesView({ role }: { role: 'talent' | 'venue' | 'party' }) {
  const qc = useQueryClient();
  const { data: session } = authClient.useSession();
  const myId = session?.user?.id;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalRate, setProposalRate] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // S20: ?c=<conversationId> deep link (Inquire / saved-talent outreach land
  // on their new thread). Two traps shape the mechanism: useSearchParams
  // would demand a Suspense boundary that never resolves under the nonce-CSP
  // setup (the settings page learned this the hard way), and reading
  // window.location in a mount effect races App Router client-side pushes —
  // the URL can still be the PREVIOUS page's when effects first run. So the
  // param is consumed when the conversations list arrives (a network round
  // trip later, the URL has settled), and only once — after that the user's
  // own thread clicks win.
  const consumedDeepLink = useRef<string | null>(null);

  const { data: listData, isPending: listPending } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await fetch('/api/conversations');
      if (!res.ok) throw new Error('Failed to load conversations');
      return res.json() as Promise<{ conversations: Conversation[] }>;
    },
    refetchInterval: 30_000, // fallback — SSE invalidation (S9) drives freshness
  });
  const conversations = useMemo(() => listData?.conversations ?? [], [listData]);
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  // Select the ?c= thread once the list is in; default to the most recent
  // thread otherwise. A ?c= id that is not in the caller's own list (stale
  // or forged) falls through to the default.
  useEffect(() => {
    if (conversations.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get('c');
    if (
      wanted &&
      consumedDeepLink.current !== wanted &&
      conversations.some((conversation) => conversation.id === wanted)
    ) {
      consumedDeepLink.current = wanted;
      setSelectedId(wanted);
      return;
    }
    if (!selectedId || !conversations.some((conversation) => conversation.id === selectedId)) {
      setSelectedId(conversations[0].id);
    }
  }, [selectedId, conversations]);

  const { data: threadData } = useQuery({
    queryKey: ['messages', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${selectedId}/messages`);
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json() as Promise<{ messages: Message[] }>;
    },
    refetchInterval: 30_000, // fallback — SSE invalidation (S9) drives freshness
  });
  const messages = threadData?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async (payload: {
      content?: string;
      kind?: 'TEXT' | 'RATE_PROPOSAL';
      rate_cents?: number;
      attachment_url?: string;
    }) => {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not send');
      }
    },
    onSuccess: () => {
      setDraft('');
      setAttachment(null);
      setProposalOpen(false);
      setProposalRate('');
      void qc.invalidateQueries({ queryKey: ['messages', selectedId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const acceptRate = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await fetch(`/api/conversations/${selectedId}/accept-rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not accept');
      }
    },
    onSuccess: () => {
      toast.success('Rate accepted — it now applies to the application');
      void qc.invalidateQueries({ queryKey: ['messages', selectedId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const report = useMutation({
    mutationFn: async () => {
      const reason = window.prompt('What is wrong with this conversation?');
      if (!reason || reason.trim().length < 3) throw new Error('Report cancelled');
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'conversation',
          entity_id: selectedId,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) throw new Error('Could not file report');
    },
    onSuccess: () => toast.success('Reported — our moderation team will review'),
    onError: (error: Error) => {
      if (error.message !== 'Report cancelled') toast.error(error.message);
    },
  });

  const onPickFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Max 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachment(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (attachment) {
      send.mutate({ content: draft.trim(), attachment_url: attachment });
      return;
    }
    if (draft.trim().length === 0) return;
    send.mutate({ content: draft.trim() });
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role={role} />

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold">Messages</h1>
            <p className="text-xs text-white/40">
              {listPending ? 'Loading…' : `${conversations.length} conversations`}
            </p>
          </div>
          <NotificationsBell role={role} />
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* ── Conversation list ── */}
          <aside className="w-72 flex-shrink-0 border-r border-white/5 bg-[#0F0F0F] overflow-y-auto hidden md:block">
            {conversations.length === 0 && !listPending ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-xs text-white/30 leading-relaxed">
                  No conversations yet.{' '}
                  {role === 'talent'
                    ? 'Open a gig and hit "Inquire" to start one.'
                    : role === 'party'
                      ? 'Find a venue you love and inquire about hosting your private party.'
                      : 'Threads open when talent inquire about your gigs.'}
                </p>
                {role === 'party' && (
                  <Link
                    href="/venues"
                    className="inline-block mt-3 text-xs font-bold text-[#00FFCC] hover:underline"
                  >
                    Discover venues →
                  </Link>
                )}
              </div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors',
                    conversation.id === selectedId && 'bg-[#00FFCC]/[0.05]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-white truncate">
                      {conversation.other_name ?? 'Conversation'}
                    </p>
                    {conversation.unread_count > 0 && (
                      <span className="bg-[#00FFCC] text-black text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                  {conversation.gig_title && (
                    <p className="text-[11px] text-[#00FFCC]/70 font-semibold truncate">
                      {conversation.gig_title}
                    </p>
                  )}
                  <p className="text-xs text-white/35 truncate mt-0.5">
                    {conversation.last_kind === 'RATE_PROPOSAL'
                      ? '💰 Rate proposal'
                      : (conversation.last_content ?? 'New conversation')}
                  </p>
                </button>
              ))
            )}
          </aside>

          {/* ── Thread ── */}
          <section className="flex-1 flex flex-col min-w-0">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center">
                {listPending ? (
                  <Loader2 className="w-6 h-6 text-[#00FFCC] animate-spin" />
                ) : (
                  <p className="text-white/30 text-sm">Select a conversation</p>
                )}
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="h-12 flex items-center justify-between px-4 border-b border-white/5 flex-shrink-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">
                      {selected.other_name ?? 'Conversation'}
                      {selected.kind === 'PARTY_INQUIRY' && (
                        <span className="ml-2 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                          Private-party inquiry
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => report.mutate()}
                    className="text-white/30 hover:text-red-400 transition-colors flex items-center gap-1 text-xs"
                  >
                    <Flag className="w-3.5 h-3.5" /> Report
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {messages.map((message) => {
                    const mine = message.sender_id === myId;
                    if (message.kind === 'SYSTEM') {
                      return (
                        <p
                          key={message.id}
                          className="text-center text-[11px] text-white/30 py-1"
                        >
                          — {message.content} —
                        </p>
                      );
                    }
                    return (
                      <div
                        key={message.id}
                        className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[75%] rounded-2xl px-4 py-2.5',
                            message.kind === 'RATE_PROPOSAL'
                              ? 'bg-[#00FFCC]/10 border border-[#00FFCC]/30'
                              : mine
                                ? 'bg-[#00FFCC]/15 text-white'
                                : 'bg-white/[0.06] text-white'
                          )}
                        >
                          {message.kind === 'RATE_PROPOSAL' && (
                            <div className="flex items-center gap-2 mb-1">
                              <CircleDollarSign className="w-4 h-4 text-[#00FFCC]" />
                              <span className="text-sm font-black text-[#00FFCC]">
                                Proposed ${((message.rate_cents ?? 0) / 100).toFixed(2)}/hr
                              </span>
                            </div>
                          )}
                          {message.content && (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                              {message.content}
                            </p>
                          )}
                          {message.attachment_url && (
                            <img
                              src={message.attachment_url}
                              alt="attachment"
                              className="mt-2 rounded-lg max-h-48 object-cover"
                            />
                          )}
                          {message.kind === 'RATE_PROPOSAL' && !mine && (
                            <Button
                              size="sm"
                              disabled={acceptRate.isPending}
                              onClick={() => acceptRate.mutate(message.id)}
                              className="mt-2 bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs h-7"
                            >
                              Accept rate
                            </Button>
                          )}
                          <p className="text-[10px] text-white/25 mt-1">
                            {new Date(message.created_at).toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Composer */}
                <div className="border-t border-white/5 p-3 flex-shrink-0 space-y-2">
                  {attachment && (
                    <div className="flex items-center gap-2 px-2">
                      <img src={attachment} alt="preview" className="h-12 rounded-lg" />
                      <button
                        onClick={() => setAttachment(null)}
                        className="text-white/40 hover:text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {proposalOpen && (
                    <div className="flex items-center gap-2 px-2">
                      <CircleDollarSign className="w-4 h-4 text-[#00FFCC] flex-shrink-0" />
                      <input
                        type="number"
                        min={0}
                        placeholder="Rate $/hr"
                        value={proposalRate}
                        onChange={(e) => setProposalRate(e.target.value)}
                        className="w-28 bg-[#121212] border border-[#00FFCC]/30 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#00FFCC]"
                      />
                      <Button
                        size="sm"
                        disabled={send.isPending || !(Number(proposalRate) > 0)}
                        onClick={() =>
                          send.mutate({
                            kind: 'RATE_PROPOSAL',
                            rate_cents: Math.round(Number(proposalRate) * 100),
                            content: draft.trim(),
                          })
                        }
                        className="bg-[#00FFCC] text-black font-bold text-xs h-7"
                      >
                        Propose
                      </Button>
                      <button
                        onClick={() => setProposalOpen(false)}
                        className="text-white/40 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPickFile(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      title="Attach image"
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 flex-shrink-0"
                    >
                      <ImagePlus className="w-4 h-4" />
                    </button>
                    {selected.kind === 'GIG' && (
                      <button
                        onClick={() => setProposalOpen((prev) => !prev)}
                        title="Propose a rate"
                        className={cn(
                          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
                          proposalOpen
                            ? 'bg-[#00FFCC]/15 text-[#00FFCC]'
                            : 'bg-white/5 hover:bg-white/10 text-white/50'
                        )}
                      >
                        <CircleDollarSign className="w-4 h-4" />
                      </button>
                    )}
                    <textarea
                      rows={1}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                      placeholder="Write a message…"
                      className="flex-1 bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-[#00FFCC]/50 resize-none"
                    />
                    <Button
                      disabled={send.isPending || (draft.trim().length === 0 && !attachment)}
                      onClick={submit}
                      className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold h-9 w-9 p-0 flex-shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/20 text-center flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    All communications and payments are secured via the AfterDark platform.
                  </p>
                </div>
              </>
            )}
          </section>

          {/* ── Gig in focus rail ── */}
          {selected?.gig_id && (
            <aside className="hidden xl:block w-64 flex-shrink-0 border-l border-white/5 bg-[#0F0F0F] p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                Gig in focus
              </p>
              <div className="rounded-xl bg-[#1A1A1A] border border-white/5 p-4">
                <p className="text-sm font-black text-white leading-tight">
                  {selected.gig_title}
                </p>
                {selected.gig_status && (
                  <span className="inline-block mt-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">
                    {selected.gig_status}
                  </span>
                )}
                {selected.gig_base_rate && (
                  <p className="text-xs text-white/50 mt-2">
                    Base rate:{' '}
                    <span className="text-white font-bold">
                      ${Number(selected.gig_base_rate).toFixed(0)}/hr
                    </span>
                  </p>
                )}
                {selected.gig_start_time && (
                  <p className="text-xs text-white/50 mt-1">
                    {new Date(selected.gig_start_time).toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                )}
                <Link href={`/gigs/${selected.gig_id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3 bg-transparent border-white/10 text-white/70 hover:bg-white/5 hover:text-white text-xs"
                  >
                    View full listing
                  </Button>
                </Link>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
