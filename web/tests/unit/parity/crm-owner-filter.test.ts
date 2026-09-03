import { describe, it, expect } from "vitest";
import { Customer } from "../../../src/core/models/customer";
import { CustomerRole, CustomerStatus, CustomerFilter, OwnerStockFilter, OwnerPropertySort } from "../../../src/core/models/enums";
import { applyCustomerFilters, calculateOwnerPropertyStats } from "../../../src/core/engine/customer-filter";
import { Property } from "../../../src/core/models/property";
import { CustomerPropertyLink } from "../../../src/core/models/customer";
import { PropertyStatus } from "../../../src/core/models/enums";

describe("FEATURE PARITY: CRM-OWNER-FILTER-001 (OwnerStockFilter & OwnerPropertySort)", () => {
  const mockCustomers: Customer[] = [
    {
      id: "owner-0",
      name: "Chủ 0 (Chưa có nhà)",
      nameNormalized: "chu 0 chua co nha",
      phone: "0900000000",
      demandType: "Ký gửi BĐS",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.OWNER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 1000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    },
    {
      id: "owner-1",
      name: "Chủ 1 (Có 2 nhà: 1 bán, 1 đã bán)",
      nameNormalized: "chu 1 co 2 nha 1 ban 1 da ban",
      phone: "0900000001",
      demandType: "Ký gửi BĐS",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.OWNER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 2000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    },
    {
      id: "owner-2",
      name: "Chủ 2 (Có 1 nhà đang bán)",
      nameNormalized: "chu 2 co 1 nha dang ban",
      phone: "0900000002",
      demandType: "Ký gửi BĐS",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.OWNER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 3000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    },
    {
      id: "owner-3",
      name: "Chủ 3 (Có 1 nhà đã bán)",
      nameNormalized: "chu 3 co 1 nha da ban",
      phone: "0900000003",
      demandType: "Ký gửi BĐS",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.OWNER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 4000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    },
    {
      id: "owner-4",
      name: "Chủ 4 (Có 3 nhà đều đã bán)",
      nameNormalized: "chu 4 co 3 nha deu da ban",
      phone: "0900000004",
      demandType: "Ký gửi BĐS",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.OWNER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 5000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    },
    {
      id: "buyer-1",
      name: "Khách mua Tuấn",
      nameNormalized: "khach mua tuan",
      phone: "0900000005",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.BUYER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 6000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    }
  ];

  const mockProperties: Partial<Property>[] = [
    { id: "prop-1", status: PropertyStatus.FOR_SALE, isDeleted: false },
    { id: "prop-2", status: PropertyStatus.SOLD, isDeleted: false },
    { id: "prop-3", status: PropertyStatus.FOR_SALE, isDeleted: false },
    { id: "prop-4", status: PropertyStatus.SOLD, isDeleted: false },
    { id: "prop-5", status: PropertyStatus.SOLD, isDeleted: false },
    { id: "prop-6", status: PropertyStatus.SOLD, isDeleted: false },
    { id: "prop-7", status: PropertyStatus.SOLD, isDeleted: false }
  ];

  const mockLinks: CustomerPropertyLink[] = [
    // owner-1 có prop-1 (Đang bán) và prop-2 (Đã bán)
    { customerId: "owner-1", propertyId: "prop-1", role: "OWNER", updatedAt: 1000, isDeleted: false, isSynced: true },
    { customerId: "owner-1", propertyId: "prop-2", role: "OWNER", updatedAt: 1000, isDeleted: false, isSynced: true },
    // owner-2 có prop-3 (Đang bán)
    { customerId: "owner-2", propertyId: "prop-3", role: "OWNER", updatedAt: 1000, isDeleted: false, isSynced: true },
    // owner-3 có prop-4 (Đã bán)
    { customerId: "owner-3", propertyId: "prop-4", role: "OWNER", updatedAt: 1000, isDeleted: false, isSynced: true },
    // owner-4 có prop-5, prop-6, prop-7 (Đều Đã bán)
    { customerId: "owner-4", propertyId: "prop-5", role: "OWNER", updatedAt: 1000, isDeleted: false, isSynced: true },
    { customerId: "owner-4", propertyId: "prop-6", role: "OWNER", updatedAt: 1000, isDeleted: false, isSynced: true },
    { customerId: "owner-4", propertyId: "prop-7", role: "OWNER", updatedAt: 1000, isDeleted: false, isSynced: true }
  ];

  it("tính toán chính xác OwnerPropertyStats (totalCount, forSaleCount, soldCount)", () => {
    const stats = calculateOwnerPropertyStats(mockLinks, mockProperties as Property[]);

    expect(stats["owner-0"]).toBeUndefined();
    expect(stats["owner-1"]).toEqual({ totalCount: 2, forSaleCount: 1, soldCount: 1 });
    expect(stats["owner-2"]).toEqual({ totalCount: 1, forSaleCount: 1, soldCount: 0 });
    expect(stats["owner-3"]).toEqual({ totalCount: 1, forSaleCount: 0, soldCount: 1 });
    expect(stats["owner-4"]).toEqual({ totalCount: 3, forSaleCount: 0, soldCount: 3 });
  });

  it("lọc OwnerStockFilter.HAS_STOCK ('Còn hàng'): chỉ trả về chủ nhà có ít nhất 1 BĐS đang bán (forSaleCount > 0)", () => {
    const stats = calculateOwnerPropertyStats(mockLinks, mockProperties as Property[]);
    const result = applyCustomerFilters(
      mockCustomers,
      CustomerFilter.OWNER_ACTIVE,
      stats,
      "",
      OwnerStockFilter.HAS_STOCK
    );

    const resultIds = result.map((c) => c.id);
    expect(resultIds).toEqual(["owner-1", "owner-2"]);
  });

  it("lọc OwnerStockFilter.SOLD_OUT ('Đã bán hết'): chỉ trả về chủ nhà có nhà nhưng toàn bộ đã bán", () => {
    const stats = calculateOwnerPropertyStats(mockLinks, mockProperties as Property[]);
    const result = applyCustomerFilters(
      mockCustomers,
      CustomerFilter.OWNER_ACTIVE,
      stats,
      "",
      OwnerStockFilter.SOLD_OUT
    );

    const resultIds = result.map((c) => c.id);
    expect(resultIds).toEqual(["owner-3", "owner-4"]);
  });

  it("sắp xếp OwnerPropertySort.DESCENDING: sắp xếp giảm dần theo tổng số nhà sở hữu", () => {
    const stats = calculateOwnerPropertyStats(mockLinks, mockProperties as Property[]);
    const result = applyCustomerFilters(
      mockCustomers,
      CustomerFilter.OWNER_ACTIVE,
      stats,
      "",
      OwnerStockFilter.ALL,
      OwnerPropertySort.DESCENDING
    );

    const resultIds = result.map((c) => c.id);
    // owner-4 (3 nhà) > owner-1 (2 nhà) > owner-2 (1 nhà) > owner-3 (1 nhà) > owner-0 (0 nhà)
    expect(resultIds[0]).toBe("owner-4");
    expect(resultIds[1]).toBe("owner-1");
    expect(resultIds[4]).toBe("owner-0");
  });
});
