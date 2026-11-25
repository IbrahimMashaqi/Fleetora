"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  readWarehousesForSession,
  writeWarehouseForSession,
} from "./warehouses.server";
import type {
  WarehouseQuery,
  WarehouseScope,
  WarehouseWrite,
} from "./warehouses.types";

export async function readWarehousesAction(
  expected: WarehouseScope,
  query: WarehouseQuery,
) {
  const result = await readWarehousesForSession(
    await cookies(),
    expected,
    query,
  );
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}

export async function writeWarehouseAction(
  expected: WarehouseScope,
  operation: WarehouseWrite,
) {
  const result = await writeWarehouseForSession(
    await cookies(),
    expected,
    operation,
  );
  if (result.status === "unauthenticated") redirect("/login");
  return result;
}
