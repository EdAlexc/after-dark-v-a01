import sql from '@/app/api/utils/sql';
import { authGuard } from '@/app/api/utils/auth-guard';
import { auditLogger } from '@/app/api/utils/audit';
import { notify } from '@/app/api/utils/notify';
import { parseBody, parseQuery } from '@/app/api/utils/validation';
import { ReviewCreateSchema, ReviewsListQuerySchema } from '@/app/api/utils/schemas';
import { computeTrustScore } from '@/app/api/utils/trust';
import { ApiError, withRoute } from '@/app/api/utils/route-kit';
import { clientKey, enforceRateLimit, getRateLimiter } from '@/app/api/utils/rate-limit';
import { withRlsContext, serviceContext } from '@/app/api/utils/rls';

const reviewLimiter = getRateLimiter('reviews-create', { windowMs: 60 * 60 * 1000, max: 10 });

interface ReviewShiftRow {
  id: string;
  status: string;
  talent_id: string;
  venue_id: string;
  gig_title: string;
  venue_user_id: string;
  talent_user_id: string;
}

/**
 * GET /api/reviews?venue_id=… | ?talent_id=… — public marketplace content
 * (venue cards / talent cards, wireframes p4/p10). Latest 10 + the stored
 * aggregate. Author appears as their public stage/venue name only —
 * reviewer user ids never leave the server.
 */
export const GET = withRoute('reviews.list', async (request) => {
  const query = parseQuery(request.url, ReviewsListQuerySchema);

  if (query.venue_id) {
    const [reviews, aggregate] = await Promise.all([
      sql`
        SELECT r.id, r.rating, r.comment, r.created_at,
               tp.stage_name AS author_name
        FROM reviews r
        JOIN talent_profiles tp ON tp.id = r.talent_id
        WHERE r.venue_id = ${query.venue_id} AND r.direction = 'TALENT_TO_VENUE'
        ORDER BY r.created_at DESC
        LIMIT 10
      `,
      sql`
        SELECT rating, rating_count FROM venue_profiles WHERE id = ${query.venue_id} LIMIT 1
      `,
    ]);
    const profile = (aggregate as Array<{ rating: string | null; rating_count: number }>)[0];
    return Response.json({
      aggregate: {
        rating: profile?.rating !== null && profile !== undefined ? Number(profile.rating) : null,
        count: profile?.rating_count ?? 0,
      },
      reviews,
    });
  }

  const [reviews, aggregate] = await Promise.all([
    sql`
      SELECT r.id, r.rating, r.comment, r.created_at,
             vp.venue_name AS author_name
      FROM reviews r
      JOIN venue_profiles vp ON vp.id = r.venue_id
      WHERE r.talent_id = ${query.talent_id!} AND r.direction = 'VENUE_TO_TALENT'
      ORDER BY r.created_at DESC
      LIMIT 10
    `,
    sql`
      SELECT rating, rating_count, trust_score
      FROM talent_profiles WHERE id = ${query.talent_id!} LIMIT 1
    `,
  ]);
  const profile = (
    aggregate as Array<{ rating: string | null; rating_count: number; trust_score: number | null }>
  )[0];
  return Response.json({
    aggregate: {
      rating: profile?.rating != null ? Number(profile.rating) : null,
      count: profile?.rating_count ?? 0,
      trustScore: profile?.trust_score ?? null,
    },
    reviews,
  });
});

/**
 * POST /api/reviews (S8) — counterparties of a CHECKED_OUT/PAID shift review
 * each other, once per direction. Direction is DERIVED from which side of
 * the shift the caller is — never a client input — and the aggregate +
 * trust score recompute server-side in the same request.
 */
