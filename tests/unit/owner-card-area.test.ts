import { describe, expect, it } from "vitest";
import {
  pickOwnerMainArea,
  OwnerPropertyArea,
  calculateOwnerPropertyStats,
  OwnerPropertyStats
} from "../../src/core/engine/customer-filter";
import { CustomerRole, CustomerPropertyRole, PropertyStatus } from "../../src/core/models/enums";
import { CustomerPropertyLink } from "../../src/core/models/customer";
import { Property, createDefaultProperty } from "../../src/core/models/property";

describe("OwnerMainArea (pickOwnerMainArea - parity Android)", () => {
  const forSale = (area: string, price: number): OwnerPropertyArea => ({
    area,
    price,
    isForSale: true
  });
  const sold = (area: string, price: number): OwnerPropertyArea => ({
    area,
    price,
    isForSale: false
  });

  it("single area is returned", () => {
    expect(pickOwnerMainArea([forSale("Hòa Xuân", 3.0)])).toBe("Hòa Xuân");
  });

  it("two areas with one property each picks the higher priced area", () => {
    const items = [forSale("Hòa Khánh", 3.0), forSale("Hòa Xuân", 8.0)];
    expect(pickOwnerMainArea(items)).toBe("Hòa Xuân");
  });

  it("area with more properties wins over a single pricier one", () => {
    const items = [
      forSale("Hòa Khánh", 2.0),
      forSale("Hòa Khánh", 2.5),
      forSale("Hòa Xuân", 9.0),
      forSale("Ngũ Hành Sơn", 4.0)
    ];
    expect(pickOwnerMainArea(items)).toBe("Hòa Khánh");
  });

  it("three areas all tied picks the one with the highest price", () => {
    const items = [forSale("A", 1.0), forSale("B", 5.0), forSale("C", 3.0)];
    expect(pickOwnerMainArea(items)).toBe("B");
  });

  it("only for-sale properties count when the owner has any", () => {
    const items = [
      sold("Hòa Xuân", 10.0),
      sold("Hòa Xuân", 12.0),
      forSale("Hòa Khánh", 2.0)
    ];
    expect(pickOwnerMainArea(items)).toBe("Hòa Khánh");
  });

  it("falls back to sold properties when nothing is for sale", () => {
    const items = [sold("Hòa Xuân", 10.0), sold("Hòa Khánh", 2.0)];
    expect(pickOwnerMainArea(items)).toBe("Hòa Xuân");
  });

  it("spelling variants of the same area are grouped", () => {
    // 2 căn cùng khu (khác kiểu bỏ dấu "Hoà Xuân" vs "Hòa Xuân") thắng 1 căn đắt hơn;
    // hiển thị tên của căn giá cao nhất trong khu
    const items = [
      forSale("Hoà Xuân", 3.0),
      forSale("Hòa Xuân", 4.0),
      forSale("Hòa Khánh", 9.0)
    ];
    expect(pickOwnerMainArea(items)).toBe("Hòa Xuân");
  });

  it("blank areas are ignored and empty input gives null", () => {
    expect(pickOwnerMainArea([])).toBeNull();
    expect(pickOwnerMainArea([forSale("  ", 3.0)])).toBeNull();
    expect(
      pickOwnerMainArea([forSale("", 9.0), forSale("Hòa Xuân", 1.0)])
    ).toBe("Hòa Xuân");
  });
});

describe("calculateOwnerPropertyStats integration with mainArea", () => {
  it("computes totalCount, forSaleCount, soldCount, and mainArea", () => {
    const p1: Property = createDefaultProperty({
      id: "p1",
      area: "Hải Châu",
      price: 5.0,
      status: PropertyStatus.FOR_SALE
    });
    const p2: Property = createDefaultProperty({
      id: "p2",
      area: "Hải Châu",
      price: 6.0,
      status: PropertyStatus.FOR_SALE
    });
    const p3: Property = createDefaultProperty({
      id: "p3",
      area: "Sơn Trà",
      price: 15.0,
      status: PropertyStatus.SOLD
    });

    const links: CustomerPropertyLink[] = [
      {
        customerId: "cust-1",
        propertyId: "p1",
        role: CustomerRole.OWNER,
        viewDate: null,
        viewNote: null,
        updatedAt: 1000,
        isDeleted: false,
        isSynced: true
      },
      {
        customerId: "cust-1",
        propertyId: "p2",
        role: CustomerRole.OWNER,
        viewDate: null,
        viewNote: null,
        updatedAt: 1000,
        isDeleted: false,
        isSynced: true
      },
      {
        customerId: "cust-1",
        propertyId: "p3",
        role: CustomerPropertyRole.CO_OWNER,
        viewDate: null,
        viewNote: null,
        updatedAt: 1000,
        isDeleted: false,
        isSynced: true
      }
    ];

    const stats = calculateOwnerPropertyStats(links, [p1, p2, p3]);
    const ownerStat = stats["cust-1"];
    expect(ownerStat).toBeDefined();
    expect(ownerStat.totalCount).toBe(3);
    expect(ownerStat.forSaleCount).toBe(2);
    expect(ownerStat.soldCount).toBe(1);
    expect(ownerStat.mainArea).toBe("Hải Châu");
  });
});

describe("Thẻ chủ nhà format summary text (giống Android)", () => {
  function formatSummaryText(ownerStats?: OwnerPropertyStats): string {
    const total = ownerStats?.totalCount ?? 0;
    const forSale = ownerStats?.forSaleCount ?? 0;
    const mainArea = ownerStats?.mainArea;
    if (total <= 0) return "Chưa có BĐS";
    if (!mainArea || !mainArea.trim()) return `${forSale} đang bán / ${total} nhà`;
    return `${mainArea} · ${forSale} đang bán / ${total} nhà`;
  }

  it("khi total <= 0 hiện Chưa có BĐS", () => {
    expect(formatSummaryText()).toBe("Chưa có BĐS");
    expect(formatSummaryText({ totalCount: 0, forSaleCount: 0, soldCount: 0 })).toBe("Chưa có BĐS");
  });

  it("khi không có khu vực đặc trưng hiện X đang bán / Y nhà", () => {
    expect(
      formatSummaryText({ totalCount: 3, forSaleCount: 2, soldCount: 1, mainArea: null })
    ).toBe("2 đang bán / 3 nhà");
  });

  it("khi có khu vực đặc trưng hiện <khu vực> · X đang bán / Y nhà", () => {
    expect(
      formatSummaryText({ totalCount: 3, forSaleCount: 2, soldCount: 1, mainArea: "Hòa Xuân" })
    ).toBe("Hòa Xuân · 2 đang bán / 3 nhà");
  });
});
