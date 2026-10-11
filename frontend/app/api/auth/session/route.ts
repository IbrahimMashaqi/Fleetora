import { NextRequest } from "next/server";
import { handleSession } from "@/features/auth/session.route";

export async function POST(request: NextRequest) {
  return handleSession(request);
}
