/**
 * App-level 404 (CLAUDE.md §2.1, §5.1).
 *
 * Replaces the inherited create.xyz builder 404, which rendered a light-theme
 * "Uh-oh! This page doesn't exist (yet)" screen with a **Create Page** button
 * and postMessage'd the parent frame on `'*'`. That is builder-only tooling: it
 * leaked the authoring UI to end users and offered an action nobody outside the
 * create.xyz sandbox can take.
 *
 * Keeping this on-brand also restores the deploy diagnostic documented in
 * CLAUDE.md §2.1 — a dark AfterDark 404 means the request reached Next.js,
 * while the white "404: NOT_FOUND" platform page means it never did.
 */

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#121212] text-white font-sans flex flex-col items-center justify-center px-4 text-center selection:bg-[#00FFCC] selection:text-black">
      <Link
        href="/"
        className="text-2xl font-bold tracking-tighter text-[#00FFCC] absolute top-6 left-6"
      >
        AFTERDARK
      </Link>

      <p className="text-xs font-semibold tracking-widest text-[#00FFCC] uppercase mb-6">
        404 — Off the guest list
      </p>

      <h1 className="text-5xl sm:text-6xl font-bold tracking-tighter mb-4">
        This page isn&apos;t on the list.
      </h1>

      <p className="text-white/60 max-w-md mb-10">
        The page you&apos;re looking for moved, closed for the night, or never
        existed. Let&apos;s get you back to the good stuff.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/"
          className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold px-6 py-3 rounded-md transition-colors"
        >
          Back to Home
        </Link>
        <Link
          href="/dashboard/talent/browse"
          className="border border-white/15 hover:border-white/30 hover:text-white text-white/80 font-medium px-6 py-3 rounded-md transition-colors"
        >
          Browse Gigs
        </Link>
      </div>
    </main>
  );
}
