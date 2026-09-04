import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { AppDatabase } from "../../../src/data/local/db";
import { Property } from "../../../src/core/models/property";
import { Customer } from "../../../src/core/models/customer";
import { CustomerRole, CustomerStatus, PropertyStatus } from "../../../src/core/models/enums";
import { ensureCustomerForProperty } from "../../../src/core/services/customer-linker";

describe("FEATURE PARITY: CRM-LINK-CREATION-002 (Tạo liên kết BĐS và Khách hàng)", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase();
    await db.properties.clear();
    await db.customers.clear();
    await db.customer_property_links.clear();
  });

  it("[REPRODUCTION & VERIFICATION] Thêm BĐS từ màn hình Khách hàng (?linkedCustomerId=...) ghi nhận liên kết hai chiều trong customer_property_links", async () => {
    // 1. Khách hàng ban đầu trong CRM
    const customer: Customer = {
      id: "cust-hoang-001",
      name: "Anh Hoàng",
      nameNormalized: "anh hoang",
      phone: "0912345678",
      demandType: "Ký gửi BĐS",
      propertyType: "Nhà",
      demandAreas: "Bình Thạnh",
      demandDirections: "Đông",
      priceMin: 3.5,
      priceMax: 4.5,
      note: "Chủ nhà gửi bán nhà mặt tiền",
      noteNormalized: "chu nha gui ban nha mat tien",
      role: CustomerRole.OWNER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 1000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };
    await db.customers.add(customer);

    // 2. Thêm BĐS từ màn hình khách hàng này (có param linkedCustomerId)
    const newProp: Property = {
      id: "prop-hoang-001",
      area: "45/2 Bạch Đằng, Bình Thạnh",
      latitude: 10.802,
      longitude: 106.7,
      imagePath: null,
      driveMediaIds: null,
      driveFolderId: null,
      priceAtFolderCreation: null,
      documentUrl: "",
      areaSize: 55,
      price: 4.2,
      description: "Nhà 1 trệt 2 lầu",
      status: PropertyStatus.FOR_SALE,
      surveyDate: "2026-09-04",
      direction: "Đông",
      ownerName: "Anh Hoàng",
      ownerPhone: "0912345678",
      propertyType: "Nhà",
      needToViewToday: false,
      isDraft: false,
      isTextSynced: false,
      rawText: "",
      diary: "",
      updatedAt: 2000,
      isDeleted: false,
      propertyDetailJsonFileId: null,
      txtFileId: null,
      isMediaSynced: false,
      linkedCustomerId: "cust-hoang-001",
      title: null,
      mapLink: null,
      extractedBy: null,
      createdAt: 2000,
      isVerified: true,
      lastEditedAt: 2000,
      r2MediaKeys: null
    };
    await db.properties.add(newProp);

    // Gọi ensureCustomerForProperty với explicitCustomerId
    const linkedCustomerId = await ensureCustomerForProperty(db, newProp, "cust-hoang-001");
    expect(linkedCustomerId).toBe("cust-hoang-001");

    // 3. Kiểm tra bản ghi trong bảng customer_property_links
    const links = await db.customer_property_links
      .where("customerId")
      .equals("cust-hoang-001")
      .filter((l) => !l.isDeleted)
      .toArray();

    expect(links.length).toBe(1);
    expect(links[0].propertyId).toBe("prop-hoang-001");
    expect(links[0].role).toBe(CustomerRole.OWNER);

    // 4. Kiểm tra truy vấn danh sách BĐS liên kết của khách hàng
    const linkedProps = await db.properties
      .filter((p) => !p.isDeleted && links.map((l) => l.propertyId).includes(p.id))
      .toArray();

    expect(linkedProps.length).toBe(1);
    expect(linkedProps[0].id).toBe("prop-hoang-001");
    expect(linkedProps[0].area).toBe("45/2 Bạch Đằng, Bình Thạnh");
  });

  it("Không tạo bản ghi liên kết trùng lặp nếu đã tồn tại cặp customerId - propertyId", async () => {
    const prop: Property = {
      id: "prop-dup-001",
      area: "100 Xô Viết Nghệ Tĩnh",
      latitude: null,
      longitude: null,
      imagePath: null,
      driveMediaIds: null,
      driveFolderId: null,
      priceAtFolderCreation: null,
      documentUrl: "",
      areaSize: 40,
      price: 3.0,
      description: "",
      status: PropertyStatus.FOR_SALE,
      surveyDate: "",
      direction: "",
      ownerName: "Anh Hoàng",
      ownerPhone: "0912345678",
      propertyType: "Nhà",
      needToViewToday: false,
      isDraft: false,
      isTextSynced: false,
      rawText: "",
      diary: "",
      updatedAt: 1000,
      isDeleted: false,
      propertyDetailJsonFileId: null,
      txtFileId: null,
      isMediaSynced: false,
      linkedCustomerId: "cust-dup-123",
      title: null,
      mapLink: null,
      extractedBy: null,
      createdAt: 1000,
      isVerified: true,
      lastEditedAt: 1000,
      r2MediaKeys: null
    };

    await db.properties.add(prop);

    // Gọi lần 1
    await ensureCustomerForProperty(db, prop, "cust-dup-123");
    // Gọi lần 2 (giả lập submit lại hoặc edit)
    await ensureCustomerForProperty(db, prop, "cust-dup-123");

    const links = await db.customer_property_links
      .where("customerId")
      .equals("cust-dup-123")
      .filter((l) => l.propertyId === "prop-dup-001" && !l.isDeleted)
      .toArray();

    expect(links.length).toBe(1);
  });
});
