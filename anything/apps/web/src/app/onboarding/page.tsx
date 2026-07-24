'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Music, Wine, ShieldCheck, Megaphone, ArrowRight, Check } from 'lucide-react';

const ROLES = [
  {
    value: 'TALENT',
    label: 'Talent',
    description: 'I perform, mix, host, or work events as a professional.',
    icon: Music,
    examples: ['DJ / Producer', 'Mixologist', 'Promoter', 'Host / MC'],
    color: 'text-[#00FFCC]',
    border: 'border-[#00FFCC]',
    bg: 'bg-[#00FFCC]/10',
  },
  {
    value: 'VENUE',
    label: 'Venue',
    description: 'I manage a club, lounge, bar, or nightlife venue.',
    icon: Wine,
    examples: ['Club Owner', 'Booking Manager', 'Event Director', 'Bar Manager'],
    color: 'text-purple-400',
    border: 'border-purple-400',
    bg: 'bg-purple-400/10',
  },
];

const TALENT_ROLES = [
  { label: 'DJ / Producer', icon: Music },
  { label: 'Mixologist / Bartender', icon: Wine },
  { label: 'Promoter', icon: Megaphone },
  { label: 'Security', icon: ShieldCheck },
  { label: 'Host / MC', icon: Music },
  { label: 'Stage Manager', icon: Music },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedSubRole, setSelectedSubRole] = useState<string | null>(null);
  const [stageName, setStageName] = useState('');
  const [venueName, setVenueName] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up role selected during sign-up
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pending = localStorage.getItem('pendingRole');
      if (pending === 'TALENT' || pending === 'VENUE') {
        setSelectedRole(pending);
      }
    }
  }, []);

  const handleComplete = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          subRole: selectedSubRole,
          stageName,
          venueName,
          neighborhood,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save profile');
      }

      if (typeof window !== 'undefined') {
        localStorage.removeItem('pendingRole');
      }

      // Redirect to the appropriate dashboard
      router.push(selectedRole === 'VENUE' ? '/dashboard/venue' : '/dashboard/talent');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }, [selectedRole, selectedSubRole, stageName, venueName, neighborhood, router]);

  return (
    <main className="min-h-screen bg-[#121212] text-white flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#00FFCC]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-3xl font-black tracking-tighter text-[#00FFCC]">AFTERDARK</span>
          <p className="text-white/40 text-sm mt-2">Let's set up your profile</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step > s
                    ? 'bg-[#00FFCC] text-black'
                    : step === s
                      ? 'bg-[#00FFCC]/20 border border-[#00FFCC] text-[#00FFCC]'
                      : 'bg-white/5 border border-white/10 text-white/30'
                }`}
              >
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 2 && (
                <div className={`w-16 h-px ${step > s ? 'bg-[#00FFCC]' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Role Selection */}
        {step === 1 && (
          <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8">
            <h1 className="text-2xl font-bold mb-2">What brings you to AfterDark?</h1>
            <p className="text-white/40 text-sm mb-8">Choose your primary role on the platform.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {ROLES.map((r) => {
                const Icon = r.icon;
                const isSelected = selectedRole === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setSelectedRole(r.value)}
                    className={`text-left p-6 rounded-xl border transition-all ${
                      isSelected
                        ? `${r.border} ${r.bg}`
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <Icon className={`w-8 h-8 mb-4 ${isSelected ? r.color : 'text-white/40'}`} />
                    <h3 className={`text-lg font-bold mb-1 ${isSelected ? r.color : 'text-white'}`}>
                      {r.label}
                    </h3>
                    <p className="text-white/40 text-xs mb-4">{r.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {r.examples.map((ex) => (
                        <span
                          key={ex}
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            isSelected ? `${r.bg} ${r.color}` : 'bg-white/5 text-white/30'
                          }`}
                        >
                          {ex}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!selectedRole}
              onClick={() => setStep(2)}
              className="w-full bg-[#00FFCC] text-black font-bold py-3 rounded-xl text-sm hover:bg-[#00FFCC]/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Profile Basics */}
        {step === 2 && (
          <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8">
            <h1 className="text-2xl font-bold mb-2">
              {selectedRole === 'TALENT' ? 'Tell us about yourself' : 'Tell us about your venue'}
            </h1>
            <p className="text-white/40 text-sm mb-8">
              {selectedRole === 'TALENT'
                ? 'This is what venues will see when they review your profile.'
                : 'This is what talent will see when browsing your gigs.'}
            </p>

            <div className="flex flex-col gap-5">
              {selectedRole === 'TALENT' ? (
                <>
                  {/* Sub-role picker */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                      Your Primary Role
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {TALENT_ROLES.map((tr) => (
                        <button
                          key={tr.label}
                          type="button"
                          onClick={() => setSelectedSubRole(tr.label)}
                          className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                            selectedSubRole === tr.label
                              ? 'border-[#00FFCC] bg-[#00FFCC]/10 text-[#00FFCC]'
                              : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20'
                          }`}
                        >
                          {tr.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                      Stage Name
                    </span>
                    <input
                      type="text"
                      value={stageName}
                      onChange={(e) => setStageName(e.target.value)}
                      placeholder="e.g. DJ Nova, Marco V…"
                      className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                      Your Neighborhood
                    </span>
                    <input
                      type="text"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="e.g. Brooklyn, Midtown, Lower East Side…"
                      className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                      Venue Name
                    </span>
                    <input
                      type="text"
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      placeholder="e.g. Nebula NYC, The Loft…"
                      className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                      Neighborhood / Area
                    </span>
                    <input
                      type="text"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="e.g. Chelsea, Meatpacking District…"
                      className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
                    />
                  </label>
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 border border-white/10 text-white/60 font-bold py-3 rounded-xl text-sm hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleComplete()}
                disabled={loading}
                className="flex-[2] bg-[#00FFCC] text-black font-bold py-3 rounded-xl text-sm hover:bg-[#00FFCC]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  'Setting up your profile…'
                ) : (
                  <>
                    Enter AfterDark <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
