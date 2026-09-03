import { AppDatabase } from "../../data/local/db";
import { Property } from "../models/property";
import { Customer } from "../models/customer";
import { CustomerRole, CustomerStatus } from "../models/enums";
import { canonicalizeVietnamesePhone, normalizeVietnamese } from "../utils/vietnamese";

export const AUTO_NOTE_PREFIX = "Nhu cầu tự động từ BĐS";

/**
 * Tự động tìm hoặc tạo hồ sơ Chủ nhà (OWNER) khi thêm/sửa một BĐS
 * và tạo liên kết CustomerPropertyLink tương ứng.
 * Khớp chính xác 100% với ensureCustomerForProperty trong PropertyRepositoryImpl.kt của Android.
 */
export async function ensureCustomerForProperty(
  db: AppDatabase,
  property: Property,
  explicitCustomerId?: string | null
): Promise<string | null> {
  const targetExplicitId = explicitCustomerId || property.linkedCustomerId;

  // Trường hợp (1): Có explicitCustomerId được chỉ định (ví dụ khi bấm thêm BĐS từ trang chi tiết khách hàng)
  if (targetExplicitId) {
    const existingLinks = await db.customer_property_links
      .where("propertyId")
      .equals(property.id)
      .filter((l) => l.customerId === targetExplicitId && !l.isDeleted)
      .toArray();

    if (existingLinks.length === 0) {
      const now = Date.now();
      await db.customer_property_links.put({
        customerId: targetExplicitId,
        propertyId: property.id,
        role: CustomerRole.OWNER,
        updatedAt: now,
        isDeleted: false,
        isSynced: false
      });
    }
    return targetExplicitId;
  }

  const ownerPhone = (property.ownerPhone || "").trim();
  const ownerName = (property.ownerName || "").trim();

  // Không có thông tin chủ nhà và không có SĐT -> không xử lý
  if (!ownerPhone && !ownerName) return null;

  // Trường hợp (2): Đã có liên kết OWNER cho BĐS này chưa?
  const existingOwnerLinks = await db.customer_property_links
    .where("propertyId")
    .equals(property.id)
    .filter((l) => l.role === CustomerRole.OWNER && !l.isDeleted)
    .toArray();

  if (existingOwnerLinks.length > 0) {
    const existingOwnerLink = existingOwnerLinks[0];
    const cust = await db.customers.get(existingOwnerLink.customerId);
    if (cust) {
      const newName = ownerName.length > 0 ? ownerName : cust.name;
      const canonicalInputPhone = canonicalizeVietnamesePhone(ownerPhone);
      const newPhone = canonicalInputPhone.length > 0 ? canonicalInputPhone : cust.phone;

      if (cust.name !== newName || cust.phone !== newPhone) {
        await db.customers.update(cust.id, {
          name: newName,
          nameNormalized: normalizeVietnamese(newName),
          phone: newPhone,
          isSynced: false,
          updatedAt: Date.now()
        });
      }
      return cust.id;
    }
  }

  // Trường hợp (3): Chưa có chủ -> Tái sử dụng khách hàng cũ:
  // - Có SĐT: tra theo SĐT canonical
  // - Không có SĐT: tra theo tên chuẩn hóa trong nhóm chủ không có SĐT
  const canonicalOwnerPhone = canonicalizeVietnamesePhone(ownerPhone);
  let reusableCustomer: Customer | undefined;

  if (canonicalOwnerPhone.length > 0) {
    reusableCustomer = await db.customers
      .filter((c) => !c.isDeleted && canonicalizeVietnamesePhone(c.phone) === canonicalOwnerPhone)
      .first();
  } else if (ownerName.length > 0) {
    const normName = normalizeVietnamese(ownerName);
    reusableCustomer = await db.customers
      .filter((c) => !c.isDeleted && (!c.phone || c.phone.trim() === "") && c.nameNormalized === normName)
      .first();
  }

  const finalName = ownerName.length > 0 ? ownerName : `Chủ sở hữu ${canonicalOwnerPhone || ownerPhone}`;
  let customerId: string;

  if (reusableCustomer) {
    customerId = reusableCustomer.id;
  } else {
    customerId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const newCustomer: Customer = {
      id: customerId,
      name: finalName,
      nameNormalized: normalizeVietnamese(finalName),
      phone: canonicalOwnerPhone,
      demandType: "Ký gửi BĐS",
      propertyType: property.propertyType,
      demandAreas: property.area,
      demandDirections: property.direction,
      priceMin: property.price,
      priceMax: property.price,
      note: `${AUTO_NOTE_PREFIX}: ${property.area}`,
      noteNormalized: normalizeVietnamese(`${AUTO_NOTE_PREFIX}: ${property.area}`),
      role: CustomerRole.OWNER,
      status: CustomerStatus.ACTIVE,
      updatedAt: now,
      isSynced: false,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };
    await db.customers.put(newCustomer);
  }

  // Tạo liên kết CustomerPropertyLink
  const existingLinksForPair = await db.customer_property_links
    .where("propertyId")
    .equals(property.id)
    .filter((l) => l.customerId === customerId && l.role === CustomerRole.OWNER && !l.isDeleted)
    .toArray();

  if (existingLinksForPair.length === 0) {
    await db.customer_property_links.put({
      customerId,
      propertyId: property.id,
      role: CustomerRole.OWNER,
      updatedAt: Date.now(),
      isDeleted: false,
      isSynced: false
    });
  }

  return customerId;
}
