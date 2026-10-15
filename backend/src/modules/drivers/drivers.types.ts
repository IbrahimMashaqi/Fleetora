// Drivers are existing Worker records, independent of login accounts.
import type { Models } from '../../prisma/generated/contract.d';
export type DriverRow = Pick<
  Models.public_Worker,
  'id' | 'fullName' | 'phone' | 'status'
>;
export type Driver = Omit<DriverRow, 'fullName'> & { name: string };
export type DriverPage = {
  companyId: string;
  items: Driver[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};
export type DriverDetails = { companyId: string; driver: Driver };
