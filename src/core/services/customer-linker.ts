import { AppDatabase } from "../../data/local/db";
import { Property } from "../models/property";
import { Customer } from "../models/customer";
import { CustomerRole, CustomerStatus } from "../models/enums";
import { canonicalizeVietnamesePhone, normalizeVietnamese } from "../utils/vietnamese";

export const AUTO_NOTE_PREFIX = "Nhu cầu tự động từ BĐS";

export type OwnerSaveNotice =
  | { type: "NewOwnerCreated"; name: string }
  | { type: "OwnerRenamed"; newName: string; otherPropertyCount: number };

export function ownerSaveNoticeText(notice: OwnerSaveNotice, isLivestream: boolean = false): string {
  switch (notice.type) {
    case "NewOwnerCreated":
      return isLivestream
        ? "Đã thêm khách chủ nhà mới"
        : `Đã thêm khách chủ nhà mới: ${notice.name}`;
    case "OwnerRenamed":
      if (notice.otherPropertyCount > 0) {
        return isLivestream
          ? `Đã đổi tên chủ ở cả ${notice.otherPropertyCount} căn khác`
          : `Đã đổi tên chủ thành ${notice.newName} ở cả ${notice.otherPropertyCount} căn khác`;
      }
      return isLivestream
        ? "Đã đổi tên khách"
        : `Đã đổi tên khách thành ${notice.newName}`;
  }
}

/**
 * Tìm kiếm khách hàng theo tên (chuẩn Android CustomerDao.searchOwnersByName):
 * Tìm mọi khách chưa xóa có nameNormalized chứa từ khóa (độ dài >= 2),
 * Ưu tiên role = 'OWNER' lên trước, sau đó xếp theo tên, giới hạn 5 kết quả.
 */
