import { SetMetadata } from '@nestjs/common';
export const COMPANY_STATUS_ALLOWED = 'company-status-allowed';
// Authentication is still required. These routes expose only own status/resubmission.
export const AllowCompanyStatus = () => SetMetadata(COMPANY_STATUS_ALLOWED, true);
