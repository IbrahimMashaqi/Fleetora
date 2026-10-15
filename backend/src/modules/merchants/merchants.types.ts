// This slice represents existing MERCHANT user accounts, not merchant businesses.
export type MerchantAccountRow = {
  id: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
};

export type MerchantAccount = Omit<MerchantAccountRow, 'fullName'> & { name: string };
export type MerchantPage = { companyId: string; items: MerchantAccount[]; page: number; pageSize: number; hasNext: boolean };
export type MerchantDetails = { companyId: string; account: MerchantAccount };