export function searchOwnersByNameList(customers: Customer[], query: string): Customer[] {
  // Như CustomerDao.searchOwnersByName: không chặn độ dài (ngưỡng >= 2 ký tự nằm ở searchOwnersByName)
  const norm = normalizeVietnamese(query.trim());
  if (!norm) return [];
  return customers
    .filter((c) => !c.isDeleted && normalizeVietnamese(c.nameNormalized || c.name).includes(norm))
    .sort((a, b) => {
      const aIsOwner = a.role === CustomerRole.OWNER ? 1 : 0;
      const bIsOwner = b.role === CustomerRole.OWNER ? 1 : 0;
      if (bIsOwner !== aIsOwner) return bIsOwner - aIsOwner;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 5);
}

export async function searchOwnersByName(db: AppDatabase, query: string): Promise<Customer[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const all = await db.customers.filter((c) => !c.isDeleted).toArray();
  return searchOwnersByNameList(all, trimmed);
}

export function findCustomerByPhoneInList(customers: Customer[], phone: string): Customer | null {
  const trimmed = phone.trim();
  if (trimmed.length < 8) return null;
  const canonical = canonicalizeVietnamesePhone(trimmed);
  return (
    customers.find(
      (c) => !c.isDeleted && Boolean(c.phone && canonicalizeVietnamesePhone(c.phone) === canonical)
    ) || null
  );
}

export async function findCustomerByPhone(db: AppDatabase, phone: string): Promise<Customer | null> {
  const trimmed = phone.trim();
  if (trimmed.length < 8) return null;
  const canonical = canonicalizeVietnamesePhone(trimmed);
  const found = await db.customers
    .filter((c) => !c.isDeleted && Boolean(c.phone && canonicalizeVietnamesePhone(c.phone) === canonical))
    .first();
  return found || null;
}

export interface OwnerFormFields {
  ownerName: string;
  ownerPhone: string;
  linkedCustomerId: string | null;
}

export function handleOwnerNameChangeHelper(
  current: OwnerFormFields,
  newName: string
): OwnerFormFields {
  const unlinked = current.linkedCustomerId && newName !== current.ownerName ? null : current.linkedCustomerId;
  return {
    ...current,
    ownerName: newName,
    linkedCustomerId: unlinked
  };
}

export function handleOwnerPhoneChangeHelper(
  current: OwnerFormFields,
  newPhone: string
): OwnerFormFields {
  const unlinked = current.linkedCustomerId && newPhone !== current.ownerPhone ? null : current.linkedCustomerId;
  return {
    ...current,
    ownerPhone: newPhone,
    linkedCustomerId: unlinked
  };
}

export function handleSelectSuggestedOwnerHelper(
  customer: Customer
): OwnerFormFields {
  return {
    linkedCustomerId: customer.id,
    ownerName: customer.name,
    ownerPhone: customer.phone || ""
  };
}

export interface EnsureCustomerResult {
  customerId: string | null;
  notice: OwnerSaveNotice | null;
}

/**
 * Lưu chủ nhà từ form SP theo chuẩn Android (reconcileOwnerLink & saveFromForm):
 * - Nếu linkedCustomerId được gán tường minh (không đổi): liên kết và không báo gì (notice = null).
 * - Nếu không có linkedCustomerId:
 *   + Cả tên và SĐT trống: huỷ liên kết.
 *   + Khách mới hoàn toàn: tạo khách chủ nhà mới -> báo NewOwnerCreated.
 *   + Đổi tên của chính chủ đang gắn với căn này: đổi tên khách và cập nhật ownerName ở các căn khác
 *     của khách đó -> báo OwnerRenamed (kèm số căn khác bị đổi theo).
 *   + Khớp khách cũ không phải chủ căn này: tái sử dụng mà không đổi tên -> notice = null.
 */
export async function savePropertyOwnerFromForm(
  db: AppDatabase,
  property: Property,
  linkedCustomerId?: string | null
): Promise<EnsureCustomerResult> {
  const targetExplicitId = linkedCustomerId || property.linkedCustomerId;
  const now = Date.now();

  // (1) Có explicitCustomerId được chỉ định
  if (targetExplicitId) {
    const existingOwnerLink = await db.customer_property_links
      .where("propertyId")
      .equals(property.id)
      .filter((l) => l.customerId === targetExplicitId && l.role === CustomerRole.OWNER && !l.isDeleted)
      .first();

    // Soft-delete các liên kết OWNER khác (KHÔNG động vào CO_OWNER như Android)
    const otherOwnerLinks = await db.customer_property_links
      .where("propertyId")
      .equals(property.id)
      .filter((l) => l.role === CustomerRole.OWNER && l.customerId !== targetExplicitId && !l.isDeleted)
      .toArray();

    for (const link of otherOwnerLinks) {
      await db.customer_property_links.update([link.customerId, property.id], {
        isDeleted: true,
        updatedAt: now,
        isSynced: false
      });
      await db.enqueueOutbox("LINK", `${link.customerId}:::${property.id}`, "DELETE");
    }

    if (!existingOwnerLink) {
      const existingLink = await db.customer_property_links.get([targetExplicitId, property.id]);
      await db.customer_property_links.put({
        customerId: targetExplicitId,
        propertyId: property.id,
        role: CustomerRole.OWNER,
        viewDate: existingLink?.viewDate ?? null,
        viewNote: existingLink?.viewNote ?? null,
        updatedAt: now,
        isDeleted: false,
        isSynced: false
      });
      await db.enqueueOutbox("LINK", `${targetExplicitId}:::${property.id}`, "UPSERT");
    }
    return { customerId: targetExplicitId, notice: null };
  }

  // (2) AutoDetectOrCreate khi linkedCustomerId == null
  const rawPhone = (property.ownerPhone || "").trim();
  const rawName = (property.ownerName || "").trim();

  // Không có thông tin chủ nhà và không có SĐT -> soft-delete link OWNER cũ nếu có
  if (!rawPhone && !rawName) {
    const activeOwnerLinks = await db.customer_property_links
      .where("propertyId")
      .equals(property.id)
      .filter((l) => l.role === CustomerRole.OWNER && !l.isDeleted)
      .toArray();

    for (const link of activeOwnerLinks) {
      await db.customer_property_links.update([link.customerId, property.id], {
        isDeleted: true,
        updatedAt: now,
        isSynced: false
      });
      await db.enqueueOutbox("LINK", `${link.customerId}:::${property.id}`, "DELETE");
    }
    return { customerId: null, notice: null };
  }

  const canonicalOwnerPhone = canonicalizeVietnamesePhone(rawPhone);
  let reusableCustomer: Customer | undefined;

  if (canonicalOwnerPhone.length > 0) {
    reusableCustomer = await db.customers
      .filter((c) => !c.isDeleted && Boolean(c.phone && canonicalizeVietnamesePhone(c.phone) === canonicalOwnerPhone))
      .first();
  } else if (rawName.length > 0) {
    const normName = normalizeVietnamese(rawName);
    reusableCustomer = await db.customers
      .filter((c) => !c.isDeleted && (!c.phone || c.phone.trim() === "") && c.nameNormalized === normName)
      .first();
  }

  const activeOwnerLinks = await db.customer_property_links
    .where("propertyId")
    .equals(property.id)
    .filter((l) => l.role === CustomerRole.OWNER && !l.isDeleted)
    .toArray();

  if (!reusableCustomer) {
    // Tạo khách chủ nhà mới
    const finalName = rawName.length > 0 ? rawName : `Chủ sở hữu ${canonicalOwnerPhone || rawPhone}`;
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
    await db.enqueueOutbox("CUSTOMER", newCustomer.id, "UPSERT");

    // Soft-delete các liên kết OWNER khác
    for (const link of activeOwnerLinks) {
      await db.customer_property_links.update([link.customerId, property.id], {
        isDeleted: true,
        updatedAt: now,
        isSynced: false
      });
      await db.enqueueOutbox("LINK", `${link.customerId}:::${property.id}`, "DELETE");
    }

    const existingPairLink = await db.customer_property_links.get([customerId, property.id]);
    await db.customer_property_links.put({
      customerId,
      propertyId: property.id,
      role: CustomerRole.OWNER,
      viewDate: existingPairLink?.viewDate ?? null,
      viewNote: existingPairLink?.viewNote ?? null,
      updatedAt: now,
      isDeleted: false,
      isSynced: false
    });
    await db.enqueueOutbox("LINK", `${customerId}:::${property.id}`, "UPSERT");

    return {
      customerId,
      notice: { type: "NewOwnerCreated", name: finalName }
    };
  }

  // Tái sử dụng khách cũ
  const targetCustomerId = reusableCustomer.id;
  const alreadyLinked = activeOwnerLinks.some((l) => l.customerId === targetCustomerId);
  const isRenamingCurrentOwner =
    alreadyLinked && rawName.length > 0 && rawName !== reusableCustomer.name;

  let otherOwnedPropertyIds: string[] = [];

  if (isRenamingCurrentOwner) {
    const custLinks = await db.customer_property_links
      .where("customerId")
      .equals(targetCustomerId)
      .filter((l) => l.role === CustomerRole.OWNER && !l.isDeleted && l.propertyId !== property.id)
      .toArray();
    otherOwnedPropertyIds = Array.from(new Set(custLinks.map((l) => l.propertyId)));

    await db.customers.update(targetCustomerId, {
      name: rawName,
      nameNormalized: normalizeVietnamese(rawName),
      updatedAt: now,
      isSynced: false
    });
    await db.enqueueOutbox("CUSTOMER", targetCustomerId, "UPSERT");

    for (const otherId of otherOwnedPropertyIds) {
      const other = await db.properties.get(otherId);
      if (!other || other.isDeleted) continue;
      await db.properties.update(otherId, {
        ownerName: rawName,
        updatedAt: now,
        isTextSynced: false
      });
      await db.enqueueOutbox("PROPERTY", otherId, "UPSERT");
    }
  }

  // Soft-delete các liên kết OWNER khác
  const linksToSoftDelete = activeOwnerLinks.filter((l) => l.customerId !== targetCustomerId);
  for (const link of linksToSoftDelete) {
    await db.customer_property_links.update([link.customerId, property.id], {
      isDeleted: true,
      updatedAt: now,
      isSynced: false
    });
    await db.enqueueOutbox("LINK", `${link.customerId}:::${property.id}`, "DELETE");
  }

  if (!alreadyLinked) {
    const existingPairLink = await db.customer_property_links.get([targetCustomerId, property.id]);
    await db.customer_property_links.put({
      customerId: targetCustomerId,
      propertyId: property.id,
      role: CustomerRole.OWNER,
      viewDate: existingPairLink?.viewDate ?? null,
      viewNote: existingPairLink?.viewNote ?? null,
      updatedAt: now,
      isDeleted: false,
      isSynced: false
    });
    await db.enqueueOutbox("LINK", `${targetCustomerId}:::${property.id}`, "UPSERT");
  }

  const notice: OwnerSaveNotice | null = isRenamingCurrentOwner
    ? {
        type: "OwnerRenamed",
        newName: rawName,
        otherPropertyCount: otherOwnedPropertyIds.length
      }
    : null;

  return { customerId: targetCustomerId, notice };
}

/**
 * Tự động tìm hoặc tạo hồ sơ Chủ nhà (OWNER) khi thêm/sửa một BĐS
 * và tạo liên kết CustomerPropertyLink tương ứng (giữ tương thích ngược).
 */
export async function ensureCustomerForProperty(
  db: AppDatabase,
  property: Property,
  explicitCustomerId?: string | null
): Promise<string | null> {
  const result = await savePropertyOwnerFromForm(db, property, explicitCustomerId);
  return result.customerId;
}
