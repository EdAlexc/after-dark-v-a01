import sql from '@/app/api/utils/sql';
import { parseQuery } from '@/app/api/utils/validation';
import { SearchQuerySchema } from '@/app/api/utils/schemas';
import { buildGigSearchQuery, buildTalentSearchQuery } from '@/app/api/utils/search-query';
import { withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';

/**
 * Global "search gigs or talent" (S5 / Backlog #7). Public like the browse
 * listings it draws from: PUBLISHED gigs + stage-named talent profiles,
 * public columns only. The term only ever reaches plainto_tsquery / a LIKE
 * parameter (see search-query.ts). Rate-limited per client because the UI
 * fires it per (debounced) keystroke.
 */
const searchLimiter = getRateLimiter('search', { windowMs: 60 * 1000, max: 60 });

export const GET = withRoute('search.list', async (request) => {
  await enforceRateLimit(searchLimiter, clientKey(request));
  const query = parseQuery(request.url, SearchQuerySchema);

  const wantGigs = query.type !== 'talent';
  const wantTalent = query.type !== 'gigs';

  const [gigs, talent] = await Promise.all([
    wantGigs
      ? (() => {
          const { text, values } = buildGigSearchQuery(query.q, query.limit);
          return sql(text, values);
        })()
      : Promise.resolve([]),
    wantTalent
      ? (() => {
          const { text, values } = buildTalentSearchQuery(query.q, query.limit);
          return sql(text, values);
        })()
      : Promise.resolve([]),
  ]);

  return Response.json({ q: query.q, gigs, talent });
});
