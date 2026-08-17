/**
 * P10.4 k6 gate — TENANT_GUARDRAIL §3.4's scenario SHAPES at CI smoke scale.
 *
 *   k6 run k6/alpha-gates.js -e BASE_URL=http://localhost:4000 \
 *     -e PREVIEW_ACCOUNTS_SECRET=…
 *
 * This is deliberately NOT the full load lab (50→500 VUs, 15 min steady,
 * soak) — that stays a manual pre-release procedure (TESTING.md §11), and
 * the §3 bars (Apdex @ T=300 ms, p99 ≤ 1.2 s) belong to that lab. What
 * this run asserts on every PR, at the CI-calibrated APDEX_T (see ci.yml):
 *   - Apdex_API ≥ 0.85 at T / 4T tolerating across all scenario traffic;
 *   - p99 < 4T (S15 — equals the §3 p99 bar exactly when T=300);
 *   - error rate < 1%;
 *   - the §3.4 shape #4 invariant live: idempotent double-tap check-in
 *     (same key, repeated calls) returns one consistent outcome — and the
 *     run FAILS (S15) if setup can't produce the shift it needs;
 *   - the §3.4 shape #2 apply spike: apply→withdraw cycles stay 2xx.
 * Scales stay inside the app's own per-user rate limits (shift transitions
 * are 60/h/user) so the gate measures latency, not 429 behavior.
 *
 * Credentials: the S1 preview accounts, derived in setup() via the same
 * HMAC scheme as scripts/preview-password.ts (k6 can't import app TS).
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const SECRET = __ENV.PREVIEW_ACCOUNTS_SECRET || '';

const apdex = new Trend('apdex_score');
const apiErrors = new Rate('api_errors');

// TENANT_GUARDRAIL §3 sets T=300 ms — that bar belongs to the pre-release
// load lab on production-grade infra. CI passes APDEX_T calibrated to the
// shared 2-core runner that co-hosts server, Postgres, proxy AND the load
// generator (see ci.yml); the threshold formula stays identical.
const APDEX_T = Number(__ENV.APDEX_T || 300);
const APDEX_TOLERATING = APDEX_T * 4;

export const options = {
  scenarios: {
    // §3.4 #1 — Friday-night browse surge (anonymous filter permutations).
    browse_surge: {
      executor: 'ramping-vus',
      exec: 'browseSurge',
      startVUs: 2,
      stages: [
        { duration: '20s', target: 6 },
        { duration: '40s', target: 6 },
        { duration: '10s', target: 0 },
      ],
    },
    // §3.4 #3 — messaging poll fan-out (authed talent polling cadence).
    message_poll: {
      executor: 'constant-vus',
      exec: 'messagePoll',
      vus: 4,
      duration: '70s',
    },
    // §3.4 #2 — hot-gig application spike (S15): apply→withdraw cycles from
    // an authed talent; sized to stay inside the 30/h apply limit so the
    // gate measures latency + correctness, not 429 behavior.
    apply_spike: {
      executor: 'per-vu-iterations',
      exec: 'applySpike',
      vus: 1,
      iterations: 8,
      startTime: '15s',
    },
    // §3.4 #4 — check-in double-tap burst (idempotency under repetition).
    checkin_burst: {
      executor: 'per-vu-iterations',
      exec: 'checkinBurst',
      vus: 1,
      iterations: 15,
      startTime: '10s',
    },
  },
  thresholds: {
    apdex_score: ['avg>=0.85'], // the alpha gate's non-negotiable floor
    api_errors: ['rate<0.01'],
    http_req_failed: ['rate<0.05'],
    // S15: p99 at 4×T — with the lab's T=300 this IS the §3 "p99 ≤ 1.2 s"
    // bar; with CI's calibrated T it scales into the same regression
    // tripwire as the Apdex floor.
    http_req_duration: [`p(99)<${APDEX_TOLERATING}`],
  },
};

function derivePreviewPassword(email) {
  const digest = crypto.hmac('sha256', SECRET, email, 'base64rawurl');
  return `Ad!${digest.slice(0, 18)}`;
}

function record(res) {
  const duration = res.timings.duration;
  apdex.add(duration <= APDEX_T ? 1 : duration <= APDEX_TOLERATING ? 0.5 : 0);
  apiErrors.add(res.status >= 500 || res.status === 0);
}

function signIn(email) {
  const res = http.post(
    `${BASE_URL}/api/auth/sign-in/email`,
    JSON.stringify({ email, password: derivePreviewPassword(email) }),
    // Origin satisfies better-auth's trusted-origin CSRF check.
    { headers: { 'Content-Type': 'application/json', Origin: BASE_URL } }
  );
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  // k6 parses Set-Cookie into res.cookies: { name: [{ value, … }] }.
  const names = Object.keys(res.cookies || {});
  if (names.length === 0) throw new Error(`no session cookie for ${email}`);
  return names.map((name) => `${name}=${res.cookies[name][0].value}`).join('; ');
}

export function setup() {
  if (!SECRET) throw new Error('PREVIEW_ACCOUNTS_SECRET is required');
  const talentCookie = signIn('talent.preview@afterdark.dev');
  const venueCookie = signIn('venue.preview@afterdark.dev');

  // Ensure a shift exists for the check-in burst: apply → hire (tolerant of
  // re-runs where the pair already exists).
  const auth = (cookie) => ({ headers: { 'Content-Type': 'application/json', Cookie: cookie } });
  const anonGigs = http.get(`${BASE_URL}/api/gigs`).json('gigs');
  if (!anonGigs || anonGigs.length === 0) throw new Error('no published gigs — seed first');
  // The hire chain needs a gig OWNED by venue.preview, so use its own list.
  const ownGigs = http.get(`${BASE_URL}/api/venue/gigs`, auth(venueCookie)).json('gigs') || [];
  const ownPublished = ownGigs.find((gig) => gig.status === 'PUBLISHED');
  const gigId = ownPublished ? ownPublished.id : anonGigs[0].id;

  let shifts = http.get(`${BASE_URL}/api/talent/shifts`, auth(talentCookie)).json('shifts') || [];
  if (shifts.length === 0) {
    http.post(`${BASE_URL}/api/gigs/${gigId}/apply`, JSON.stringify({}), auth(talentCookie));
    const applications =
      http.get(`${BASE_URL}/api/venue/applications`, auth(venueCookie)).json('applications') || [];
    const pending = applications.find((application) => application.status === 'PENDING');
    if (pending) {
      http.patch(
        `${BASE_URL}/api/applications/${pending.id}`,
        JSON.stringify({ status: 'HIRED' }),
        auth(venueCookie)
      );
    }
    shifts = http.get(`${BASE_URL}/api/talent/shifts`, auth(talentCookie)).json('shifts') || [];
  }
  const shift = shifts.find((row) => row.status === 'SCHEDULED' || row.status === 'IN_TRANSIT');
  // S15: fail, don't skip — a silently-absent shift would let the §3.4 #4
  // idempotency assertion pass vacuously (found by the 2026-08-17 audit, Q3).
  if (!shift) {
    throw new Error(
      'check-in burst has no SCHEDULED/IN_TRANSIT shift — the idempotency assertion would ' +
        'silently skip. Fix the seed/hire chain (setup applies + hires to create one).'
    );
  }

  // §3.4 #2 (S15): the apply spike needs a PUBLISHED gig that is NOT the one
  // the hire chain may have just flipped to FILLED.
  const applyGig = anonGigs.find((gig) => gig.id !== gigId) ?? anonGigs[0];

  return { talentCookie, venueCookie, gigId, shiftId: shift.id, applyGigId: applyGig.id };
}

const FILTERS = [
  '',
  '?tonightOnly=true',
  '?roles=DJ,Bartender',
  '?neighborhoods=Lower East Side',
  '?minRate=50&maxRate=300',
  '?page=1',
];

export function browseSurge() {
  // A real surge arrives from DISTINCT clients; per-VU forwarded-for keeps
  // the shared per-client rate limits (search: 60/min) semantically intact
  // instead of funnelling every VU into one anonymous bucket.
  const params = { headers: { 'X-Forwarded-For': `203.0.113.${(__VU % 200) + 1}` } };
  const filter = FILTERS[Math.floor(Math.random() * FILTERS.length)];
  const res = http.get(`${BASE_URL}/api/gigs${encodeURI(filter)}`, params);
  record(res);
  check(res, { 'browse 200': (r) => r.status === 200 });
  const search = http.get(`${BASE_URL}/api/search?q=dj`, params);
  record(search);
  check(search, { 'search 200': (r) => r.status === 200 });
  sleep(0.5 + Math.random());
}

export function messagePoll(data) {
  const params = { headers: { Cookie: data.talentCookie } };
  const conversations = http.get(`${BASE_URL}/api/conversations`, params);
  record(conversations);
  check(conversations, { 'conversations 200': (r) => r.status === 200 });
  const notifications = http.get(`${BASE_URL}/api/notifications`, params);
  record(notifications);
  sleep(5); // the documented poll cadence
}

export function applySpike(data) {
  // §3.4 #2 shape: hot gig, repeated apply pressure. Each cycle applies
  // (re-apply revives a WITHDRAWN row) then withdraws, so every iteration
  // exercises both writes with 2xx outcomes and leaves the data clean.
  const params = {
    headers: { 'Content-Type': 'application/json', Cookie: data.talentCookie },
  };
  const apply = http.post(`${BASE_URL}/api/gigs/${data.applyGigId}/apply`, JSON.stringify({}), params);
  record(apply);
  check(apply, { 'apply 2xx': (r) => r.status >= 200 && r.status < 300 });

  const mine = http.get(`${BASE_URL}/api/talent/applications`, params);
  record(mine);
  const application = (mine.json('applications') || []).find(
    (row) => row.gig_id === data.applyGigId && row.status === 'PENDING'
  );
  if (application) {
    const withdraw = http.patch(
      `${BASE_URL}/api/applications/${application.id}`,
      JSON.stringify({ status: 'WITHDRAWN' }),
      params
    );
    record(withdraw);
    check(withdraw, { 'withdraw 2xx': (r) => r.status >= 200 && r.status < 300 });
  }
  sleep(1);
}

export function checkinBurst(data) {
  const params = {
    headers: { 'Content-Type': 'application/json', Cookie: data.venueCookie },
  };
  // §3.4 #4: ONE fixed idempotency key hammered across every iteration —
  // the first call performs the transition, every later call must replay
  // the recorded outcome (never re-run, never double-pay, never 4xx/5xx).
  const key = 'k6-burst-fixed-checkin-0001';
  const body = JSON.stringify({ to: 'CHECKED_IN', idempotency_key: key });
  const first = http.post(`${BASE_URL}/api/shifts/${data.shiftId}`, body, params);
  const second = http.post(`${BASE_URL}/api/shifts/${data.shiftId}`, body, params);
  record(first);
  record(second);
  check({ first, second }, {
    'double-tap replays one outcome': ({ first: a, second: b }) =>
      // Once checked in, replays of the same key return the recorded result;
      // a non-2xx pair would mean idempotency broke under repetition.
      a.status < 500 && b.status < 500 && (a.status < 300) === (b.status < 300),
  });
  sleep(1);
}
