import { describe, it, expect } from "vitest";
import {
  applyQuickPriceEdit,
  applyClearPriceHistory,
  summarizeLatestPriceChange,
  formatPrice
} from "../../src/core/utils/price-history-ops";
import { createDefaultProperty } from "../../src/core/models/property";
import {
  PropertyPriceHistory,
  PriceHistoryChangeType,
  PriceEditKind
} from "../../src/core/models/price-history";

describe("price-history-ops", () => {
  describe("formatPrice", () => {
    it("định dạng giá dưới 1 tỷ ra triệu và trên 1 tỷ ra tỷ", () => {
      expect(formatPrice(0.5)).toBe("500 triệu");
      expect(formatPrice(0.05)).toBe("50 triệu");
      expect(formatPrice(1.0)).toBe("1 tỷ");
      expect(formatPrice(1.5)).toBe("1.5 tỷ");
      expect(formatPrice(2.45)).toBe("2.45 tỷ");
      expect(formatPrice(0)).toBe("Thỏa thuận");
      expect(formatPrice(null)).toBe("Thỏa thuận");
      expect(formatPrice(-1)).toBe("Thỏa thuận");
    });
  });

  describe("applyQuickPriceEdit", () => {
    const baseProperty = createDefaultProperty({
      id: "prop-1",
      price: 3.2,
      updatedAt: 1000,
      lastEditedAt: 1000,
      isTextSynced: true,
      isDeleted: false
    });

    it("giá không hợp lệ (<= 0, NaN, Infinity) trả về INVALID", () => {
      expect(applyQuickPriceEdit(baseProperty, 3.2, 0, 2000)).toEqual({
        kind: "INVALID"
      });
      expect(applyQuickPriceEdit(baseProperty, 3.2, -1, 2000)).toEqual({
        kind: "INVALID"
      });
      expect(applyQuickPriceEdit(baseProperty, 3.2, NaN, 2000)).toEqual({
        kind: "INVALID"
      });
      expect(applyQuickPriceEdit(baseProperty, 3.2, Infinity, 2000)).toEqual({
        kind: "INVALID"
      });
    });

    it("giá không đổi (trùng hoặc sai số < 0.0001) trả về UNCHANGED", () => {
      expect(applyQuickPriceEdit(baseProperty, 3.2, 3.2, 2000)).toEqual({
        kind: "UNCHANGED"
      });
      expect(applyQuickPriceEdit(baseProperty, 3.2, 3.20004, 2000)).toEqual({
        kind: "UNCHANGED"
      });
    });

    it("xung đột: giá hiện tại lệch expectedPrice >= 0.0001 trả về CONFLICT", () => {
      const modifiedProp = { ...baseProperty, price: 3.5 };
      expect(applyQuickPriceEdit(modifiedProp, 3.2, 3.8, 2000)).toEqual({
        kind: "CONFLICT"
      });
    });

    it("xung đột: căn đã bị xóa (isDeleted = true) trả về CONFLICT", () => {
      const deletedProp = { ...baseProperty, isDeleted: true };
      expect(applyQuickPriceEdit(deletedProp, 3.2, 3.5, 2000)).toEqual({
        kind: "CONFLICT"
      });
    });

    it("hợp lệ (OK): cập nhật price, priceEditKind = MARKET_CHANGE, isTextSynced = false", () => {
      const result = applyQuickPriceEdit(baseProperty, 3.2, 3.5, 2000);
      expect(result.kind).toBe("OK");
      if (result.kind === "OK") {
        expect(result.updated.price).toBe(3.5);
        expect(result.updated.priceEditKind).toBe(PriceEditKind.MARKET_CHANGE);
        expect(result.updated.isTextSynced).toBe(false);
        expect(result.updated.updatedAt).toBe(2000);
        expect(result.updated.lastEditedAt).toBe(2000);
        expect(result.updated.priceEditAt).toBe(2000);
      }
    });

    it("hợp lệ (OK): làm tròn 4 chữ số thập phân", () => {
      const result = applyQuickPriceEdit(baseProperty, 3.2, 3.123456, 2000);
      expect(result.kind).toBe("OK");
      if (result.kind === "OK") {
        expect(result.updated.price).toBe(3.1235);
      }
    });

    it("thời điểm khi now <= updatedAt: lấy updatedAt + 1", () => {
      const propWithFutureUpdatedAt = { ...baseProperty, updatedAt: 1000 };

      // now === updatedAt
      const resultEqual = applyQuickPriceEdit(propWithFutureUpdatedAt, 3.2, 3.5, 1000);
      expect(resultEqual.kind).toBe("OK");
      if (resultEqual.kind === "OK") {
        expect(resultEqual.updated.updatedAt).toBe(1001);
        expect(resultEqual.updated.lastEditedAt).toBe(1001);
        expect(resultEqual.updated.priceEditAt).toBe(1001);
      }

      // now < updatedAt
      const resultPast = applyQuickPriceEdit(propWithFutureUpdatedAt, 3.2, 3.5, 800);
      expect(resultPast.kind).toBe("OK");
      if (resultPast.kind === "OK") {
        expect(resultPast.updated.updatedAt).toBe(1001);
        expect(resultPast.updated.lastEditedAt).toBe(1001);
        expect(resultPast.updated.priceEditAt).toBe(1001);
      }
    });

    it("priceEditAt === updatedAt khi cập nhật giá thành công", () => {
      const result = applyQuickPriceEdit(baseProperty, 3.2, 3.6, 2500);
      expect(result.kind).toBe("OK");
      if (result.kind === "OK") {
        expect(result.updated.priceEditAt).toBe(result.updated.updatedAt);
      }
    });
  });

  describe("applyClearPriceHistory", () => {
    const baseProperty = createDefaultProperty({
      id: "prop-1",
      price: 3.2,
      priceHistoryClearedRev: 3,
      priceEditAt: 1000,
      updatedAt: 1000,
      lastEditedAt: 1000,
      isTextSynced: true
    });

    it("mốc xoá không tăng (upToRevision <= priceHistoryClearedRev) trả về null", () => {
      expect(applyClearPriceHistory(baseProperty, 3, 2000)).toBeNull();
      expect(applyClearPriceHistory(baseProperty, 2, 2000)).toBeNull();
    });

    it("mốc xoá tăng: trả về bản property mới với priceHistoryClearedRev mới, isTextSynced = false", () => {
      const result = applyClearPriceHistory(baseProperty, 5, 2000);
      expect(result).not.toBeNull();
      expect(result!.priceHistoryClearedRev).toBe(5);
      expect(result!.isTextSynced).toBe(false);
      expect(result!.updatedAt).toBe(2000);
      expect(result!.price).toBe(3.2); // Không đổi giá
      expect(result!.lastEditedAt).toBe(1000); // Không đổi lastEditedAt
    });

    it("priceEditAt đi theo khi bằng updatedAt cũ", () => {
      const prop = {
        ...baseProperty,
        priceEditAt: 1000,
        updatedAt: 1000
      };
      const result = applyClearPriceHistory(prop, 5, 2000);
      expect(result).not.toBeNull();
      expect(result!.updatedAt).toBe(2000);
      expect(result!.priceEditAt).toBe(2000);
    });

    it("priceEditAt KHÔNG đi theo khi khác updatedAt cũ", () => {
      const prop = {
        ...baseProperty,
        priceEditAt: 500,
        updatedAt: 1000
      };
      const result = applyClearPriceHistory(prop, 5, 2000);
      expect(result).not.toBeNull();
      expect(result!.updatedAt).toBe(2000);
      expect(result!.priceEditAt).toBe(500);
    });

    it("thời điểm khi now <= updatedAt: updatedAt mới là max(now, updatedAt + 1)", () => {
      const prop = {
        ...baseProperty,
        priceEditAt: 1000,
        updatedAt: 1000
      };
      const result = applyClearPriceHistory(prop, 5, 900);
      expect(result).not.toBeNull();
      expect(result!.updatedAt).toBe(1001);
      expect(result!.priceEditAt).toBe(1001);
    });
  });

  describe("summarizeLatestPriceChange", () => {
    const makeHistory = (
      partial: Partial<PropertyPriceHistory>
    ): PropertyPriceHistory => ({
      id: "h-1",
      revision: 1,
      propertyId: "prop-1",
      changeType: PriceHistoryChangeType.PRICE_CHANGE,
      editKind: PriceEditKind.MARKET_CHANGE,
      previousPrice: 3.0,
      currentPrice: 2.5,
      previousAreaSize: 50,
      currentAreaSize: 50,
      previousPricePerM2: 0.06,
      currentPricePerM2: 0.05,
      recordedAt: 1000,
      ...partial
    });

    it("tóm tắt giảm: hiển thị mũi tên xuống, mức giảm, và phần trăm", () => {
      const histories = [
        makeHistory({
          previousPrice: 3.0,
          currentPrice: 2.5
        })
      ];
      const summary = summarizeLatestPriceChange(histories);
      expect(summary.isDecrease).toBe(true);
      expect(summary.text).toBe("↓ 500 triệu · 16.7%");
    });

    it("tóm tắt giảm lớn (trên 1 tỷ): hiển thị đơn vị tỷ", () => {
      const histories = [
        makeHistory({
          previousPrice: 5.0,
          currentPrice: 3.5
        })
      ];
      const summary = summarizeLatestPriceChange(histories);
      expect(summary.isDecrease).toBe(true);
      expect(summary.text).toBe("↓ 1.5 tỷ · 30%");
    });

    it("tóm tắt tăng: hiển thị mũi tên lên, mức tăng, và phần trăm", () => {
      const histories = [
        makeHistory({
          previousPrice: 2.5,
          currentPrice: 3.0
        })
      ];
      const summary = summarizeLatestPriceChange(histories);
      expect(summary.isDecrease).toBe(false);
      expect(summary.text).toBe("↑ 500 triệu · 20%");
    });

    it("tóm tắt chưa đổi: danh sách rỗng", () => {
      expect(summarizeLatestPriceChange([])).toEqual({
        text: "Chưa thay đổi",
        isDecrease: null
      });
    });

    it("tóm tắt chưa đổi: changeType là BASELINE hoặc RESTORE_BASELINE", () => {
      const baselineHistory = [
        makeHistory({ changeType: PriceHistoryChangeType.BASELINE })
      ];
      expect(summarizeLatestPriceChange(baselineHistory)).toEqual({
        text: "Chưa thay đổi",
        isDecrease: null
      });

      const restoreHistory = [
        makeHistory({ changeType: PriceHistoryChangeType.RESTORE_BASELINE })
      ];
      expect(summarizeLatestPriceChange(restoreHistory)).toEqual({
        text: "Chưa thay đổi",
        isDecrease: null
      });
    });

    it("tóm tắt chưa đổi: editKind không phải MARKET_CHANGE (ví dụ DATA_CORRECTION)", () => {
      const correctionHistory = [
        makeHistory({ editKind: PriceEditKind.DATA_CORRECTION })
      ];
      expect(summarizeLatestPriceChange(correctionHistory)).toEqual({
        text: "Chưa thay đổi",
        isDecrease: null
      });
    });

    it("tóm tắt chưa đổi: previousPrice null hoặc <= 0", () => {
      expect(
        summarizeLatestPriceChange([makeHistory({ previousPrice: null })])
      ).toEqual({
        text: "Chưa thay đổi",
        isDecrease: null
      });

      expect(
        summarizeLatestPriceChange([makeHistory({ previousPrice: 0 })])
      ).toEqual({
        text: "Chưa thay đổi",
        isDecrease: null
      });
    });

    it("tóm tắt chưa đổi: chênh lệch giá nhỏ hơn hoặc bằng 1e-4", () => {
      const tinyDiffHistory = [
        makeHistory({
          previousPrice: 3.0,
          currentPrice: 3.00005
        })
      ];
      expect(summarizeLatestPriceChange(tinyDiffHistory)).toEqual({
        text: "Chưa thay đổi",
        isDecrease: null
      });
    });
  });
});
