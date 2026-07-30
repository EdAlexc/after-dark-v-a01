import sql from '@/app/api/utils/sql';
import { parseQuery } from '@/app/api/utils/validation';
import { TalentListQuerySchema } from '@/app/api/utils/schemas';
import { TALENT_PAGE_SIZE, buildTalentListQuery } from '@/app/api/utils/talent-query';
import { withRoute } from '@/app/api/utils/route-kit';

/**
 * Public talent directory (venue browse, P1.1). Serves only public-profile
 * columns for profiles that set a stage name — never auth-table data.
 */
export const GET = withRoute('talent.list', async (request) => {
  const filters = parseQuery(request.url, TalentListQuerySchema);
  const { text, values } = buildTalentListQuery(filters);
  const rows = await sql(text, values as (string | number)[]);
  const hasMore = rows.length > TALENT_PAGE_SIZE;
  const talent = hasMore ? rows.slice(0, TALENT_PAGE_SIZE) : rows;
  return Response.json({ talent, page: filters.page, pageSize: TALENT_PAGE_SIZE, hasMore });
});
