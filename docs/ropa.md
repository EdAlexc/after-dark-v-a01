# Record of Processing Activities (RoPA)

> GDPR Art. 30 / TENANT_GUARDRAIL §4.2 **G2**. AfterDark Marketplace Inc. is the
> **controller** for everything below. Last reviewed: **2026-07-30** (P2).
>
> Keep this honest: if a slice adds a table that holds personal data, add its row here in the
> same PR. The user-facing summary of this document is [/legal/privacy](../anything/apps/web/src/app/legal/privacy/page.tsx).

## 1. Controller

| Field | Value |
|---|---|
| Controller | AfterDark Marketplace Inc. |
| Contact | privacy@afterdark.example |
| DPO | Not appointed — not required at current scale (Art. 37). Revisit before GA. |

## 2. Processing activities

### A. Account management and authentication
| Field | Value |
|---|---|
| Purpose | Create accounts, authenticate, secure sign-in (2FA), age eligibility |
| Lawful basis | **Contract** (Art. 6(1)(b)); **legitimate interests** for security controls |
| Data subjects | Talent, venue operators, personal/party accounts |
| Categories | Email, name, password hash, recovery email, phone, 2FA secret + backup codes (encrypted), 18+ attestation timestamp |
| Recipients | Neon (DB), Vercel (hosting) |
| Retention | Life of the account; see `retention.md` |
| Storage | `user`, `account`, `session`, `twoFactor` |

### B. Public marketplace profiles
| Field | Value |
|---|---|
| Purpose | Let venues discover talent and talent evaluate venues |
| Lawful basis | **Contract** |
| Categories | Stage name, pronouns, bio, neighborhood, photos, rate range, social links; venue name, address, capacity, gallery |
| Recipients | Neon, Vercel. **Published publicly, including to logged-out visitors** |
| Special note | Pronouns are gender-adjacent — treated as sensitive-by-caution, always optional. Photos may carry EXIF GPS: stripping is scheduled in **P4** and is a known open gap until then |
| Retention | Life of the account |
| Storage | `talent_profiles`, `venue_profiles` |

### C. Gig lifecycle
| Field | Value |
|---|---|
| Purpose | Publish, discover, and manage nightlife work |
| Lawful basis | **Contract** |
| Categories | Gig title, role, description, times, rate, age requirement, venue linkage |
| Recipients | Neon, Vercel; published gigs are public |
| Retention | Life of the account (cascades on erasure) |
| Storage | `gigs` |

### D. Security audit trail
| Field | Value |
|---|---|
| Purpose | Accountability, abuse and fraud detection, incident investigation |
| Lawful basis | **Legitimate interests** (Art. 6(1)(f)) — balancing test below; **legal obligation** for accountability (Art. 5(2)) |
| Categories | Actor id, action, entity, PII-redacted metadata, timestamp |
| Balancing test | Necessary to detect account takeover and marketplace abuse; minimal (identifier + action, never message or profile content); metadata passes `redactPii` before insert; **pseudonymized on erasure** so it never outlives the relationship in identifying form |
| Retention | Retained after erasure in pseudonymized form; see `retention.md` |
| Storage | `audit_logs` (append-only by policy *and* by database privilege) |

### E. Error monitoring
| Field | Value |
|---|---|
| Purpose | Detect and fix faults |
| Lawful basis | **Legitimate interests** |
| Categories | Stack traces, route, user **id only** — cookies, headers, email, phone are stripped before transmission (`src/lib/sentry-scrub.ts`) |
| Recipients | Sentry (processor) — **inactive unless a DSN is configured** |
| Retention | Per Sentry project settings (default 90 days) |

### F. Data-subject requests
| Field | Value |
|---|---|
| Purpose | Serve access, portability, and erasure rights |
| Lawful basis | **Legal obligation** (Arts. 15, 17, 20) |
| Categories | The exported data itself; the fact of the request in the audit trail |
| Retention | Export files are generated on demand and never stored server-side |
| Storage | `src/app/api/utils/account-data.ts` is the single registry both operations read |

## 3. Processors

| Processor | Role | Location | Transfer basis |
|---|---|---|---|
| Neon | Managed Postgres | US (AWS us-east-2) | SCCs where applicable |
| Vercel | App hosting + CDN | Global edge | SCCs where applicable |
| Stripe | Payments (**not yet live** — lands in P8) | US/IE | SCCs / DPF |
| Sentry | Error monitoring (optional) | US | SCCs |

**Action before GA:** execute DPAs with each and publish the list in the privacy policy (G10).

## 4. Technical and organisational measures (Art. 32)

- TLS in transit; encryption at rest (provider); 2FA secrets and backup codes encrypted at the application layer.
- RBAC enforced on every endpoint, **proven by a generated authZ matrix suite** (`src/app/api/utils/authz-matrix.ts`) that fails CI when a route is undeclared.
- Postgres row-level security policies, **verified against a real non-owner role** (`yarn db:verify-rls`). Production cutover is tracked in DEV_TIMELINE.
- Append-only audit trail, immutable at the privilege level.
- Nonce-based CSP, HSTS, and the rest of the header set; rate limiting on credential and export endpoints.
- PII redaction in logs and error reports.

## 5. Known gaps (tracked, not hidden)

| Gap | Risk | Where it is tracked |
|---|---|---|
| EXIF/GPS not stripped from uploaded photos | Location inference from images | **P4** media pipeline |
| Profile images stored base64 in Postgres | Larger PII blast radius than object storage with signed URLs | **P4** |
| No automated retention purge job | Logs may outlive the stated schedule | `retention.md` §4, P10 |
| RLS policies verified but not yet the production connection role | Defence-in-depth not yet active in prod | DEV_TIMELINE P2.4 cutover |
| DPAs not yet executed | Processor compliance unevidenced | G10, before GA |
| No DPIA | Recommended given location + work-history data | G13, before GA |
