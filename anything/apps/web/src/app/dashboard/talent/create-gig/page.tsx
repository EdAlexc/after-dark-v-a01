'use client';

import React, { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Check,
  Bell,
  Zap,
  Users,
  DollarSign,
  Clock,
  MapPin,
  Music,
  AlertCircle,
  Save,
  Eye,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types & Constants ────────────────────────────────────────────────────────

interface TalentGigForm {
  title: string;
  service_type: string;
  genres: string[];
  bio_excerpt: string;
  available_from: string;
  available_to: string;
  time_from: string;
  time_to: string;
  neighborhood: string;
  rate_min: string;
  rate_max: string;
  travel_included: boolean;
  equipment_included: boolean;
  advance_notice: string;
}

const STEPS = [
  { id: 1, label: 'Your Service' },
  { id: 2, label: 'Availability' },
  { id: 3, label: 'Rates & Extras' },
  { id: 4, label: 'Review' },
];

const SERVICE_TYPES = [
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
  'Live Vocalist',
  'Saxophonist',
];

const GENRE_OPTIONS = [
  'House',
  'Techno',
  'Hip-Hop',
  'R&B',
  'Afrobeats',
  'Latin',
  'Pop',
  'Disco',
  'Funk',
  'Drum & Bass',
  'Reggaeton',
  'Amapiano',
];

const NEIGHBORHOODS = [
  'Chelsea',
  'Midtown',
  'Meatpacking',
  'Flatiron',
  'LES',
  'Williamsburg',
  'Bushwick',
  'Downtown',
  'Harlem',
  'Astoria',
];

const ADVANCE_OPTIONS = ['Same day', '24 hours', '48 hours', '1 week'];

const MOCK_VENUES = [
  {
    name: 'Nebula NYC',
    neighborhood: 'Midtown',
    rating: 4.8,
    lookingFor: 'DJ / Producer',
    match: 97,
  },
  {
    name: 'PHD Rooftop',
    neighborhood: 'Downtown',
    rating: 4.7,
    lookingFor: 'DJ / Producer',
    match: 93,
  },
  {
    name: 'Output BK',
    neighborhood: 'Williamsburg',
    rating: 4.9,
    lookingFor: 'DJ / Producer',
    match: 91,
  },
  { name: 'The Box', neighborhood: 'LES', rating: 4.6, lookingFor: 'DJ / Producer', match: 88 },
];

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
                      : 'bg-transparent border-white/20 text-white/30'
                )}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : step.id}
              </div>
              <span
                className={cn(
                  'text-xs font-bold hidden sm:block',
                  active ? 'text-white' : done ? 'text-[#00FFCC]' : 'text-white/30'
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className="flex-1 h-px mx-3"
                style={{
                  minWidth: 16,
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

const inputClass =
  'w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#00FFCC]/40 transition-colors';

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-1">
        {label}
        {required && <span className="text-[#00FFCC]">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-white/30">{hint}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TalentPostGigPage() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [form, setForm] = useState<TalentGigForm>({
    title: '',
    service_type: '',
    genres: [],
    bio_excerpt: '',
    available_from: '',
    available_to: '',
    time_from: '',
    time_to: '',
    neighborhood: '',
    rate_min: '',
    rate_max: '',
    travel_included: false,
    equipment_included: false,
    advance_notice: '48 hours',
  });

  const update = useCallback(<K extends keyof TalentGigForm>(key: K, val: TalentGigForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const toggleGenre = (g: string) => {
    setForm((prev) => ({
      ...prev,
      genres: prev.genres.includes(g) ? prev.genres.filter((x) => x !== g) : [...prev.genres, g],
    }));
  };

  const matchCount = form.service_type ? 8 : 0;

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 900));
    toast.success('Draft saved!');
    setSaving(false);
  };

  const handlePublish = async () => {
    setPublishing(true);
    await new Promise((r) => setTimeout(r, 1200));
    toast.success('Your gig listing is live! Venues are being notified.');
    setPublishing(false);
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Post a Gig</h1>
            <p className="text-xs text-white/40">Offer your services and let venues find you</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/20 border border-[#00FFCC]/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#00FFCC]" />
            </div>
          </div>
        </header>

        {/* Step indicator */}
        <div className="px-6 py-4 border-b border-white/5 bg-[#0F0F0F]">
          <StepIndicator current={step} />
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
            {/* STEP 1 – Your Service */}
            {step === 1 && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-black mb-1">Your Service</h2>
                  <p className="text-xs text-white/40">Describe what you offer to venues</p>
                </div>

                <Field
                  label="Listing Title"
                  required
                  hint='e.g. "Available DJ for Closing Sets – Deep House & Techno"'
                >
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g. Available DJ for Friday/Saturday late nights"
                    value={form.title}
                    onChange={(e) => update('title', e.target.value)}
                  />
                </Field>

                <Field label="Service Type" required>
                  <div className="relative">
                    <select
                      value={form.service_type}
                      onChange={(e) => update('service_type', e.target.value)}
                      className={cn(inputClass, 'appearance-none pr-10 cursor-pointer')}
                    >
                      <option value="">Select your role…</option>
                      {SERVICE_TYPES.map((s) => (
                        <option key={s} value={s} className="bg-[#1A1A1A]">
                          {s}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                  </div>
                </Field>

                <Field label="Genres / Specialities" hint="Select all that apply">
                  <div className="flex flex-wrap gap-2">
                    {GENRE_OPTIONS.map((g) => (
                      <button
                        key={g}
                        onClick={() => toggleGenre(g)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors',
                          form.genres.includes(g)
                            ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                            : 'bg-[#1A1A1A] border-white/10 text-white/50 hover:text-white'
                        )}
                      >
                        <Music className="w-3 h-3" />
                        {g}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field
                  label="Pitch / Bio"
                  hint="Tell venues why you're a great fit — max 300 chars"
                >
                  <textarea
                    rows={4}
                    maxLength={300}
                    className={cn(inputClass, 'resize-none')}
                    placeholder="Describe your experience, style, and what makes you stand out…"
                    value={form.bio_excerpt}
                    onChange={(e) => update('bio_excerpt', e.target.value)}
                  />
                  <p className="text-right text-[11px] text-white/25">
                    {form.bio_excerpt.length}/300
                  </p>
                </Field>
              </section>
            )}

            {/* STEP 2 – Availability */}
            {step === 2 && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-black mb-1">Availability</h2>
                  <p className="text-xs text-white/40">When and where are you available?</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Available From" required>
                    <input
                      type="date"
                      value={form.available_from}
                      onChange={(e) => update('available_from', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Available To" required>
                    <input
                      type="date"
                      value={form.available_to}
                      onChange={(e) => update('available_to', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="From Time">
                    <input
                      type="time"
                      value={form.time_from}
                      onChange={(e) => update('time_from', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="To Time">
                    <input
                      type="time"
                      value={form.time_to}
                      onChange={(e) => update('time_to', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="Preferred Neighborhood">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <select
                      value={form.neighborhood}
                      onChange={(e) => update('neighborhood', e.target.value)}
                      className={cn(inputClass, 'pl-10 appearance-none pr-10 cursor-pointer')}
                    >
                      <option value="">Any neighborhood</option>
                      {NEIGHBORHOODS.map((n) => (
                        <option key={n} value={n} className="bg-[#1A1A1A]">
                          {n}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                  </div>
                </Field>

                <Field label="Advance Notice Required">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ADVANCE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => update('advance_notice', opt)}
                        className={cn(
                          'py-2.5 rounded-xl border text-xs font-bold transition-colors text-center',
                          form.advance_notice === opt
                            ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                            : 'bg-[#1A1A1A] border-white/10 text-white/50 hover:text-white'
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </Field>
              </section>
            )}

            {/* STEP 3 – Rates & Extras */}
            {step === 3 && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-black mb-1">Rates & Extras</h2>
                  <p className="text-xs text-white/40">Set your rate and what's included</p>
                </div>

                <Field
                  label="Rate Range ($/hr)"
                  required
                  hint="Setting a range increases booking likelihood"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input
                        type="number"
                        min={20}
                        placeholder="Min"
                        value={form.rate_min}
                        onChange={(e) => update('rate_min', e.target.value)}
                        className={cn(inputClass, 'pl-10')}
                      />
                    </div>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input
                        type="number"
                        min={20}
                        placeholder="Max"
                        value={form.rate_max}
                        onChange={(e) => update('rate_max', e.target.value)}
                        className={cn(inputClass, 'pl-10')}
                      />
                    </div>
                  </div>
                </Field>

                {form.rate_min && form.rate_max && (
                  <div className="p-3 rounded-xl bg-[#00FFCC]/5 border border-[#00FFCC]/15 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current flex-shrink-0" />
                    <p className="text-xs text-white/50">
                      Your listed range is{' '}
                      <span className="text-white font-bold">
                        ${form.rate_min}–${form.rate_max}/hr
                      </span>
                      . Similar talent in your area earn{' '}
                      <span className="text-[#00FFCC] font-bold">$120–$200/hr</span>.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-[#1A1A1A] border border-white/10">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-white/40" />
                      <div>
                        <p className="text-sm font-bold">Travel Included</p>
                        <p className="text-[11px] text-white/40">
                          You cover your own transit costs
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={form.travel_included}
                      onCheckedChange={(v) => update('travel_included', v)}
                      className="data-[state=checked]:bg-[#00FFCC]"
                    />
                  </div>

                  <div className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-[#1A1A1A] border border-white/10">
                    <div className="flex items-center gap-3">
                      <Music className="w-4 h-4 text-white/40" />
                      <div>
                        <p className="text-sm font-bold">Equipment / Kit Included</p>
                        <p className="text-[11px] text-white/40">You bring your own gear</p>
                      </div>
                    </div>
                    <Switch
                      checked={form.equipment_included}
                      onCheckedChange={(v) => update('equipment_included', v)}
                      className="data-[state=checked]:bg-[#00FFCC]"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* STEP 4 – Review */}
            {step === 4 && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-black mb-1">Review & Go Live</h2>
                  <p className="text-xs text-white/40">
                    Confirm your listing before venues can see it
                  </p>
                </div>

                <div className="space-y-2">
                  {[
                    { label: 'Listing Title', value: form.title || '—' },
                    { label: 'Service Type', value: form.service_type || '—' },
                    { label: 'Genres', value: form.genres.length ? form.genres.join(', ') : '—' },
                    {
                      label: 'Available',
                      value: form.available_from
                        ? `${form.available_from} → ${form.available_to}`
                        : '—',
                    },
                    {
                      label: 'Times',
                      value: form.time_from ? `${form.time_from} – ${form.time_to}` : '—',
                    },
                    { label: 'Neighborhood', value: form.neighborhood || 'Any' },
                    {
                      label: 'Rate',
                      value: form.rate_min ? `$${form.rate_min}–$${form.rate_max}/hr` : '—',
                    },
                    { label: 'Advance Notice', value: form.advance_notice },
                    { label: 'Equipment Included', value: form.equipment_included ? 'Yes' : 'No' },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between py-3 px-4 rounded-xl bg-[#1A1A1A] border border-white/5"
                    >
                      <span className="text-sm text-white/50">{row.label}</span>
                      <span className="text-sm font-bold text-white">{row.value}</span>
                    </div>
                  ))}
                </div>

                {(!form.title || !form.service_type || !form.rate_min) && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300">
                      Missing some required fields. Go back and fill in your title, service type,
                      and rate.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Navigation */}
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
              {step < STEPS.length && (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold flex items-center gap-1.5"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Right panel – Live preview / matching venues */}
          <div className="hidden xl:flex flex-col w-80 flex-shrink-0 border-l border-white/5 bg-[#0F0F0F] overflow-y-auto">
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                  Live Preview
                </span>
                <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current" />
              </div>
              <div className="flex items-center gap-4 py-3 px-4 rounded-xl bg-[#00FFCC]/5 border border-[#00FFCC]/15">
                <div className="w-12 h-12 rounded-xl bg-[#00FFCC]/15 flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-[#00FFCC]" />
                </div>
                <div>
                  <p className="text-3xl font-black text-[#00FFCC] leading-none">{matchCount}</p>
                  <p className="text-xs text-white/50 mt-0.5">Venues actively hiring</p>
                </div>
              </div>
              {matchCount > 0 && (
                <div className="mt-3 space-y-1.5 text-[11px] text-white/40">
                  <div className="flex items-center justify-between">
                    <span>Avg. offer response</span>
                    <span className="text-white/70 font-bold">~20 min</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Est. booking time</span>
                    <span className="text-white/70 font-bold">1–3 hrs</span>
                  </div>
                </div>
              )}
            </div>

            {matchCount > 0 && (
              <div className="p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">
                  Venues Hiring Now
                </p>
                {MOCK_VENUES.map((v) => (
                  <div
                    key={v.name}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#1A1A1A] border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#00FFCC] text-xs font-black">
                        {v.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{v.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                        <span className="text-[10px] text-white/40">
                          {v.rating} · {v.neighborhood}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-black text-[#00FFCC]">{v.match}%</p>
                      <p className="text-[10px] text-white/30">match</p>
                    </div>
                  </div>
                ))}
                <div className="p-3 rounded-xl bg-[#1A1A1A] border border-[#00FFCC]/10 mt-2">
                  <div className="flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 text-[#00FFCC] mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Going live sends your listing to all matching venues. They can message you
                      directly.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {matchCount === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 text-white/20" />
                </div>
                <p className="text-sm font-bold text-white/30">
                  Select a service type to see matching venues
                </p>
                <p className="text-[11px] text-white/20 mt-1">
                  We'll match you with venues hiring for your role
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
              onClick={handleSave}
              disabled={saving}
              className="text-white/40 hover:text-white text-xs flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            <span className="text-[11px] text-white/20 hidden sm:block">
              ✓ Auto-saved 2 min ago
            </span>
          </div>
          <div className="flex items-center gap-2">
            {step === STEPS.length && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/10 text-white/60 hover:text-white text-xs flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" /> Preview
                </Button>
                <Button
                  size="sm"
                  onClick={handlePublish}
                  disabled={publishing || !form.title || !form.service_type}
                  className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-black flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  {publishing ? 'Publishing…' : 'Go Live'}
                </Button>
              </>
            )}
            {step < STEPS.length && (
              <div className="flex items-center gap-1.5 text-[11px] text-white/30">
                <Clock className="w-3 h-3" /> Step {step} of {STEPS.length}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
