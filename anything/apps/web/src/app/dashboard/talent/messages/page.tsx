'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Send,
  Paperclip,
  Bell,
  Zap,
  MapPin,
  Clock,
  DollarSign,
  Music,
  CalendarDays,
  Star,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageType = 'sent' | 'received' | 'event';

interface Message {
  id: number;
  type: MessageType;
  content: string;
  time: string;
  read?: boolean;
  eventKind?: 'rate_proposal' | 'rate_accepted' | 'gig_confirmed';
  eventData?: string;
}

interface Conversation {
  id: number;
  name: string;
  role: string;
  initials: string;
  color: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  gigTitle: string;
  messages: Message[];
}

interface GigFocus {
  venueName: string;
  gigTitle: string;
  image: string;
  location: string;
  date: string;
  time: string;
  budget: string;
  rating: number;
  description: string;
  status: 'SHORTLISTED' | 'PENDING' | 'HIRED';
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const CONVERSATIONS: Conversation[] = [
  {
    id: 1,
    name: 'Nebula NYC',
    role: 'Venue Manager',
    initials: 'NB',
    color: 'bg-[#00FFCC]/20 text-[#00FFCC]',
    lastMessage: "Sounds good — we'll lock in the $175/hr rate.",
    time: '11:42 PM',
    unread: 2,
    online: true,
    gigTitle: 'Closing Set – Main Room',
    messages: [
      {
        id: 1,
        type: 'received',
        content:
          "Hey Marcus! We loved your SoundCloud mix. You'd be a great fit for our Saturday closing set.",
        time: '10:15 PM',
      },
      {
        id: 2,
        type: 'sent',
        content: "Thanks! I'd love to play Nebula. What's the set time and expected crowd?",
        time: '10:22 PM',
        read: true,
      },
      {
        id: 3,
        type: 'received',
        content:
          'The closing set runs 2AM–6AM. We typically hit 600–800 capacity, predominantly house and techno crowd.',
        time: '10:30 PM',
      },
      {
        id: 4,
        type: 'event',
        content: '',
        time: '10:45 PM',
        eventKind: 'rate_proposal',
        eventData: '$175/hr',
      },
      {
        id: 5,
        type: 'received',
        content: "That rate works for us. We'll draft the contract now.",
        time: '11:02 PM',
      },
      {
        id: 6,
        type: 'event',
        content: '',
        time: '11:05 PM',
        eventKind: 'rate_accepted',
        eventData: '$175/hr',
      },
      {
        id: 7,
        type: 'received',
        content: "Sounds good — we'll lock in the $175/hr rate.",
        time: '11:42 PM',
      },
    ],
  },
  {
    id: 2,
    name: 'PHD Rooftop',
    role: 'Event Coordinator',
    initials: 'PH',
    color: 'bg-purple-500/20 text-purple-400',
    lastMessage: 'Can you do a quick mix preview?',
    time: '9:00 PM',
    unread: 0,
    online: true,
    gigTitle: 'Saturday Night Rooftop',
    messages: [
      {
        id: 1,
        type: 'received',
        content: 'Hi! We have a rooftop gig Saturday 11PM–4AM, Hip-Hop/R&B. Interested?',
        time: '8:45 PM',
      },
      {
        id: 2,
        type: 'sent',
        content: "Yes, definitely interested! What's the budget range?",
        time: '8:52 PM',
        read: true,
      },
      {
        id: 3,
        type: 'received',
        content: "We're thinking $200–$220/hr. Can you do a quick mix preview?",
        time: '9:00 PM',
      },
    ],
  },
  {
    id: 3,
    name: 'Limelight',
    role: 'Talent Buyer',
    initials: 'LL',
    color: 'bg-orange-500/20 text-orange-400',
    lastMessage: "We'd love to have you for the Afrobeats night.",
    time: 'Yesterday',
    unread: 1,
    online: false,
    gigTitle: 'Afrobeats Thursday',
    messages: [
      {
        id: 1,
        type: 'received',
        content: "We'd love to have you for the Afrobeats night. Thursday 9PM–2AM, $140/hr + tips.",
        time: 'Yesterday',
      },
    ],
  },
  {
    id: 4,
    name: 'The Standard',
    role: 'Booking Manager',
    initials: 'TS',
    color: 'bg-blue-500/20 text-blue-400',
    lastMessage: 'Contract sent to your email.',
    time: 'Mon',
    unread: 0,
    online: false,
    gigTitle: 'House Night Main Stage',
    messages: [
      {
        id: 1,
        type: 'event',
        content: '',
        time: 'Mon',
        eventKind: 'gig_confirmed',
        eventData: 'Fri Jul 18 · $150/hr',
      },
      {
        id: 2,
        type: 'received',
        content: 'Contract sent to your email. See you Friday!',
        time: 'Mon',
      },
    ],
  },
  {
    id: 5,
    name: 'Output BK',
    role: 'Venue Owner',
    initials: 'OP',
    color: 'bg-pink-500/20 text-pink-400',
    lastMessage: "You're shortlisted for the closing slot.",
    time: 'Sun',
    unread: 0,
    online: false,
    gigTitle: 'Techno Saturday Closing',
    messages: [
      {
        id: 1,
        type: 'received',
        content: "You're shortlisted for the closing slot. We'll confirm by Thursday.",
        time: 'Sun',
      },
    ],
  },
];

const GIG_FOCUS_MAP: Record<number, GigFocus> = {
  1: {
    venueName: 'Nebula NYC',
    gigTitle: 'Closing Set – Main Room',
    image: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=600&q=80',
    location: 'Midtown, New York',
    date: 'Sat, Jul 19, 2026',
    time: '2:00 AM – 6:00 AM',
    budget: '$175/hr',
    rating: 4.9,
    description:
      "Nebula is one of NYC's premier underground venues, known for world-class sound and a loyal house/techno crowd. Closing sets here are career-defining.",
    status: 'SHORTLISTED',
  },
  2: {
    venueName: 'PHD Rooftop',
    gigTitle: 'Saturday Night Rooftop',
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80',
    location: 'Downtown, New York',
    date: 'Sat, Jul 19, 2026',
    time: '11:00 PM – 4:00 AM',
    budget: '$200–$220/hr',
    rating: 4.7,
    description:
      'Rooftop venue with stunning Manhattan skyline views. Hip-Hop / R&B format, upscale crowd.',
    status: 'PENDING',
  },
  3: {
    venueName: 'Limelight',
    gigTitle: 'Afrobeats Thursday',
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?w=600&q=80',
    location: 'Chelsea, New York',
    date: 'Thu, Jul 17, 2026',
    time: '9:00 PM – 2:00 AM',
    budget: '$140/hr + Tips',
    rating: 4.6,
    description:
      'High-energy Afrobeats night. Limelight has a diverse, vibrant crowd and consistent weekly bookings.',
    status: 'PENDING',
  },
  4: {
    venueName: 'The Standard',
    gigTitle: 'House Night Main Stage',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=80',
    location: 'Meatpacking, New York',
    date: 'Fri, Jul 18, 2026',
    time: '10:00 PM – 3:00 AM',
    budget: '$150/hr',
    rating: 4.8,
    description:
      'Iconic Meatpacking venue. House night with a loyal Friday crowd and top-tier production.',
    status: 'HIRED',
  },
  5: {
    venueName: 'Output BK',
    gigTitle: 'Techno Saturday Closing',
    image: 'https://images.unsplash.com/photo-1598387181032-a3103a2db5b3?w=600&q=80',
    location: 'Williamsburg, Brooklyn',
    date: 'Sat, Jul 19, 2026',
    time: '11:00 PM – 6:00 AM',
    budget: '$200/hr',
    rating: 4.9,
    description:
      "Output is Brooklyn's leading underground club. Known for serious techno and an immersive sound system.",
    status: 'SHORTLISTED',
  },
};

const STATUS_CONFIG = {
  SHORTLISTED: {
    label: 'Shortlisted',
    color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20',
  },
  PENDING: { label: 'Pending', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  HIRED: { label: 'Hired', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function EventBubble({ msg }: { msg: Message }) {
  if (msg.eventKind === 'rate_proposal') {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2.5 bg-[#00FFCC]/5 border border-[#00FFCC]/20 rounded-xl px-4 py-2.5">
          <DollarSign className="w-3.5 h-3.5 text-[#00FFCC] flex-shrink-0" />
          <div className="text-center">
            <p className="text-xs font-black text-[#00FFCC]">Rate Proposed · {msg.eventData}</p>
            <p className="text-[10px] text-white/40 mt-0.5">Awaiting venue response · {msg.time}</p>
          </div>
        </div>
      </div>
    );
  }
  if (msg.eventKind === 'rate_accepted') {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2.5 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-2.5">
          <CheckCheck className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          <div className="text-center">
            <p className="text-xs font-black text-green-400">Rate Accepted · {msg.eventData}</p>
            <p className="text-[10px] text-white/40 mt-0.5">Both parties agreed · {msg.time}</p>
          </div>
        </div>
      </div>
    );
  }
  if (msg.eventKind === 'gig_confirmed') {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5">
          <CalendarDays className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <div className="text-center">
            <p className="text-xs font-black text-blue-400">Gig Confirmed</p>
            <p className="text-[10px] text-white/40 mt-0.5">
              {msg.eventData} · {msg.time}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const [activeId, setActiveId] = useState(1);
  const [input, setInput] = useState('');
  const [convos, setConvos] = useState(CONVERSATIONS);
  const [proposeRate, setProposeRate] = useState(false);
  const [rateValue, setRateValue] = useState('175');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(1000);

  const active = convos.find((c) => c.id === activeId)!;
  const gig = GIG_FOCUS_MAP[activeId];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeId, active?.messages.length]);

  // When selecting a conversation on mobile, switch to chat view
  const handleSelectConversation = (id: number) => {
    setActiveId(id);
    setMobileView('chat');
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    msgCounter.current += 1;
    const newMsg: Message = {
      id: msgCounter.current,
      type: 'sent',
      content: input.trim(),
      time: 'Just now',
      read: false,
    };
    setConvos((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? { ...c, messages: [...c.messages, newMsg], lastMessage: input.trim(), time: 'Just now' }
          : c
      )
    );
    setInput('');
  };

  const sendRateProposal = () => {
    msgCounter.current += 1;
    const newMsg: Message = {
      id: msgCounter.current,
      type: 'event',
      content: '',
      time: 'Just now',
      eventKind: 'rate_proposal',
      eventData: `$${rateValue}/hr`,
    };
    setConvos((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? {
              ...c,
              messages: [...c.messages, newMsg],
              lastMessage: `Rate proposed: $${rateValue}/hr`,
              time: 'Just now',
            }
          : c
      )
    );
    setProposeRate(false);
  };

  return (
    <div className="h-[100dvh] bg-[#121212] text-white flex font-sans overflow-hidden pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* ── Conversation list ─── hidden on mobile when chat is active */}
        <div
          className={cn(
            'flex-col border-r border-white/5 bg-[#0D0D0D]',
            'w-full md:w-72 md:flex flex-shrink-0',
            mobileView === 'list' ? 'flex' : 'hidden md:flex'
          )}
        >
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
            <h2 className="text-base font-bold">Messages</h2>
            <button className="relative w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-white/50" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input
                type="text"
                placeholder="Search messages…"
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-[#00FFCC]/30"
              />
            </div>
          </div>

          {/* Conversation items */}
          <div className="flex-1 overflow-y-auto">
            {convos.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectConversation(c.id)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3.5 border-b border-white/5 text-left transition-colors hover:bg-white/[0.03]',
                  activeId === c.id && 'bg-[#00FFCC]/5 border-l-2 border-l-[#00FFCC]'
                )}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-xs font-black border border-white/10',
                      c.color
                    )}
                  >
                    {c.initials}
                  </div>
                  {c.online && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-[#0D0D0D] rounded-full" />
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p
                      className={cn(
                        'text-sm font-bold truncate',
                        activeId === c.id ? 'text-[#00FFCC]' : 'text-white'
                      )}
                    >
                      {c.name}
                    </p>
                    <span className="text-[10px] text-white/30 flex-shrink-0">{c.time}</span>
                  </div>
                  <p className="text-[11px] text-white/40 truncate mb-1">{c.gigTitle}</p>
                  <p className="text-xs text-white/30 truncate">{c.lastMessage}</p>
                </div>
                {c.unread > 0 && (
                  <span className="flex-shrink-0 bg-[#00FFCC] text-black text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center mt-1">
                    {c.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Chat window ───────────────────────────────────────────── */}
        <div
          className={cn(
            'flex-col min-w-0 border-r border-white/5',
            'w-full md:flex-1',
            mobileView === 'chat' ? 'flex flex-1' : 'hidden md:flex'
          )}
        >
          {/* Chat header */}
          <div className="h-16 flex items-center justify-between px-4 md:px-5 border-b border-white/5 bg-[#0F0F0F] flex-shrink-0">
            <div className="flex items-center gap-3">
              {/* Mobile back button */}
              <button
                onClick={() => setMobileView('list')}
                className="md:hidden w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-xs font-black border border-white/10',
                  active.color
                )}
              >
                {active.initials}
              </div>
              <div>
                <p className="text-sm font-bold">{active.name}</p>
                <p className="text-[11px] text-white/40 flex items-center gap-1.5">
                  {active.online && (
                    <Circle className="w-1.5 h-1.5 fill-green-400 text-green-400" />
                  )}
                  {active.online ? 'Online now' : 'Offline'} · {active.role}
                </p>
              </div>
            </div>
            <div className="text-[11px] text-white/30 hidden sm:block truncate max-w-[200px]">
              Re: <span className="text-white/50 font-medium">{active.gigTitle}</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
            {active.messages.map((msg) => {
              if (msg.type === 'event') return <EventBubble key={msg.id} msg={msg} />;
              const isSent = msg.type === 'sent';
              return (
                <div
                  key={msg.id}
                  className={cn('flex gap-2.5', isSent ? 'justify-end' : 'justify-start')}
                >
                  {!isSent && (
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border border-white/10 flex-shrink-0 mt-0.5',
                        active.color
                      )}
                    >
                      {active.initials}
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[65%] flex flex-col',
                      isSent ? 'items-end' : 'items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                        isSent
                          ? 'bg-[#00FFCC] text-black rounded-br-sm font-medium'
                          : 'bg-[#1E1E1E] text-white rounded-bl-sm border border-white/5'
                      )}
                    >
                      {msg.content}
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-1 mt-1',
                        isSent ? 'flex-row-reverse' : ''
                      )}
                    >
                      <span className="text-[10px] text-white/25">{msg.time}</span>
                      {isSent &&
                        (msg.read ? (
                          <CheckCheck className="w-3 h-3 text-[#00FFCC]" />
                        ) : (
                          <Check className="w-3 h-3 text-white/30" />
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-5 pb-2 flex gap-2 flex-wrap">
            <button
              onClick={() => setProposeRate(!proposeRate)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors',
                proposeRate
                  ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                  : 'bg-[#1A1A1A] border-white/10 text-white/50 hover:text-white'
              )}
            >
              <DollarSign className="w-3 h-3" /> Propose Rate
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#1A1A1A] text-xs font-bold text-white/50 hover:text-white transition-colors">
              <Music className="w-3 h-3" /> Share Setlist
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#1A1A1A] text-xs font-bold text-white/50 hover:text-white transition-colors">
              <CalendarDays className="w-3 h-3" /> Check Availability
            </button>
          </div>

          {/* Rate Propose inline */}
          {proposeRate && (
            <div className="mx-5 mb-2 flex items-center gap-2 p-3 rounded-xl bg-[#1A1A1A] border border-[#00FFCC]/20">
              <DollarSign className="w-3.5 h-3.5 text-[#00FFCC] flex-shrink-0" />
              <input
                type="number"
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                className="flex-1 bg-transparent text-sm font-bold text-white focus:outline-none"
                placeholder="Enter rate..."
              />
              <span className="text-xs text-white/40">/hr</span>
              <Button
                size="sm"
                onClick={sendRateProposal}
                className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-black text-xs h-7 px-3"
              >
                Send
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="px-5 pb-5 flex-shrink-0">
            <div className="flex items-center gap-2 bg-[#1A1A1A] border border-white/10 rounded-2xl px-4 py-2.5 focus-within:border-[#00FFCC]/30 transition-colors">
              <button className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0">
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="text"
                placeholder="Type a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                  input.trim()
                    ? 'bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90'
                    : 'bg-white/5 text-white/20'
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Gig in Focus ──────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-72 xl:w-80 flex-shrink-0 bg-[#0D0D0D] overflow-y-auto">
          {/* Venue image */}
          <div className="relative h-44 flex-shrink-0 overflow-hidden">
            <img src={gig.image} alt={gig.venueName} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-black/40 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <div className="flex items-center justify-between">
                <p className="text-base font-black text-white leading-tight">{gig.venueName}</p>
                <span
                  className={cn(
                    'text-[10px] font-black px-2 py-0.5 rounded-full border',
                    STATUS_CONFIG[gig.status].color
                  )}
                >
                  {STATUS_CONFIG[gig.status].label}
                </span>
              </div>
              <p className="text-xs text-white/60 mt-0.5">{gig.gigTitle}</p>
            </div>
          </div>

          <div className="p-4 space-y-4 flex-1">
            {/* Gig Details */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Gig Details
              </p>
              {[
                { icon: <MapPin className="w-3.5 h-3.5" />, value: gig.location },
                { icon: <CalendarDays className="w-3.5 h-3.5" />, value: gig.date },
                { icon: <Clock className="w-3.5 h-3.5" />, value: gig.time },
                { icon: <DollarSign className="w-3.5 h-3.5" />, value: gig.budget },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs">
                  <span className="text-white/30 flex-shrink-0">{row.icon}</span>
                  <span className="text-white/70">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Rating */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'w-3 h-3',
                      i < Math.floor(gig.rating)
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-white/10 fill-white/10'
                    )}
                  />
                ))}
              </div>
              <span className="text-xs font-bold text-white/60">{gig.rating} / 5.0</span>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Button className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-black text-sm flex items-center justify-between">
                Propose Final Rate <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                className="w-full border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm font-semibold"
              >
                View Full Listing
              </Button>
            </div>

            <div className="border-t border-white/5" />

            {/* About the Venue */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                About the Venue
              </p>
              <p className="text-xs text-white/50 leading-relaxed">{gig.description}</p>
            </div>

            {/* Zap indicator */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[#00FFCC]/5 border border-[#00FFCC]/10">
              <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-white/40 leading-relaxed">
                Avg response time for this venue is{' '}
                <span className="text-white/60 font-bold">~14 min</span>. Keep the conversation
                going!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
