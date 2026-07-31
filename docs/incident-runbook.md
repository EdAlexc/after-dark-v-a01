# Incident & data-breach runbook — AfterDark

> TENANT_GUARDRAIL §4.2 **G9**: breach notification within **72 hours** to the supervisory
> authority; user notice without undue delay when the breach is high-risk. This runbook is
> written for the current reality — a solo-operated closed alpha on Vercel + Neon — and must
> be re-cut when there is a team to page. Keep it one page of action; background lives in
> [`ropa.md`](ropa.md) and [`retention.md`](retention.md).

**Version 1.0 · effective 2026-07-31 · owner: platform operator (see contact tree)**

---

## 1. What counts as an incident

Anything that actually or probably breaches confidentiality, integrity, or availability of
personal data (GDPR Art. 4(12)), or platform money-state. Examples mapped to this stack:

| Class | Examples here |
|---|---|
| **P1 — data breach, high risk** | `DATABASE_URL`/`BETTER_AUTH_SECRET` leaked; cross-tenant read confirmed in prod (venue A reads venue B's applicants/messages); auth bypass; mass account takeover; payout ledger tampered |
| **P2 — data breach, limited** | Single-account compromise (phished tester); PII in a log line or error tracker; a private message exposed to a wrong-but-known party |
| **P3 — security event, no confirmed exposure** | Credential-stuffing burst (429s spiking); vuln report received; dependency CVE in a shipped package; suspicious admin-audit anomaly |
| **P4 — availability** | Vercel/Neon outage; deploy that 404s or bricks auth |

When unsure, classify **up**, then de-escalate with evidence. The 72 h clock starts at
**awareness** of a personal-data breach (P1/P2), not at root-cause.

## 2. Contact tree

| Role | Who | Channel |
|---|---|---|
| Incident lead (and acting DPO-equivalent) | Platform operator / founder | direct |
| Security intake (external reports land here) | `security@afterdark.example` | monitored mailbox |
| Privacy/data-subject intake | `privacy@afterdark.example` | monitored mailbox |
| Processors | Neon (database), Vercel (hosting/blob), Stripe (when keys land), Sentry (when DSN lands) | each vendor's support/security page + status page |
| Supervisory authority | EU/EEA data subjects affected → lead SA per Art. 56 (no EU establishment: the SA of any affected subject's state); NY residents → NY AG under the SHIELD Act | authority web form |

> These `afterdark.example` addresses are the versioned placeholders from
> `src/lib/legal.ts` (`LEGAL_CONTACT`) — swap both places together when a real domain
> lands, in the same commit.

## 3. The drill (P1/P2 — personal data involved)

**T+0 — Contain (minutes).** Stop the bleeding before diagnosing:
- Leaked secret → rotate it now: Neon (reset role password / new pooled string), Vercel env
  (`BETTER_AUTH_SECRET` — ⚠ invalidates sessions AND 2FA enrollments, acceptable in a P1),
  then redeploy.
- Compromised account → suspend via `/dashboard/admin` (AuthGuard enforces platform-wide on
  the target's next request; the suspend itself is audited).
- Bad deploy/rogue surface → Vercel instant rollback to the previous deployment.
- Cross-tenant leak → take the affected route down (suspend feature or roll back) rather
  than leave it leaking while debugging.

**T+1h — Preserve evidence.** Neon: create a branch of production *now* (point-in-time
snapshot — cheap, immutable). Export relevant `audit_logs` slices (admin CSV export — the
export itself is audited, good). Save Vercel runtime logs for the window. Do **not** purge
or "clean up" anything yet — retention rules pause during an investigation (legal hold,
`retention.md` §5).

**T+4h — Assess.** Answer in writing, in the incident log (§5): what data classes
(see `ropa.md` §2 inventory), whose (which tenants/roles, how many), window of exposure,
confirmed vs. probable, ongoing or stopped. This drives the two notification decisions.

**T+≤72h — Notify authority** (Art. 33) if the breach is unlikely to be "no risk": use the
authority's web form; include nature, categories + approximate counts, likely consequences,
measures taken, contact point (`privacy@`). If facts are incomplete at 72 h, notify in
phases — lateness is the violation, not incompleteness.

**User notice** (Art. 34) when high-risk (credentials, private messages, location-bearing
media, anything financial): plain-language email to affected users — what happened, what of
theirs was involved, what we did, what they should do (rotate password, revoke sessions in
Settings, re-enroll 2FA). During closed alpha the affected population is the tester cohort —
brief them all rather than lawyering over "affected".

**T+1w — Post-incident.** Root cause written; regression test or guardrail added (the P2
"deleted account kept a live session" bug → AuthGuard existence check is the house pattern:
every incident ends in a test); this runbook amended where it lied; log entry closed.

For **P3/P4** run the same skeleton without the notification steps: contain → evidence →
assess → fix → post-mortem. A P3 that assessment upgrades (exposure confirmed) restarts the
clock as P1/P2 **from the moment of that awareness**.

## 4. Tabletop exercises

Run one before the first tester invite, then after any incident and at every major surface
change (Stripe keys landing is the next trigger). Script (~20 min, solo or pair): pick a
scenario, walk §3 step by step *doing the lookups for real* (open the Neon console, find
the rollback button, locate the authority form — but submit nothing), note every step where
reality diverged from this document, fix the document in the same sitting.

Scenarios on rotation: (a) `DATABASE_URL` pasted into a public gist; (b) tester reports
seeing another venue's applicants; (c) Sentry event contains a message body with PII;
(d) suspended user still hitting APIs.

| Date | Scenario | Run by | Gaps found → fixed |
|---|---|---|---|
| 2026-07-31 | (a) leaked `DATABASE_URL` | AI-assisted desk check (walked §3 against the live repo/tooling; no production actions taken) | 3 gaps found and fixed in this v1.0: original draft said "rotate in Vercel dashboard" but Neon password reset comes first (the string is the credential); evidence step originally omitted the legal-hold note now in `retention.md` §5 cross-ref; contact tree had no Stripe/Sentry rows for the keyed future. **A human-run tabletop is still owed before the first tester invite** — this desk check validates the document, not the operator's muscle memory. |

## 5. Incident log

Append-only; one row per incident, details in a linked write-up when needed. No entries yet
— the table exists so the first incident is logged in a known place, not improvised.

| Opened | Class | Summary | Authority notified? | Users notified? | Closed |
|---|---|---|---|---|---|
