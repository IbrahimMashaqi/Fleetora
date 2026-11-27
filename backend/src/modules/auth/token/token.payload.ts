export type UserRole =
  | 'PLATFORM_ADMIN'
  | 'COMPANY_ADMIN'
  | 'MERCHANT'
  | 'OPERATIONS'
  | 'WAREHOUSE'
  | 'DRIVER'
  | 'ACCOUNTANT';

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  orgId: string;
  sessionVersion?: number;
  companyVersion?: number;
  companyStatus?: 'PENDING' | 'ACTIVE' | 'REJECTED';
}
