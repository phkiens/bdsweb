import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { AppDatabase } from "../../../src/data/local/db";
import { Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import { ensureCustomerForProperty } from "../../../src/core/services/customer-linker";

describe("FEATURE PARITY: PROP-AUTO-CUSTOMER-LINK-001", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase();
    await db.properties.clear();
    await db.customers.clear();
    await db.customer_property_links.clear();
  });

  it("[REPRODUCTION & VERIFICATION] Tự động tạo hồ sơ Chủ nhà (OWNER) và liên kết khi lưu BĐS mới có Tên và SĐT", async () => {
    const prop: Property = {
      id: "prop-nam-001",
      area: "123 Lê Quang Định, Bình Thạnh",
      latitude: 10.801,
      longitude: 106.699,
      imagePath: null,
      driveMediaIds: null,
      driveFolderId: null,
      priceAtFolderCreation: null,
      documentUrl: "",
      areaSize: 60,
      price: 5.5,
      description: "Nhà mặt tiền",
      status: PropertyStatus.FOR_SALE,
      surveyDate: "2026-09-03",
      direction: "Đông Nam",
      ownerName: "Bác Nam",
      ownerPhone: "0903112233",
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
      linkedCustomerId: null,
      title: null,
      mapLink: null,
      extractedBy: null,
      createdAt: 1000,
      isVerified: true,
      lastEditedAt: 1000,
      r2MediaKeys: null
    };

    await db.properties.add(prop);

    // Gọi ensureCustomerForProperty
    const customerId = await ensureCustomerForProperty(db, prop);
    expect(customerId).toBeDefined();

    // 1. Kiểm tra Khách hàng được tự động tạo trong db.customers
    const customer = await db.customers.get(customerId!);
    expect(customer).toBeDefined();
    expect(customer?.name).toBe("Bác Nam");
    expect(customer?.phone).toBe("0903112233");
    expect(customer?.role).toBe("OWNER");
    expect(customer?.demandType).toBe("Ký gửi BĐS");

    // 2. Kiểm tra bản ghi liên kết được tạo trong db.customer_property_links
    const links = await db.customer_property_links
      .where({ customerId: customerId!, propertyId: prop.id })
      .toArray();
    expect(links.length).toBe(1);
    expect(links[0].role).toBe("OWNER");
    expect(links[0].isDeleted).toBe(false);
  });

  it("[REPRODUCTION & VERIFICATION] Tái sử dụng chủ nhà nếu số điện thoại trùng khớp canonical", async () => {
    // Đã có sẵn 1 chủ nhà với số điện thoại +84 903 112 233
    await db.customers.add({
      id: "cust-existing-001",
      name: "Bác Nam Gốc",
      nameNormalized: "bac nam goc",
      phone: "0903112233",
      demandType: "Ký gửi BĐS",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: "OWNER",
      status: "ACTIVE",
      updatedAt: 1000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    });

    const prop2: Property = {
      id: "prop-nam-002",
      area: "456 Phan Văn Trị",
      latitude: null,
      longitude: null,
      imagePath: null,
      driveMediaIds: null,
      driveFolderId: null,
      priceAtFolderCreation: null,
      documentUrl: "",
      areaSize: 80,
      price: 7.2,
      description: "",
      status: PropertyStatus.FOR_SALE,
      surveyDate: "",
      direction: "",
      ownerName: "Bác Nam",
      ownerPhone: "+84 903 112 233", // Khớp canonical với 0903112233
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
      linkedCustomerId: null,
      title: null,
      mapLink: null,
      extractedBy: null,
      createdAt: 2000,
      isVerified: true,
      lastEditedAt: 2000,
      r2MediaKeys: null
    };

    await db.properties.add(prop2);
    const linkedId = await ensureCustomerForProperty(db, prop2);

    // Không tạo thêm khách mới mà tái sử dụng cust-existing-001
    expect(linkedId).toBe("cust-existing-001");
    const totalCustomers = await db.customers.count();
    expect(totalCustomers).toBe(1);

    // Bản ghi liên kết được tạo cho căn nhà thứ 2
    const links = await db.customer_property_links
      .where({ customerId: "cust-existing-001", propertyId: "prop-nam-002" })
      .toArray();
    expect(links.length).toBe(1);
    expect(links[0].role).toBe("OWNER");
  });

  it("[REPRODUCTION & VERIFICATION] Hỗ trợ liên kết trực tiếp khi có explicitCustomerId (?linkedCustomerId=...)", async () => {
    const prop3: Property = {
      id: "prop-linked-003",
      area: "789 Nơ Trang Long",
      latitude: null,
      longitude: null,
      imagePath: null,
      driveMediaIds: null,
      driveFolderId: null,
      priceAtFolderCreation: null,
      documentUrl: "",
      areaSize: 50,
      price: 4.0,
      description: "",
      status: PropertyStatus.FOR_SALE,
      surveyDate: "",
      direction: "",
      ownerName: "",
      ownerPhone: "",
      propertyType: "Nhà",
      needToViewToday: false,
      isDraft: false,
      isTextSynced: false,
      rawText: "",
      diary: "",
      updatedAt: 3000,
      isDeleted: false,
      propertyDetailJsonFileId: null,
      txtFileId: null,
      isMediaSynced: false,
      linkedCustomerId: "cust-direct-123",
      title: null,
      mapLink: null,
      extractedBy: null,
      createdAt: 3000,
      isVerified: true,
      lastEditedAt: 3000,
      r2MediaKeys: null
    };

    await db.properties.add(prop3);
    const resultId = await ensureCustomerForProperty(db, prop3, "cust-direct-123");
    expect(resultId).toBe("cust-direct-123");

    const links = await db.customer_property_links
      .where({ customerId: "cust-direct-123", propertyId: "prop-linked-003" })
      .toArray();
    expect(links.length).toBe(1);
    expect(links[0].role).toBe("OWNER");
  });
});
