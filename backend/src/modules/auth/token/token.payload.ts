export type UserRole =
  | 'PLATFORM_ADMIN'
  | 'COMPANY_ADMIN'
  | 'MERCHANT'
  | 'OPERATIONS'
  | 'WAREHOUSE'
  | 'ACCOUNTANT';

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  orgId: string;
}
