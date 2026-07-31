import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { withRoute } from '@/app/api/utils/route-kit';
import { withRlsContext } from '@/app/api/utils/rls';

interface KpiRow {
  avg_time_to_hire_hours: string | null;
  published_30d: number;
  filled_30d: number;
  published_prev_30d: number;
  filled_prev_30d: number;
  applications_30d: number;
  applications_prev_30d: number;
}

/**
 * Venue KPI aggregates from the S6 event capture (Backlog #14) — the
 * wireframe p10 cards that stayed muted until real instants existed:
 * average time-to-hire and filling rate, each with a previous-30-day
 * window for the month-over-month trend. Tenant-scoped by the session
 * venue; events carry no PII, so this projection can't either.
 */
export const GET = withRoute('venue.stats', async () => {
  const user = await authGuard.requireRole('VENUE');

  const venueRows = (await sql`
    SELECT id FROM venue_profiles WHERE user_id = ${user.id} LIMIT 1
  `) as Array<{ id: string }>;
  if (venueRows.length === 0) {
    return Response.json({ stats: null });
  }
  const venueId = venueRows[0].id;

  // One pass over this venue's events. Time-to-hire pairs each gig's first
  // publish with its first fill; unpaired publishes simply don't contribute.
  const rows = await withRlsContext<KpiRow[]>(
    user,
    sql`
      WITH mine AS (
        SELECT kind, gig_id, created_at
        FROM events
        WHERE venue_id = ${venueId}
          AND created_at >= NOW() - INTERVAL '60 days'
      ),
      pairs AS (
        SELECT p.gig_id,
               MIN(p.created_at) AS published_at,
               MIN(f.created_at) AS filled_at
        FROM mine p
        JOIN mine f ON f.gig_id = p.gig_id AND f.kind = 'gig.filled'
        WHERE p.kind = 'gig.published'
        GROUP BY p.gig_id
      )
      SELECT
        (SELECT AVG(EXTRACT(EPOCH FROM (filled_at - published_at)) / 3600.0)
           FROM pairs WHERE filled_at > published_at)::text AS avg_time_to_hire_hours,
        COUNT(*) FILTER (WHERE kind = 'gig.published'
          AND created_at >= NOW() - INTERVAL '30 days')::int AS published_30d,
        COUNT(*) FILTER (WHERE kind = 'gig.filled'
          AND created_at >= NOW() - INTERVAL '30 days')::int AS filled_30d,
        COUNT(*) FILTER (WHERE kind = 'gig.published'
          AND created_at < NOW() - INTERVAL '30 days')::int AS published_prev_30d,
        COUNT(*) FILTER (WHERE kind = 'gig.filled'
          AND created_at < NOW() - INTERVAL '30 days')::int AS filled_prev_30d,
        COUNT(*) FILTER (WHERE kind = 'application.created'
          AND created_at >= NOW() - INTERVAL '30 days')::int AS applications_30d,
        COUNT(*) FILTER (WHERE kind = 'application.created'
          AND created_at < NOW() - INTERVAL '30 days')::int AS applications_prev_30d
      FROM mine
    `
  );

  const row = rows[0];
  const avgHours = row?.avg_time_to_hire_hours ? Number(row.avg_time_to_hire_hours) : null;

  return Response.json({
    stats: {
      avgTimeToHireHours: avgHours !== null && Number.isFinite(avgHours) ? avgHours : null,
      window30d: {
        published: row?.published_30d ?? 0,
        filled: row?.filled_30d ?? 0,
        applications: row?.applications_30d ?? 0,
      },
      previous30d: {
        published: row?.published_prev_30d ?? 0,
        filled: row?.filled_prev_30d ?? 0,
        applications: row?.applications_prev_30d ?? 0,
      },
    },
  });
});
