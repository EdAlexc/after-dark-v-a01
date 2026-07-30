import type { Metadata } from 'next';
import Link from 'next/link';
import { LifeBuoy, ShieldAlert, Lock, Mail } from 'lucide-react';
import { LEGAL_CONTACT } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Contact Support — AfterDark',
  description: 'Reach AfterDark support, privacy, and security teams.',
};

/**
 * Contact page (TENANT_GUARDRAIL §4.2 G1 — the third required legal-surface
 * route). Deliberately a set of addressed mailto routes rather than a contact
 * form: a form would collect PII through a new, untested surface, and the
 * privacy policy commits us to routing rights requests to a specific address.
 *
 * Reachable logged-out, like the legal pages.
 */

const CHANNELS = [
  {
    icon: <LifeBuoy className="w-5 h-5" />,
    title: 'General support',
    body: 'Account help, gigs, bookings, or anything that looks broken.',
    email: LEGAL_CONTACT.support,
  },
  {
    icon: <Lock className="w-5 h-5" />,
    title: 'Privacy & data requests',
    body: 'Questions about your data, or requests beyond the self-serve export and delete in Settings.',
    email: LEGAL_CONTACT.privacy,
  },
  {
    icon: <ShieldAlert className="w-5 h-5" />,
    title: 'Security disclosure',
    body: 'Found a vulnerability? Tell us here — please do not open a public issue.',
    email: LEGAL_CONTACT.security,
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans">
      <nav className="sticky top-0 z-40 bg-[#121212]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-black tracking-tighter text-[#00FFCC]">
            AFTERDARK
          </Link>
          <div className="flex items-center gap-4 text-sm text-white/50">
            <Link href="/legal/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">Contact AfterDark</h1>
        <p className="text-white/60 leading-relaxed mb-10">
          We are a small team in closed alpha. Email is the fastest way to reach us, and we aim
          to reply within two business days.
        </p>

        <div className="space-y-4">
          {CHANNELS.map((channel) => (
            <a
              key={channel.email}
              href={`mailto:${channel.email}`}
              className="flex items-start gap-4 p-5 rounded-2xl bg-[#1E1E1E] border border-white/5 hover:border-[#00FFCC]/25 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#00FFCC]/10 text-[#00FFCC] flex items-center justify-center flex-shrink-0">
                {channel.icon}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white group-hover:text-[#00FFCC] transition-colors">
                  {channel.title}
                </p>
                <p className="text-sm text-white/50 mt-1 leading-relaxed">{channel.body}</p>
                <p className="text-sm text-[#00FFCC] mt-2 flex items-center gap-1.5 break-all">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  {channel.email}
                </p>
              </div>
            </a>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-white/[0.03] border border-white/5 p-5">
          <p className="text-sm font-bold text-white/80 mb-2">Need your data right now?</p>
          <p className="text-sm text-white/50 leading-relaxed">
            You do not have to email us. Download a full copy of your data, or delete your
            account, from{' '}
            <Link href="/dashboard/settings" className="text-[#00FFCC] hover:underline">
              Settings → Privacy &amp; Data
            </Link>
            . Both take effect immediately.
          </p>
        </div>
      </main>

      <footer className="border-t border-white/5 py-8 mt-8">
        <div className="max-w-3xl mx-auto px-4 flex flex-wrap items-center justify-between gap-4 text-xs text-white/30">
          <span>© 2026 AfterDark Marketplace Inc.</span>
          <Link href="/" className="hover:text-[#00FFCC] transition-colors">
            Back to AfterDark
          </Link>
        </div>
      </footer>
    </div>
  );
}
