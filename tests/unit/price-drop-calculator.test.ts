import { describe, it, expect } from "vitest";
import {
  PriceDropCalculator,
  PriceDropSort,
  PriceDropWindow,
  calculatePricePerM2Fallback,
  formatRelativeDropTime,
  isActiveMarketProperty,
  priceDropMatchesFilter
} from "../../src/core/engine/price-drop-calculator";
import { createDefaultProperty, Property } from "../../src/core/models/property";
import {
  PropertyPriceHistory,
  PriceHistoryChangeType,
  PriceEditKind
} from "../../src/core/models/price-history";
import { PropertyStatus, FilterScope } from "../../src/core/models/enums";

describe("PriceDropCalculator", () => {
  const baseTime = 1791704400000; // 2026-10-11T12:00:00+07:00

  function createTestProp(partial?: Partial<Property>): Property {
    return createDefaultProperty({
      id: "prop-1",
      area: "Cầu Giấy",
      price: 3.0,
      areaSize: 50,
      status: PropertyStatus.FOR_SALE,
      isDraft: false,
      isDeleted: false,
      isVerified: true,
      ...partial
    });
  }

  function createTestHistory(
    partial?: Partial<PropertyPriceHistory>
  ): PropertyPriceHistory {
    return {
      id: "h-1",
      revision: 1,
      propertyId: "prop-1",
      changeType: PriceHistoryChangeType.PRICE_CHANGE,
      editKind: PriceEditKind.MARKET_CHANGE,
      previousPrice: 3.5,
      currentPrice: 3.0,
      previousAreaSize: 50,
      currentAreaSize: 50,
      previousPricePerM2: null,
      currentPricePerM2: null,
      recordedAt: baseTime - 1000,
      ...partial
    };
  }

  describe("Quy tắc chọn căn (calculate)", () => {
    it("lần cuối là tăng ⇒ loại dù trước đó có giảm", () => {
      const prop = createTestProp({ id: "p1", price: 3.8 });
      const histories = [
        createTestHistory({
          id: "h1",
          revision: 1,
          propertyId: "p1",
          previousPrice: 4.0,
          currentPrice: 3.5,
          recordedAt: baseTime - 100_000
        }),
        createTestHistory({
          id: "h2",
          revision: 2,
          propertyId: "p1",
          previousPrice: 3.5,
          currentPrice: 3.8, // Tăng giá
          recordedAt: baseTime - 10_000
        })
      ];

      const res = PriceDropCalculator.calculate(
        [prop],
        { p1: histories },
        baseTime,
        PriceDropWindow.DAYS_30
      );

      expect(res).toHaveLength(0);
    });

    it("lần cuối DATA_CORRECTION/UNSPECIFIED ⇒ loại", () => {
      const prop1 = createTestProp({ id: "p1", price: 3.0 });
      const hDataCorrection = createTestHistory({
        id: "h1",
        propertyId: "p1",
        editKind: PriceEditKind.DATA_CORRECTION
      });

      const res1 = PriceDropCalculator.calculate(
        [prop1],
        { p1: [hDataCorrection] },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(res1).toHaveLength(0);

      const prop2 = createTestProp({ id: "p2", price: 3.0 });
      const hUnspecified = createTestHistory({
        id: "h2",
        propertyId: "p2",
        editKind: PriceEditKind.UNSPECIFIED
      });

      const res2 = PriceDropCalculator.calculate(
        [prop2],
        { p2: [hUnspecified] },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(res2).toHaveLength(0);

      // Thử cả trường hợp changeType khác PRICE_CHANGE
      const prop3 = createTestProp({ id: "p3", price: 3.0 });
      const hBaseline = createTestHistory({
        id: "h3",
        propertyId: "p3",
        changeType: PriceHistoryChangeType.BASELINE
      });

      const res3 = PriceDropCalculator.calculate(
        [prop3],
        { p3: [hBaseline] },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(res3).toHaveLength(0);
    });

    it("giá hiện tại lệch lịch sử ⇒ loại", () => {
      const prop = createTestProp({ id: "p1", price: 3.2 }); // lệch so với currentPrice trong lịch sử (3.0)
      const history = createTestHistory({
        propertyId: "p1",
        currentPrice: 3.0,
        previousPrice: 3.5
      });

      const res = PriceDropCalculator.calculate(
        [prop],
        { p1: [history] },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(res).toHaveLength(0);

      // Giá khớp trong khoảng epsilon (1e-4) thì được chấp nhận
      const propMatched = createTestProp({ id: "p1", price: 3.00001 });
      const resMatched = PriceDropCalculator.calculate(
        [propMatched],
        { p1: [history] },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(resMatched).toHaveLength(1);
    });

    it("ngoài khung ngày ⇒ loại", () => {
      const prop = createTestProp({ id: "p1", price: 3.0 });
      // Giảm giá 35 ngày trước
      const history = createTestHistory({
        propertyId: "p1",
        recordedAt: baseTime - 35 * 86_400_000
      });

      const res7 = PriceDropCalculator.calculate(
        [prop],
        { p1: [history] },
        baseTime,
        PriceDropWindow.DAYS_7
      );
      expect(res7).toHaveLength(0);

      const res30 = PriceDropCalculator.calculate(
        [prop],
        { p1: [history] },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(res30).toHaveLength(0);
    });

    it("Tất cả ⇒ có", () => {
      const prop = createTestProp({ id: "p1", price: 3.0 });
      // Giảm giá 120 ngày trước
      const history = createTestHistory({
        propertyId: "p1",
        recordedAt: baseTime - 120 * 86_400_000
      });

      const res90 = PriceDropCalculator.calculate(
        [prop],
        { p1: [history] },
        baseTime,
        PriceDropWindow.DAYS_90
      );
      expect(res90).toHaveLength(0);

      const resAll = PriceDropCalculator.calculate(
        [prop],
        { p1: [history] },
        baseTime,
        PriceDropWindow.ALL
      );
      expect(resAll).toHaveLength(1);
      expect(resAll[0].property.id).toBe("p1");
    });

    it("recordedAt tương lai > 60s ⇒ bỏ dòng", () => {
      const prop = createTestProp({ id: "p1", price: 3.0 });
      const validH = createTestHistory({
        id: "h1",
        revision: 1,
        propertyId: "p1",
        previousPrice: 3.5,
        currentPrice: 3.0,
        recordedAt: baseTime - 1000
      });
      const corruptFutureH = createTestHistory({
        id: "h2",
        revision: 2,
        propertyId: "p1",
        previousPrice: 3.0,
        currentPrice: 2.5,
        recordedAt: baseTime + 65_000 // Tương lai > 60s
      });

      // corruptFutureH bị loại bỏ hoàn toàn, validH là bản ghi mới nhất hợp lệ
      const res = PriceDropCalculator.calculate(
        [prop],
        { p1: [validH, corruptFutureH] },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(res).toHaveLength(1);
      expect(res[0].currentPrice).toBe(3.0);
      expect(res[0].latestRevision).toBe(1);

      // Nếu chỉ có duy nhất bản ghi tương lai > 60s ⇒ loại căn
      const resOnlyFuture = PriceDropCalculator.calculate(
        [prop],
        { p1: [corruptFutureH] },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(resOnlyFuture).toHaveLength(0);
    });

    it("đếm số lần giảm trong khung/toàn bộ", () => {
      const prop = createTestProp({ id: "p1", price: 2.5 });
      const histories = [
        createTestHistory({
          id: "h1",
          revision: 1,
          propertyId: "p1",
          previousPrice: 4.0,
          currentPrice: 3.5,
          recordedAt: baseTime - 45 * 86_400_000 // 45 ngày trước
        }),
        createTestHistory({
          id: "h2",
          revision: 2,
          propertyId: "p1",
          previousPrice: 3.5,
          currentPrice: 3.0,
          recordedAt: baseTime - 20 * 86_400_000 // 20 ngày trước
        }),
        createTestHistory({
          id: "h3",
          revision: 3,
          propertyId: "p1",
          previousPrice: 3.0,
          currentPrice: 2.5,
          recordedAt: baseTime - 5 * 86_400_000 // 5 ngày trước
        })
      ];

      const res30 = PriceDropCalculator.calculate(
        [prop],
        { p1: histories },
        baseTime,
        PriceDropWindow.DAYS_30
      );
      expect(res30).toHaveLength(1);
      expect(res30[0].dropCountInWindow).toBe(2); // h2 và h3 trong 30 ngày
      expect(res30[0].totalDropCountSinceBaseline).toBe(3); // cả h1, h2, h3

      const resAll = PriceDropCalculator.calculate(
        [prop],
        { p1: histories },
        baseTime,
        PriceDropWindow.ALL
      );
      expect(resAll).toHaveLength(1);
      expect(resAll[0].dropCountInWindow).toBe(3);
      expect(resAll[0].totalDropCountSinceBaseline).toBe(3);
    });
  });

  describe("3 cách sắp xếp và thứ tự phụ", () => {
    it("RECENT: sắp theo lastDropAt DESC, latestRevision DESC, dropAmount DESC, property.id ASC", () => {
      const p1 = createTestProp({ id: "p1", price: 3.0 });
      const p2 = createTestProp({ id: "p2", price: 3.0 });
      const p3 = createTestProp({ id: "p3", price: 2.0 });

      const h1 = createTestHistory({
        propertyId: "p1",
        revision: 1,
        previousPrice: 4.0,
        currentPrice: 3.0,
        recordedAt: baseTime - 1000
      });
      // p2 cùng thời gian nhưng revision cao hơn
      const h2 = createTestHistory({
        propertyId: "p2",
        revision: 2,
        previousPrice: 4.0,
        currentPrice: 3.0,
        recordedAt: baseTime - 1000
      });
      // p3 giảm gần đây hơn
      const h3 = createTestHistory({
        propertyId: "p3",
        revision: 1,
        previousPrice: 3.0,
        currentPrice: 2.0,
        recordedAt: baseTime - 500
      });

      const res = PriceDropCalculator.calculate(
        [p1, p2, p3],
        { p1: [h1], p2: [h2], p3: [h3] },
        baseTime,
        PriceDropWindow.DAYS_30,
        PriceDropSort.RECENT
      );

      expect(res.map((x) => x.property.id)).toEqual(["p3", "p2", "p1"]);
    });

    it("AMOUNT_DESC: sắp theo dropAmount DESC, dropPercent DESC, lastDropAt DESC, property.id ASC", () => {
      const p1 = createTestProp({ id: "p1", price: 4.0 }); // giảm 1 tỷ từ 5 tỷ (20%)
      const p2 = createTestProp({ id: "p2", price: 2.0 }); // giảm 2 tỷ từ 4 tỷ (50%)
      const p3 = createTestProp({ id: "p3", price: 1.0 }); // giảm 1 tỷ từ 2 tỷ (50%)

      const h1 = createTestHistory({
        propertyId: "p1",
        previousPrice: 5.0,
        currentPrice: 4.0,
        recordedAt: baseTime - 1000
      });
      const h2 = createTestHistory({
        propertyId: "p2",
        previousPrice: 4.0,
        currentPrice: 2.0,
        recordedAt: baseTime - 1000
      });
      const h3 = createTestHistory({
        propertyId: "p3",
        previousPrice: 2.0,
        currentPrice: 1.0,
        recordedAt: baseTime - 1000
      });

      const res = PriceDropCalculator.calculate(
        [p1, p2, p3],
        { p1: [h1], p2: [h2], p3: [h3] },
        baseTime,
        PriceDropWindow.DAYS_30,
        PriceDropSort.AMOUNT_DESC
      );

      // p2 (giảm 2 tỷ) trước; sau đó p3 và p1 đều giảm 1 tỷ nhưng p3 giảm 50% > p1 giảm 20%
      expect(res.map((x) => x.property.id)).toEqual(["p2", "p3", "p1"]);
    });

    it("PERCENT_DESC: sắp theo dropPercent DESC, dropAmount DESC, lastDropAt DESC, property.id ASC", () => {
      const p1 = createTestProp({ id: "p1", price: 8.0 }); // 10 -> 8: giảm 20% (giảm 2 tỷ)
      const p2 = createTestProp({ id: "p2", price: 2.0 }); // 4 -> 2: giảm 50% (giảm 2 tỷ)
      const p3 = createTestProp({ id: "p3", price: 1.0 }); // 2 -> 1: giảm 50% (giảm 1 tỷ)

      const h1 = createTestHistory({
        propertyId: "p1",
        previousPrice: 10.0,
        currentPrice: 8.0,
        recordedAt: baseTime - 1000
      });
      const h2 = createTestHistory({
        propertyId: "p2",
        previousPrice: 4.0,
        currentPrice: 2.0,
        recordedAt: baseTime - 1000
      });
      const h3 = createTestHistory({
        propertyId: "p3",
        previousPrice: 2.0,
        currentPrice: 1.0,
        recordedAt: baseTime - 1000
      });

      const res = PriceDropCalculator.calculate(
        [p1, p2, p3],
        { p1: [h1], p2: [h2], p3: [h3] },
        baseTime,
        PriceDropWindow.DAYS_30,
        PriceDropSort.PERCENT_DESC
      );

      // p2 và p3 đều giảm 50%, nhưng p2 giảm 2 tỷ > p3 giảm 1 tỷ; cuối cùng p1 giảm 20%
      expect(res.map((x) => x.property.id)).toEqual(["p2", "p3", "p1"]);
    });
  });

  describe("calculatePricePerM2Fallback", () => {
    it("tính chính xác giá/m² dự phòng và trả về null khi dữ liệu không hợp lệ", () => {
      // 2 tỷ / 50m² = (2 * 1000) / 50 = 40 tr/m²
      expect(calculatePricePerM2Fallback(2.0, 50)).toBe(40.0);
      expect(calculatePricePerM2Fallback(null, 50)).toBeNull();
      expect(calculatePricePerM2Fallback(2.0, null)).toBeNull();
      expect(calculatePricePerM2Fallback(0, 50)).toBeNull();
      expect(calculatePricePerM2Fallback(2.0, 0)).toBeNull();
      expect(calculatePricePerM2Fallback(-1, 50)).toBeNull();
      expect(calculatePricePerM2Fallback(2.0, -10)).toBeNull();
      expect(calculatePricePerM2Fallback(NaN, 50)).toBeNull();
      expect(calculatePricePerM2Fallback(2.0, Infinity)).toBeNull();
    });

    it("sử dụng giá/m² dự phòng trong calculate khi history không lưu sẵn ppm2", () => {
      const prop = createTestProp({ id: "p1", price: 3.0, areaSize: 60 });
      const history = createTestHistory({
        propertyId: "p1",
        previousPrice: 3.6,
        currentPrice: 3.0,
        currentPricePerM2: null,
        previousPricePerM2: null,
        // Lịch sử không lưu diện tích ⇒ dùng diện tích hiện tại của căn (60 m²), như Android
        currentAreaSize: null,
        previousAreaSize: null
      });

      const res = PriceDropCalculator.calculate(
        [prop],
        { p1: [history] },
        baseTime,
        PriceDropWindow.DAYS_30
      );

      expect(res).toHaveLength(1);
      // currentPricePerM2: (3.0 * 1000) / 60 = 50 tr/m²
      expect(res[0].currentPricePerM2).toBe(50.0);
      // previousPricePerM2: (3.6 * 1000) / 60 = 60 tr/m²
      expect(res[0].previousPricePerM2).toBe(60.0);
    });
  });

  describe("formatRelativeDropTime", () => {
    // 2026-10-11T12:00:00+07:00
    const nowVn = 1791704400000;

    it("hôm nay khi cùng ngày theo lịch Việt Nam", () => {
      // 2 tiếng trước cùng ngày
      const recorded = nowVn - 2 * 3600 * 1000;
      expect(formatRelativeDropTime(recorded, nowVn)).toBe("Hôm nay");
    });

    it("hôm qua khi lùi 1 ngày", () => {
      const recorded = nowVn - 24 * 3600 * 1000;
      expect(formatRelativeDropTime(recorded, nowVn)).toBe("Hôm qua");
    });

    it("N ngày trước khi chênh lệch từ 2 đến 6 ngày", () => {
      const recorded2 = nowVn - 2 * 86_400_000;
      expect(formatRelativeDropTime(recorded2, nowVn)).toBe("2 ngày trước");

      const recorded6 = nowVn - 6 * 86_400_000;
      expect(formatRelativeDropTime(recorded6, nowVn)).toBe("6 ngày trước");
    });

    it("N tuần trước khi chênh lệch từ 7 đến 29 ngày", () => {
      const recorded7 = nowVn - 7 * 86_400_000;
      expect(formatRelativeDropTime(recorded7, nowVn)).toBe("1 tuần trước");

      const recorded14 = nowVn - 14 * 86_400_000;
      expect(formatRelativeDropTime(recorded14, nowVn)).toBe("2 tuần trước");

      const recorded28 = nowVn - 28 * 86_400_000;
      expect(formatRelativeDropTime(recorded28, nowVn)).toBe("4 tuần trước");
    });

    it("dd/MM/yyyy khi chênh lệch >= 30 ngày", () => {
      // Lùi 35 ngày từ 11/10/2026 => 06/09/2026
      const recorded35 = nowVn - 35 * 86_400_000;
      expect(formatRelativeDropTime(recorded35, nowVn)).toBe("06/09/2026");
    });
  });

  describe("isActiveMarketProperty & priceDropMatchesFilter", () => {
    it("loại trừ BĐS đã xoá, bản nháp, hoặc trạng thái không còn bán", () => {
      expect(isActiveMarketProperty(createTestProp({ isDeleted: true }))).toBe(false);
      expect(isActiveMarketProperty(createTestProp({ isDraft: true }))).toBe(false);
      expect(isActiveMarketProperty(createTestProp({ status: PropertyStatus.SOLD }))).toBe(false);
      expect(isActiveMarketProperty(createTestProp({ status: PropertyStatus.PAUSED }))).toBe(false);
      expect(isActiveMarketProperty(createTestProp({ status: PropertyStatus.FOR_SALE }))).toBe(true);
      expect(isActiveMarketProperty(createTestProp({ status: PropertyStatus.PENDING_SURVEY }))).toBe(true);
    });

    it("lọc chính thức và chờ theo FilterScope", () => {
      const verified = createTestProp({ id: "v1", isVerified: true });
      const unverified = createTestProp({ id: "u1", isVerified: false });

      // Giống Android (PropertyListMode.ALL): phạm vi tab không ẩn căn chờ
      expect(priceDropMatchesFilter(verified, { scope: FilterScope.CURRENT_TAB })).toBe(true);
      expect(priceDropMatchesFilter(unverified, { scope: FilterScope.CURRENT_TAB })).toBe(true);

      // Scope ALL nhận cả hai
      expect(priceDropMatchesFilter(verified, { scope: FilterScope.ALL })).toBe(true);
      expect(priceDropMatchesFilter(unverified, { scope: FilterScope.ALL })).toBe(true);
    });
  });
});
