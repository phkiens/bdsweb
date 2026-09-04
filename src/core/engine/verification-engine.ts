import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";

/**
 * Promotes an unverified property to verified status with updated timestamps.
 * If current status is PENDING_SURVEY (or empty), promotes to FOR_SALE.
 */
export function buildVerifiedProperty(
  property: Property,
  overrides?: Partial<Property>
): Property {
  const merged: Property = { ...property, ...overrides };
  const now = Date.now();

  const shouldPromoteStatus =
    merged.status === PropertyStatus.PENDING_SURVEY || !merged.status;

  return {
    ...merged,
    isVerified: true,
    status: shouldPromoteStatus ? PropertyStatus.FOR_SALE : merged.status,
    updatedAt: now,
    lastEditedAt: now,
    isTextSynced: false
  };
}

/**
 * Checks if a property has all essential broker fields for field verification.
 */
export function checkVerificationReadiness(property: Property): {
  isReady: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!property.area || !property.area.trim()) {
    warnings.push("Thiếu tên khu vực hoặc địa chỉ bất động sản");
  }

  if (!property.ownerPhone || !property.ownerPhone.trim()) {
    warnings.push("Chưa có số điện thoại chủ nhà");
  }

  if (property.latitude === null || property.longitude === null) {
    warnings.push("Chưa có tọa độ định vị GPS thực địa");
  }

  if (!property.price || property.price <= 0) {
    warnings.push("Chưa có mức giá chào bán");
  }

  return {
    isReady: warnings.length === 0,
    warnings
  };
}
