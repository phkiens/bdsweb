import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { AppDatabase } from "../../src/data/local/db";
import {
  addCoOwner,
  addNewCoOwner,
  removeCoOwner,
  getCoOwners,
  reconcileOwnerStatus,
  getActiveOwnerAndCoOwnerLinksForProperty
} from "../../src/core/services/co-owner";
import { ensureCustomerForProperty } from "../../src/core/services/customer-linker";
import { calculateOwnerPropertyStats } from "../../src/core/engine/customer-filter";
import { buildMergedActivityTimeline, canAddViewingLink } from "../../src/core/engine/activity-timeline-engine";
import { CustomerRole, CustomerPropertyRole, CustomerStatus, PropertyStatus } from "../../src/core/models/enums";
import { createDefaultProperty, Property } from "../../src/core/models/property";
import { Customer } from "../../src/core/models/customer";

describe("Co-Owner Business Logic & Anti-Overwrite Tests (Parity với Android)", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase();
    await db.properties.clear();
    await db.customers.clear();
    await db.customer_property_links.clear();
    await db.sync_outbox.clear();
  });

  const createSampleCustomer = (overrides: Partial<Customer> & { id: string }): Customer => ({
    id: overrides.id,
    name: overrides.name || "Nguyễn Văn A",
    nameNormalized: (overrides.name || "Nguyễn Văn A").toLowerCase(),
    phone: overrides.phone || "0901234567",
    demandType: overrides.demandType || "Ký gửi BĐS",
    propertyType: overrides.propertyType || "Bán",
    demandAreas: overrides.demandAreas || "Quận 1",
    demandDirections: overrides.demandDirections || "Đông",
    priceMin: overrides.priceMin ?? 1.0,
    priceMax: overrides.priceMax ?? 10.0,
    note: overrides.note || "Khách hàng mẫu",
    noteNormalized: (overrides.note || "Khách hàng mẫu").toLowerCase(),
    role: overrides.role || CustomerRole.OWNER,
    status: overrides.status || CustomerStatus.ACTIVE,
    updatedAt: overrides.updatedAt ?? 1000,
    isSynced: overrides.isSynced ?? true,
    isDeleted: overrides.isDeleted ?? false,
    avatarPath: null,
    avatarDriveUrl: null
  });

  const createSampleProperty = (overrides: Partial<Property> & { id: string }): Property =>
    createDefaultProperty({
      id: overrides.id,
      area: overrides.area || "Quận 1",
      price: overrides.price ?? 5.0,
      areaSize: overrides.areaSize ?? 50.0,
      status: overrides.status || PropertyStatus.FOR_SALE,
      ownerName: overrides.ownerName || "Chủ chính",
      ownerPhone: overrides.ownerPhone || "0900000001",
      updatedAt: overrides.updatedAt ?? 1000,
      isVerified: true
    });

  // Case 1: Thêm khách hàng OWNER có sẵn làm đồng sở hữu
  it("Case 1: thêm khách có sẵn làm đồng sở hữu -> link CO_OWNER, BĐS không đổi chủ, getCoOwners trả về", async () => {
    const prop = createSampleProperty({ id: "prop-1", ownerName: "Chủ chính", ownerPhone: "0900000001", updatedAt: 1000 });
    await db.properties.put(prop);

    const coOwner = createSampleCustomer({
      id: "cust-co",
      name: "Đồng sở hữu A",
      phone: "0900000002",
      role: CustomerRole.OWNER
    });
    await db.customers.put(coOwner);

    const result = await addCoOwner(db, prop.id, coOwner.id);
    expect(result.type).toBe("Added");
    if (result.type === "Added") {
      expect(result.name).toBe("Đồng sở hữu A");
      expect(result.convertedFromBuyer).toBe(false);
    }

    const link = await db.customer_property_links.get([coOwner.id, prop.id]);
    expect(link).toBeDefined();
    expect(link?.role).toBe(CustomerPropertyRole.CO_OWNER);
    expect(link?.isDeleted).toBe(false);

    // BĐS chủ chính không bị thay đổi
    const propAfter = await db.properties.get(prop.id);
    expect(propAfter?.ownerName).toBe("Chủ chính");
    expect(propAfter?.ownerPhone).toBe("0900000001");
    expect(propAfter?.updatedAt).toBe(1000);

    const coOwners = await getCoOwners(db, prop.id);
    expect(coOwners.length).toBe(1);
    expect(coOwners[0].id).toBe(coOwner.id);
  });

  // Case 2: Thêm khách hàng BUYER -> đổi role sang OWNER, các thông tin khác giữ nguyên
  it("Case 2: thêm khách mua làm đồng sở hữu -> convertedFromBuyer = true, đổi role thành OWNER", async () => {
    const prop = createSampleProperty({ id: "prop-1" });
    await db.properties.put(prop);

    const buyer = createSampleCustomer({
      id: "cust-buyer",
      name: "Khách Mua B",
      phone: "0900000003",
      role: CustomerRole.BUYER,
      note: "Cần mua gấp",
      demandType: "Mua BĐS"
    });
    await db.customers.put(buyer);

    const result = await addCoOwner(db, prop.id, buyer.id);
    expect(result).toEqual({
      type: "Added",
      name: "Khách Mua B",
      convertedFromBuyer: true
    });

    const buyerAfter = await db.customers.get(buyer.id);
    expect(buyerAfter?.role).toBe(CustomerRole.OWNER);
    expect(buyerAfter?.note).toBe("Cần mua gấp");
    expect(buyerAfter?.demandType).toBe("Mua BĐS");
    expect(buyerAfter?.phone).toBe("0900000003");
  });

  // Case 3: Thêm chủ chính -> AlreadyMainOwner; thêm 2 lần -> AlreadyCoOwner
  it("Case 3: thêm chủ chính báo AlreadyMainOwner, thêm trùng báo AlreadyCoOwner", async () => {
    const prop = createSampleProperty({ id: "prop-1" });
    await db.properties.put(prop);

    const mainOwner = createSampleCustomer({ id: "cust-main", name: "Chủ chính", phone: "0900000001" });
    await db.customers.put(mainOwner);
    await db.customer_property_links.put({
      customerId: mainOwner.id,
      propertyId: prop.id,
      role: CustomerRole.OWNER,
      updatedAt: 1000,
      isDeleted: false,
      isSynced: true
    });

    const resMain = await addCoOwner(db, prop.id, mainOwner.id);
    expect(resMain.type).toBe("AlreadyMainOwner");

    const coOwner = createSampleCustomer({ id: "cust-co", name: "Đồng sở hữu", phone: "0900000002" });
    await db.customers.put(coOwner);

    const res1 = await addCoOwner(db, prop.id, coOwner.id);
    expect(res1.type).toBe("Added");

    const res2 = await addCoOwner(db, prop.id, coOwner.id);
    expect(res2.type).toBe("AlreadyCoOwner");
  });

  // Case 4: addNewCoOwner trùng SĐT -> dùng khách cũ; SĐT mới -> tạo khách mới role OWNER
  it("Case 4: addNewCoOwner trùng SĐT tái sử dụng khách cũ, SĐT mới tạo khách role OWNER", async () => {
    const prop = createSampleProperty({ id: "prop-1" });
    await db.properties.put(prop);

    const existing = createSampleCustomer({ id: "cust-existing", name: "Khách Cũ", phone: "0912345678" });
    await db.customers.put(existing);

    const countBefore = await db.customers.count();

    const res1 = await addNewCoOwner(db, prop.id, "Tên Khác", "0912345678");
    expect(res1.type).toBe("Added");
    expect(await db.customers.count()).toBe(countBefore);

    const link1 = await db.customer_property_links.get([existing.id, prop.id]);
    expect(link1?.role).toBe(CustomerPropertyRole.CO_OWNER);

    // Người mới hoàn toàn
    const res2 = await addNewCoOwner(db, prop.id, "Người Mới Hoàn Toàn", "0988776655");
    expect(res2.type).toBe("Added");
    expect(await db.customers.count()).toBe(countBefore + 1);

    const newCust = await db.customers.where("phone").equals("0988776655").first();
    expect(newCust).toBeDefined();
    expect(newCust?.name).toBe("Người Mới Hoàn Toàn");
    expect(newCust?.role).toBe(CustomerRole.OWNER);
  });

  // Case 5: Đổi chủ chính sang người khác -> CO_OWNER vẫn giữ nguyên
  it("Case 5: đổi chủ chính sang khách khác vẫn giữ nguyên link CO_OWNER", async () => {
    const prop = createSampleProperty({ id: "prop-1", ownerName: "Chủ 1", ownerPhone: "0900000001" });
    await db.properties.put(prop);

    const owner1 = createSampleCustomer({ id: "cust-1", name: "Chủ 1", phone: "0900000001" });
    const owner2 = createSampleCustomer({ id: "cust-2", name: "Chủ 2", phone: "0900000002" });
    const coOwner = createSampleCustomer({ id: "cust-co", name: "Đồng sở hữu", phone: "0900000003" });
    await db.customers.bulkPut([owner1, owner2, coOwner]);

    await db.customer_property_links.put({
      customerId: owner1.id,
      propertyId: prop.id,
      role: CustomerRole.OWNER,
      isDeleted: false,
      isSynced: true,
      updatedAt: 1000
    });
    await addCoOwner(db, prop.id, coOwner.id);

    // Đổi chủ sang owner2
    await ensureCustomerForProperty(db, prop, owner2.id);

    // Link CO_OWNER vẫn active
    const coLink = await db.customer_property_links.get([coOwner.id, prop.id]);
    expect(coLink).toBeDefined();
    expect(coLink?.role).toBe(CustomerPropertyRole.CO_OWNER);
    expect(coLink?.isDeleted).toBe(false);

    // Link owner2 là OWNER
    const owner2Link = await db.customer_property_links.get([owner2.id, prop.id]);
    expect(owner2Link).toBeDefined();
    expect(owner2Link?.role).toBe(CustomerRole.OWNER);
    expect(owner2Link?.isDeleted).toBe(false);

    // Link owner1 cũ bị soft delete
    const owner1Link = await db.customer_property_links.get([owner1.id, prop.id]);
    expect(owner1Link?.isDeleted).toBe(true);
  });

  // Case 6: Đổi chủ chính sang đúng người đang là đồng sở hữu -> link trở thành OWNER
  it("Case 6: nâng đồng sở hữu lên làm chủ chính -> link thành OWNER và ra khỏi getCoOwners", async () => {
    const prop = createSampleProperty({ id: "prop-1", ownerName: "Chủ 1", ownerPhone: "0900000001" });
    await db.properties.put(prop);

    const owner1 = createSampleCustomer({ id: "cust-1", name: "Chủ 1", phone: "0900000001" });
    const coOwner = createSampleCustomer({ id: "cust-co", name: "Đồng sở hữu", phone: "0900000002" });
    await db.customers.bulkPut([owner1, coOwner]);

    await db.customer_property_links.put({
      customerId: owner1.id,
      propertyId: prop.id,
      role: CustomerRole.OWNER,
      isDeleted: false,
      isSynced: true,
      updatedAt: 1000
    });
    await addCoOwner(db, prop.id, coOwner.id);

    expect((await getCoOwners(db, prop.id)).length).toBe(1);

    // Nâng coOwner lên làm chủ chính
    await ensureCustomerForProperty(db, prop, coOwner.id);

    const linkAfter = await db.customer_property_links.get([coOwner.id, prop.id]);
    expect(linkAfter?.role).toBe(CustomerRole.OWNER);
    expect(linkAfter?.isDeleted).toBe(false);

    const coOwnersAfter = await getCoOwners(db, prop.id);
    expect(coOwnersAfter.some((c) => c.id === coOwner.id)).toBe(false);
  });

  // Case 7: removeCoOwner soft delete link; gọi với main owner không làm gì
  it("Case 7: removeCoOwner xóa mềm link, gọi với main owner không làm gì", async () => {
    const prop = createSampleProperty({ id: "prop-1" });
    await db.properties.put(prop);

    const mainOwner = createSampleCustomer({ id: "cust-main", name: "Chủ chính", phone: "0900000001" });
    const coOwner = createSampleCustomer({ id: "cust-co", name: "Đồng sở hữu", phone: "0900000002" });
    await db.customers.bulkPut([mainOwner, coOwner]);

    await db.customer_property_links.put({
      customerId: mainOwner.id,
      propertyId: prop.id,
      role: CustomerRole.OWNER,
      isDeleted: false,
      isSynced: true,
      updatedAt: 1000
    });
    await addCoOwner(db, prop.id, coOwner.id);

    // Gỡ đồng sở hữu
    await removeCoOwner(db, prop.id, coOwner.id);
    const coLink = await db.customer_property_links.get([coOwner.id, prop.id]);
    expect(coLink?.isDeleted).toBe(true);

    // Gọi với main owner không làm gì
    await removeCoOwner(db, prop.id, mainOwner.id);
    const mainLink = await db.customer_property_links.get([mainOwner.id, prop.id]);
    expect(mainLink?.isDeleted).toBe(false);
    expect(mainLink?.role).toBe(CustomerRole.OWNER);
  });

  // Case 8: Khi BĐS bán hết (SOLD) -> co-owner chuyển sang CLOSED
  it("Case 8: BĐS bán hết và đồng sở hữu không còn căn active -> chuyển CLOSED", async () => {
    const prop = createSampleProperty({ id: "prop-1", status: PropertyStatus.FOR_SALE });
    await db.properties.put(prop);

    const mainOwner = createSampleCustomer({ id: "cust-main", role: CustomerRole.OWNER });
    const coOwner = createSampleCustomer({ id: "cust-co", role: CustomerRole.OWNER });
    await db.customers.bulkPut([mainOwner, coOwner]);

    await db.customer_property_links.put({
      customerId: mainOwner.id,
      propertyId: prop.id,
      role: CustomerRole.OWNER,
      isDeleted: false,
      isSynced: true,
      updatedAt: 1000
    });
    await addCoOwner(db, prop.id, coOwner.id);

    expect((await db.customers.get(coOwner.id))?.status).toBe(CustomerStatus.ACTIVE);

    // Đánh dấu BĐS đã bán
    await db.properties.update(prop.id, { status: PropertyStatus.SOLD });
    await reconcileOwnerStatus(db, coOwner.id);
    await reconcileOwnerStatus(db, mainOwner.id);

    expect((await db.customers.get(coOwner.id))?.status).toBe(CustomerStatus.CLOSED);
    expect((await db.customers.get(mainOwner.id))?.status).toBe(CustomerStatus.CLOSED);
  });

  // Anti-overwrite Test 1: Sửa/lưu căn không làm mất CO_OWNER
  it("Anti-overwrite 1: ensureCustomerForProperty khi sửa thông tin căn không làm mất link CO_OWNER", async () => {
    const prop = createSampleProperty({ id: "prop-1", ownerName: "Chủ A", ownerPhone: "0900000001" });
    await db.properties.put(prop);

    const owner = createSampleCustomer({ id: "cust-owner", name: "Chủ A", phone: "0900000001" });
    const coOwner = createSampleCustomer({ id: "cust-co", name: "Đồng sở hữu", phone: "0900000002" });
    await db.customers.bulkPut([owner, coOwner]);

    await db.customer_property_links.put({
      customerId: owner.id,
      propertyId: prop.id,
      role: CustomerRole.OWNER,
      isDeleted: false,
      isSynced: true,
      updatedAt: 1000
    });
    await addCoOwner(db, prop.id, coOwner.id);

    // Lưu lại BĐS với tên mới của chủ chính
    const updatedProp = { ...prop, ownerName: "Chủ A (Đổi tên)" };
    await db.properties.put(updatedProp);
    await ensureCustomerForProperty(db, updatedProp);

    // Kiểm tra link CO_OWNER vẫn sống
    const coLink = await db.customer_property_links.get([coOwner.id, prop.id]);
    expect(coLink).toBeDefined();
    expect(coLink?.role).toBe(CustomerPropertyRole.CO_OWNER);
    expect(coLink?.isDeleted).toBe(false);
  });

  // Anti-overwrite Test 2: Hoạt động xem nhà KHÔNG tính CO_OWNER
  it("Anti-overwrite 2: activity-timeline không đưa CO_OWNER vào danh sách người xem nhà", () => {
    const links = [
      {
        customerId: "cust-co",
        propertyId: "prop-1",
        role: CustomerPropertyRole.CO_OWNER,
        viewDate: "10/10/2026",
        viewNote: "Ghi chú đồng sở hữu",
        updatedAt: 1000,
        isDeleted: false,
        isSynced: true
      },
      {
        customerId: "cust-viewer",
        propertyId: "prop-1",
        role: CustomerPropertyRole.VIEWER,
        viewDate: "11/10/2026",
        viewNote: "Khách khen nhà đẹp",
        updatedAt: 2000,
        isDeleted: false,
        isSynced: true
      }
    ];

    const customersMap = new Map<string, Customer>([
      ["cust-co", createSampleCustomer({ id: "cust-co", name: "Anh Đồng Sở Hữu" })],
      ["cust-viewer", createSampleCustomer({ id: "cust-viewer", name: "Chị Người Xem" })]
    ]);

    const timeline = buildMergedActivityTimeline("", links as any, customersMap);
    const viewings = timeline.filter((i) => i.type === "VIEWING");

    expect(viewings.length).toBe(1);
    expect((viewings[0] as any).customerName).toBe("Chị Người Xem");
  });

  // Anti-overwrite Test 3: Không thể thêm người đang là đồng sở hữu làm người xem
  it("Anti-overwrite 3: canAddViewingLink chặn việc gán thêm link cho người đã là CO_OWNER", () => {
    const existingLinks = [
      {
        customerId: "cust-co",
        propertyId: "prop-1",
        role: CustomerPropertyRole.CO_OWNER,
        updatedAt: 1000,
        isDeleted: false,
        isSynced: true
      }
    ];

    expect(canAddViewingLink("cust-co", "prop-1", existingLinks as any)).toBe(false);
    expect(canAddViewingLink("cust-other", "prop-1", existingLinks as any)).toBe(true);
  });

  // Thống kê chủ tính cả OWNER và CO_OWNER
  it("calculateOwnerPropertyStats tính cả BĐS sở hữu chính và đồng sở hữu", () => {
    const properties = [
      createSampleProperty({ id: "prop-1", status: PropertyStatus.FOR_SALE }),
      createSampleProperty({ id: "prop-2", status: PropertyStatus.SOLD })
    ];

    const links = [
      {
        customerId: "cust-1",
        propertyId: "prop-1",
        role: CustomerRole.OWNER,
        isDeleted: false,
        isSynced: true,
        updatedAt: 1000
      },
      {
        customerId: "cust-1",
        propertyId: "prop-2",
        role: CustomerPropertyRole.CO_OWNER,
        isDeleted: false,
        isSynced: true,
        updatedAt: 2000
      }
    ];

    const stats = calculateOwnerPropertyStats(links as any, properties);
    expect(stats["cust-1"]).toBeDefined();
    expect(stats["cust-1"].totalCount).toBe(2);
    expect(stats["cust-1"].forSaleCount).toBe(1);
    expect(stats["cust-1"].soldCount).toBe(1);
  });

  // getActiveOwnerAndCoOwnerLinksForProperty lấy cả 2 loại link
  it("getActiveOwnerAndCoOwnerLinksForProperty trả về cả OWNER và CO_OWNER", async () => {
    await db.customer_property_links.bulkPut([
      { customerId: "c1", propertyId: "p1", role: CustomerRole.OWNER, updatedAt: 1000, isDeleted: false, isSynced: true },
      { customerId: "c2", propertyId: "p1", role: CustomerPropertyRole.CO_OWNER, updatedAt: 2000, isDeleted: false, isSynced: true },
      { customerId: "c3", propertyId: "p1", role: CustomerPropertyRole.VIEWER, updatedAt: 3000, isDeleted: false, isSynced: true },
      { customerId: "c4", propertyId: "p1", role: CustomerPropertyRole.CO_OWNER, updatedAt: 4000, isDeleted: true, isSynced: true }
    ]);

    const activeLinks = await getActiveOwnerAndCoOwnerLinksForProperty(db, "p1");
    expect(activeLinks.length).toBe(2);
    expect(activeLinks.map((l) => l.customerId).sort()).toEqual(["c1", "c2"]);
  });
});
