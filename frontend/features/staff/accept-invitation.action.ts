"use server";

import {
  getBackendEndpoint,
  readBackendBody,
  requestBackend,
} from "@/lib/api/backend.server";
import { clientSourceFor } from "@/lib/api/client-source.server";
import { newPasswordError } from "@/lib/auth/password-policy";
import type {
  AcceptInvitationField,
  AcceptInvitationState,
} from "./staff.types";

const validToken = /^[a-f0-9]{64}$/;

export async function acceptStaffInvitationAction(
  token: string,
  _previous: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const name = read("name").trim();
  const password = read("password");
  const fieldErrors: Partial<Record<AcceptInvitationField, string>> = {};
  if (Array.from(name).length < 2 || name.length > 120)
    fieldErrors.name = "Enter your full name (2 to 120 characters).";
  const passwordError = newPasswordError(password);
  if (passwordError) fieldErrors.password = passwordError;
  if (password !== read("confirmPassword"))
    fieldErrors.confirmPassword = "Passwords do not match.";
  if (Object.keys(fieldErrors).length)
    return { status: "error", fieldErrors, name };
  if (typeof token !== "string" || !validToken.test(token))
    return { status: "error", message: "invalid", name };

  try {
    const endpoint = getBackendEndpoint("company/staff/invitations/accept");
    if (!endpoint) return { status: "error", message: "unavailable", name };
    const clientSource = await clientSourceFor("POST", endpoint);
    const response = await requestBackend(endpoint, {
      method: "POST",
      body: { token, name, password },
      clientSource,
    });
    if (response.status === 400)
      return { status: "error", message: "invalid", name };
    if (response.status === 409)
      return { status: "error", message: "conflict", name };
    if (response.status === 429)
      return { status: "error", message: "limited", name };
    if (!response.ok) return { status: "error", message: "unavailable", name };
    const body = await readBackendBody(response);
    if (
      typeof body !== "object" ||
      body === null ||
      !("success" in body) ||
      body.success !== true ||
      !("data" in body) ||
      typeof body.data !== "object" ||
      body.data === null ||
      !("accepted" in body.data) ||
      body.data.accepted !== true ||
      !("email" in body.data) ||
      typeof body.data.email !== "string"
    )
      return { status: "error", message: "unavailable", name };
    return { status: "accepted", email: body.data.email };
  } catch {
    return { status: "error", message: "unavailable", name };
  }
}
