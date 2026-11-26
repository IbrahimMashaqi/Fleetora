import type { Models } from '../../prisma/generated/contract.d';

export const STAFF_ROLES = [
  'COMPANY_ADMIN',
  'ACCOUNTANT',
  'OPERATIONS',
  'WAREHOUSE',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const isStaffRole = (value: unknown): value is StaffRole =>
  STAFF_ROLES.some((role) => role === value);

export type StaffInvitationRow = Pick<
  Models.public_StaffInvitation,
  | 'id'
  | 'email'
  | 'role'
  | 'expiresAt'
  | 'createdAt'
  | 'acceptedAt'
  | 'revokedAt'
>;
export type StaffInvitationState =
  'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
export type StaffInvitation = {
  id: string;
  email: string;
  role: StaffRole;
  state: StaffInvitationState;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
export type StaffMember = {
  id: string;
  fullName: string;
  email: string | null;
  role: StaffRole;
  active: boolean;
};
export type StaffOverview = {
  companyId: string;
  members: StaffMember[];
  invitations: StaffInvitation[];
};
