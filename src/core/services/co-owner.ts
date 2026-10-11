import { AppDatabase } from "../../data/local/db";
import { Customer, CustomerPropertyLink } from "../models/customer";
import { CustomerPropertyRole, CustomerRole, CustomerStatus, PropertyStatus } from "../models/enums";
import { canonicalizeVietnamesePhone, normalizeVietnamese } from "../utils/vietnamese";
import { syncManager } from "../../data/sync/sync-manager";
import { AUTO_NOTE_PREFIX } from "./customer-linker";

export type CoOwnerAddResult =
  | { type: "Added"; name: string; convertedFromBuyer: boolean }
  | { type: "AlreadyMainOwner" }
  | { type: "AlreadyCoOwner" }
  | { type: "NotFound" };

/**
 * Lấy danh sách đồng sở hữu (Customer) của BĐS theo thứ tự link updatedAt ASC.
 * Khớp với getCoOwnersForPropertyFlow / getCoOwnersFlow trong Android.
 */
export async function getCoOwners(db: AppDatabase, propertyId: string): Promise<Customer[]> {
  const links = await db.customer_property_links
    .where("propertyId")
    .equals(propertyId)
    .filter((l) => l.role === CustomerPropertyRole.CO_OWNER && !l.isDeleted)
    .toArray();

  links.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));

  const coOwners: Customer[] = [];
  for (const link of links) {
    const customer = await db.customers.get(link.customerId);
    if (customer && !customer.isDeleted) {
      coOwners.push(customer);
    }
  }
  return coOwners;
}

/**
 * Lấy danh sách link của cả chủ chính (OWNER) và đồng sở hữu (CO_OWNER) đang hoạt động của BĐS.
 * Khớp với getActiveOwnerAndCoOwnerLinksForProperty trong CustomerDao.kt.
 */
export async function getActiveOwnerAndCoOwnerLinksForProperty(
  db: AppDatabase,
  propertyId: string
): Promise<CustomerPropertyLink[]> {
  return await db.customer_property_links
    .where("propertyId")
    .equals(propertyId)
    .filter(
      (l) =>
        (l.role === CustomerRole.OWNER || l.role === CustomerPropertyRole.CO_OWNER) &&
        !l.isDeleted
    )
    .toArray();
}

/**
 * Cập nhật trạng thái của chủ nhà/đồng sở hữu (ACTIVE vs CLOSED).
 * Nếu chủ không còn căn nào Đang bán hoặc Chờ khảo sát thì chuyển sang CLOSED.
 * Khớp 100% với reconcileOwnerStatus trong PropertyRepositoryImpl.kt của Android.
 */
export async function reconcileOwnerStatus(db: AppDatabase, ownerId: string): Promise<void> {
  try {
    const customer = await db.customers.get(ownerId);
    if (!customer || customer.role !== CustomerRole.OWNER) return;

    const links = await db.customer_property_links
      .where("customerId")
      .equals(ownerId)
      .filter(
        (l) =>
          (l.role === CustomerRole.OWNER || l.role === CustomerPropertyRole.CO_OWNER) &&
          !l.isDeleted
      )
      .toArray();

    const ownerPropIds = new Set(links.map((l) => l.propertyId));
    const allProps = await db.properties
      .filter((p) => !p.isDeleted && ownerPropIds.has(p.id))
      .toArray();

    const hasActiveProperty = allProps.some(
      (p) =>
        p.status === PropertyStatus.FOR_SALE ||
        p.status === PropertyStatus.PENDING_SURVEY
    );

    const targetStatus = hasActiveProperty ? CustomerStatus.ACTIVE : CustomerStatus.CLOSED;

    if (customer.status !== targetStatus) {
      const now = Date.now();
      await db.customers.update(ownerId, {
        status: targetStatus,
        updatedAt: now,
        isSynced: false
      });
      await db.enqueueOutbox("CUSTOMER", ownerId, "UPSERT");
      syncManager.pushChanges();
    }
  } catch (err) {
    console.error("Error in reconcileOwnerStatus:", err);
  }
}

/**
 * Thêm một khách hàng có sẵn làm đồng sở hữu của BĐS.
 * Khớp chính xác 100% với addCoOwner trong PropertyRepositoryImpl.kt của Android.
 */
