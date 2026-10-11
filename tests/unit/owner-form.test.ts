import { describe, expect, it, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { AppDatabase } from "../../src/data/local/db";
import { Customer } from "../../src/core/models/customer";
import { CustomerRole, CustomerStatus } from "../../src/core/models/enums";
import { createDefaultProperty } from "../../src/core/models/property";
import {
  searchOwnersByNameList,
  searchOwnersByName,
  findCustomerByPhoneInList,
  handleOwnerNameChangeHelper,
  handleOwnerPhoneChangeHelper,
  handleSelectSuggestedOwnerHelper,
  savePropertyOwnerFromForm,
  ownerSaveNoticeText,
  OwnerSaveNotice
} from "../../src/core/services/customer-linker";
import { buildLocationUrl, buildCoordinateText } from "../../src/core/utils/maps";

function createCustomer(
  id: string,
  name: string,
  role: CustomerRole = CustomerRole.OWNER,
  phone: string = "0901234567",
  isDeleted: boolean = false
): Customer {
  return {
    id,
    name,
    nameNormalized: name.toLowerCase(),
    phone,
    demandType: "Ký gửi BĐS",
    propertyType: "Bán",
    demandAreas: "Hải An",
    demandDirections: "Đông",
    priceMin: 1.0,
    priceMax: 10.0,
    note: `Khách ${id}`,
    noteNormalized: `khach ${id}`,
    role,
    status: CustomerStatus.ACTIVE,
    updatedAt: 1000,
    isSynced: true,
    isDeleted,
    avatarPath: null,
    avatarDriveUrl: null
  };
}

describe("1. Tìm kiếm chủ nhà theo tên (CustomerOwnerSearchTest - Parity Android)", () => {
  it("searchOwnersByName tìm được cả non-owner và ưu tiên owner lên trước", () => {
    const buyer = createCustomer("c1", "Anh Khách", CustomerRole.BUYER);
    const owner = createCustomer("c2", "Bác Chủ", CustomerRole.OWNER);

    const results = searchOwnersByNameList([buyer, owner], "a");
    expect(results).toHaveLength(2);
    // Chủ nhà phải đứng trước dù "Anh Khách" đứng trước theo bảng chữ cái
    expect(results[0].name).toBe("Bác Chủ");
    expect(results[0].role).toBe(CustomerRole.OWNER);
    expect(results[1].name).toBe("Anh Khách");
    expect(results[1].role).toBe(CustomerRole.BUYER);
  });

  it("searchOwnersByName sắp xếp nhiều owner và non-owner đúng thứ tự", () => {
    const buyer1 = createCustomer("c1", "Nguyễn An", CustomerRole.BUYER);
    const buyer2 = createCustomer("c2", "Nguyễn Dũng", CustomerRole.BUYER);
    const owner1 = createCustomer("c3", "Nguyễn Bình", CustomerRole.OWNER);
    const owner2 = createCustomer("c4", "Nguyễn Cường", CustomerRole.OWNER);

    const results = searchOwnersByNameList([buyer1, buyer2, owner1, owner2], "nguyen");
    expect(results).toHaveLength(4);
    // OWNERs đứng trước, sắp xếp theo tên
    expect(results[0].name).toBe("Nguyễn Bình");
    expect(results[1].name).toBe("Nguyễn Cường");
    // Non-OWNERs đứng sau, sắp xếp theo tên
    expect(results[2].name).toBe("Nguyễn An");
    expect(results[3].name).toBe("Nguyễn Dũng");
  });

  it("searchOwnersByName loại trừ khách đã xóa", () => {
    const active = createCustomer("c1", "Nguyễn Văn Active", CustomerRole.BUYER, "0901234567", false);
    const deleted = createCustomer("c2", "Nguyễn Văn Deleted", CustomerRole.OWNER, "0901234567", true);

    const results = searchOwnersByNameList([active, deleted], "nguyen van");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("c1");
  });

  it("searchOwnersByName tôn trọng giới hạn LIMIT 5", () => {
    const list: Customer[] = [];
    for (let i = 1; i <= 8; i++) {
      list.push(
        createCustomer(
          `c${i}`,
          `Khách Hàng ${i}`,
          i % 2 === 0 ? CustomerRole.OWNER : CustomerRole.BUYER
        )
      );
    }

    const results = searchOwnersByNameList(list, "khach hang");
    expect(results).toHaveLength(5);
    // Tất cả 4 chủ nhà (2, 4, 6, 8) phải đứng trước
    const ownerCount = results.filter((c) => c.role === CustomerRole.OWNER).length;
    expect(ownerCount).toBe(4);
  });

  it("từ khóa dưới 2 ký tự trả về mảng rỗng (ngưỡng ở searchOwnersByName, như ViewModel Android)", async () => {
    const testDb = new AppDatabase();
    await testDb.customers.put(createCustomer("c1", "Anh Khách", CustomerRole.OWNER));
    expect(await searchOwnersByName(testDb, "a")).toHaveLength(0);
    expect(await searchOwnersByName(testDb, "  ")).toHaveLength(0);
    expect(await searchOwnersByName(testDb, "an")).toHaveLength(1);
    await testDb.delete();
  });
});

describe("2. Tương tác form chủ nhà (PropertyFormOwnerTest - Parity Android)", () => {
  const customer1 = createCustomer("cust_1", "Chủ Nhà A", CustomerRole.OWNER, "0912345678");
  const customer2 = createCustomer("cust_2", "Chủ Nhà B", CustomerRole.OWNER, "0987654321");

  it("updateOwnerName khi đã liên kết với tên khác -> hủy liên kết", () => {
    const initial = {
      ownerName: "Chủ Nhà A",
      ownerPhone: "0912345678",
      linkedCustomerId: "cust_1"
    };

    const updated = handleOwnerNameChangeHelper(initial, "Tên Khác");
    expect(updated.linkedCustomerId).toBeNull();
    expect(updated.ownerName).toBe("Tên Khác");
  });

  it("updateOwnerName khi đã liên kết với cùng tên -> giữ nguyên liên kết", () => {
    const initial = {
      ownerName: "Chủ Nhà A",
      ownerPhone: "0912345678",
      linkedCustomerId: "cust_1"
    };

    const updated = handleOwnerNameChangeHelper(initial, "Chủ Nhà A");
    expect(updated.linkedCustomerId).toBe("cust_1");
    expect(updated.ownerName).toBe("Chủ Nhà A");
  });

  it("updateOwnerPhone khi đã liên kết với SĐT khác -> hủy liên kết", () => {
    const initial = {
      ownerName: "Chủ Nhà A",
      ownerPhone: "0912345678",
      linkedCustomerId: "cust_1"
    };

    const updated = handleOwnerPhoneChangeHelper(initial, "0999999999");
    expect(updated.linkedCustomerId).toBeNull();
    expect(updated.ownerPhone).toBe("0999999999");
  });

  it("updateOwnerPhone khi đã liên kết với cùng SĐT -> giữ nguyên liên kết", () => {
    const initial = {
      ownerName: "Chủ Nhà A",
      ownerPhone: "0912345678",
      linkedCustomerId: "cust_1"
    };

    const updated = handleOwnerPhoneChangeHelper(initial, "0912345678");
    expect(updated.linkedCustomerId).toBe("cust_1");
    expect(updated.ownerPhone).toBe("0912345678");
  });

  it("selectSuggestedOwner liên kết khách hàng và cập nhật các trường", () => {
    const result = handleSelectSuggestedOwnerHelper(customer2);
    expect(result.linkedCustomerId).toBe("cust_2");
    expect(result.ownerName).toBe("Chủ Nhà B");
    expect(result.ownerPhone).toBe("0987654321");
  });

  it("tra cứu SĐT khi tên chủ trống -> tự điền tên", () => {
    const matched = findCustomerByPhoneInList([customer1], "0912345678");
    expect(matched).not.toBeNull();
    const currentName = "";
    const resolvedName = !currentName || currentName.trim() === "" ? matched!.name : currentName;
    expect(resolvedName).toBe("Chủ Nhà A");
  });

  it("tra cứu SĐT khi tên chủ không trống -> không ghi đè tên", () => {
    const matched = findCustomerByPhoneInList([customer1], "0912345678");
    expect(matched).not.toBeNull();
    const currentName = "Người Khác";
    const resolvedName = !currentName || currentName.trim() === "" ? matched!.name : currentName;
    expect(resolvedName).toBe("Người Khác");
  });
});

describe("3. Thông báo lưu chủ nhà (PropertyOwnerSaveNoticeTest - Parity Android)", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase(`test_owner_notice_${Date.now()}_${Math.random()}`);
  });

  it("testSaveFromForm_newOwner_returnsNewOwnerCreated", async () => {
    const prop = createDefaultProperty({
      id: "prop-new-1",
      area: "Quận 1",
      ownerName: "Chủ Mới Toanh",
      ownerPhone: "0912345678"
    });
    await db.properties.add(prop);

    const { customerId, notice } = await savePropertyOwnerFromForm(db, prop, null);

    expect(notice).not.toBeNull();
    expect(notice?.type).toBe("NewOwnerCreated");
    expect((notice as any).name).toBe("Chủ Mới Toanh");

    const links = await db.customer_property_links
      .where("propertyId")
      .equals("prop-new-1")
      .filter((l) => l.role === CustomerRole.OWNER && !l.isDeleted)
      .toArray();
    expect(links).toHaveLength(1);
    expect(links[0].customerId).toBe(customerId);

    const created = await db.customers.get(customerId!);
    expect(created).toBeDefined();
    expect(created?.name).toBe("Chủ Mới Toanh");
    expect(created?.phone).toBe("0912345678");
  });

  it("testSaveFromForm_existingCustomerNotCurrentOwner_returnsNull", async () => {
    const existing = createCustomer("cust-existing", "Khách Cũ", CustomerRole.OWNER, "0901234567");
    await db.customers.add(existing);

    const prop = createDefaultProperty({
      id: "prop-new-2",
      area: "Quận 1",
      ownerName: "Tên Khác Nhau",
      ownerPhone: "0901234567"
    });
    await db.properties.add(prop);

    const initialCount = await db.customers.count();
    const { customerId, notice } = await savePropertyOwnerFromForm(db, prop, null);

    expect(notice).toBeNull();
    expect(customerId).toBe("cust-existing");
    expect(await db.customers.count()).toBe(initialCount);

    const links = await db.customer_property_links
      .where("propertyId")
      .equals("prop-new-2")
      .filter((l) => l.role === CustomerRole.OWNER && !l.isDeleted)
      .toArray();
    expect(links).toHaveLength(1);
    expect(links[0].customerId).toBe("cust-existing");
  });

  it("testSaveFromForm_renamingCurrentOwnerWithOtherProperties_returnsOwnerRenamed", async () => {
    const custA = createCustomer("cust-A", "Nguyễn Văn A", CustomerRole.OWNER, "0901234567");
    await db.customers.add(custA);

    const p1 = createDefaultProperty({
      id: "p1",
      area: "Quận 1",
      ownerName: "Nguyễn Văn A",
      ownerPhone: "0901234567"
    });
    const p2 = createDefaultProperty({
      id: "p2",
      area: "Quận 1",
      ownerName: "Nguyễn Văn A",
      ownerPhone: "0901234567"
    });
    await db.properties.add(p1);
    await db.properties.add(p2);

    await db.customer_property_links.add({
      customerId: "cust-A",
      propertyId: "p1",
      role: CustomerRole.OWNER,
      viewDate: null,
      viewNote: null,
      updatedAt: 1000,
      isDeleted: false,
      isSynced: true
    });
    await db.customer_property_links.add({
      customerId: "cust-A",
      propertyId: "p2",
      role: CustomerRole.OWNER,
      viewDate: null,
      viewNote: null,
      updatedAt: 1000,
      isDeleted: false,
      isSynced: true
    });

    // Sửa tên p1 thành "Nguyễn Văn A Đổi Tên"
    const p1Edited = { ...p1, ownerName: "Nguyễn Văn A Đổi Tên" };
    await db.properties.put(p1Edited);

    const { notice } = await savePropertyOwnerFromForm(db, p1Edited, null);

    expect(notice).not.toBeNull();
    expect(notice?.type).toBe("OwnerRenamed");
    const renamed = notice as { type: "OwnerRenamed"; newName: string; otherPropertyCount: number };
    expect(renamed.newName).toBe("Nguyễn Văn A Đổi Tên");
    expect(renamed.otherPropertyCount).toBe(1);

    const updatedCustomer = await db.customers.get("cust-A");
    expect(updatedCustomer?.name).toBe("Nguyễn Văn A Đổi Tên");

    const updatedP2 = await db.properties.get("p2");
    expect(updatedP2?.ownerName).toBe("Nguyễn Văn A Đổi Tên");
  });

  it("testSaveFromForm_renamingCurrentOwnerWithZeroOtherProperties_returnsOwnerRenamedWithCountZero", async () => {
    const custSingle = createCustomer("cust-Single", "Chủ Một Căn", CustomerRole.OWNER, "0933221100");
    await db.customers.add(custSingle);

    const pSingle = createDefaultProperty({
      id: "p-single",
      area: "Quận 1",
      ownerName: "Chủ Một Căn",
      ownerPhone: "0933221100"
    });
    await db.properties.add(pSingle);

    await db.customer_property_links.add({
      customerId: "cust-Single",
      propertyId: "p-single",
      role: CustomerRole.OWNER,
      viewDate: null,
      viewNote: null,
      updatedAt: 1000,
      isDeleted: false,
      isSynced: true
    });

    const pSingleEdited = { ...pSingle, ownerName: "Chủ Một Căn Mới" };
    await db.properties.put(pSingleEdited);

    const { notice } = await savePropertyOwnerFromForm(db, pSingleEdited, null);

    expect(notice).not.toBeNull();
    expect(notice?.type).toBe("OwnerRenamed");
    const renamed = notice as { type: "OwnerRenamed"; newName: string; otherPropertyCount: number };
    expect(renamed.newName).toBe("Chủ Một Căn Mới");
    expect(renamed.otherPropertyCount).toBe(0);
  });

  it("testOwnerSaveNoticeText_allCases", () => {
    const noticeNew: OwnerSaveNotice = { type: "NewOwnerCreated", name: "Nguyễn Văn Mới" };
    expect(ownerSaveNoticeText(noticeNew)).toBe("Đã thêm khách chủ nhà mới: Nguyễn Văn Mới");

    const noticeRenamedMultiple: OwnerSaveNotice = {
      type: "OwnerRenamed",
      newName: "Trần Văn B",
      otherPropertyCount: 3
    };
    expect(ownerSaveNoticeText(noticeRenamedMultiple)).toBe(
      "Đã đổi tên chủ thành Trần Văn B ở cả 3 căn khác"
    );

    const noticeRenamedSingle: OwnerSaveNotice = {
      type: "OwnerRenamed",
      newName: "Lê Thị C",
      otherPropertyCount: 0
    };
    expect(ownerSaveNoticeText(noticeRenamedSingle)).toBe("Đã đổi tên khách thành Lê Thị C");
  });
});

describe("4. Tọa độ & Google Maps URL (MapsIntentHelper - Parity Android)", () => {
  it("buildLocationUrl định dạng chuẩn Google Maps search API", () => {
    const lat = 10.762622;
    const lng = 106.660172;
    expect(buildLocationUrl(lat, lng)).toBe(
      "https://www.google.com/maps/search/?api=1&query=10.762622,106.660172"
    );
  });

  it("buildCoordinateText định dạng chuẩn lat,lng", () => {
    const lat = 10.762622;
    const lng = 106.660172;
    expect(buildCoordinateText(lat, lng)).toBe("10.762622,106.660172");
  });
});
