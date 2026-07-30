import type { Metadata } from 'next';
import Link from 'next/link';
import { ALPHA_NOTICE, LEGAL_CONTACT, LEGAL_VERSION } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service — AfterDark',
  description:
    'The terms governing your use of the AfterDark marketplace for NYC nightlife venues and talent.',
};

const { version, effective } = LEGAL_VERSION.terms;

/**
 * Terms of Service (TENANT_GUARDRAIL §4.2 G1).
 *
 * Describes the platform as it actually behaves today — including that
 * payments are not yet live — so nothing here over-promises. Bump
 * `LEGAL_VERSION.terms` on any substantive change.
 *
 * ⚠ Not a substitute for review by counsel before general availability.
 */
export default function TermsOfServicePage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-sm text-white/40">
        Version {version} · Effective {effective}
      </p>

      <div className="rounded-xl bg-[#00FFCC]/5 border border-[#00FFCC]/15 p-4 my-6">
        <p className="!mb-0 text-sm">{ALPHA_NOTICE}</p>
      </div>

      <p>
        These terms are a contract between you and AfterDark Marketplace Inc. ("AfterDark",
        "we"). By creating an account or using the platform, you accept them. If you do not
        agree, do not use AfterDark.
      </p>

      <h2>1. What AfterDark is</h2>
      <p>
        AfterDark is a <strong>marketplace</strong>. We connect nightlife venues with nightlife
        talent — DJs, mixologists, security, promoters, stage managers — and provide the tools
        to post gigs, apply, negotiate, schedule, and (when the feature launches) get paid.
      </p>
      <p>
        <strong>We are not a party to the engagement between a venue and talent.</strong> We do
        not employ talent, we do not supply staff, and we do not control how the work is
        performed. The contract for any gig is between the venue and the talent. We are also
        not an employment agency or a payroll provider.
      </p>

      <h2>2. Eligibility</h2>
      <ul>
        <li>You must be at least 18 years old and confirm this at signup.</li>
        <li>
          Individual gigs may require you to be 21 or older; that requirement is shown on the
          listing and it is your responsibility to meet it.
        </li>
        <li>You must provide accurate information and keep your account secure.</li>
        <li>One account per person or venue. Do not share credentials.</li>
      </ul>

      <h2>3. Roles on the platform</h2>
      <ul>
        <li>
          <strong>Talent</strong> — build a public profile, browse and apply to gigs, negotiate
          rates, work shifts.
        </li>
        <li>
          <strong>Venue</strong> — publish gigs, review and hire applicants, run live
          operations, pay for completed work.
        </li>
        <li>
          <strong>Personal / Party</strong> — discovery only. Browse public events and venues.
          Personal accounts cannot post gigs, apply, or transact.
        </li>
      </ul>

      <h2>4. Your responsibilities</h2>
      <h3>Venues</h3>
      <ul>
        <li>Post accurate gigs: real dates, rates, duties, and requirements.</li>
        <li>Honor the agreed rate for work performed, and pay on time.</li>
        <li>
          Comply with applicable employment, licensing, safety, and alcohol-service law. That
          responsibility is yours, not ours.
        </li>
        <li>Provide a safe working environment.</li>
      </ul>
      <h3>Talent</h3>
      <ul>
        <li>Represent your experience, licences, and availability honestly.</li>
        <li>Show up for gigs you accept, on time, and perform them professionally.</li>
        <li>Hold any licence or certification the role legally requires.</li>
      </ul>

      <h2>5. Fees</h2>
      <p>
        AfterDark charges a <strong>5% marketplace fee</strong> on the value of a booking,
        deducted from the talent payout and shown before you submit an application. Payment
        processing is handled by Stripe under its own terms. We will give notice before
        changing our fee.
      </p>
      <p>
        <strong>Payments are not live during closed alpha.</strong> Any figures shown are
        estimates for demonstration.
      </p>

      <h2>6. Prohibited conduct</h2>
      <ul>
        <li>Illegal activity, or facilitating it.</li>
        <li>Harassment, hate speech, threats, or discrimination.</li>
        <li>Misrepresenting who you are, or impersonating anyone.</li>
        <li>
          Taking transactions off-platform to avoid fees, after connecting through AfterDark.
        </li>
        <li>Scraping, automated bulk access, or probing our systems without permission.</li>
        <li>Uploading malware, or content you do not have the rights to.</li>
      </ul>

      <h2>7. Content you post</h2>
      <p>
        You keep ownership of everything you upload. You grant us a non-exclusive licence to
        host and display it for the purpose of operating the platform. You are responsible for
        having the rights to what you post — including photographs of other people. We may
        remove content that violates these terms.
      </p>

      <h2>8. Suspension and termination</h2>
      <p>
        You may delete your account at any time from Settings. We may suspend or terminate an
        account that violates these terms, creates risk for other users, or is required to be
        removed by law. Where practical we give notice and a chance to respond.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The platform is provided "as is". We do not screen, endorse, or guarantee any venue or
        talent, and we do not guarantee that a gig will be filled, that work will be performed
        satisfactorily, or that the service will be uninterrupted. Verify who you are dealing
        with.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, AfterDark is not liable for indirect,
        incidental, or consequential damages, or for lost profits, arising from your use of the
        platform or from any engagement between a venue and talent. Our total liability is
        limited to the greater of the fees you paid us in the preceding 12 months or USD 100.
        Nothing here limits liability that cannot lawfully be limited.
      </p>

      <h2>11. Disputes between users</h2>
      <p>
        Venue–talent disputes are between those parties. We provide a reporting tool and may
        review conduct on the platform, but we do not adjudicate contracts and are not
        obligated to intervene.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these terms. Revisions are posted here with a new version and effective
        date, and we give in-app notice of material changes. Continuing to use AfterDark after
        that means you accept the update.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the laws of the State of New York, without regard to
        conflict-of-law rules. Disputes go to the state or federal courts located in New York
        County, New York.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these terms: <Link href="/contact">contact us</Link> or email{' '}
        <a href={`mailto:${LEGAL_CONTACT.support}`}>{LEGAL_CONTACT.support}</a>. See also our{' '}
        <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>
    </>
  );
}