export async function addCoOwner(
  db: AppDatabase,
  propertyId: string,
  customerId: string
): Promise<CoOwnerAddResult> {
  const customer = await db.customers.get(customerId);
  if (!customer || customer.isDeleted) {
    return { type: "NotFound" };
  }

  const property = await db.properties.get(propertyId);
  if (!property || property.isDeleted) {
    return { type: "NotFound" };
  }

  const existingLink = await db.customer_property_links.get([customerId, propertyId]);
  if (existingLink && !existingLink.isDeleted) {
    if (existingLink.role === CustomerRole.OWNER) {
      return { type: "AlreadyMainOwner" };
    }
    if (existingLink.role === CustomerPropertyRole.CO_OWNER) {
      return { type: "AlreadyCoOwner" };
    }
  }

  const now = Date.now();
  const roleWasChanged = customer.role !== CustomerRole.OWNER;

  if (roleWasChanged) {
    await db.customers.update(customerId, {
      role: CustomerRole.OWNER,
      updatedAt: now,
      isSynced: false
    });
    await db.enqueueOutbox("CUSTOMER", customerId, "UPSERT");
  }

  const newLink: CustomerPropertyLink = {
    customerId,
    propertyId,
    role: CustomerPropertyRole.CO_OWNER,
    viewDate: existingLink?.viewDate ?? null,
    viewNote: existingLink?.viewNote ?? null,
    updatedAt: now,
    isDeleted: false,
    isSynced: false
  };

  await db.customer_property_links.put(newLink);
  await db.enqueueOutbox("LINK", `${customerId}:::${propertyId}`, "UPSERT");

  await reconcileOwnerStatus(db, customerId);
  syncManager.pushChanges();

  return {
    type: "Added",
    name: customer.name,
    convertedFromBuyer: roleWasChanged
  };
}

/**
 * Thêm một người mới làm đồng sở hữu BĐS (kiểm tra chống trùng theo SĐT như Android).
 * Khớp 100% với addNewCoOwner trong PropertyRepositoryImpl.kt của Android.
 */
export async function addNewCoOwner(
  db: AppDatabase,
  propertyId: string,
  name: string,
  phone: string
): Promise<CoOwnerAddResult> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { type: "NotFound" };
  }

  const property = await db.properties.get(propertyId);
  if (!property || property.isDeleted) {
    return { type: "NotFound" };
  }

  const canonicalPhone = canonicalizeVietnamesePhone(phone.trim());
  if (canonicalPhone) {
    const existingCustomer = await db.customers
      .filter((c) => !c.isDeleted && canonicalizeVietnamesePhone(c.phone) === canonicalPhone)
      .first();

    if (existingCustomer) {
      return await addCoOwner(db, propertyId, existingCustomer.id);
    }
  }

  const newId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const newCustomer: Customer = {
    id: newId,
    name: trimmedName,
    nameNormalized: normalizeVietnamese(trimmedName),
    phone: canonicalPhone,
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
  await db.enqueueOutbox("CUSTOMER", newId, "UPSERT");

  return await addCoOwner(db, propertyId, newId);
}

/**
 * Gỡ đồng sở hữu khỏi BĐS (soft delete link role CO_OWNER).
 * Nếu gọi với chủ chính (role OWNER), hàm không làm gì cả.
 * Khớp 100% với removeCoOwner trong PropertyRepositoryImpl.kt của Android.
 */
export async function removeCoOwner(
  db: AppDatabase,
  propertyId: string,
  customerId: string
): Promise<void> {
  const link = await db.customer_property_links.get([customerId, propertyId]);
  if (!link || link.isDeleted || link.role !== CustomerPropertyRole.CO_OWNER) {
    return;
  }

  const now = Date.now();
  await db.customer_property_links.update([customerId, propertyId], {
    isDeleted: true,
    updatedAt: now,
    isSynced: false
  });
  await db.enqueueOutbox("LINK", `${customerId}:::${propertyId}`, "DELETE");

  await reconcileOwnerStatus(db, customerId);
  syncManager.pushChanges();
}
