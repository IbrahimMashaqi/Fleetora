// Drivers are existing Worker records, independent of login accounts.
import type { Models } from '../../prisma/generated/contract.d';
export type DriverVehicleRow = Pick<
  Models.public_Vehicle,
  'id' | 'companyId' | 'type' | 'plateNumber' | 'manufacturer' | 'model'
>;
export type DriverVehicle = Omit<DriverVehicleRow, 'companyId'>;
export type DriverRow = Pick<
  Models.public_Worker,
  'id' | 'fullName' | 'phone' | 'status'
> & { vehicle: DriverVehicleRow | null };
export type Driver = Omit<DriverRow, 'fullName' | 'vehicle'> & {
  name: string;
  vehicle: DriverVehicle | null;
};
export type DriverPage = {
  companyId: string;
  items: Driver[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};
export type DriverDetails = { companyId: string; driver: Driver };
