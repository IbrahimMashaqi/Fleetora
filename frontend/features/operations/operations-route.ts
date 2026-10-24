export type OperationSearch = Promise<
  Record<string, string | string[] | undefined>
>;
export async function operationQuery(
  searchParams: OperationSearch,
): Promise<Record<string, string>> {
  const values = await searchParams;
  const query: Record<string, string> = {};
  for (const key of [
    "search",
    "page",
    "pageSize",
    "merchantId",
    "workerId",
    "status",
    "city",
    "from",
    "to",
    "currency",
    "active",
    "remitted",
    "sort",
    "direction",
    "reason",
  ]) {
    if (typeof values[key] === "string") query[key] = values[key];
    else if (Array.isArray(values[key])) query.page = "0";
  }
  return query;
}
