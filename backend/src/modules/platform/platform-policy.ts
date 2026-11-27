import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { canonicalEmail } from '../../common/utils/email.js';

export const PLATFORM_ROLES = [
  'SUPER_ADMIN',
  'COMPANY_MANAGER',
  'BILLING',
  'SUPPORT',
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export function platformRole(value: unknown): value is PlatformRole {
  return (
    typeof value === 'string' && PLATFORM_ROLES.some((role) => role === value)
  );
}
export function platformPermissions(role: string) {
  if (!platformRole(role))
    throw new ForbiddenException('Platform role required');
  return {
    manageTeam: role === 'SUPER_ADMIN',
    manageCompanies: role === 'SUPER_ADMIN' || role === 'COMPANY_MANAGER',
    managePlans: role === 'SUPER_ADMIN',
    manageBilling: role === 'SUPER_ADMIN' || role === 'BILLING',
    companyOperations: false,
    supportAccess: false,
  };
}
export function bootstrapEmail(
  args: string[],
  environment: Record<string, string | undefined>,
) {
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--email'))
    throw new BadRequestException(
      'Usage: platform:bootstrap -- --email owner@example.com',
    );
  const email = canonicalEmail(
    args[1] ?? environment.FLEETORA_PLATFORM_BOOTSTRAP_EMAIL ?? '',
  );
  if (!isEmail(email) || email.length > 254)
    throw new BadRequestException('A valid bootstrap email is required');
  return email;
}
