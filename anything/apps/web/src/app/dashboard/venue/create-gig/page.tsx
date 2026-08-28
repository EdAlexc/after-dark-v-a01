'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ApiGig } from '@/lib/gigs';
import {
  ChevronRight,
  ChevronDown,
  Check,
  Building2,
  Users,
  Zap,
  Eye,
  Save,
  Clock,
  DollarSign,
  Mic,
  Camera,
  Shield,
  ChevronUp,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { NotificationsBell } from '@/components/NotificationsBell';

// MapLibre touches window — never SSR it (same pattern as browse).
const GigsMap = dynamic(() => import('@/components/GigsMap'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface GigFormData {
  title: string;
  role_needed: string;
  subgenre: string;
  description: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  address: string;
  base_rate: string;
  payment_type: 'cash' | 'card' | 'both';
  tips_included: boolean;
  age_requirement: boolean;
  equipment_provided: boolean;
  dress_code: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Identity & Role' },
  { id: 2, label: 'Logistics' },
  { id: 3, label: 'Compensation' },
  { id: 4, label: 'Review' },
];

const ROLE_OPTIONS = [
  'DJ / Producer',
  'Go-Go Dancer',
  'Bartender',
  'Bottle Server',
  'Photographer',
  'Security / Bouncer',
  'Host / MC',
  'Mixologist',
  'Coat Check',
  'Event Staff',
];

/** GET /api/gigs/match-preview response (S7 — real Live Analysis). */
interface MatchPreview {
  matches: { total: number; availableTonight: number; availableOnDate: number | null };
  candidates: Array<{
    id: string;
    stage_name: string;
    primary_role: string | null;
    neighborhood: string | null;
    avatar_url: string | null;
    hourly_rate_min: string | number | null;
    hourly_rate_max: string | number | null;
    available_tonight: boolean | null;
    available_on_date: boolean | null;
    match_score: number;
  }>;
  pricing: { sample: number; p25: number | null; median: number | null; p75: number | null };
}

function candidateRateBand(
  min: string | number | null,
  max: string | number | null
): string | null {
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isFinite(lo) && lo > 0 && Number.isFinite(hi) && hi > 0)
    return `$${lo}–$${hi}/hr`;
  if (Number.isFinite(lo) && lo > 0) return `$${lo}+/hr`;
  return null;
}

/** Debounce a changing value so the preview doesn't fire per keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all flex-shrink-0',
                  done
                    ? 'bg-[#00FFCC] border-[#00FFCC] text-black'
                    : active
                      ? 'bg-transparent border-[#00FFCC] text-[#00FFCC]'
                      : 'bg-transparent border-white/20 text-white/45'
                )}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : step.id}
              </div>
              <span
                className={cn(
                  'text-xs font-bold hidden sm:block',
                  active ? 'text-white' : done ? 'text-[#00FFCC]' : 'text-white/45'
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className="flex-1 h-px mx-3"
                style={{
                  minWidth: 20,
                  background: step.id < current ? '#00FFCC' : 'rgba(255,255,255,0.1)',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function InputField({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-1">
        {label}
        {required && <span className="text-[#00FFCC]">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-white/45">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#00FFCC]/40 transition-colors';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateGigPage() {
  const [step, setStep] = useState(1);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // S17 (F3): the first Save Draft records the created row's id so every
  // subsequent save PATCHes the SAME draft instead of INSERTing a duplicate,
  // and Publish promotes that draft rather than creating a twin.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [form, setForm] = useState<GigFormData>({
    title: '',
    role_needed: '',
    subgenre: '',
    description: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    address: '',
    base_rate: '',
    payment_type: 'both',
    tips_included: false,
    age_requirement: true,
    equipment_provided: false,
    dress_code: '',
  });

  const update = useCallback(<K extends keyof GigFormData>(key: K, value: GigFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Real Live Analysis (S7): candidate aggregates + public cards + pricing
  // hint from /api/gigs/match-preview, debounced off the wizard fields.
  const previewInput = useDebounced(
    {
      role: form.role_needed,
      rate: form.base_rate,
      date: form.start_date,
    },
    400
  );
  const { data: preview } = useQuery({
    queryKey: ['match-preview', previewInput],
    queryFn: async () => {
      const params = new URLSearchParams({ role: previewInput.role });
      if (previewInput.rate && Number(previewInput.rate) > 0)
        params.set('rate', previewInput.rate);
      if (previewInput.date) params.set('date', previewInput.date);
      const res = await fetch(`/api/gigs/match-preview?${params.toString()}`);
      if (!res.ok) throw new Error('Preview failed');
      return res.json() as Promise<MatchPreview>;
    },
    enabled: previewInput.role.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const matchCount = form.role_needed && preview ? preview.matches.total : 0;

  // Live map preview (S20 F6): server-side geocode probe, debounced well
  // past typing speed — the browser never talks to the geocoder directly.
  const debouncedAddress = useDebounced(form.address, 800);
  const addressReady = debouncedAddress.trim().length >= 5;
  const { data: geoPreview, isFetching: geoFetching } = useQuery({
    queryKey: ['geocode-preview', debouncedAddress.trim()],
    enabled: addressReady,
    staleTime: 5 * 60_000,
    retry: false, // a 429 from the preview limiter should go quiet, not loop
    queryFn: async () => {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(debouncedAddress)}`);
      if (!res.ok) throw new Error('Preview unavailable');
      return res.json() as Promise<{ point: { lat: number; lng: number } | null }>;
    },
  });
  const previewPoint = addressReady ? (geoPreview?.point ?? null) : null;

  /** The wizard's real values, nothing fabricated (S17 F3): empty dates ride
   *  as '' (the API stores NULL) and the title is never invented — Save Draft
   *  stays disabled until a real title exists. */
  const draftPayload = () => ({
    title: form.title.trim(),
    role_needed: form.role_needed,
    description: form.description,
    address: form.address,
    start_time:
      form.start_date && form.start_time ? `${form.start_date}T${form.start_time}` : '',
    end_time: form.end_date && form.end_time ? `${form.end_date}T${form.end_time}` : '',
    base_rate: Number(form.base_rate) || 0,
    tips_included: form.tips_included,
    age_requirement: form.age_requirement ? 21 : 18,
  });

  const canSaveDraft = form.title.trim().length >= 3;

  const handleSaveDraft = async () => {
    if (!canSaveDraft) return;
    setSaving(true);
    try {
      const res = draftId
        ? await fetch(`/api/gigs/${draftId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draftPayload()),
          })
        : await fetch('/api/gigs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...draftPayload(), status: 'DRAFT' }),
          });
      if (!res.ok) throw new Error('Failed to save');
      if (!draftId) {
        const data = (await res.json()) as { gig?: { id?: string } };
        if (data.gig?.id) setDraftId(String(data.gig.id));
      }
      setLastSavedAt(new Date());
      toast.success('Draft saved!');
    } catch {
      toast.error('Could not save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      let res: Response;
      if (draftId) {
        // Promote the saved draft: content first, then the lifecycle
        // transition (which runs the publish gates, geocoding and pushes).
        res = await fetch(`/api/gigs/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftPayload()),
        });
        if (res.ok) {
          res = await fetch(`/api/gigs/${draftId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'PUBLISHED' }),
          });
        }
      } else {
        res = await fetch('/api/gigs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draftPayload(), status: 'PUBLISHED' }),
        });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to publish');
      }
      toast.success('Gig published! Talent are being notified.');
    } catch (error) {
      toast.error(error instanceof Error && error.message !== 'Failed to publish'
        ? error.message
        : 'Could not publish gig');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Post a Gig</h1>
            <p className="text-xs text-white/40">Fill in details to attract top talent</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell role="venue" />
            <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/20 border border-[#00FFCC]/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#00FFCC]" />
            </div>
          </div>
        </header>

        {/* Step progress */}
        <div className="px-6 py-4 border-b border-white/5 bg-[#0F0F0F]">
          <StepIndicator current={step} />
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
            {/* STEP 1: Identity & Role */}
            {step === 1 && (
              <>
                <section>
                  <h2 className="text-base font-black text-white mb-1">Identity & Role</h2>
                  <p className="text-xs text-white/40 mb-5">Tell talent what this gig is about</p>

                  <div className="space-y-4">
                    <InputField label="Gig Title" required>
                      <input
                        type="text"
                        placeholder='e.g. "Closing DJ Set – Main Room"'
                        value={form.title}
                        onChange={(e) => update('title', e.target.value)}
                        className={inputClass}
                      />
                    </InputField>

                    <InputField label="Role Needed" required>
                      <div className="relative">
                        <select
                          value={form.role_needed}
                          onChange={(e) => update('role_needed', e.target.value)}
                          aria-label="Role needed"
                          className={cn(inputClass, 'appearance-none pr-10 cursor-pointer')}
                        >
                          <option value="">Select a role…</option>
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r} className="bg-[#1A1A1A]">
                              {r}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                      </div>
                    </InputField>

                    <InputField label="Genre / Sub-genre" hint="e.g. House, Techno, Afrobeats, R&B">
                      <input
                        type="text"
                        placeholder="e.g. Deep House / Techno"
                        value={form.subgenre}
                        onChange={(e) => update('subgenre', e.target.value)}
                        className={inputClass}
                      />
                    </InputField>

                    <InputField
                      label="Gig Description"
                      hint="Describe the vibe, expectations, and anything talent should know"
                    >
                      <textarea
                        rows={4}
                        placeholder="Describe the event, expected crowd, music direction, special requirements…"
                        value={form.description}
                        onChange={(e) => update('description', e.target.value)}
                        className={cn(inputClass, 'resize-none')}
                      />
                    </InputField>
                  </div>
                </section>
              </>
            )}

            {/* STEP 2: Logistics */}
            {step === 2 && (
              <>
                <section>
                  <h2 className="text-base font-black text-white mb-1">Logistics</h2>
                  <p className="text-xs text-white/40 mb-5">When and where is this happening?</p>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <InputField label="Start Date" required>
                        <input
                          type="date"
                          value={form.start_date}
                          onChange={(e) => update('start_date', e.target.value)}
                          className={inputClass}
                        />
                      </InputField>
                      <InputField label="Start Time" required>
                        <input
                          type="time"
                          value={form.start_time}
                          onChange={(e) => update('start_time', e.target.value)}
                          className={inputClass}
                        />
                      </InputField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <InputField label="End Date" required>
                        <input
                          type="date"
                          value={form.end_date}
                          onChange={(e) => update('end_date', e.target.value)}
                          className={inputClass}
                        />
                      </InputField>
                      <InputField label="End Time" required>
                        <input
                          type="time"
                          value={form.end_time}
                          onChange={(e) => update('end_time', e.target.value)}
                          className={inputClass}
                        />
                      </InputField>
                    </div>

                    <InputField label="Venue Address" required>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                          type="text"
                          placeholder="123 Club Street, New York, NY"
                          value={form.address}
                          onChange={(e) => update('address', e.target.value)}
                          className={cn(inputClass, 'pl-10')}
                        />
                      </div>
                    </InputField>

                    {/* Live map preview (S20 F6) — the pin is advisory; publish
                        geocodes authoritatively server-side. */}
                    {previewPoint ? (
                      <GigsMap
                        gigs={[
                          {
                            id: 'preview',
                            title: form.title || 'New gig',
                            lat: previewPoint.lat,
                            lng: previewPoint.lng,
                          } as unknown as ApiGig,
                        ]}
                        className="h-40"
                        showSummary={false}
                        interactive={false}
                        maxZoom={15}
                      />
                    ) : (
                      <div className="rounded-xl bg-[#1A1A1A] border border-white/5 h-40 flex items-center justify-center">
                        <div className="text-center">
                          <MapPin className="w-6 h-6 text-white/15 mx-auto mb-2" />
                          <p className="text-xs text-white/40">
                            {!addressReady
                              ? 'Type the venue address to preview the map'
                              : geoFetching
                                ? 'Locating address…'
                                : 'No pin yet — keep typing or refine the address'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            {/* STEP 3: Compensation */}
            {step === 3 && (
              <>
                <section>
                  <h2 className="text-base font-black text-white mb-1">
                    Compensation & Requirements
                  </h2>
                  <p className="text-xs text-white/40 mb-5">
                    Set your pay rate and any requirements
                  </p>

                  <div className="space-y-4">
                    <InputField
                      label="Base Rate ($/hr)"
                      required
                      hint="Set a fair rate to attract more applicants"
                    >
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                          type="number"
                          min={20}
                          placeholder="e.g. 150"
                          value={form.base_rate}
                          onChange={(e) => update('base_rate', e.target.value)}
                          className={cn(inputClass, 'pl-10')}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/45 font-bold">
                          /hr
                        </span>
                      </div>
                    </InputField>

                    {/* Payment Type */}
                    <InputField label="Payment Method">
                      <div className="flex gap-2">
                        {(['cash', 'card', 'both'] as const).map((type) => (
                          <button
                            key={type}
                            onClick={() => update('payment_type', type)}
                            className={cn(
                              'flex-1 py-2.5 rounded-xl border text-sm font-bold capitalize transition-colors',
                              form.payment_type === type
                                ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                                : 'bg-[#1A1A1A] border-white/10 text-white/50 hover:text-white'
                            )}
                          >
                            {type === 'both'
                              ? 'Cash & Card'
                              : type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                    </InputField>

                    {/* Tips toggle */}
                    <div className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-[#1A1A1A] border border-white/10">
                      <div className="flex items-center gap-3">
                        <DollarSign className="w-4 h-4 text-[#00FFCC]" />
                        <div>
                          <p className="text-sm font-bold">Cash Tips Included</p>
                          <p className="text-[11px] text-white/40">
                            Talent can receive tips from guests
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={form.tips_included}
                        onCheckedChange={(v) => update('tips_included', v)}
                        className="data-[state=checked]:bg-[#00FFCC]"
                      />
                    </div>

                    {/* Age Requirement */}
                    <div className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-[#1A1A1A] border border-white/10">
                      <div className="flex items-center gap-3">
                        <Shield className="w-4 h-4 text-white/50" />
                        <div>
                          <p className="text-sm font-bold">21+ Age Requirement</p>
                          <p className="text-[11px] text-white/40">Talent must be 21 or older</p>
                        </div>
                      </div>
                      <Switch
                        checked={form.age_requirement}
                        onCheckedChange={(v) => update('age_requirement', v)}
                        className="data-[state=checked]:bg-[#00FFCC]"
                      />
                    </div>

                    {/* Equipment & Attire — collapsible */}
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <button
                        onClick={() => setEquipmentOpen(!equipmentOpen)}
                        className="w-full flex items-center justify-between px-4 py-3.5 bg-[#1A1A1A] hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Mic className="w-4 h-4 text-white/50" />
                          <span className="text-sm font-bold">Equipment & Attire</span>
                          <span className="text-[11px] text-white/45">Optional</span>
                        </div>
                        {equipmentOpen ? (
                          <ChevronUp className="w-4 h-4 text-white/40" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-white/40" />
                        )}
                      </button>
                      {equipmentOpen && (
                        <div className="px-4 py-4 bg-[#141414] border-t border-white/5 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Camera className="w-3.5 h-3.5 text-white/40" />
                              <span className="text-sm text-white/70">
                                Equipment provided by venue
                              </span>
                            </div>
                            <Switch
                              checked={form.equipment_provided}
                              onCheckedChange={(v) => update('equipment_provided', v)}
                              className="data-[state=checked]:bg-[#00FFCC]"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">
                              Dress Code
                            </label>
                            <input
                              type="text"
                              placeholder='e.g. "All black", "Smart casual"'
                              value={form.dress_code}
                              onChange={(e) => update('dress_code', e.target.value)}
                              className={inputClass}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* STEP 4: Review */}
            {step === 4 && (
              <>
                <section>
                  <h2 className="text-base font-black text-white mb-1">Review & Publish</h2>
                  <p className="text-xs text-white/40 mb-5">
                    Double-check everything before going live
                  </p>

                  <div className="space-y-3">
                    {[
                      {
                        icon: <Clock className="w-4 h-4" />,
                        label: 'Role',
                        value: form.role_needed || '—',
                      },
                      {
                        icon: <Clock className="w-4 h-4" />,
                        label: 'Gig Title',
                        value: form.title || '—',
                      },
                      {
                        icon: <Clock className="w-4 h-4" />,
                        label: 'Start',
                        value: form.start_date ? `${form.start_date} at ${form.start_time}` : '—',
                      },
                      {
                        icon: <Clock className="w-4 h-4" />,
                        label: 'End',
                        value: form.end_date ? `${form.end_date} at ${form.end_time}` : '—',
                      },
                      {
                        icon: <MapPin className="w-4 h-4" />,
                        label: 'Address',
                        value: form.address || '—',
                      },
                      {
                        icon: <DollarSign className="w-4 h-4" />,
                        label: 'Rate',
                        value: form.base_rate ? `$${form.base_rate}/hr` : '—',
                      },
                      {
                        icon: <DollarSign className="w-4 h-4" />,
                        label: 'Tips',
                        value: form.tips_included ? 'Yes' : 'No',
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between py-3 px-4 rounded-xl bg-[#1A1A1A] border border-white/5"
                      >
                        <div className="flex items-center gap-3 text-white/40">
                          {row.icon}
                          <span className="text-sm text-white/50">{row.label}</span>
                        </div>
                        <span className="text-sm font-bold text-white">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {(!form.title || !form.role_needed || !form.start_date || !form.base_rate) && (
                    <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-300">
                        Some required fields are missing. Go back and fill in the title, role, date,
                        and rate before publishing.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Step navigation */}
            <div className="flex items-center justify-between pt-2">
              {step > 1 ? (
                <Button
                  variant="ghost"
                  onClick={() => setStep((s) => s - 1)}
                  className="text-white/40 hover:text-white"
                >
                  ← Back
                </Button>
              ) : (
                <div />
              )}
              {step < STEPS.length ? (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold flex items-center gap-1.5"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {/* Right: Live Analysis panel */}
          <div className="hidden xl:flex flex-col w-80 flex-shrink-0 border-l border-white/5 bg-[#0F0F0F] overflow-y-auto">
            {/* Match counter */}
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                  Live Analysis
                </span>
                <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current" />
              </div>
              <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-[#00FFCC]/5 border border-[#00FFCC]/15">
                <div className="w-12 h-12 rounded-xl bg-[#00FFCC]/15 flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-[#00FFCC]" />
                </div>
                <div>
                  <p className="text-3xl font-black text-[#00FFCC] leading-none">{matchCount}</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Matching talent on AfterDark
                  </p>
                </div>
              </div>

              {preview && matchCount > 0 && (
                <div className="mt-3 space-y-1.5 text-[11px] text-white/40">
                  <div className="flex items-center justify-between">
                    <span>Available tonight</span>
                    <span className="text-white/70 font-bold">
                      {preview.matches.availableTonight}
                    </span>
                  </div>
                  {preview.matches.availableOnDate !== null && (
                    <div className="flex items-center justify-between">
                      <span>Free on your date</span>
                      <span className="text-[#00FFCC] font-bold">
                        {preview.matches.availableOnDate}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Pricing hint from published-gig percentiles (S7) */}
              {preview && preview.pricing.sample >= 3 && preview.pricing.median !== null && (
                <div className="mt-3 p-3 rounded-xl bg-[#1A1A1A] border border-white/5 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
                    Going rate · {preview.pricing.sample} similar gigs
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-white">
                      ${Math.round(preview.pricing.median)}
                    </span>
                    <span className="text-[11px] text-white/40">
                      /hr median
                      {preview.pricing.p25 !== null && preview.pricing.p75 !== null
                        ? ` · $${Math.round(preview.pricing.p25)}–$${Math.round(preview.pricing.p75)} typical`
                        : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Top Candidates — real public directory cards (S7) */}
            {preview && preview.candidates.length > 0 && (
              <div className="p-5 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Top Candidates
                </p>
                <div className="space-y-2.5">
                  {preview.candidates.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#1A1A1A] border border-white/5 hover:border-white/10 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {c.avatar_url ? (
                          <img
                            src={c.avatar_url}
                            alt={c.stage_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[#00FFCC] text-xs font-black">
                            {c.stage_name
                              .split(' ')
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{c.stage_name}</p>
                        <p className="text-[11px] text-white/40 truncate">
                          {candidateRateBand(c.hourly_rate_min, c.hourly_rate_max) ??
                            c.primary_role ??
                            '—'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-black text-[#00FFCC]">{c.match_score}%</p>
                        {c.available_on_date ? (
                          <p className="text-[9px] font-black text-[#00FFCC]/70">FREE THAT DAY</p>
                        ) : c.available_tonight ? (
                          <p className="text-[9px] font-black text-yellow-400/80">TONIGHT</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 rounded-xl bg-[#1A1A1A] border border-[#00FFCC]/10">
                  <div className="flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 text-[#00FFCC] mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Counts and cards come from live profiles and calendars. Publishing makes
                      this gig visible to everyone browsing.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(!preview || preview.candidates.length === 0) && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 text-white/20" />
                </div>
                <p className="text-sm font-bold text-white/45">
                  {form.role_needed ? 'No matching talent yet' : 'Select a role to see matching talent'}
                </p>
                <p className="text-[11px] text-white/40 mt-1">
                  {form.role_needed
                    ? 'Try widening the rate — matches update as you type'
                    : "We'll show you real candidates based on your gig details"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sticky bottom bar */}
        <div className="sticky bottom-0 bg-[#0A0A0A] border-t border-white/5 px-6 py-3 flex items-center justify-between gap-4 z-20">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveDraft}
              disabled={saving || !canSaveDraft}
              title={canSaveDraft ? undefined : 'Add a title (3+ characters) to save a draft'}
              className="text-white/40 hover:text-white text-xs flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            {lastSavedAt && (
              <span className="text-[11px] text-white/40 hidden sm:block">
                Draft saved{' '}
                {lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — in
                Open Gigs; re-saving updates it
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === STEPS.length && (
              <>
                {draftId ? (
                  <Link href={`/gigs/${draftId}`} target="_blank">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 text-white/60 hover:text-white text-xs flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </Button>
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title="Save a draft first — Preview opens your listing as talent will see it"
                    className="border-white/10 text-white/60 hover:text-white text-xs flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handlePublish}
                  disabled={publishing || !form.title || !form.role_needed}
                  className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-black flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  {publishing ? 'Publishing…' : 'Publish Gig'}
                </Button>
              </>
            )}
            {step < STEPS.length && (
              <div className="flex items-center gap-1.5 text-[11px] text-white/45">
                <div className="w-2 h-2 rounded-full bg-[#00FFCC]/40" />
                Step {step} of {STEPS.length}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
