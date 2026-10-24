import { OperationsDashboard } from "@/features/operations/components/operations-dashboard";
import {
  operationQuery,
  type OperationSearch,
} from "@/features/operations/operations-route";
export default async function Page({
  searchParams,
}: {
  searchParams: OperationSearch;
}) {
  return <OperationsDashboard query={await operationQuery(searchParams)} />;
}
