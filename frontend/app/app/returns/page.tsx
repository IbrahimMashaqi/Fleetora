import { OperationsDirectory } from "@/features/operations/components/operations-directory";
import {
  operationQuery,
  type OperationSearch,
} from "@/features/operations/operations-route";
export default async function Page({
  searchParams,
}: {
  searchParams: OperationSearch;
}) {
  return (
    <OperationsDirectory
      resource="returns"
      query={await operationQuery(searchParams)}
    />
  );
}
