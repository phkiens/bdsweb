import { CustomerPropertyRole, CustomerRole, CustomerStatus } from "./enums";

export interface Customer {
  id: string;
  name: string;
  nameNormalized: string;
  phone: string;
  demandType: string; // "Cần mua", "Cần thuê", "Cần bán"
  propertyType: string; // "Đất", "Nhà", "Bất kỳ"
  demandAreas: string; // "|||" separated
  demandDirections: string; // "|||" separated
  priceMin: number;
  priceMax: number;
  note: string;
  noteNormalized: string;
  role: CustomerRole | string; // "BUYER", "OWNER"
  status: CustomerStatus | string; // "ACTIVE", "CLOSED"
  updatedAt: number;
  isSynced: boolean;
  isDeleted: boolean;
  avatarPath: string | null;
  avatarDriveUrl: string | null;
}

export interface CustomerPropertyLink {
  customerId: string;
  propertyId: string;
  role: CustomerPropertyRole | string; // "OWNER", "VIEWED"
  updatedAt: number;
  isDeleted: boolean;
  isSynced: boolean;
}

export const AUTO_NOTE_PREFIX = "Tự động tạo từ thông tin BĐS";

export function isBuyerSide(customer: Customer): boolean {
  return customer.role === CustomerRole.BUYER || customer.demandType === "Cần mua";
}

export function isEligibleForMatching(customer: Customer): boolean {
  return !customer.isDeleted && customer.status === CustomerStatus.ACTIVE && isBuyerSide(customer);
}
