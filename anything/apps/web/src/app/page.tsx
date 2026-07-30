import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PostGigButton } from '@/components/PostGigButton';
import { FeaturedTonight } from '@/components/FeaturedTonight';
import {
  Music,
  Wine,
  ShieldCheck,
  Zap,
  Calendar,
  CreditCard,
  ArrowRight,
  Menu,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans selection:bg-[#00FFCC] selection:text-black">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#121212]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-2xl font-bold tracking-tighter text-[#00FFCC]">
              AFTERDARK
            </Link>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-white/60">
              <Link href="/dashboard/talent/browse" className="hover:text-white transition-colors">
                Browse Gigs &amp; Events
              </Link>
              <Link href="/dashboard/venue" className="hover:text-white transition-colors">
                Venues
              </Link>
              <Link href="/dashboard/talent" className="hover:text-white transition-colors">
                Talent Network
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/account/signin"
              className="text-sm font-medium hover:text-[#00FFCC] transition-colors"
            >
              Sign In
            </Link>
            <Link href="/account/signup">
              <Button className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold px-6">
                Join Now
              </Button>
            </Link>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-6 h-6" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 bg-[url('https://raw.createusercontent.com/08a22b5a-871d-4fc0-89ba-eddb675f2450/')] bg-cover bg-center">
          <div className="absolute inset-0 bg-gradient-to-b from-[#121212]/60 via-[#121212]/80 to-[#121212]"></div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold tracking-widest text-[#00FFCC] mb-6 uppercase">
            <Zap className="w-3 h-3 fill-current" /> The Beat of NYC Nightlife
          </div>
          <h1 className="text-5xl md:text-8xl font-bold tracking-tight mb-6 leading-tight">
            Your Next Night Out <br />
            <span className="text-[#00FFCC]">Starts Here.</span>
          </h1>
          <p className="text-lg md:text-xl text-white/60 mb-10 max-w-2xl mx-auto leading-relaxed">
            NYC's premier marketplace for nightlife talent and venues. Connect with the best DJs,
            mixologists, and security professionals in the city.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <PostGigButton className="w-full sm:w-auto bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 h-14 px-8 text-lg font-bold" />
            <Link href="/dashboard/talent/browse">
              <Button
                variant="outline"
                className="w-full sm:w-auto border-white/20 hover:bg-white/5 h-14 px-8 text-lg text-black font-bold"
              >
                Browse Gigs
              </Button>
            </Link>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 opacity-20 bounce-animation">
          <ArrowRight className="w-6 h-6 rotate-90 text-[#00FFCC]" />
        </div>
      </section>

      {/* Featured Tonight Section */}
      <section className="py-24 max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Hot Gigs Tonight</h2>
            <p className="text-white/60">The most urgent opportunities in the city right now.</p>
          </div>
          <Link
            href="/dashboard/talent/browse"
            className="hidden md:flex items-center gap-2 text-[#00FFCC] font-semibold hover:underline"
          >
            See All Listings <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <FeaturedTonight />
      </section>

      {/* Workflow Diagram Section */}
      <section className="py-24 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Fastest Path from Post to Payout
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Our streamlined process ensures you spend less time on paperwork and more time owning
              the night.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Connecting lines for desktop */}
            <div className="hidden md:block absolute top-1/2 left-[20%] right-[20%] h-px bg-gradient-to-r from-[#00FFCC]/0 via-[#00FFCC]/40 to-[#00FFCC]/0"></div>

            <div className="text-center relative">
              <div className="w-16 h-16 bg-[#1E1E1E] border border-[#00FFCC]/40 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-3 hover:rotate-0 transition-transform">
                <Zap className="w-8 h-8 text-[#00FFCC]" />
              </div>
              <h3 className="text-xl font-bold mb-2">1. Post or Browse</h3>
              <p className="text-white/60 text-sm">
                Venues list needs, talent find gigs. Simple as that.
              </p>
            </div>

            <div className="text-center relative">
              <div className="w-16 h-16 bg-[#1E1E1E] border border-[#00FFCC]/40 rounded-2xl flex items-center justify-center mx-auto mb-6 -rotate-3 hover:rotate-0 transition-transform">
                <Calendar className="w-8 h-8 text-[#00FFCC]" />
              </div>
              <h3 className="text-xl font-bold mb-2">2. Secure Booking</h3>
              <p className="text-white/60 text-sm">
                Negotiate rates and confirm schedules in real-time.
              </p>
            </div>

            <div className="text-center relative">
              <div className="w-16 h-16 bg-[#1E1E1E] border border-[#00FFCC]/40 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-6 hover:rotate-0 transition-transform">
                <CreditCard className="w-8 h-8 text-[#00FFCC]" />
              </div>
              <h3 className="text-xl font-bold mb-2">3. Instant Payout</h3>
              <p className="text-white/60 text-sm">
                Work the gig, check out, and get paid via Stripe Connect.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section className="py-24 max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row gap-16 items-start">
          <div className="md:w-1/3">
            <h2 className="text-4xl font-bold mb-6 leading-tight">
              The Roles We <br />
              <span className="text-[#00FFCC]">Power</span>
            </h2>
            <p className="text-white/60 mb-8 leading-relaxed">
              Whether you're behind the decks, the bar, or the velvet ropes, AfterDark is built to
              make your nightlife operations seamless.
            </p>
            <Button
              variant="link"
              className="text-[#00FFCC] p-0 h-auto font-bold text-lg hover:no-underline flex items-center gap-2 group"
            >
              Learn more about our community{' '}
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>

          <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card className="bg-[#1E1E1E] border-white/5 p-8 hover:bg-[#252525] transition-colors group">
              <Music className="w-10 h-10 text-[#00FFCC] mb-6" />
              <h3 className="text-2xl font-bold mb-4">Talent</h3>
              <p className="text-white/60 text-sm mb-6">
                From DJs to promoters. Manage your bookings, set your rates, and guarantee your
                payouts.
              </p>
              <Link
                href="/dashboard/talent"
                className="text-[#00FFCC] text-sm font-bold flex items-center gap-1"
              >
                View Opportunities <ArrowRight className="w-4 h-4" />
              </Link>
            </Card>

            <Card className="bg-[#1E1E1E] border-white/5 p-8 hover:bg-[#252525] transition-colors group">
              <Wine className="w-10 h-10 text-[#00FFCC] mb-6" />
              <h3 className="text-2xl font-bold mb-4">Venues</h3>
              <p className="text-white/60 text-sm mb-6">
                Source world-class talent, manage live operations, and automate your nightlife
                ecosystem.
              </p>
              <Link
                href="/dashboard/venue"
                className="text-[#00FFCC] text-sm font-bold flex items-center gap-1"
              >
                Sourcing Talent <ArrowRight className="w-4 h-4" />
              </Link>
            </Card>

            <Card className="bg-[#1E1E1E] border-white/5 p-8 hover:bg-[#252525] transition-colors group">
              <ShieldCheck className="w-10 h-10 text-[#00FFCC] mb-6" />
              <h3 className="text-2xl font-bold mb-4">Operations</h3>
              <p className="text-white/60 text-sm mb-6">
                Security, hosts, and management. The glue that keeps NYC nightlife running safe and
                smooth.
              </p>
              <Link
                href="/dashboard/talent"
                className="text-[#00FFCC] text-sm font-bold flex items-center gap-1"
              >
                Join the Network <ArrowRight className="w-4 h-4" />
              </Link>
            </Card>

            <Card className="bg-[#00FFCC] border-none p-8 hover:bg-[#00FFCC]/90 transition-colors group text-black">
              <Zap className="w-10 h-10 mb-6 fill-current" />
              <h3 className="text-2xl font-bold mb-4">Promoters</h3>
              <p className="text-black/70 text-sm mb-6 font-medium">
                Scale your parties, track ticket sales, and manage your talent rosters all in one
                place.
              </p>
              <Link
                href="/dashboard/talent"
                className="text-black font-black text-sm flex items-center gap-1 uppercase tracking-wider"
              >
                Start Promoting <ArrowRight className="w-4 h-4" />
              </Link>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto bg-gradient-to-br from-[#00FFCC] to-[#00CCAA] rounded-[40px] p-12 md:p-24 text-center text-black relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-black mb-8 tracking-tighter">
              READY TO OWN <br />
              THE NIGHT?
            </h2>
            <p className="text-lg md:text-xl font-medium mb-12 max-w-xl mx-auto opacity-80">
              Join the thousands of professionals and venues already transforming how NYC
              experiences nightlife.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link href="/account/signup">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-black text-white hover:bg-black/90 h-16 px-12 text-xl font-bold rounded-full"
                >
                  Get Started
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-black/20 hover:bg-black/5 h-16 px-12 text-xl font-bold rounded-full"
              >
                Talk to Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="space-y-6">
            <Link href="/" className="text-2xl font-black tracking-tighter text-[#00FFCC]">
              AFTERDARK
            </Link>
            <p className="text-white/40 text-sm leading-relaxed">
              The premium marketplace connecting the heartbeat of NYC nightlife. Powering the next
              generation of entertainment.
            </p>
            <div className="flex items-center gap-4">
              {/* Social placeholders */}
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#00FFCC]/20 transition-colors cursor-pointer">
                <Music className="w-5 h-5 text-white/60" />
              </div>
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#00FFCC]/20 transition-colors cursor-pointer">
                <Zap className="w-5 h-5 text-white/60" />
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-6 uppercase tracking-widest text-xs text-white/40">
              Platform
            </h4>
            <ul className="space-y-4 text-sm font-medium text-white/60">
              <li>
                <Link
                  href="/dashboard/talent/browse"
                  className="hover:text-[#00FFCC] transition-colors"
                >
                  Browse Gigs
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/venue/create-gig"
                  className="hover:text-[#00FFCC] transition-colors"
                >
                  Post a Listing
                </Link>
              </li>
              <li>
                <Link href="/dashboard/venue" className="hover:text-[#00FFCC] transition-colors">
                  Venues
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/venue/browse"
                  className="hover:text-[#00FFCC] transition-colors"
                >
                  Talent Network
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-6 uppercase tracking-widest text-xs text-white/40">
              Company
            </h4>
            {/* Trimmed to destinations that exist. About/Careers/Press return when
                there are real pages behind them — a dead link costs more trust
                than a missing one. */}
            <ul className="space-y-4 text-sm font-medium text-white/60">
              <li>
                <Link href="/legal/terms" className="hover:text-[#00FFCC] transition-colors">
                  Safety &amp; Trust
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[#00FFCC] transition-colors">
                  Contact Support
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="hover:text-[#00FFCC] transition-colors">
                  Your Data &amp; Rights
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-6 uppercase tracking-widest text-xs text-white/40">
              Legal
            </h4>
            {/* Real routes (G1). "Cookie Policy" and "Payment Terms" are sections of
                the two documents rather than separate pages — link to them, don't
                invent pages that would go stale. */}
            <ul className="space-y-4 text-sm font-medium text-white/60">
              <li>
                <Link href="/legal/terms" className="hover:text-[#00FFCC] transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="hover:text-[#00FFCC] transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/privacy#cookies"
                  className="hover:text-[#00FFCC] transition-colors"
                >
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[#00FFCC] transition-colors">
                  Contact Support
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 mt-20 pt-8 border-t border-white/5 text-center text-white/20 text-xs font-bold tracking-widest uppercase">
          © 2026 AFTERDARK MARKETPLACE INC. ALL RIGHTS RESERVED.
        </div>
      </footer>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .bounce-animation {
          animation: bounce 2s infinite;
        }
      `,
        }}
      />
    </div>
  );
}
