import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Shell for the public legal surface (TENANT_GUARDRAIL §4.2 G1).
 *
 * These pages must be reachable **logged out** — they are linked from the
 * footer and from signup, and an unauthenticated regulator/user has to be able
 * to read them. They deliberately live outside `/dashboard`, which middleware
 * gates.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
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
            <Link href="/contact" className="hover:text-white transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </nav>

      <article
        className="max-w-3xl mx-auto px-4 py-12
          [&_h1]:text-3xl [&_h1]:md:text-4xl [&_h1]:font-black [&_h1]:tracking-tight [&_h1]:mb-2
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-white
          [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-white/90
          [&_p]:text-white/60 [&_p]:leading-relaxed [&_p]:mb-4
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_ul]:text-white/60 [&_ul]:mb-4
          [&_li]:leading-relaxed
          [&_a]:text-[#00FFCC] [&_a]:hover:underline
          [&_strong]:text-white/90
          [&_table]:w-full [&_table]:text-sm [&_table]:my-4 [&_table]:block [&_table]:overflow-x-auto
          [&_th]:text-left [&_th]:font-bold [&_th]:text-white/70 [&_th]:border-b [&_th]:border-white/10 [&_th]:py-2 [&_th]:pr-4
          [&_td]:text-white/60 [&_td]:border-b [&_td]:border-white/5 [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top"
      >
        {children}
      </article>

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
