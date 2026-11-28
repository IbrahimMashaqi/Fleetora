import { NextRequest } from "next/server";
import { handleActivation } from "@/features/platform/activation.route";
export const POST = (request: NextRequest) => handleActivation(request, "company");
