export type UserRole =
  | 'PLATFORM_ADMIN'
  | 'COMPANY_ADMIN'
  | 'MERCHANT'
  | 'ACCOUNTANT';

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  orgId: string;
}
