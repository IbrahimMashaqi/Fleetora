import type { Models } from '../../prisma/generated/contract.d';
export type VehicleRow = Pick<
  Models.public_Vehicle,
  'id' | 'companyId' | 'manufacturer' | 'model' | 'type' | 'plateNumber'
> & { worker: { id: string; companyId: string; fullName: string } | null };
export type Vehicle = Omit<VehicleRow, 'companyId' | 'worker'> & {
  assignedDriver: { id: string; name: string } | null;
};
export function publicVehicle(row: VehicleRow, companyId: string): Vehicle {
  return {
    id: row.id,
    manufacturer: row.manufacturer,
    model: row.model,
    type: row.type,
    plateNumber: row.plateNumber,
    assignedDriver:
      row.worker?.companyId === companyId
        ? { id: row.worker.id, name: row.worker.fullName }
        : null,
  };
}
