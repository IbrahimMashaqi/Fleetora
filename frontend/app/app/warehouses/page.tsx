import type { Metadata } from "next";
import { WarehousesDirectory } from "@/features/warehouses/components/warehouses-directory";

export const metadata: Metadata = { title: "Warehouses" };

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim() : "";
  // Unrecognized values become page 0, which the server layer rejects as invalid.
  const page =
    params.page === undefined
      ? 1
      : typeof params.page === "string" && /^\d+$/.test(params.page)
        ? Number(params.page)
        : 0;
  return (
    <WarehousesDirectory
      query={{
        search,
        status: params.status === "archived" ? "ARCHIVED" : "ACTIVE",
        page: Array.isArray(params.search) ? 0 : page,
        pageSize: 20,
      }}
    />
  );
}
