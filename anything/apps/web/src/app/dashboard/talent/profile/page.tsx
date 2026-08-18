'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import DashboardSidebar from '@/components/DashboardSidebar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Music,
  Save,
  Globe,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotificationsBell } from '@/components/NotificationsBell';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROLES = [
  'DJ',
  'Bartender',
  'Security',
  'Promoter',
  'Photographer',
  'VIP Host',
  'Waitstaff',
  'Coat Check',
];
const VIBES = [
  'House',
  'Hip-Hop',
  'R&B',
  'Afrobeats',
  'Techno',
  'Reggaeton',
  'Latin',
  'Pop',
  'EDM',
  'Jazz',
  'Soul',
  'Dancehall',
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TalentProfile {
  stage_name: string;
  pronouns: string;
  neighborhood: string;
  bio: string;
  primary_role: string;
  genres_vibes: string[];
  hourly_rate_min: number | '';
  hourly_rate_max: number | '';
  social_links: { instagram?: string; soundcloud?: string; tiktok?: string; website?: string };
  avatar_url: string;
  portfolio_images: string[];
  profile_completion_pct: number;
}

const DEFAULT: TalentProfile = {
  stage_name: '',
  pronouns: '',
  neighborhood: '',
  bio: '',
  primary_role: '',
  genres_vibes: [],
  hourly_rate_min: '',
  hourly_rate_max: '',
  social_links: {},
  avatar_url: '',
  portfolio_images: ['', '', ''],
  profile_completion_pct: 0,
};

// ─── Image Upload Zone ─────────────────────────────────────────────────────────

function UploadZone({
  value,
  onChange,
  label,
  large,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  large?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      // Simple base64 preview — in production, wire to real upload
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        onChange(url);
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div
      className={`relative group rounded-xl border-2 border-dashed border-white/10 hover:border-[#00FFCC]/40 transition-colors cursor-pointer overflow-hidden bg-[#121212] ${
        large ? 'h-48' : 'h-28'
      }`}
      onClick={() => inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onInputChange}
      />
      {value ? (
        <>
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-6 h-6 text-white" />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-3">
          <div className="w-10 h-10 rounded-xl bg-[#00FFCC]/10 flex items-center justify-center">
            <ImagePlus className="w-5 h-5 text-[#00FFCC]/60" />
          </div>
          <p className="text-[11px] text-white/30 text-center leading-tight">{label}</p>
        </div>
      )}
    </div>
  );
}

// ─── Section Card ──────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-6">
      <div className="mb-5">
        <h2 className="text-base font-bold text-white">{title}</h2>
        <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

// ─── Tag Toggle ────────────────────────────────────────────────────────────────

function TagToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active
          ? 'bg-[#00FFCC]/15 border-[#00FFCC]/40 text-[#00FFCC]'
          : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20 hover:text-white/70'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Input Field ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  'bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all';

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TalentProfilePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<TalentProfile>(DEFAULT);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ['talent-profile'],
    queryFn: async () => {
      const res = await fetch('/api/talent/profile');
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json() as Promise<{ profile: TalentProfile | null }>;
    },
  });

  useEffect(() => {
    if (data?.profile) {
      setForm({
        ...DEFAULT,
        ...data.profile,
        portfolio_images:
          data.profile.portfolio_images?.length === 3
            ? data.profile.portfolio_images
            : ['', '', ''],
        genres_vibes: data.profile.genres_vibes ?? [],
        social_links: data.profile.social_links ?? {},
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (payload: TalentProfile) => {
      const res = await fetch('/api/talent/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: (result) => {
      setForm((prev) => ({
        ...prev,
        profile_completion_pct:
          result.profile?.profile_completion_pct ?? prev.profile_completion_pct,
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void qc.invalidateQueries({ queryKey: ['talent-profile'] });
      toast.success('Profile saved!');
    },
    onError: () => toast.error('Failed to save profile'),
  });

  const set = <K extends keyof TalentProfile>(key: K, value: TalentProfile[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleVibe = (v: string) =>
    setForm((prev) => ({
      ...prev,
      genres_vibes: prev.genres_vibes.includes(v)
        ? prev.genres_vibes.filter((g) => g !== v)
        : [...prev.genres_vibes, v],
    }));

  const setPortfolio = (idx: number, url: string) =>
    setForm((prev) => {
      const arr = [...prev.portfolio_images];
      arr[idx] = url;
      return { ...prev, portfolio_images: arr };
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const pct = form.profile_completion_pct;

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-10">
          <div>
            <h1 className="text-lg font-bold">Craft Your Identity</h1>
            <p className="text-xs text-white/40">How the city sees you</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell role="talent" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-xs gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Preview Profile
            </Button>
            <Button
              type="submit"
              form="talent-profile-form"
              size="sm"
              disabled={mutation.isPending}
              className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs gap-1.5"
            >
              {saved ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  {mutation.isPending ? 'Saving…' : 'Save Progress'}
                </>
              )}
            </Button>
          </div>
        </header>

        {/* Profile completion banner */}
        <div className="px-6 pt-5">
          <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl px-5 py-4 flex items-center gap-5">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-white/60">Profile Completion</p>
                <span className="text-xs font-black text-[#00FFCC]">{pct}%</span>
              </div>
              <Progress value={pct} aria-label="Profile completion" className="h-1.5 bg-white/10" />
            </div>
            <Badge
              className={`flex-shrink-0 text-xs font-bold px-3 py-1 ${
                pct >= 80
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
              }`}
            >
              {pct >= 80 ? '🟢 Profile Live' : '🟡 Incomplete'}
            </Badge>
          </div>
        </div>

        {/* Form */}
        <form
          id="talent-profile-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-5"
        >
          {/* ── Media Gallery ── */}
          <Section title="Media Gallery" subtitle="Your face to the venue — make it count">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <p className="text-[11px] text-white/30 uppercase tracking-widest font-semibold mb-2">
                  Primary Headshot
                </p>
                <UploadZone
                  value={form.avatar_url}
                  onChange={(url) => set('avatar_url', url)}
                  label="Click or drag to upload · PNG, JPG · Max 5MB"
                  large
                />
              </div>
              <div className="md:col-span-2">
                <p className="text-[11px] text-white/30 uppercase tracking-widest font-semibold mb-2">
                  Portfolio Highlights
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <UploadZone
                      key={i}
                      value={form.portfolio_images[i] ?? ''}
                      onChange={(url) => setPortfolio(i, url)}
                      label="Add photo"
                    />
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ── The Basics ── */}
          <Section title="The Basics" subtitle="Your identity on the platform">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Display Name / Stage Name">
                <input
                  className={inputCls}
                  placeholder="e.g. DJ Marcus Lee"
                  value={form.stage_name}
                  onChange={(e) => set('stage_name', e.target.value)}
                />
              </Field>
              <Field label="Pronouns">
                <input
                  className={inputCls}
                  placeholder="e.g. he/him, she/her, they/them"
                  value={form.pronouns}
                  onChange={(e) => set('pronouns', e.target.value)}
                />
              </Field>
              <Field label="Home Base (Neighborhood)">
                <input
                  className={inputCls}
                  placeholder="e.g. Brooklyn, Harlem, LES"
                  value={form.neighborhood}
                  onChange={(e) => set('neighborhood', e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label={`Professional Bio (${form.bio.length}/500)`}>
                <textarea
                  className={`${inputCls} min-h-[110px] resize-none leading-relaxed`}
                  placeholder="Tell venues what makes you the best fit for their night. Your energy, your sound, your story…"
                  maxLength={500}
                  value={form.bio}
                  onChange={(e) => set('bio', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* ── Professional Specifications ── */}
          <Section title="Professional Specifications" subtitle="Help venues find the right match">
            {/* Primary Role */}
            <div className="mb-5">
              <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold mb-3">
                Primary Role
              </p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <TagToggle
                    key={r}
                    label={r}
                    active={form.primary_role === r}
                    onClick={() => set('primary_role', form.primary_role === r ? '' : r)}
                  />
                ))}
              </div>
            </div>

            {/* Vibes & Genres */}
            <div className="mb-5">
              <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold mb-3">
                Vibes &amp; Genres
              </p>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <TagToggle
                    key={v}
                    label={v}
                    active={form.genres_vibes.includes(v)}
                    onClick={() => toggleVibe(v)}
                  />
                ))}
              </div>
            </div>

            {/* Rate Range */}
            <div>
              <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold mb-3">
                Hourly Rate Range
              </p>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00FFCC] text-sm font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Min"
                    className={`${inputCls} pl-7`}
                    value={form.hourly_rate_min}
                    onChange={(e) =>
                      set('hourly_rate_min', e.target.value === '' ? '' : Number(e.target.value))
                    }
                  />
                </div>
                <span className="text-white/30 text-sm">—</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00FFCC] text-sm font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Max"
                    className={`${inputCls} pl-7`}
                    value={form.hourly_rate_max}
                    onChange={(e) =>
                      set('hourly_rate_max', e.target.value === '' ? '' : Number(e.target.value))
                    }
                  />
                </div>
                <span className="text-white/30 text-sm flex-shrink-0">/ hr</span>
              </div>
            </div>
          </Section>

          {/* ── Digital Presence ── */}
          <Section title="Digital Presence" subtitle="Links that build your brand">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Instagram Handle">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E1306C]/60"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="@yourhandle"
                    value={form.social_links.instagram ?? ''}
                    onChange={(e) =>
                      set('social_links', { ...form.social_links, instagram: e.target.value })
                    }
                  />
                </div>
              </Field>
              <Field label="TikTok Handle">
                <div className="relative">
                  <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="@yourhandle"
                    value={form.social_links.tiktok ?? ''}
                    onChange={(e) =>
                      set('social_links', { ...form.social_links, tiktok: e.target.value })
                    }
                  />
                </div>
              </Field>
              <Field label="SoundCloud URL">
                <div className="relative">
                  <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="soundcloud.com/yourname"
                    value={form.social_links.soundcloud ?? ''}
                    onChange={(e) =>
                      set('social_links', { ...form.social_links, soundcloud: e.target.value })
                    }
                  />
                </div>
              </Field>
              <Field label="Professional Website">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="https://yoursite.com"
                    value={form.social_links.website ?? ''}
                    onChange={(e) =>
                      set('social_links', { ...form.social_links, website: e.target.value })
                    }
                  />
                </div>
              </Field>
            </div>
          </Section>

          {/* Bottom save button */}
          <div className="flex justify-end pb-6">
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold px-8 gap-2"
            >
              <Save className="w-4 h-4" />
              {mutation.isPending ? 'Saving…' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
