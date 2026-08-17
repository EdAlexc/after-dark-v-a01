import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRlsContext } from '@/app/api/utils/rls';
import { parseQuery } from '@/app/api/utils/validation';
import { MatchPreviewQuerySchema } from '@/app/api/utils/schemas';
import {
  buildMatchCountQuery,
  buildPricingHintQuery,
  buildTopCandidatesQuery,
  scoreCandidate,
  type CandidateRow,
} from '@/app/api/utils/match-query';
import { withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

const previewLimiter = getRateLimiter('match-preview', { windowMs: 60 * 1000, max: 60 });

/**
 * S7 matching engine — the create-gig wizard's Live Analysis, from real
 * data (replaces the S4-labeled sample rail). VENUE-only: this is a hiring
 * tool. Aggregate/public data only pre-hire — candidate cards carry the
 * public directory columns plus a single yes/no for the gig date (0017
 * SECURITY DEFINER probe); slot details and notes never leave the talent's
 * calendar. Pricing hint = rate percentiles over recent posted gigs.
 */
export const GET = withRoute('gigs.match-preview', async (request) => {
  const user = await authGuard.requireRole('VENUE');
  await enforceRateLimit(previewLimiter, clientKey(request, user.id));

  const query = parseQuery(request.url, MatchPreviewQuerySchema);
  const input = { role: query.role, rate: query.rate, date: query.date ?? null };

  const countQuery = buildMatchCountQuery(input);
  const candidatesQuery = buildTopCandidatesQuery(input);
  const pricingQuery = buildPricingHintQuery(query.role);

  // S12: one atomic batch under the venue's RLS context. The reads happen to
  // survive context-less (talent_profiles/published gigs are public-read),
  // but an authenticated surface must not lean on that implicitly — and the
  // batch is one round trip where Promise.all was three.
  const [countRows, candidateRows, pricingRows] = await withRlsContext<
    [
      Array<{ total: number; tonight: number; on_date: number }>,
      CandidateRow[],
      Array<{ sample: number; p25: number | null; p50: number | null; p75: number | null }>,
    ]
  >(user, [
    sql(countQuery.text, countQuery.values),
    sql(candidatesQuery.text, candidatesQuery.values),
    sql(pricingQuery.text, pricingQuery.values),
  ]);

  const counts = countRows[0] ?? { total: 0, tonight: 0, on_date: 0 };
  const pricing = pricingRows[0] ?? { sample: 0, p25: null, p50: null, p75: null };

  return Response.json({
    matches: {
      total: counts.total,
      availableTonight: counts.tonight,
      availableOnDate: query.date ? counts.on_date : null,
    },
    candidates: candidateRows.map((candidate) => ({
      ...candidate,
      match_score: scoreCandidate(candidate, input),
    })),
    pricing: {
      sample: pricing.sample,
      p25: pricing.p25,
      median: pricing.p50,
      p75: pricing.p75,
    },
  });
});
