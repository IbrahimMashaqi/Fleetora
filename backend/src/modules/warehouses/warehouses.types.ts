import type { Models } from '../../prisma/generated/contract.d';

export type WarehouseRow = Pick<
  Models.public_Warehouse,
  'id' | 'name' | 'address' | 'archivedAt'
>;
export type Warehouse = {
  id: string;
  name: string;
  address: string;
  archived: boolean;
};
export type WarehousePage = {
  companyId: string;
  items: Warehouse[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};
export type WarehouseDetails = { companyId: string; warehouse: Warehouse };