export const POST = withRoute('reviews.create', async (request) => {
  const user = await authGuard.requireRole('TALENT', 'VENUE');
  await enforceRateLimit(reviewLimiter, clientKey(request, user.id));

  const body = await parseBody(request, ReviewCreateSchema);

  const shifts = (await sql`
    SELECT review_shift.id, review_shift.status, review_shift.talent_id,
           g.venue_id, g.title AS gig_title,
           vp.user_id AS venue_user_id, tp.user_id AS talent_user_id
    FROM shifts review_shift
    JOIN gigs g ON g.id = review_shift.gig_id
    JOIN venue_profiles vp ON vp.id = g.venue_id
    JOIN talent_profiles tp ON tp.id = review_shift.talent_id
    WHERE review_shift.id = ${body.shift_id}
    LIMIT 1
  `) as ReviewShiftRow[];
  if (shifts.length === 0) throw ApiError.notFound();
  const shift = shifts[0];

  // Counterparties only; everyone else gets the same 404 as a missing shift.
  const isTalent = shift.talent_user_id === user.id;
  const isVenue = shift.venue_user_id === user.id;
  if (!isTalent && !isVenue) throw ApiError.notFound();
  const direction = isTalent ? 'TALENT_TO_VENUE' : 'VENUE_TO_TALENT';

  if (shift.status !== 'CHECKED_OUT' && shift.status !== 'PAID') {
    throw ApiError.badRequest('Reviews open after the shift is checked out');
  }

  // One per direction — the DB UNIQUE is the source of truth.
  let inserted: Array<Record<string, unknown>>;
  try {
    inserted = await withRlsContext<Array<Record<string, unknown>>>(
      user,
      sql`
        INSERT INTO reviews (shift_id, direction, reviewer_user_id, venue_id, talent_id, rating, comment)
        VALUES (${shift.id}, ${direction}, ${user.id}, ${shift.venue_id}, ${shift.talent_id},
                ${body.rating}, ${body.comment})
        RETURNING id, shift_id, direction, rating, comment, created_at
      `
    );
  } catch (error) {
    if (error instanceof Error && /reviews_one_per_direction|duplicate key/i.test(error.message)) {
      throw ApiError.badRequest('You already reviewed this shift');
    }
    throw error;
  }

  // Server-side aggregation (S8 gate). Runs as SERVICE context: the reviewer
  // legitimately updates the COUNTERPART's public aggregate, which their own
  // tenant context could never write post-RLS-cutover.
  const system = serviceContext('review-aggregation');
  if (direction === 'TALENT_TO_VENUE') {
    await withRlsContext(
      system,
      sql`
        UPDATE venue_profiles vp SET
          rating = sub.avg_rating,
          rating_count = sub.review_count
        FROM (
          SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS review_count
          FROM reviews WHERE venue_id = ${shift.venue_id} AND direction = 'TALENT_TO_VENUE'
        ) sub
        WHERE vp.id = ${shift.venue_id}
      `
    );
  } else {
    const [ratingRows, shiftRows, profileRows] = await withRlsContext<
      [
        Array<{ avg_rating: string | null; review_count: number }>,
        Array<{ completed: number }>,
        Array<{ profile_completion_pct: number | null }>,
      ]
    >(system, [
      sql`
        SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS review_count
        FROM reviews WHERE talent_id = ${shift.talent_id} AND direction = 'VENUE_TO_TALENT'
      `,
      sql`
        SELECT COUNT(*)::int AS completed FROM shifts
        WHERE talent_id = ${shift.talent_id} AND status IN ('CHECKED_OUT', 'PAID')
      `,
      sql`
        SELECT profile_completion_pct FROM talent_profiles
        WHERE id = ${shift.talent_id} LIMIT 1
      `,
    ]);
    const avgRating = ratingRows[0]?.avg_rating != null ? Number(ratingRows[0].avg_rating) : null;
    const ratingCount = ratingRows[0]?.review_count ?? 0;
    const trustScore = computeTrustScore({
      avgRating,
      ratingCount,
      completedShifts: shiftRows[0]?.completed ?? 0,
      profileCompletionPct: profileRows[0]?.profile_completion_pct ?? null,
    });
    await withRlsContext(
      system,
      sql`
        UPDATE talent_profiles SET
          rating = ${avgRating},
          rating_count = ${ratingCount},
          trust_score = ${trustScore}
        WHERE id = ${shift.talent_id}
      `
    );
  }

  await auditLogger.record({
    actorId: user.id,
    action: 'review.create',
    entityType: 'review',
    entityId: String(inserted[0]?.id ?? ''),
    metadata: { shiftId: shift.id, direction, rating: body.rating },
  });
  await notify(isTalent ? shift.venue_user_id : shift.talent_user_id, 'review.received', {
    gigTitle: shift.gig_title,
    rating: body.rating,
  });

  return Response.json({ review: inserted[0] }, { status: 201 });
});
