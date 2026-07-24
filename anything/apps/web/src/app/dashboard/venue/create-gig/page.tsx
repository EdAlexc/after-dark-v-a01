'use client';

import React, { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Check,
  Bell,
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

const MOCK_CANDIDATES = [
  { name: 'DJ Marcus Lee', role: 'DJ / Producer', rating: 4.9, rate: '$160-$220/hr', match: 98 },
  { name: 'Kira Voss', role: 'DJ / Producer', rating: 4.8, rate: '$140-$200/hr', match: 95 },
  { name: 'Tony Reyes', role: 'DJ / Producer', rating: 4.7, rate: '$100-$180/hr', match: 91 },
  { name: 'Amara J.', role: 'DJ / Producer', rating: 4.6, rate: '$120-$160/hr', match: 88 },
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
      {hint && <p className="text-[11px] text-white/30">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#00FFCC]/40 transition-colors';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateGigPage() {
  const [step, setStep] = useState(1);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
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

  const matchCount = form.role_needed ? 12 : 0;

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const startTime =
        form.start_date && form.start_time
          ? `${form.start_date}T${form.start_time}`
          : '2026-01-01T00:00:00';
      const endTime =
        form.end_date && form.end_time
          ? `${form.end_date}T${form.end_time}`
          : '2026-01-01T06:00:00';

      const res = await fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title || 'Untitled Gig',
          role_needed: form.role_needed,
          description: form.description,
          start_time: startTime,
          end_time: endTime,
          base_rate: Number(form.base_rate) || 0,
          tips_included: form.tips_included,
          status: 'DRAFT',
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
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
      const startTime = `${form.start_date}T${form.start_time}`;
      const endTime = `${form.end_date}T${form.end_time}`;
      const res = await fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          role_needed: form.role_needed,
          description: form.description,
          start_time: startTime,
          end_time: endTime,
          base_rate: Number(form.base_rate),
          tips_included: form.tips_included,
          status: 'PUBLISHED',
        }),
      });
      if (!res.ok) throw new Error('Failed to publish');
      toast.success('Gig published! Talent are being notified.');
    } catch {
      toast.error('Could not publish gig');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" userName="Nebula NYC" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Post a Gig</h1>
            <p className="text-xs text-white/40">Fill in details to attract top talent</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
            </button>
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

                    {/* Map placeholder */}
                    <div className="rounded-xl bg-[#1A1A1A] border border-white/5 h-40 flex items-center justify-center">
                      <div className="text-center">
                        <MapPin className="w-6 h-6 text-white/15 mx-auto mb-2" />
                        <p className="text-xs text-white/20">Map preview will appear here</p>
                      </div>
                    </div>
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
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 font-bold">
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
                          <span className="text-[11px] text-white/30">Optional</span>
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
                  <p className="text-xs text-white/50 mt-0.5">Perfect matches found</p>
                </div>
              </div>

              {matchCount > 0 && (
                <div className="mt-3 space-y-1.5 text-[11px] text-white/40">
                  <div className="flex items-center justify-between">
                    <span>Avg. response time</span>
                    <span className="text-white/70 font-bold">~14 min</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Est. fill time</span>
                    <span className="text-white/70 font-bold">2-4 hrs</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Est. outreach</span>
                    <span className="text-[#00FFCC] font-bold">{matchCount * 3}+ talent</span>
                  </div>
                </div>
              )}
            </div>

            {/* Top Candidates */}
            {matchCount > 0 && (
              <div className="p-5 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Top Candidates
                </p>
                <div className="space-y-2.5">
                  {MOCK_CANDIDATES.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#1A1A1A] border border-white/5 hover:border-white/10 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#00FFCC] text-xs font-black">
                          {c.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{c.name}</p>
                        <p className="text-[11px] text-white/40">{c.rate}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-black text-[#00FFCC]">{c.match}%</p>
                        <div className="flex items-center gap-0.5 justify-end">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                i < Math.floor(c.rating) ? 'bg-yellow-400' : 'bg-white/10'
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 rounded-xl bg-[#1A1A1A] border border-[#00FFCC]/10">
                  <div className="flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 text-[#00FFCC] mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Publishing this gig will instantly notify all matched talent. Average response
                      time is under 15 minutes.
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
                  Select a role to see matching talent
                </p>
                <p className="text-[11px] text-white/20 mt-1">
                  We'll show you the best candidates based on your gig details
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
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </Button>
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
              <div className="flex items-center gap-1.5 text-[11px] text-white/30">
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
