'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Send,
  Paperclip,
  Bell,
  Zap,
  DollarSign,
  CalendarDays,
  Star,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Circle,
  UserCheck,
  UserX,
  Clock,
  Music,
  MapPin,
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
  eventKind?: 'offer_sent' | 'rate_received' | 'rate_accepted' | 'talent_confirmed';
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
  appliedGig: string;
  applicationStatus: 'PENDING' | 'SHORTLISTED' | 'HIRED' | 'REJECTED';
  messages: Message[];
}

interface TalentFocus {
  name: string;
  role: string;
  initials: string;
  color: string;
  neighborhood: string;
  rateMin: number;
  rateMax: number;
  rating: number;
  reviewCount: number;
  appliedGig: string;
  gigDate: string;
  gigTime: string;
  bio: string;
  genres: string[];
  applicationStatus: 'PENDING' | 'SHORTLISTED' | 'HIRED' | 'REJECTED';
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  SHORTLISTED: {
    label: 'Shortlisted',
    color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20',
  },
  HIRED: { label: 'Hired', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  REJECTED: { label: 'Rejected', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
};

const CONVERSATIONS: Conversation[] = [
  {
    id: 1,
    name: 'DJ Kira Voss',
    role: 'DJ / Producer',
    initials: 'KV',
    color: 'bg-[#00FFCC]/20 text-[#00FFCC]',
    lastMessage: "I'm available and would love the closing slot.",
    time: '11:52 PM',
    unread: 2,
    online: true,
    appliedGig: 'Closing Set – Main Room',
    applicationStatus: 'SHORTLISTED',
    messages: [
      {
        id: 1,
        type: 'received',
        content:
          'Hi! I applied for the closing set. I play deep house and techno. My SoundCloud is linked in my profile.',
        time: '10:10 PM',
      },
      {
        id: 2,
        type: 'sent',
        content:
          "Thanks Kira! We checked your mixes — really love the sound. You're shortlisted for the closing slot.",
        time: '10:30 PM',
        read: true,
      },
      {
        id: 3,
        type: 'event',
        content: '',
        time: '10:45 PM',
        eventKind: 'offer_sent',
        eventData: '$175/hr · Sat Jul 19 · 2AM–6AM',
      },
      {
        id: 4,
        type: 'received',
        content:
          'That sounds great. Can we do $185/hr? I bring my own equipment and have 800+ followers in NYC.',
        time: '11:00 PM',
      },
      {
        id: 5,
        type: 'event',
        content: '',
        time: '11:05 PM',
        eventKind: 'rate_received',
        eventData: '$185/hr',
      },
      {
        id: 6,
        type: 'sent',
        content: "We can do $180/hr — that's our max for this slot. Does that work?",
        time: '11:20 PM',
        read: true,
      },
      {
        id: 7,
        type: 'received',
        content: "I'm available and would love the closing slot.",
        time: '11:52 PM',
      },
    ],
  },
  {
    id: 2,
    name: 'Marcus Lee',
    role: 'DJ / Producer',
    initials: 'ML',
    color: 'bg-purple-500/20 text-purple-400',
    lastMessage: 'Confirmed. See you Saturday.',
    time: '9:30 PM',
    unread: 0,
    online: false,
    appliedGig: 'House Night Opener',
    applicationStatus: 'HIRED',
    messages: [
      {
        id: 1,
        type: 'received',
        content:
          "Hey! I'd love to open for the house night. I've played similar sets at PHD and Output before.",
        time: '8:00 PM',
      },
      {
        id: 2,
        type: 'event',
        content: '',
        time: '8:30 PM',
        eventKind: 'offer_sent',
        eventData: '$120/hr · Fri Jul 18 · 10PM–1AM',
      },
      {
        id: 3,
        type: 'event',
        content: '',
        time: '8:35 PM',
        eventKind: 'rate_accepted',
        eventData: '$120/hr',
      },
      {
        id: 4,
        type: 'event',
        content: '',
        time: '8:40 PM',
        eventKind: 'talent_confirmed',
        eventData: 'Fri Jul 18 · $120/hr',
      },
      {
        id: 5,
        type: 'received',
        content: 'Confirmed. See you Saturday.',
        time: '9:30 PM',
      },
    ],
  },
  {
    id: 3,
    name: 'Sophia Cruz',
    role: 'Mixologist',
    initials: 'SC',
    color: 'bg-orange-500/20 text-orange-400',
    lastMessage: 'I can bring my own bar tools too.',
    time: 'Yesterday',
    unread: 1,
    online: true,
    appliedGig: 'VIP Lounge Mixologist',
    applicationStatus: 'HIRED',
    messages: [
      {
        id: 1,
        type: 'received',
        content:
          'Applied for the VIP lounge role. 4 years experience, specialise in craft cocktails.',
        time: 'Yesterday',
      },
      {
        id: 2,
        type: 'sent',
        content: "You're hired, Sophia! $65/hr + tips for the VIP lounge Friday 8PM–2AM.",
        time: 'Yesterday',
        read: true,
      },
      {
        id: 3,
        type: 'received',
        content: 'I can bring my own bar tools too.',
        time: 'Yesterday',
      },
    ],
  },
  {
    id: 4,
    name: 'James Rivera',
    role: 'Security Lead',
    initials: 'JR',
    color: 'bg-blue-500/20 text-blue-400',
    lastMessage: 'Sure, happy to brief the team on arrival.',
    time: 'Mon',
    unread: 0,
    online: false,
    appliedGig: 'Door / Security Lead',
    applicationStatus: 'HIRED',
    messages: [
      {
        id: 1,
        type: 'received',
        content: 'Experienced door lead, 3 years at high-volume NYC venues. References available.',
        time: 'Mon',
      },
      {
        id: 2,
        type: 'sent',
        content: 'Hired for Saturday. Report at 9PM for briefing. $45/hr, 7hr shift.',
        time: 'Mon',
        read: true,
      },
      {
        id: 3,
        type: 'received',
        content: 'Sure, happy to brief the team on arrival.',
        time: 'Mon',
      },
    ],
  },
  {
    id: 5,
    name: 'Yuna Kim',
    role: 'Go-Go Dancer',
    initials: 'YK',
    color: 'bg-pink-500/20 text-pink-400',
    lastMessage: 'Interested in the rooftop happy hour.',
    time: 'Sun',
    unread: 0,
    online: false,
    appliedGig: 'Rooftop Happy Hour DJ',
    applicationStatus: 'PENDING',
    messages: [
      {
        id: 1,
        type: 'received',
        content: 'Interested in the rooftop happy hour. Available Thursday 4PM onwards.',
        time: 'Sun',
      },
    ],
  },
];

const TALENT_FOCUS_MAP: Record<number, TalentFocus> = {
  1: {
    name: 'DJ Kira Voss',
    role: 'DJ / Producer',
    initials: 'KV',
    color: 'bg-[#00FFCC]/20 text-[#00FFCC]',
    neighborhood: 'Brooklyn, NY',
    rateMin: 160,
    rateMax: 200,
    rating: 4.9,
    reviewCount: 48,
    appliedGig: 'Closing Set – Main Room',
    gigDate: 'Sat, Jul 19, 2026',
    gigTime: '2:00 AM – 6:00 AM',
    bio: 'Deep house and techno specialist with 6 years of experience in NYC underground venues. Known for flawless transitions and crowd reading.',
    genres: ['Deep House', 'Techno', 'Melodic Techno'],
    applicationStatus: 'SHORTLISTED',
  },
  2: {
    name: 'Marcus Lee',
    role: 'DJ / Producer',
    initials: 'ML',
    color: 'bg-purple-500/20 text-purple-400',
    neighborhood: 'Midtown, NY',
    rateMin: 100,
    rateMax: 140,
    rating: 4.7,
    reviewCount: 31,
    appliedGig: 'House Night Opener',
    gigDate: 'Fri, Jul 18, 2026',
    gigTime: '10:00 PM – 1:00 AM',
    bio: 'House and disco DJ, regularly plays NYC venue circuit. Known for smooth warm-up sets that build energy naturally.',
    genres: ['House', 'Disco', 'Funk'],
    applicationStatus: 'HIRED',
  },
  3: {
    name: 'Sophia Cruz',
    role: 'Mixologist',
    initials: 'SC',
    color: 'bg-orange-500/20 text-orange-400',
    neighborhood: 'Chelsea, NY',
    rateMin: 60,
    rateMax: 80,
    rating: 4.8,
    reviewCount: 22,
    appliedGig: 'VIP Lounge Mixologist',
    gigDate: 'Fri, Jul 18, 2026',
    gigTime: '8:00 PM – 2:00 AM',
    bio: 'Craft cocktail specialist with 4 years of high-volume VIP lounge experience. Signature menu creation available on request.',
    genres: [],
    applicationStatus: 'HIRED',
  },
  4: {
    name: 'James Rivera',
    role: 'Security Lead',
    initials: 'JR',
    color: 'bg-blue-500/20 text-blue-400',
    neighborhood: 'Queens, NY',
    rateMin: 40,
    rateMax: 55,
    rating: 4.6,
    reviewCount: 17,
    appliedGig: 'Door / Security Lead',
    gigDate: 'Sat, Jul 19, 2026',
    gigTime: '9:00 PM – 4:00 AM',
    bio: 'Experienced door and security lead. Specialises in crowd management, conflict de-escalation, and VIP protocols.',
    genres: [],
    applicationStatus: 'HIRED',
  },
  5: {
    name: 'Yuna Kim',
    role: 'Go-Go Dancer',
    initials: 'YK',
    color: 'bg-pink-500/20 text-pink-400',
    neighborhood: 'Williamsburg, NY',
    rateMin: 100,
    rateMax: 130,
    rating: 4.5,
    reviewCount: 9,
    appliedGig: 'Rooftop Happy Hour DJ',
    gigDate: 'Thu, Jul 17, 2026',
    gigTime: '5:00 PM – 9:00 PM',
    bio: 'High-energy performer with 3 years of NYC nightlife experience. Comfortable with rooftop, pool, and club environments.',
    genres: ['Pop', 'Latin', 'Afrobeats'],
    applicationStatus: 'PENDING',
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function EventBubble({ msg }: { msg: Message }) {
  if (msg.eventKind === 'offer_sent') {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2.5 bg-[#00FFCC]/5 border border-[#00FFCC]/20 rounded-xl px-4 py-2.5">
          <DollarSign className="w-3.5 h-3.5 text-[#00FFCC] flex-shrink-0" />
          <div className="text-center">
            <p className="text-xs font-black text-[#00FFCC]">Offer Sent · {msg.eventData}</p>
            <p className="text-[10px] text-white/40 mt-0.5">
              Awaiting talent acceptance · {msg.time}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (msg.eventKind === 'rate_received') {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-2.5">
          <DollarSign className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
          <div className="text-center">
            <p className="text-xs font-black text-yellow-400">Counter Offer · {msg.eventData}</p>
            <p className="text-[10px] text-white/40 mt-0.5">Talent proposed · {msg.time}</p>
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
  if (msg.eventKind === 'talent_confirmed') {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5">
          <CalendarDays className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <div className="text-center">
            <p className="text-xs font-black text-blue-400">Talent Confirmed</p>
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

export default function VenueMessagesPage() {
  const [activeId, setActiveId] = useState(1);
  const [input, setInput] = useState('');
  const [convos, setConvos] = useState(CONVERSATIONS);
  const [sendOffer, setSendOffer] = useState(false);
  const [offerRate, setOfferRate] = useState('175');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(2000);

  const active = convos.find((c) => c.id === activeId)!;
  const talent = TALENT_FOCUS_MAP[activeId];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeId, active?.messages.length]);

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

  const sendOfferEvent = () => {
    msgCounter.current += 1;
    const newMsg: Message = {
      id: msgCounter.current,
      type: 'event',
      content: '',
      time: 'Just now',
      eventKind: 'offer_sent',
      eventData: `$${offerRate}/hr · ${talent.gigDate} · ${talent.gigTime.split('–')[0].trim()}`,
    };
    setConvos((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? {
              ...c,
              messages: [...c.messages, newMsg],
              lastMessage: `Offer sent: $${offerRate}/hr`,
              time: 'Just now',
            }
          : c
      )
    );
    setSendOffer(false);
  };

  const hireOrReject = (action: 'HIRED' | 'REJECTED') => {
    setConvos((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, applicationStatus: action } : c))
    );
  };

  return (
    <div className="h-[100dvh] bg-[#121212] text-white flex font-sans overflow-hidden pt-14 md:pt-0">
      <DashboardSidebar role="venue" userName="Nebula NYC" />

      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* ── Conversation list ─────────────────────────────────────── */}
        <div
          className={cn(
            'flex-col border-r border-white/5 bg-[#0D0D0D]',
            'w-full md:w-72 md:flex flex-shrink-0',
            mobileView === 'list' ? 'flex' : 'hidden md:flex'
          )}
        >
          <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
            <h2 className="text-base font-bold">Messages</h2>
            <button className="relative w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-white/50" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
            </button>
          </div>

          <div className="px-3 py-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input
                type="text"
                placeholder="Search talent…"
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-[#00FFCC]/30"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {convos.map((c) => {
              const st = STATUS_CONFIG[c.applicationStatus];
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelectConversation(c.id)}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-3.5 border-b border-white/5 text-left transition-colors hover:bg-white/[0.03]',
                    activeId === c.id && 'bg-[#00FFCC]/5 border-l-2 border-l-[#00FFCC]'
                  )}
                >
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
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-[11px] text-white/40 truncate">{c.appliedGig}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-white/30 truncate flex-1">{c.lastMessage}</p>
                      <span
                        className={cn(
                          'text-[9px] font-black px-1.5 py-0.5 rounded-full border flex-shrink-0',
                          st.color
                        )}
                      >
                        {st.label}
                      </span>
                    </div>
                  </div>
                  {c.unread > 0 && (
                    <span className="flex-shrink-0 bg-[#00FFCC] text-black text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center mt-1">
                      {c.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chat window ── hidden on mobile when list is shown */}
        <div
          className={cn(
            'flex-col min-w-0 border-r border-white/5',
            'w-full md:flex-1',
            mobileView === 'chat' ? 'flex flex-1' : 'hidden md:flex'
          )}
        >
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
            <div className="text-[11px] text-white/30 hidden sm:block truncate max-w-[220px]">
              Re: <span className="text-white/50 font-medium">{active.appliedGig}</span>
            </div>
          </div>

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
              onClick={() => setSendOffer(!sendOffer)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors',
                sendOffer
                  ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                  : 'bg-[#1A1A1A] border-white/10 text-white/50 hover:text-white'
              )}
            >
              <DollarSign className="w-3 h-3" /> Send Offer
            </button>
            <button
              onClick={() => hireOrReject('HIRED')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors',
                active.applicationStatus === 'HIRED'
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : 'bg-[#1A1A1A] border-white/10 text-white/50 hover:text-green-400 hover:border-green-500/30'
              )}
            >
              <UserCheck className="w-3 h-3" />
              {active.applicationStatus === 'HIRED' ? 'Hired' : 'Hire'}
            </button>
            <button
              onClick={() => hireOrReject('REJECTED')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors',
                active.applicationStatus === 'REJECTED'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-[#1A1A1A] border-white/10 text-white/50 hover:text-red-400 hover:border-red-500/30'
              )}
            >
              <UserX className="w-3 h-3" /> Reject
            </button>
          </div>

          {/* Offer inline */}
          {sendOffer && (
            <div className="mx-5 mb-2 flex items-center gap-2 p-3 rounded-xl bg-[#1A1A1A] border border-[#00FFCC]/20">
              <DollarSign className="w-3.5 h-3.5 text-[#00FFCC] flex-shrink-0" />
              <input
                type="number"
                value={offerRate}
                onChange={(e) => setOfferRate(e.target.value)}
                className="flex-1 bg-transparent text-sm font-bold text-white focus:outline-none"
                placeholder="Rate..."
              />
              <span className="text-xs text-white/40">/hr</span>
              <Button
                size="sm"
                onClick={sendOfferEvent}
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

        {/* ── Talent in Focus ───────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-72 xl:w-80 flex-shrink-0 bg-[#0D0D0D] overflow-y-auto">
          {/* Talent header */}
          <div className="p-5 border-b border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={cn(
                  'w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black border border-white/10 flex-shrink-0',
                  talent.color
                )}
              >
                {talent.initials}
              </div>
              <div>
                <p className="text-base font-black text-white">{talent.name}</p>
                <p className="text-xs text-[#00FFCC] font-bold">{talent.role}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-white/30" />
                  <span className="text-[11px] text-white/40">{talent.neighborhood}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  'text-[11px] font-black px-2.5 py-1 rounded-full border',
                  STATUS_CONFIG[talent.applicationStatus].color
                )}
              >
                {STATUS_CONFIG[talent.applicationStatus].label}
              </span>
              <div className="flex items-center gap-1">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        'w-3 h-3',
                        i < Math.floor(talent.rating)
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-white/10 fill-white/10'
                      )}
                    />
                  ))}
                </div>
                <span className="text-xs text-white/50 ml-1">
                  {talent.rating} ({talent.reviewCount})
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4 flex-1">
            {/* Applied Gig */}
            <div className="p-3 rounded-xl bg-[#1A1A1A] border border-white/5 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Applied For
              </p>
              <p className="text-sm font-bold text-white">{talent.appliedGig}</p>
              <div className="flex flex-col gap-1 text-xs text-white/40">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-3 h-3" />
                  {talent.gigDate}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {talent.gigTime}
                </span>
              </div>
            </div>

            {/* Rate */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Rate Range
              </p>
              <p className="text-2xl font-black text-white">
                ${talent.rateMin}–${talent.rateMax}
                <span className="text-sm font-normal text-white/40">/hr</span>
              </p>
            </div>

            {/* Genres */}
            {talent.genres.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                  Genres
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {talent.genres.map((g) => (
                    <span
                      key={g}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1A1A1A] border border-white/8 text-[11px] text-white/60"
                    >
                      <Music className="w-2.5 h-2.5" />
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <Button
                onClick={() => hireOrReject('HIRED')}
                className={cn(
                  'w-full font-black text-sm flex items-center gap-2',
                  active.applicationStatus === 'HIRED'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                    : 'bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90'
                )}
              >
                <UserCheck className="w-4 h-4" />
                {active.applicationStatus === 'HIRED' ? 'Hired' : 'Hire Talent'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSendOffer(true)}
                className="w-full border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm font-semibold flex items-center justify-between"
              >
                Send Offer <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="border-t border-white/5" />

            {/* Bio */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                About
              </p>
              <p className="text-xs text-white/50 leading-relaxed">{talent.bio}</p>
            </div>

            {/* Zap note */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[#00FFCC]/5 border border-[#00FFCC]/10">
              <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-white/40 leading-relaxed">
                This talent has a{' '}
                <span className="text-white/60 font-bold">~90% acceptance rate</span> for offers
                above ${talent.rateMin}/hr.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
