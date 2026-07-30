import type { Metadata } from 'next';
import Link from 'next/link';
import { ALPHA_NOTICE, LEGAL_CONTACT, LEGAL_VERSION } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — AfterDark',
  description:
    'How AfterDark collects, uses, and protects your personal data, and how to exercise your privacy rights.',
};

const { version, effective } = LEGAL_VERSION.privacy;

/**
 * Privacy Policy (TENANT_GUARDRAIL §4.2 G1).
 *
 * Content mirrors the PII inventory in §4.1 and the retention schedule in
 * `docs/retention.md` — when either changes, change this page in the same PR
 * and bump `LEGAL_VERSION.privacy`.
 *
 * ⚠ Written to be accurate about what the code actually does today. It is not
 * a substitute for review by counsel before general availability.
 */
export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-white/40">
        Version {version} · Effective {effective}
      </p>

      <div className="rounded-xl bg-[#00FFCC]/5 border border-[#00FFCC]/15 p-4 my-6">
        <p className="!mb-0 text-sm">{ALPHA_NOTICE}</p>
      </div>

      <p>
        AfterDark Marketplace Inc. ("AfterDark", "we") operates a marketplace connecting NYC
        nightlife venues with nightlife talent. This policy explains what personal data we
        collect, why, how long we keep it, and the rights you have over it. We are the{' '}
        <strong>data controller</strong> for that data.
      </p>

      <h2>1. What we collect</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Examples</th>
            <th>Why we need it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account</td>
            <td>Email, name, password hash, recovery email, phone, 18+ confirmation</td>
            <td>Create and secure your account; age eligibility</td>
          </tr>
          <tr>
            <td>Two-factor</td>
            <td>Authenticator secret and backup codes (encrypted at rest)</td>
            <td>Protect your account at sign-in</td>
          </tr>
          <tr>
            <td>Talent profile</td>
            <td>Stage name, pronouns, bio, neighborhood, photos, rates, social links</td>
            <td>Show you to venues in the public talent directory</td>
          </tr>
          <tr>
            <td>Venue profile</td>
            <td>Venue name, address, description, capacity, gallery</td>
            <td>Show your venue and its gigs publicly</td>
          </tr>
          <tr>
            <td>Marketplace activity</td>
            <td>Gigs, applications, messages, shifts and check-in times</td>
            <td>Operate the marketplace; this is your work history</td>
          </tr>
          <tr>
            <td>Technical</td>
            <td>Session cookies, IP address, audit logs of security-relevant actions</td>
            <td>Keep you signed in; detect abuse; meet our accountability duties</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>We never store payment card or bank details.</strong> When payouts launch they
        run through Stripe, and we hold only Stripe's identifiers for your account and
        transfers.
      </p>

      <h2>2. Why we may use it (lawful bases)</h2>
      <ul>
        <li>
          <strong>Contract</strong> — running the marketplace: your account, profile, gigs,
          applications, messages, and payouts.
        </li>
        <li>
          <strong>Legal obligation</strong> — retaining transaction records, responding to
          lawful requests.
        </li>
        <li>
          <strong>Legitimate interests</strong> — securing accounts, preventing fraud and
          abuse, moderating reported content, and keeping an audit trail. We balance these
          against your rights and keep the data minimal.
        </li>
        <li>
          <strong>Consent</strong> — any optional marketing communications. You can withdraw
          consent at any time; we do not currently run marketing email.
        </li>
      </ul>

      <h2 id="cookies">3. Cookies</h2>
      <p>
        We set <strong>strictly necessary cookies only</strong> — the session cookies issued by
        our authentication system, plus an optional "trust this device" cookie if you choose
        that during two-factor sign-in. We run no advertising or analytics trackers, so there
        is no consent banner to click. If that ever changes, we will ask first.
      </p>

      <h2>4. Who we share it with</h2>
      <p>
        We do not sell personal data. We share it only with processors that run the service on
        our behalf, under contract and instruction:
      </p>
      <ul>
        <li>
          <strong>Neon</strong> — managed Postgres database hosting
        </li>
        <li>
          <strong>Vercel</strong> — application hosting and content delivery
        </li>
        <li>
          <strong>Stripe</strong> — payments and payouts (when that feature launches)
        </li>
        <li>
          <strong>Sentry</strong> — error monitoring, configured to strip personal data from
          reports before they are sent
        </li>
      </ul>
      <p>
        Your public profile — stage or venue name, photos, bio, rates, neighborhood — is
        visible to anyone, including logged-out visitors. Treat it as public.
      </p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Account, profile, and marketplace data: while your account is open.</li>
        <li>Sessions: expire automatically; at most 7 days of caching.</li>
        <li>Server logs and IP addresses: up to 90 days.</li>
        <li>
          Security audit logs: retained after account deletion, with your identifier replaced
          by a non-identifying token, because we must be able to show what happened without
          holding on to who you are.
        </li>
        <li>
          Financial records: retained as long as tax and accounting law requires, typically 7
          years, once payments are live.
        </li>
      </ul>

      <h2>6. Your rights</h2>
      <p>You can, at any time:</p>
      <ul>
        <li>
          <strong>Access and port</strong> your data — Settings → Privacy &amp; Data →{' '}
          <em>Download my data</em> gives you a machine-readable JSON file immediately.
        </li>
        <li>
          <strong>Correct</strong> it — edit your profile and account settings directly.
        </li>
        <li>
          <strong>Delete</strong> your account — Settings → Privacy &amp; Data →{' '}
          <em>Delete my account</em>. This removes your profile, gigs, and applications and
          pseudonymizes your audit trail. It cannot be undone.
        </li>
        <li>
          <strong>Object or restrict</strong> processing, and{' '}
          <strong>withdraw consent</strong> where we rely on it.
        </li>
        <li>
          <strong>Complain</strong> to your data protection authority.
        </li>
      </ul>
      <p>
        Self-serve export and deletion are immediate. For anything else, email{' '}
        <a href={`mailto:${LEGAL_CONTACT.privacy}`}>{LEGAL_CONTACT.privacy}</a> and we will
        respond within 30 days.
      </p>

      <h2>7. Security</h2>
      <p>
        Data is encrypted in transit and at rest. Two-factor secrets are encrypted with a key
        separate from the database. We enforce role-based access control and row-level database
        policies so one venue cannot read another's data, keep an append-only audit log of
        security-relevant actions, and scrub personal data out of error reports. If you find a
        vulnerability, please tell us at{' '}
        <a href={`mailto:${LEGAL_CONTACT.security}`}>{LEGAL_CONTACT.security}</a>.
      </p>

      <h2>8. Age</h2>
      <p>
        AfterDark is for adults. You must be <strong>18 or older</strong> to create an account,
        and you confirm this at signup. Individual gigs may require you to be 21 or older,
        which is shown on the gig listing. We do not knowingly collect data from minors; if we
        learn we have, we delete it.
      </p>

      <h2>9. International transfers</h2>
      <p>
        Our processors may handle data outside your country. Where that happens we rely on
        standard contractual clauses or an equivalent transfer mechanism.
      </p>

      <h2>10. Changes</h2>
      <p>
        We will post any revision here with a new version number and effective date, and give
        notice in-app before material changes take effect.
      </p>

      <h2>11. Contact</h2>
      <p>
        Privacy questions: <a href={`mailto:${LEGAL_CONTACT.privacy}`}>{LEGAL_CONTACT.privacy}</a>
        . General support: <Link href="/contact">contact us</Link>.
      </p>
    </>
  );
}
