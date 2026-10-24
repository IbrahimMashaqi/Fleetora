import { validMoneyInput } from "./money";
export type Scope = { userId: string; companyId: string };
export type Resource =
  | "config"
  | "merchants"
  | "parcels"
  | "returns"
  | "collections"
  | "settlements"
  | "dashboard"
  | "drivers"
  | "statement"
  | "events"
  | "adjustments";
export type Operation = {
  resource: Resource;
  id?: string;
  action?:
    | "create"
    | "edit"
    | "transition"
    | "assignment"
    | "attempts"
    | "location"
    | "remittance"
    | "preview"
    | "finalize"
    | "cancel"
    | "payment"
    | "reversal";
  query?: Record<string, string>;
  input?: Record<string, unknown>;
};
export type Failure =
  | "invalid"
  | "forbidden"
  | "changed"
  | "not-found"
  | "conflict"
  | "unavailable"
  | "uncertain"
  | "unauthenticated";
export type Result = { status: Failure } | { status: "ready"; data: Data };
export type Scalar = string | number | boolean | null;
export type Row = { id: string; [field: string]: Scalar };
export type Page = {
  items: Row[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};
export type Data =
  | {
      kind: "config";
      capabilities: Record<string, boolean>;
      transitions: Record<string, string[]>;
      currencies: string[];
    }
  | { kind: "page"; data: Page }
  | {
      kind: "merchant";
      merchant: Row;
      statistics: Record<string, number>;
      balances: Row[];
    }
  | {
      kind: "parcel";
      parcel: Row;
      merchant: Row | null;
      worker: Row | null;
      collection: Row | null;
      returnRecord: Row | null;
      events: Row[];
      attempts: Row[];
      allowedTransitions: string[];
    }
  | { kind: "settlement"; settlement: Row; lines: Row[]; payments: Row[] }
  | { kind: "preview"; preview: Row; lines: Row[] }
  | {
      kind: "dashboard";
      counts: Record<string, number>;
      money: Row[];
      recentActivity: Row[];
      attention: Row[];
      pendingReturns: Row[];
      statusDistribution: Record<string, number>;
    }
  | { kind: "saved"; id: string | null };

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function scalar(value: unknown): value is Scalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const merchantFields = [
  "id",
  "companyId",
  "name",
  "contactName",
  "phone",
  "secondaryPhone",
  "pickupAddress",
  "city",
  "latitude",
  "longitude",
  "notes",
  "active",
  "currency",
  "deliveryFee",
  "feePayer",
  "returnFee",
  "serviceFee",
  "paymentNotes",
  "revision",
  "createdAt",
  "updatedAt",
];
const parcelFields = [
  "id",
  "companyId",
  "trackingNumber",
  "merchantId",
  "merchantReference",
  "recipientName",
  "recipientPhone",
  "secondaryPhone",
  "city",
  "destination",
  "latitude",
  "longitude",
  "instructions",
  "description",
  "pieces",
  "weight",
  "declaredValue",
  "codAmount",
  "deliveryFee",
  "returnFee",
  "serviceFee",
  "feePayer",
  "currency",
  "notes",
  "scheduledAt",
  "priority",
  "workerId",
  "status",
  "custody",
  "locationLabel",
  "locationSource",
  "locationUpdatedAt",
  "attemptCount",
  "deliveredAt",
  "returnedAt",
  "revision",
  "createdAt",
  "updatedAt",
];
merchantFields.push("returnFeePolicy");
merchantFields.push("planId", "pricingDiscount");
parcelFields.push(
  "returnFeePolicy",
  "expectedCustomerTotal",
  "collectionRequired",
  "customerNotes",
  "responsibleActorId",
  "requestedBy",
  "pricingMode", "collectionMode", "pickupMethod", "deliveryZoneId", "pricingPlanId",
);
const eventFields = [
  "id",
  "companyId",
  "shipmentId",
  "event",
  "type",
  "actorId",
  "actorName",
  "occurredAt",
  "createdAt",
  "previousStatus",
  "newStatus",
  "fromStatus",
  "toStatus",
  "note",
  "reason",
  "custody",
  "locationLabel",
  "locationSource",
  "oldWorkerId",
  "newWorkerId",
  "oldWorkerName",
  "newWorkerName",
];
const financialFields = [
  "id",
  "companyId",
  "parcelId",
  "shipmentId",
  "merchantId",
  "workerId",
  "trackingNumber",
  "merchantName",
  "recipientName",
  "currency",
  "expectedAmount",
  "amount",
  "codAmount",
  "collectedAmount",
  "remittedAmount",
  "remitted",
  "remittedAt",
  "method",
  "reference",
  "notes",
  "note",
  "reason",
  "type",
  "kind",
  "status",
  "createdAt",
  "occurredAt",
  "collectedAt",
  "updatedAt",
  "paidAt",
  "initiatedAt",
  "warehouseAt",
  "merchantAt",
  "returnedToWarehouseAt",
  "returnedToMerchantAt",
  "custody",
  "locationLabel",
  "ageDays",
  "overdue",
  "revision",
  "netPayable",
  "grossCollected",
  "deliveryFees",
  "returnFees",
  "adjustments",
  "from",
  "to",
  "actorId",
  "approvedBy",
  "paidBy",
  "collectedBy",
  "confirmedBy",
  "balance",
  "eligible",
  "paid",
  "ledgerEntryId",
  "reversalOfId",
  "settlementId",
  "allocationId",
  "paymentAmount",
];
export function readRow(
  value: unknown,
  fields: readonly string[],
  requireId = true,
): Row | null {
  if (
    !object(value) ||
    (requireId && (typeof value.id !== "string" || !uuid.test(value.id)))
  )
    return null;
  const row: Row = { id: typeof value.id === "string" ? value.id : "" };
  for (const field of fields) {
    const item = value[field];
    if (item !== undefined) {
      if (!scalar(item)) return null;
      row[field] = item;
    }
  }
  return row;
}
export function parseMerchant(value: unknown): Row | null {
  const row = readRow(value, merchantFields);
  return row &&
    typeof row.name === "string" &&
    typeof row.currency === "string" &&
    ["ILS", "USD", "EUR", "JOD"].includes(row.currency) &&
    ["deliveryFee", "returnFee", "serviceFee"].every(
      (field) =>
        typeof row[field] === "string" &&
        validMoneyInput(row[field], row.currency as string),
    ) &&
    typeof row.revision === "number" &&
    typeof row.active === "boolean"
    ? row
    : null;
}
export function parseParcel(value: unknown): Row | null {
  const row = readRow(value, parcelFields);
  return row &&
    typeof row.destination === "string" &&
    typeof row.status === "string" &&
    typeof row.revision === "number" &&
    (row.collectionRequired === undefined || typeof row.collectionRequired === "boolean") &&
    typeof row.currency === "string" &&
    ["ILS", "USD", "EUR", "JOD"].includes(row.currency) &&
    [
      "codAmount",
      "deliveryFee",
      "returnFee",
      "serviceFee",
      "expectedCustomerTotal",
    ].every(
      (field) =>
        typeof row[field] === "string" &&
        validMoneyInput(row[field], row.currency as string),
    )
    ? row
    : null;
}
function rows(
  value: unknown,
  parser: (item: unknown) => Row | null,
): Row[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null;
  const result: Row[] = [];
  for (const item of value) {
    const row = parser(item);
    if (!row) return null;
    result.push(row);
  }
  return result;
}
function stringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((item) => typeof item === "string")
  );
}
function numbers(value: unknown): Record<string, number> | null {
  if (!object(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isFinite(count)) return null;
    result[key] = count;
  }
  return result;
}
financialFields.push(
  "goodsAmount",
  "recordedBy",
  "remittedBy",
  "remittanceMethod",
  "remittanceReference",
  "remittanceNotes",
  "initiatedBy",
  "originalId",
  "allocationSettlementId",
  "createdBy",
  "finalizedBy",
  "finalizedAt",
  "cancelledBy",
  "cancelledAt",
  "cancellationReason",
  "expectedCod",
  "collectedCod",
  "unremittedCash",
  "merchantPayables",
  "settledAmounts",
  "uncollectedCod",
  "previewHash",
);
const readFinancial = (value: unknown) => {
  const row = readRow(value, financialFields);
  if (!row || !object(value) || value.parcel === undefined) return row;
  const parcel = parseParcel(value.parcel);
  if (!parcel || parcel.companyId !== row.companyId) return null;
  for (const key of [
    "trackingNumber",
    "recipientName",
    "merchantId",
    "workerId",
    "custody",
    "locationLabel",
    "revision",
    "city",
  ])
    row[key] = parcel[key];
  return row;
};
const readEvent = (value: unknown) => readRow(value, eventFields);
export function parseData(
  operation: Operation,
  value: unknown,
  companyId: string,
): Data | null {
  if (!object(value) || value.companyId !== companyId) return null;
  const hasForeignOwner = (item: unknown) =>
    object(item) &&
    item.companyId !== undefined &&
    item.companyId !== companyId;
  if (
    [
      value.merchant,
      value.parcel,
      value.collection,
      value.returnRecord,
      value.settlement,
      value.entry,
    ].some(hasForeignOwner) ||
    (Array.isArray(value.items) && value.items.some(hasForeignOwner))
  )
    return null;
  if (operation.resource === "config") {
    if (
      !object(value.capabilities) ||
      !object(value.transitions) ||
      !stringList(value.currencies)
    )
      return null;
    const capabilities: Record<string, boolean> = {},
      transitions: Record<string, string[]> = {};
    for (const [key, allowed] of Object.entries(value.capabilities)) {
      if (typeof allowed !== "boolean") return null;
      capabilities[key] = allowed;
    }
    for (const [key, states] of Object.entries(value.transitions)) {
      if (!stringList(states)) return null;
      transitions[key] = states;
    }
    return {
      kind: "config",
      capabilities,
      transitions,
      currencies: value.currencies,
    };
  }
  if (operation.resource === "dashboard") {
    const counts = numbers(value.counts);
    const statusDistribution: Record<string, number> = {};
    if (!Array.isArray(value.statusDistribution)) return null;
    for (const item of value.statusDistribution) {
      if (
        !object(item) ||
        typeof item.status !== "string" ||
        typeof item.count !== "number" ||
        !Number.isInteger(item.count)
      )
        return null;
      statusDistribution[item.status] = item.count;
    }
    const money = rows(value.money, (item) =>
      readRow(item, financialFields, false),
    );
    const recentActivity = rows(value.recentActivity, readEvent),
      attention = rows(value.attention, parseParcel),
      pendingReturns = rows(value.pendingReturns, readFinancial);
    return counts &&
      statusDistribution &&
      money &&
      recentActivity &&
      attention &&
      pendingReturns
      ? {
          kind: "dashboard",
          counts,
          statusDistribution,
          money,
          recentActivity,
          attention,
          pendingReturns,
        }
      : null;
  }
  if (operation.action && operation.action !== "preview") {
    const keys: Partial<Record<Resource, string>> = {
      merchants: "merchant",
      parcels: "parcel",
      returns: "parcel",
      collections: "collection",
      settlements: "settlement",
      adjustments: "entry",
    };
    const entity = value[keys[operation.resource] ?? ""];
    const sameId =
      operation.id &&
      operation.resource !== "returns" &&
      !(
        operation.resource === "adjustments" && operation.action === "reversal"
      );
    return object(entity) &&
      typeof entity.id === "string" &&
      uuid.test(entity.id) &&
      (!sameId || entity.id === operation.id)
      ? { kind: "saved", id: entity.id }
      : null;
  }
  if (
    Array.isArray(value.items) &&
    (!operation.id || ["statement", "events"].includes(operation.resource))
  ) {
    const parser =
      operation.resource === "merchants"
        ? parseMerchant
        : operation.resource === "parcels"
          ? parseParcel
          : operation.resource === "events"
            ? readEvent
            : operation.resource === "drivers"
              ? (item: unknown) =>
                  readRow(item, ["id", "fullName", "name", "status"])
              : readFinancial;
    const items = rows(value.items, parser);
    return items &&
      Number.isInteger(value.page) &&
      Number.isInteger(value.pageSize) &&
      typeof value.page === "number" &&
      typeof value.pageSize === "number" &&
      value.page > 0 &&
      value.pageSize > 0 &&
      value.pageSize <= 100 &&
      items.length <= value.pageSize &&
      typeof value.hasNext === "boolean"
      ? {
          kind: "page",
          data: {
            items,
            page: value.page,
            pageSize: value.pageSize,
            hasNext: value.hasNext,
          },
        }
      : null;
  }
  if (operation.action === "preview" && object(value.preview)) {
    const preview = readRow(value.preview, financialFields, false),
      lines = rows(value.preview.lines, readFinancial);
    return preview && lines ? { kind: "preview", preview, lines } : null;
  }
  if (operation.resource === "merchants") {
    const merchant = parseMerchant(value.merchant),
      statistics = numbers(value.statistics),
      balances = rows(value.balances, (item) =>
        readRow(item, financialFields, false),
      );
    return merchant && merchant.id === operation.id && statistics && balances
      ? { kind: "merchant", merchant, statistics, balances }
      : null;
  }
  if (operation.resource === "parcels") {
    const parcel = parseParcel(value.parcel),
      merchant = value.merchant === null ? null : parseMerchant(value.merchant),
      worker =
        value.worker === null
          ? null
          : readRow(value.worker, ["id", "fullName", "phone", "status"]);
    const events = rows(value.events, readEvent),
      attempts = rows(value.attempts, (item) =>
        readRow(item, [...eventFields, "outcome", "attemptedAt", "workerId"]),
      );
    const collection =
        value.collection === null ? null : readFinancial(value.collection),
      returnRecord =
        value.returnRecord === null ? null : readFinancial(value.returnRecord);
    return parcel &&
      parcel.id === operation.id &&
      events &&
      attempts &&
      stringList(value.allowedTransitions)
      ? {
          kind: "parcel",
          parcel,
          merchant,
          worker,
          collection,
          returnRecord,
          events,
          attempts,
          allowedTransitions: value.allowedTransitions,
        }
      : null;
  }
  if (operation.resource === "settlements" && object(value.settlement)) {
    const settlement = readFinancial(value.settlement),
      lines = rows(value.settlement.lines, readFinancial),
      payments = rows(value.settlement.payments, readFinancial);
    return settlement && settlement.id === operation.id && lines && payments
      ? { kind: "settlement", settlement, lines, payments }
      : null;
  }
  return null;
}

