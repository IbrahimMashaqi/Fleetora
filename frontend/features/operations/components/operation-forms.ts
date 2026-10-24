import type { Field } from "./operations-ui";
import { valueText } from "./operations-ui";
import type { Row } from "../operations-contract";

const text = (
  name: string,
  label: Field["label"],
  row?: Row | null,
  required = false,
): Field => ({ name, label, required, value: row?.[name] ?? "" });
function localDateTime(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
export function merchantFields(row?: Row | null): Field[] {
  return [
    text("name", "Business name", row, true),
    text("contactName", "Contact person", row, true),
    { ...text("phone", "Phone", row, true), type: "tel" },
    { ...text("secondaryPhone", "Secondary phone", row), type: "tel" },
    { ...text("pickupAddress", "Pickup address", row, true), span: true },
    text("city", "City / region", row, true),
    {
      name: "currency",
      label: "Currency",
      required: true,
      value: row?.currency ?? "ILS",
      options: ["ILS", "USD", "EUR", "JOD"].map((value) => ({
        value,
        label: value,
        literal: true,
      })),
    },
    {
      ...text("deliveryFee", "Default delivery fee", row, true),
      type: "money",
      value: row?.deliveryFee ?? "0.00",
    },
    {
      name: "feePayer",
      label: "Fee payer",
      required: true,
      value: row?.feePayer ?? "MERCHANT",
      options: [
        { value: "MERCHANT", label: "Merchant pays" },
        { value: "CUSTOMER", label: "Customer pays" },
      ],
    },
    {
      ...text("returnFee", "Return fee", row, true),
      type: "money",
      value: row?.returnFee ?? "0.00",
    },
    {
      name: "returnFeePolicy",
      label: "Return fee policy",
      required: true,
      value: row?.returnFeePolicy ?? "ON_MERCHANT_HANDOFF",
      options: [
        { value: "NONE", label: "No return charge" },
        { value: "ON_MERCHANT_HANDOFF", label: "Charge on merchant handoff" },
      ],
    },
    {
      ...text("serviceFee", "Additional service fee", row, true),
      type: "money",
      value: row?.serviceFee ?? "0.00",
    },
    {
      ...text("latitude", "Pickup latitude", row),
      type: "number",
      min: -90,
      max: 90,
    },
    {
      ...text("longitude", "Pickup longitude", row),
      type: "number",
      min: -180,
      max: 180,
    },
    {
      ...text("paymentNotes", "Settlement notes", row),
      type: "textarea",
      span: true,
    },
    { ...text("notes", "Internal notes", row), type: "textarea", span: true },
    {
      name: "active",
      label: "Active merchant",
      type: "checkbox",
      value: row?.active ?? true,
    },
  ];
}
export function parcelFields(
  row?: Row | null,
  merchantName?: string,
  merchantId?: string,
): Field[] {
  return [
    {
      name: "merchantId",
      label: "Merchants",
      lookup: "merchants",
      required: true,
      value: row?.merchantId ?? merchantId ?? "",
      lookupLabel: merchantName,
      span: true,
    },
    text("merchantReference", "Merchant reference", row),
    text("recipientName", "Recipient name", row, true),
    { ...text("recipientPhone", "Recipient phone", row, true), type: "tel" },
    { ...text("secondaryPhone", "Secondary phone", row), type: "tel" },
    text("city", "City / region", row, true),
    {
      ...text("destination", "Delivery address", row, true),
      type: "textarea",
      span: true,
    },
    { ...text("description", "Parcel description", row, true), span: true },
    {
      name: "pieces",
      label: "Pieces",
      type: "number",
      required: true,
      value: row?.pieces ?? 1,
      min: 1,
      max: 1000,
    },
    {
      ...text("weight", "Weight (kg)", row),
      type: "number",
      min: 0.001,
      max: 10000,
    },
    {
      name: "codAmount",
      label: "COD goods amount",
      type: "money",
      required: true,
      value: row?.codAmount ?? "0.00",
    },
    { ...text("declaredValue", "Declared value", row), type: "money" },
    {
      name: "priority",
      label: "Priority",
      required: true,
      value: row?.priority ?? "NORMAL",
      options: [
        { value: "LOW", label: "Low" },
        { value: "NORMAL", label: "Normal" },
        { value: "HIGH", label: "High" },
        { value: "URGENT", label: "Urgent" },
      ],
    },
    {
      ...text("scheduledAt", "Scheduled delivery", row),
      type: "datetime-local",
      value: localDateTime(valueText(row ?? { id: "" }, "scheduledAt")),
    },
    {
      ...text("latitude", "Destination latitude", row),
      type: "number",
      min: -90,
      max: 90,
    },
    {
      ...text("longitude", "Destination longitude", row),
      type: "number",
      min: -180,
      max: 180,
    },
    {
      ...text("customerNotes", "Customer notes", row),
      type: "textarea",
      span: true,
    },
    {
      ...text("instructions", "Delivery instructions", row),
      type: "textarea",
      span: true,
    },
    { ...text("notes", "Internal notes", row), type: "textarea", span: true },
  ];
}
export const returnReasonOptions: NonNullable<Field["options"]> = [
  { value: "CUSTOMER_REFUSED", label: "Customer refused" },
  { value: "UNREACHABLE", label: "Customer unreachable" },
  { value: "WRONG_ADDRESS", label: "Incorrect address" },
  { value: "CUSTOMER_CANCELLED", label: "Customer cancellation" },
  { value: "DAMAGED", label: "Damaged parcel" },
  { value: "ATTEMPTS_EXHAUSTED", label: "Attempts exhausted" },
  { value: "MERCHANT_REQUESTED", label: "Merchant requested return" },
  { value: "OTHER", label: "Other reason" },
];
export const methodOptions: NonNullable<Field["options"]> = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
];
export function paymentFields(amount?: string, payout = false): Field[] {
  return [
    {
      name: "amount",
      label: "Amount",
      type: "money",
      required: true,
      value: amount ?? "",
    },
    {
      name: "method",
      label: "Payment method",
      required: true,
      value: "CASH",
      options: methodOptions,
    },
    {
      name: "reference",
      label: "Payment reference",
      required: payout,
      span: true,
    },
    ...(!payout
      ? [
          {
            name: "notes",
            label: "Note",
            type: "textarea",
            span: true,
          } satisfies Field,
        ]
      : []),
    ...(payout
      ? [
          {
            name: "paidAt",
            label: "Actual payment date",
            type: "datetime-local",
            required: true,
          } satisfies Field,
        ]
      : []),
  ];
}
