import { BadRequestException, ConflictException } from '@nestjs/common';
export const COMPANY_APPROVALS = ['PENDING', 'ACTIVE', 'REJECTED'] as const;
export type CompanyApproval = (typeof COMPANY_APPROVALS)[number];
export type CompanyState = { approvalStatus: string; suspended: boolean };
export function companyOperable(company: CompanyState) {
  return company.approvalStatus === 'ACTIVE' && !company.suspended;
}
export function companyPermissions(role: string) {
  return {
    read: ['SUPER_ADMIN', 'COMPANY_MANAGER', 'SUPPORT'].includes(role),
    write: ['SUPER_ADMIN', 'COMPANY_MANAGER'].includes(role),
  };
}
export function companyTransition(
  state: CompanyState,
  action: string,
  reason?: string,
) {
  const text = reason?.trim();
  if (['reject', 'suspend'].includes(action) && (!text || text.length > 500))
    throw new BadRequestException(
      'A reason of 1 to 500 characters is required',
    );
  if (
    action === 'approve' &&
    state.approvalStatus === 'PENDING' &&
    !state.suspended
  )
    return {
      approvalStatus: 'ACTIVE' as const,
      rejectionReason: null,
      suspended: false,
    };
  if (
    action === 'reject' &&
    state.approvalStatus === 'PENDING' &&
    !state.suspended
  )
    return {
      approvalStatus: 'REJECTED' as const,
      rejectionReason: text ?? null,
      suspended: false,
    };
  if (action === 'suspend' && companyOperable(state))
    return {
      approvalStatus: 'ACTIVE' as const,
      rejectionReason: null,
      suspended: true,
    };
  if (
    action === 'reactivate' &&
    state.approvalStatus === 'ACTIVE' &&
    state.suspended
  )
    return {
      approvalStatus: 'ACTIVE' as const,
      rejectionReason: null,
      suspended: false,
    };
  throw new ConflictException('Company transition is not allowed');
}
