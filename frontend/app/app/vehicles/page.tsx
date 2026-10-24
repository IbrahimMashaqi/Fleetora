import type { Metadata } from "next";
import { VehiclesDirectory } from "@/features/vehicles/components/vehicles-directory";

export const metadata: Metadata = { title: "Vehicles" };

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim() : "";
  const page =
    params.page === undefined
      ? 1
      : typeof params.page === "string" && /^\d+$/.test(params.page)
        ? Number(params.page)
        : 0;
  return (
    <VehiclesDirectory
      query={{
        search,
        page: Array.isArray(params.search) ? 0 : page,
        pageSize: 20,
      }}
    />
  );
}
