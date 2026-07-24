'use client';

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardSidebar from '@/components/DashboardSidebar';
import { Button } from '@/components/ui/button';
import {
  Bell,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  QrCode,
  Save,
  Shield,
  ShieldCheck,
  ShieldOff,
  User,
  AtSign,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/10 flex items-center justify-center text-[#00FFCC] flex-shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <p className="text-xs text-white/40">{subtitle}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

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
  'bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all w-full';

// ─── Password Field ────────────────────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className={`${inputCls} pr-10`}
          placeholder={placeholder ?? '••••••••'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </Field>
  );
}

// ─── Avatar Upload ─────────────────────────────────────────────────────────────

function AvatarUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
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
    <div className="flex items-center gap-5">
      <div
        className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 bg-[#121212] flex items-center justify-center cursor-pointer group"
        onClick={() => inputRef.current?.click()}
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
            <img src={value} alt="Avatar" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-white/20" />
            <Camera className="w-3 h-3 text-white/20" />
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Profile Photo</p>
        <p className="text-xs text-white/40 mt-0.5">PNG or JPG · Max 5MB</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 text-xs text-[#00FFCC] hover:underline font-semibold"
        >
          Upload new photo
        </button>
      </div>
    </div>
  );
}

// ─── 2FA Modal ─────────────────────────────────────────────────────────────────

function TwoFASetupModal({
  secret,
  qrUrl,
  onVerify,
  onClose,
}: {
  secret: string;
  qrUrl: string;
  onVerify: (token: string) => void;
  onClose: () => void;
}) {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  const copySecret = () => {
    void navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1E1E1E] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-white">Enable Authenticator App</h3>
            <p className="text-xs text-white/40 mt-0.5">
              Works with Google Authenticator, Microsoft Authenticator, Authy, and more
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <ol className="space-y-5 mb-6">
          <li>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">
              1 · Scan QR Code
            </p>
            <div className="flex items-center justify-center bg-white rounded-xl p-3 w-fit mx-auto">
              <img src={qrUrl} alt="2FA QR code" className="w-40 h-40" />
            </div>
          </li>
          <li>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">
              2 · Or enter code manually
            </p>
            <div className="flex items-center gap-2 bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5">
              <code className="flex-1 text-xs text-[#00FFCC] font-mono tracking-widest break-all">
                {secret}
              </code>
              <button
                type="button"
                onClick={copySecret}
                className="text-xs text-white/40 hover:text-white transition-colors flex-shrink-0"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-[#00FFCC]" /> : 'Copy'}
              </button>
            </div>
          </li>
          <li>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">
              3 · Enter 6-digit code to verify
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className={`${inputCls} text-center text-xl tracking-[0.5em] font-mono`}
              placeholder="000000"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
            />
          </li>
        </ol>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-white/10 text-white/60 hover:bg-white/5"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold"
            disabled={token.length !== 6}
            onClick={() => onVerify(token)}
          >
            <ShieldCheck className="w-4 h-4 mr-1.5" />
            Activate 2FA
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Disable 2FA Modal ─────────────────────────────────────────────────────────

function DisableTwoFAModal({
  onDisable,
  onClose,
}: {
  onDisable: (token: string) => void;
  onClose: () => void;
}) {
  const [token, setToken] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1E1E1E] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <ShieldOff className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Disable 2FA</h3>
            <p className="text-xs text-white/40">Enter your authenticator code to confirm</p>
          </div>
        </div>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          className={`${inputCls} text-center text-xl tracking-[0.5em] font-mono mb-4`}
          placeholder="000000"
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
        />
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-white/10 text-white/60 hover:bg-white/5"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-500 text-white hover:bg-red-600 font-bold"
            disabled={token.length !== 6}
            onClick={() => onDisable(token)}
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings data types ───────────────────────────────────────────────────────

interface UserSettings {
  name: string;
  email: string;
  image: string;
  recovery_email: string;
  phone: string;
  totp_enabled: boolean;
  social_links: {
    instagram?: string;
    tiktok?: string;
    twitter?: string;
    facebook?: string;
  };
}

const DEFAULT_SETTINGS: UserSettings = {
  name: '',
  email: '',
  image: '',
  recovery_email: '',
  phone: '',
  totp_enabled: false,
  social_links: {},
};

// ─── Page ──────────────────────────────────────────────────────────────────────

function SettingsInner() {
  const searchParams = useSearchParams();
  const role = (searchParams.get('role') === 'venue' ? 'venue' : 'talent') as 'talent' | 'venue';

  const qc = useQueryClient();

  // ── settings state ──
  const [form, setForm] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  // 2FA state
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [twoFAData, setTwoFAData] = useState<{ secret: string; qrUrl: string } | null>(null);

  // ── load settings ──
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to load');
      return res.json() as Promise<{ settings: UserSettings }>;
    },
  });

  useEffect(() => {
    if (settingsData?.settings) {
      setForm({ ...DEFAULT_SETTINGS, ...settingsData.settings });
    }
  }, [settingsData]);

  // ── save settings mutation ──
  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<UserSettings>) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved!');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  // ── change password ──
  const passwordMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.next,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => {
      setPasswordForm({ current: '', next: '', confirm: '' });
      setPasswordError('');
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 3000);
      toast.success('Password changed!');
    },
    onError: (err: Error) => {
      setPasswordError(err.message);
    },
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (passwordForm.next.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    passwordMutation.mutate();
  };

  // ── 2FA ──
  const open2FASetup = async () => {
    try {
      const res = await fetch('/api/settings/2fa');
      const data = (await res.json()) as { secret: string; qrUrl: string };
      setTwoFAData(data);
      setShowSetup(true);
    } catch {
      toast.error('Failed to load 2FA setup');
    }
  };

  const twoFAMutation = useMutation({
    mutationFn: async ({ action, token }: { action: 'enable' | 'disable'; token: string }) => {
      const res = await fetch('/api/settings/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, secret: twoFAData?.secret, token }),
      });
      const data = (await res.json()) as { error?: string; enabled?: boolean };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: (result) => {
      setForm((prev) => ({ ...prev, totp_enabled: result.enabled ?? false }));
      setShowSetup(false);
      setShowDisable(false);
      toast.success(result.enabled ? '2FA enabled!' : '2FA disabled');
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setSocial = (key: keyof UserSettings['social_links'], value: string) =>
    setForm((prev) => ({ ...prev, social_links: { ...prev.social_links, [key]: value } }));

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role={role} />

      {/* 2FA Modals */}
      {showSetup && twoFAData && (
        <TwoFASetupModal
          secret={twoFAData.secret}
          qrUrl={twoFAData.qrUrl}
          onVerify={(token) => twoFAMutation.mutate({ action: 'enable', token })}
          onClose={() => setShowSetup(false)}
        />
      )}
      {showDisable && (
        <DisableTwoFAModal
          onDisable={(token) => twoFAMutation.mutate({ action: 'disable', token })}
          onClose={() => setShowDisable(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-10">
          <div>
            <h1 className="text-lg font-bold">Account Settings</h1>
            <p className="text-xs text-white/40">Manage your profile, security, and preferences</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-5 max-w-3xl">
          {/* ── Profile Photo + Name ── */}
          <Section
            icon={<User className="w-4 h-4" />}
            title="Profile"
            subtitle="Your public identity"
          >
            <div className="space-y-5">
              <AvatarUpload value={form.image} onChange={(url) => set('image', url)} />
              <Field label="Display Name">
                <input
                  className={inputCls}
                  placeholder="Your full name or stage name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate({ name: form.name, image: form.image })}
                  disabled={saveMutation.isPending}
                  className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold gap-1.5"
                  size="sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Profile
                </Button>
              </div>
            </div>
          </Section>

          {/* ── Account Information ── */}
          <Section
            icon={<Mail className="w-4 h-4" />}
            title="Account Information"
            subtitle="Email addresses and phone number"
          >
            <div className="space-y-4">
              <Field label="Login Email">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="email"
                    className={`${inputCls} pl-10 opacity-60 cursor-not-allowed`}
                    value={form.email}
                    readOnly
                    title="Your login email cannot be changed here"
                  />
                </div>
                <p className="text-[11px] text-white/30">
                  Your login email · Contact support to change it
                </p>
              </Field>
              <Field label="Recovery Email">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="email"
                    className={`${inputCls} pl-10`}
                    placeholder="backup@example.com"
                    value={form.recovery_email}
                    onChange={(e) => set('recovery_email', e.target.value)}
                  />
                </div>
              </Field>
              <Field label="Phone Number">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="tel"
                    className={`${inputCls} pl-10`}
                    placeholder="+1 (212) 555-0100"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </div>
              </Field>
              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    saveMutation.mutate({
                      recovery_email: form.recovery_email,
                      phone: form.phone,
                    })
                  }
                  disabled={saveMutation.isPending}
                  className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold gap-1.5"
                  size="sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Account Info
                </Button>
              </div>
            </div>
          </Section>

          {/* ── Social Media Links ── */}
          <Section
            icon={<AtSign className="w-4 h-4" />}
            title="Social Media"
            subtitle="Connect your social profiles"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Instagram */}
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
                    placeholder="@yourhandle"
                    value={form.social_links.instagram ?? ''}
                    onChange={(e) => setSocial('instagram', e.target.value)}
                  />
                </div>
              </Field>

              {/* TikTok */}
              <Field label="TikTok">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.53V6.77a4.85 4.85 0 01-1.02-.08z" />
                  </svg>
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="@yourhandle"
                    value={form.social_links.tiktok ?? ''}
                    onChange={(e) => setSocial('tiktok', e.target.value)}
                  />
                </div>
              </Field>

              {/* Twitter / X */}
              <Field label="Twitter / X">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="@yourhandle"
                    value={form.social_links.twitter ?? ''}
                    onChange={(e) => setSocial('twitter', e.target.value)}
                  />
                </div>
              </Field>

              {/* Facebook */}
              <Field label="Facebook">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1877F2]/60"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <input
                    className={`${inputCls} pl-10`}
                    placeholder="facebook.com/yourpage"
                    value={form.social_links.facebook ?? ''}
                    onChange={(e) => setSocial('facebook', e.target.value)}
                  />
                </div>
              </Field>
            </div>
            <div className="flex justify-end mt-4">
              <Button
                onClick={() => saveMutation.mutate({ social_links: form.social_links })}
                disabled={saveMutation.isPending}
                className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold gap-1.5"
                size="sm"
              >
                <Save className="w-3.5 h-3.5" />
                Save Social Links
              </Button>
            </div>
          </Section>

          {/* ── Change Password ── */}
          <Section
            icon={<KeyRound className="w-4 h-4" />}
            title="Change Password"
            subtitle="Keep your account secure with a strong password"
          >
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <PasswordField
                label="Current Password"
                value={passwordForm.current}
                onChange={(v) => setPasswordForm((p) => ({ ...p, current: v }))}
                placeholder="Your current password"
              />
              <PasswordField
                label="New Password"
                value={passwordForm.next}
                onChange={(v) => setPasswordForm((p) => ({ ...p, next: v }))}
                placeholder="At least 8 characters"
              />
              <PasswordField
                label="Confirm New Password"
                value={passwordForm.confirm}
                onChange={(v) => setPasswordForm((p) => ({ ...p, confirm: v }))}
                placeholder="Repeat new password"
              />

              {passwordError && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  {passwordError}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    passwordMutation.isPending ||
                    !passwordForm.current ||
                    !passwordForm.next ||
                    !passwordForm.confirm
                  }
                  className={`font-bold gap-1.5 ${
                    passwordSaved
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90'
                  }`}
                  size="sm"
                >
                  {passwordSaved ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Changed!
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      {passwordMutation.isPending ? 'Updating…' : 'Update Password'}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Section>

          {/* ── Two-Factor Authentication ── */}
          <Section
            icon={<Shield className="w-4 h-4" />}
            title="Two-Factor Authentication"
            subtitle="Add an extra layer of security to your account"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    form.totp_enabled
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-white/5 text-white/30'
                  }`}
                >
                  {form.totp_enabled ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : (
                    <ShieldOff className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">
                    {form.totp_enabled ? '2FA is Active' : 'Authenticator App'}
                  </p>
                  {form.totp_enabled ? (
                    <p className="text-xs text-green-400 mt-0.5">
                      Your account is protected by an authenticator app
                    </p>
                  ) : (
                    <p className="text-xs text-white/40 mt-0.5">
                      Use Google Authenticator, Microsoft Authenticator, or Authy to generate
                      time-based one-time codes
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {/* App badges */}
                    {['Google Authenticator', 'Microsoft Authenticator', 'Authy'].map((app) => (
                      <span
                        key={app}
                        className="text-[10px] font-semibold text-white/30 border border-white/10 rounded-full px-2.5 py-0.5 flex items-center gap-1"
                      >
                        <QrCode className="w-2.5 h-2.5" />
                        {app}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0">
                {form.totp_enabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDisable(true)}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-400 font-semibold text-xs gap-1.5"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Disable
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void open2FASetup()}
                    className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Enable
                  </Button>
                )}
              </div>
            </div>
          </Section>

          <div className="h-10" />
        </main>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SettingsInner />
    </Suspense>
  );
}
