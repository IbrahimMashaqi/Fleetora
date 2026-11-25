export type Warehouse = {
  id: string;
  name: string;
  address: string;
  archived: boolean;
};
export type WarehouseStatus = "ACTIVE" | "ARCHIVED";
export type WarehouseQuery = {
  search: string;
  status: WarehouseStatus;
  page: number;
  pageSize: number;
};
export type WarehousePage = {
  items: Warehouse[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};
export type WarehouseScope = { userId: string; companyId: string };
export type WarehouseResult =
  | { status: "list"; data: WarehousePage }
  | {
      status:
        | "unauthenticated"
        | "forbidden"
        | "changed"
        | "invalid"
        | "unavailable";
    };
export type WarehouseInput = { name: string; address: string };
export type WarehouseWrite =
  | { kind: "create"; input: WarehouseInput }
  | { kind: "edit"; id: string; input: WarehouseInput }
  | { kind: "archive"; id: string; archived: boolean };
export type WarehouseWriteResult =
  | { status: "saved"; data: Warehouse }
  | {
      status:
        | "unauthenticated"
        | "forbidden"
        | "changed"
        | "invalid"
        | "not-found"
        | "conflict"
        | "unavailable"
        | "uncertain";
    };

// Mirrors the backend DTO so obvious mistakes are caught before submission.
export function normalizeWarehouseInput(input: WarehouseInput): WarehouseInput {
  return {
    name: input.name.trim().replace(/\s+/g, " "),
    address: input.address.trim().replace(/\s+/g, " "),
  };
}
export function isValidWarehouseInput(input: WarehouseInput): boolean {
  return (
    input.name.length >= 2 &&
    input.name.length <= 120 &&
    input.address.length >= 5 &&
    input.address.length <= 300
  );
}
