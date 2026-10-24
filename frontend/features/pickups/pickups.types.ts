export type Scope = { userId: string; companyId: string };
export type Pickup = {
  id: string;
  companyId: string;
  merchantId: string;
  method: "COMPANY_PICKUP" | "WAREHOUSE_DROPOFF";
  status: "REQUESTED" | "PROPOSED" | "CONFIRMED" | "RECEIVED" | "CANCELLED";
  revision: number;
  pickupAddress: string;
  notes: string | null;
  preferredFrom: string | null;
  preferredTo: string | null;
  proposedFrom: string | null;
  proposedTo: string | null;
  confirmedFrom: string | null;
  confirmedTo: string | null;
  workerId: string | null;
  warehouseId: string | null;
  parcels?: {
    id: string;
    shipmentId: string;
    receipt: string;
    receiptNotes: string | null;
  }[];
};
export type Review = {
  revision: number;
  action: "CONFIRM" | "PROPOSE" | "CANCEL";
  from?: string;
  to?: string;
  workerId?: string;
  warehouseId?: string;
  reason?: string;
};
export type Receipts = {
  revision: number;
  parcels: {
    parcelId: string;
    receipt: "RECEIVED" | "MISSING" | "DISCREPANT";
    notes?: string;
  }[];
};
export type PickupOperation =
  | { action: "list"; page: number }
  | { action: "detail"; id: string }
  | { action: "review"; id: string; input: Review }
  | { action: "receipts"; id: string; input: Receipts };
export type Failure =
  | "unauthenticated"
  | "changed"
  | "forbidden"
  | "invalid"
  | "not-found"
  | "conflict"
  | "unavailable"
  | "uncertain";
export type PickupResult =
  | { status: Failure }
  | { status: "ready"; items: Pickup[]; hasNext: boolean }
  | { status: "detail"; pickup: Pickup };
