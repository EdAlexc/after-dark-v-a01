'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import DashboardSidebar from '@/components/DashboardSidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Camera,
  CheckCircle2,
  Clock,
  Globe,
  ImagePlus,
  Music,
  Save,
  MapPin,
  Users,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { NotificationsBell } from '@/components/NotificationsBell';

// ─── Constants ─────────────────────────────────────────────────────────────────

const VENUE_TYPES = [
  'Nightclub',
  'Rooftop Bar',
  'Lounge',
  'Restaurant & Bar',
  'Event Space',
  'Hotel Bar',
  'Sports Bar',
  'Jazz Club',
  'Comedy Club',
];
const GENRES = [
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
  'Top 40',
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OperatingHours {
  [day: string]: { open: string; close: string; closed: boolean };
}

interface VenueProfile {
  venue_name: string;
  neighborhood: string;
  address: string;
  description: string;
  venue_type: string;
  capacity: number | '';
  music_genres: string[];
  operating_hours: OperatingHours;
  avatar_url: string;
  gallery_images: string[];
  social_links: { instagram?: string; tiktok?: string; website?: string; facebook?: string };
}

const defaultHours = (): OperatingHours =>
  Object.fromEntries(
    DAYS.map((d) => [d, { open: '20:00', close: '04:00', closed: d === 'Mon' || d === 'Tue' }])
  );

const DEFAULT: VenueProfile = {
  venue_name: '',
  neighborhood: '',
  address: '',
  description: '',
  venue_type: '',
  capacity: '',
  music_genres: [],
  operating_hours: defaultHours(),
  avatar_url: '',
  gallery_images: Array(4).fill(''),
  social_links: {},
};

// ─── Upload Zone ───────────────────────────────────────────────────────────────

function UploadZone({
  value,
  onChange,
  label,
  large,
  rounded,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  large?: boolean;
  rounded?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => onChange(e.target?.result as string);
      reader.readAsDataURL(file);
    },
    [onChange]
  );
  return (
    <div
      className={`relative group border-2 border-dashed border-white/10 hover:border-[#00FFCC]/40 transition-colors cursor-pointer overflow-hidden bg-[#121212] ${
        large ? 'h-52' : 'h-28'
      } ${rounded ? 'rounded-full w-32 h-32 mx-auto' : 'rounded-xl'}`}
      onClick={() => inputRef.current?.click()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {value ? (
        <>
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-3">
          <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/10 flex items-center justify-center">
            <ImagePlus className="w-4 h-4 text-[#00FFCC]/60" />
          </div>
          <p className="text-[11px] text-white/30 text-center leading-tight">{label}</p>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

export default function VenueProfilePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<VenueProfile>(DEFAULT);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ['venue-profile'],
    queryFn: async () => {
      const res = await fetch('/api/venue/profile');
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json() as Promise<{ profile: VenueProfile | null }>;
    },
  });

  useEffect(() => {
    if (data?.profile) {
      setForm({
        ...DEFAULT,
        ...data.profile,
        gallery_images:
          data.profile.gallery_images?.length === 4
            ? data.profile.gallery_images
            : Array(4).fill(''),
        music_genres: data.profile.music_genres ?? [],
        operating_hours: data.profile.operating_hours ?? defaultHours(),
        social_links: data.profile.social_links ?? {},
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (payload: VenueProfile) => {
      const res = await fetch('/api/venue/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void qc.invalidateQueries({ queryKey: ['venue-profile'] });
      toast.success('Venue profile saved!');
    },
    onError: () => toast.error('Failed to save venue profile'),
  });

  const set = <K extends keyof VenueProfile>(key: K, value: VenueProfile[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleGenre = (g: string) =>
    setForm((prev) => ({
      ...prev,
      music_genres: prev.music_genres.includes(g)
        ? prev.music_genres.filter((x) => x !== g)
        : [...prev.music_genres, g],
    }));

  const setGallery = (idx: number, url: string) =>
    setForm((prev) => {
      const arr = [...prev.gallery_images];
      arr[idx] = url;
      return { ...prev, gallery_images: arr };
    });

  const setHours = (day: string, field: 'open' | 'close' | 'closed', value: string | boolean) =>
    setForm((prev) => ({
      ...prev,
      operating_hours: {
        ...prev.operating_hours,
        [day]: { ...prev.operating_hours[day], [field]: value },
      },
    }));

  // rough completion
  const fields = [
    form.venue_name,
    form.neighborhood,
    form.description,
    form.venue_type,
    form.capacity,
    form.avatar_url,
  ];
  const pct = Math.round(
    ((fields.filter(Boolean).length / fields.length + (form.music_genres.length > 0 ? 1 : 0)) / 7) *
      100
  );

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-10">
          <div>
            <h1 className="text-lg font-bold">Venue Profile</h1>
            <p className="text-xs text-white/40">How talent discovers your space</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell role="venue" />
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-xs gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Preview Listing
            </Button>
            <Button
              type="submit"
              form="venue-profile-form"
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
                  {mutation.isPending ? 'Saving…' : 'Save Profile'}
                </>
              )}
            </Button>
          </div>
        </header>

        {/* Completion banner */}
        <div className="px-6 pt-5">
          <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl px-5 py-4 flex items-center gap-5">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-white/60">Profile Completion</p>
                <span className="text-xs font-black text-[#00FFCC]">{pct}%</span>
              </div>
              <Progress value={pct} className="h-1.5 bg-white/10" />
            </div>
            <Badge
              className={`flex-shrink-0 text-xs font-bold px-3 py-1 ${
                pct >= 80
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
              }`}
            >
              {pct >= 80 ? '🟢 Listing Live' : '🟡 Incomplete'}
            </Badge>
          </div>
        </div>

        <form
          id="venue-profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="flex-1 overflow-y-auto p-6 space-y-5"
        >
          {/* ── Media ── */}
          <Section title="Venue Media" subtitle="Show talent what your space looks and feels like">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <p className="text-[11px] text-white/30 uppercase tracking-widest font-semibold mb-2">
                  Venue Logo / Primary Photo
                </p>
                <UploadZone
                  value={form.avatar_url}
                  onChange={(url) => set('avatar_url', url)}
                  label="Click or drag · PNG, JPG"
                  large
                />
              </div>
              <div className="md:col-span-3">
                <p className="text-[11px] text-white/30 uppercase tracking-widest font-semibold mb-2">
                  Gallery (Up to 4 Photos)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <UploadZone
                      key={i}
                      value={form.gallery_images[i] ?? ''}
                      onChange={(url) => setGallery(i, url)}
                      label="Add photo"
                    />
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ── The Basics ── */}
          <Section title="The Basics" subtitle="Core information about your venue">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Venue Name">
                <input
                  className={inputCls}
                  placeholder="e.g. Nebula NYC"
                  value={form.venue_name}
                  onChange={(e) => set('venue_name', e.target.value)}
                />
              </Field>
              <Field label="Neighborhood">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="e.g. Midtown, Lower East Side"
                    value={form.neighborhood}
                    onChange={(e) => set('neighborhood', e.target.value)}
                  />
                </div>
              </Field>
              <Field label="Full Address">
                <input
                  className={inputCls}
                  placeholder="123 W 35th St, New York, NY 10001"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </Field>
              <Field label="Capacity">
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="number"
                    min={0}
                    className={`${inputCls} pl-10`}
                    placeholder="e.g. 500"
                    value={form.capacity}
                    onChange={(e) =>
                      set('capacity', e.target.value === '' ? '' : Number(e.target.value))
                    }
                  />
                </div>
              </Field>
            </div>
            <div className="mt-4">
              <Field label={`About the Venue (${form.description.length}/600)`}>
                <textarea
                  className={`${inputCls} min-h-[110px] resize-none leading-relaxed`}
                  placeholder="Describe your venue's vibe, ambiance, clientele, and what makes a night here unforgettable…"
                  maxLength={600}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* ── Venue Details ── */}
          <Section
            title="Venue Details"
            subtitle="Help talent understand what kind of space you are"
          >
            {/* Venue Type */}
            <div className="mb-5">
              <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold mb-3">
                Venue Type
              </p>
              <div className="flex flex-wrap gap-2">
                {VENUE_TYPES.map((t) => (
                  <TagToggle
                    key={t}
                    label={t}
                    active={form.venue_type === t}
                    onClick={() => set('venue_type', form.venue_type === t ? '' : t)}
                  />
                ))}
              </div>
            </div>

            {/* Music Genres */}
            <div className="mb-5">
              <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold mb-3">
                Music &amp; Vibes
              </p>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <TagToggle
                    key={g}
                    label={g}
                    active={form.music_genres.includes(g)}
                    onClick={() => toggleGenre(g)}
                  />
                ))}
              </div>
            </div>

            {/* Operating Hours */}
            <div>
              <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Operating Hours
              </p>
              <div className="space-y-2">
                {DAYS.map((day) => {
                  const h = form.operating_hours[day] ?? {
                    open: '20:00',
                    close: '04:00',
                    closed: false,
                  };
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <span className="w-10 text-xs font-semibold text-white/50">{day}</span>
                      <button
                        type="button"
                        onClick={() => setHours(day, 'closed', !h.closed)}
                        className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
                          h.closed ? 'bg-white/10' : 'bg-[#00FFCC]/60'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                            h.closed ? 'left-0.5' : 'left-4'
                          }`}
                        />
                      </button>
                      {h.closed ? (
                        <span className="text-xs text-white/25 italic">Closed</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={h.open}
                            onChange={(e) => setHours(day, 'open', e.target.value)}
                            className="bg-[#121212] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[#00FFCC]"
                          />
                          <span className="text-white/30 text-xs">to</span>
                          <input
                            type="time"
                            value={h.close}
                            onChange={(e) => setHours(day, 'close', e.target.value)}
                            className="bg-[#121212] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[#00FFCC]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* ── Digital Presence ── */}
          <Section title="Digital Presence" subtitle="Where talent can find you online">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Instagram">
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
                    placeholder="@venuename"
                    value={form.social_links.instagram ?? ''}
                    onChange={(e) =>
                      set('social_links', { ...form.social_links, instagram: e.target.value })
                    }
                  />
                </div>
              </Field>
              <Field label="TikTok">
                <div className="relative">
                  <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="@venuename"
                    value={form.social_links.tiktok ?? ''}
                    onChange={(e) =>
                      set('social_links', { ...form.social_links, tiktok: e.target.value })
                    }
                  />
                </div>
              </Field>
              <Field label="Facebook Page">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="facebook.com/yourpage"
                    value={form.social_links.facebook ?? ''}
                    onChange={(e) =>
                      set('social_links', { ...form.social_links, facebook: e.target.value })
                    }
                  />
                </div>
              </Field>
              <Field label="Website">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="https://yourvenue.com"
                    value={form.social_links.website ?? ''}
                    onChange={(e) =>
                      set('social_links', { ...form.social_links, website: e.target.value })
                    }
                  />
                </div>
              </Field>
            </div>
          </Section>

          <div className="flex justify-end pb-6">
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold px-8 gap-2"
            >
              <Save className="w-4 h-4" />
              {mutation.isPending ? 'Saving…' : 'Save Venue Profile'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