const merchantWrites = [
  "name",
  "contactName",
  "phone",
  "secondaryPhone",
  "pickupAddress",
  "city",
  "latitude",
  "longitude",
  "notes",
  "active",
  "currency",
  "deliveryFee",
  "feePayer",
  "returnFee",
  "serviceFee",
  "paymentNotes",
  "revision",
];
merchantWrites.push("returnFeePolicy");
const parcelWrites = [
  "merchantId",
  "merchantReference",
  "recipientName",
  "recipientPhone",
  "secondaryPhone",
  "city",
  "destination",
  "latitude",
  "longitude",
  "instructions",
  "description",
  "pieces",
  "weight",
  "declaredValue",
  "codAmount",
  "notes",
  "scheduledAt",
  "priority",
  "revision",
];
parcelWrites.push("customerNotes");
export function writeFields(operation: Operation): Record<string, unknown> {
  const key = `${operation.resource}:${operation.action}`;
  const specific: Record<string, string[]> = {
    "parcels:transition": ["revision", "status", "note"],
    "parcels:assignment": ["revision", "workerId", "note"],
    "parcels:attempts": ["revision", "outcome", "reason", "note"],
    "parcels:location": [
      "revision",
      "custody",
      "locationLabel",
      "locationSource",
      "note",
    ],
    "returns:create": ["parcelId", "revision", "reason", "note"],
    "returns:transition": ["revision", "status", "note"],
    "collections:create": [
      "parcelId",
      "amount",
      "method",
      "reference",
      "notes",
      "idempotencyKey",
    ],
    "collections:remittance": [
      "amount",
      "method",
      "reference",
      "notes",
      "idempotencyKey",
    ],
    "adjustments:create": [
      "merchantId",
      "currency",
      "amount",
      "reason",
      "idempotencyKey",
    ],
    "adjustments:reversal": ["reason", "idempotencyKey"],
    "settlements:preview": ["merchantId", "currency", "from", "to"],
    "settlements:create": [
      "merchantId",
      "currency",
      "from",
      "to",
      "expectedPreviewHash",
      "idempotencyKey",
    ],
    "settlements:finalize": ["revision", "idempotencyKey"],
    "settlements:cancel": ["revision", "reason", "idempotencyKey"],
    "settlements:payment": [
      "revision",
      "amount",
      "method",
      "reference",
      "paidAt",
      "idempotencyKey",
    ],
  };
  const fields =
    specific[key] ??
    (operation.resource === "merchants"
      ? merchantWrites
      : operation.resource === "parcels"
        ? parcelWrites
        : []);
  const input: Record<string, unknown> = {};
  for (const field of fields)
    if (operation.input?.[field] !== undefined)
      input[field] = operation.input[field];
  return input;
}
export function operationEndpoint(operation: Operation): string | null {
  if (operation.id !== undefined && !uuid.test(operation.id)) return null;
  const resource = operation.resource;
  if (
    ["config", "drivers", "dashboard", "events", "statement"].includes(
      resource,
    ) &&
    operation.action
  )
    return null;
  const base: Record<Resource, string> = {
    config: "parcels/config",
    merchants: "merchants/business",
    parcels: "parcels",
    returns: "returns",
    collections: "collections",
    settlements: "settlements",
    dashboard: "parcel-operations/dashboard",
    drivers: "parcels/drivers",
    statement: `merchants/business/${operation.id}/statement`,
    events: `parcels/${operation.id}/events`,
    adjustments: "financial/adjustments",
  };
  const actions: Partial<Record<Resource, readonly string[]>> = {
    merchants: ["create", "edit"],
    parcels: [
      "create",
      "edit",
      "transition",
      "assignment",
      "attempts",
      "location",
    ],
    returns: ["create", "transition"],
    collections: ["create", "remittance"],
    settlements: ["create", "preview", "finalize", "cancel", "payment"],
    adjustments: ["create", "reversal"],
  };
  if (
    !(resource in base) ||
    (operation.action && !actions[resource]?.includes(operation.action))
  )
    return null;
  if (["statement", "events"].includes(resource))
    return operation.id ? base[resource] : null;
  if (["create", "preview"].includes(operation.action ?? ""))
    return operation.id
      ? null
      : `${base[resource]}${operation.action === "preview" ? "/preview" : ""}`;
  if (operation.action && !operation.id) return null;
  return `${base[resource]}${operation.id ? `/${operation.id}` : ""}${operation.action && operation.action !== "edit" ? `/${operation.action}` : ""}`;
}
