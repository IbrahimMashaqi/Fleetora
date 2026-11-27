import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/auth/same-origin.server";
import { isReadRequest } from "./read-contract";
import { operationsForSession } from "@/features/operations/operations.server";
import {
  readDriversForSession,
  checkDriverPhoneForSession,
} from "@/features/drivers/drivers.server";
import { fleetForSession } from "@/features/vehicles/vehicles.server";
import { readMerchantsForSession } from "@/features/merchants/merchants.server";
import { readWarehousesForSession } from "@/features/warehouses/warehouses.server";
import { pricingForSession } from "@/features/merchant-pricing/pricing.server";
import { pickupsForSession } from "@/features/pickups/pickups.server";
import { driverAccessForSession } from "@/features/drivers/driver-access.server";

export async function handleRead(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!hasSameOrigin(request))
    return NextResponse.json({ status: "forbidden" }, { status: 403, headers });
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 16000)
      return NextResponse.json({ status: "invalid" }, { status: 400, headers });
    input = JSON.parse(body);
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400, headers });
  }
  if (!isReadRequest(input))
    return NextResponse.json({ status: "invalid" }, { status: 400, headers });
  const cookies = new NextResponse(null, { headers });
  const jar = {
    get: (name: string) => request.cookies.get(name),
    set: cookies.cookies.set.bind(cookies.cookies),
    delete: cookies.cookies.delete.bind(cookies.cookies),
  };
  const { scope } = input;
  const result =
    input.area === "driverAccess" ? await driverAccessForSession(jar, scope, input.operation) : input.area === "operations"
      ? await operationsForSession(jar, scope, input.operation)
      : input.area === "drivers"
        ? await readDriversForSession(jar, scope, input.operation)
        : input.area === "vehicles"
          ? await fleetForSession(jar, scope, input.operation)
          : input.area === "merchants"
            ? await readMerchantsForSession(jar, scope, input.operation)
            : input.area === "warehouses"
              ? await readWarehousesForSession(jar, scope, input.operation)
              : input.area === "pricing"
                ? await pricingForSession(jar, scope, input.operation)
                : input.area === "operationalPricing"
                  ? await pricingForSession(jar, scope, input.operation, true)
                  : input.area === "driverPhone"
                    ? await checkDriverPhoneForSession(
                        jar,
                        scope,
                        input.operation,
                      )
                    : await pickupsForSession(jar, scope, input.operation);
  return NextResponse.json(result, { headers: cookies.headers });
}
