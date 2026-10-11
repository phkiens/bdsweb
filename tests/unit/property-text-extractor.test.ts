import { describe, expect, it } from "vitest";
import {
  UnverifiedPropertyType,
  extractPrice,
  extractSize,
  extractPhone,
  extractDirection,
  extractType,
  matchAddress,
  parseWithRegex,
  parseRawText
} from "../../src/core/engine/property-text-extractor";

describe("PropertyTextExtractor Unit Tests (Parity với Android)", () => {
  const price = (text: string, size: number | null = null) => extractPrice(text, size);
  const size = (text: string) => extractSize(text);
  const dir = (text: string) => extractDirection(text);
  const type = (text: string) => extractType(text);

  // ---------- Giá ----------
  describe("Giá (Price extraction)", () => {
    it("price with ty and trieu parts", () => {
      expect(price("Nhà 3 tầng 🔸 55m2 🔸 2 tỷ 700 triệu")).toBeCloseTo(2.7, 4);
      expect(price("Chủ thu về 2 tỷ 650")).toBeCloseTo(2.65, 4);
      expect(price("Giá chào 2tỷ480 hh30")).toBeCloseTo(2.48, 4);
      expect(price("Giá :3tỷ950 có thoả thuận")).toBeCloseTo(3.95, 4);
      expect(price("Zá: chào 12,8 tỷ")).toBeCloseTo(12.8, 4);
    });

    it("B4: 3 tỷ 5, 3ty5, 2 tỷ 48 without units", () => {
      expect(price("Bán nhà 3 tỷ 5")).toBeCloseTo(3.5, 4);
      expect(price("Chủ cần bán gấp 3ty5")).toBeCloseTo(3.5, 4);
      expect(price("Giá 2 tỷ 48")).toBeCloseTo(2.48, 4);
    });

    it("price written in millions", () => {
      expect(price("Hòa Nhất, 4 tầng, 58m2, 2750tr, lương 100")).toBeCloseTo(2.75, 4);
      expect(price("giá chỉ 1.950triệu vẫn còn bớt")).toBeCloseTo(1.95, 4);
      expect(price("nhà 50m2, 3 tầng, hướng đông nam, giá 2590, lương 30")).toBeCloseTo(2.59, 4);
      expect(price("Tổ 6: 3tầng-3N-HB-45m2-2.590")).toBeCloseTo(2.59, 4);
    });

    it("commission deposit password and phone numbers are not the price", () => {
      expect(price("Nhà 2 tầng. -Giá :1750 -Pmg :20tr -CDT :0968000000")).toBeCloseTo(1.75, 4);
      expect(price("Giá 3,5 tỷ. Lương 40tr. Cọc 100tr")).toBeCloseTo(3.5, 4);
      expect(price("Căn này mk :6666, Mã khoá 2222")).toBeNull();
      expect(price("Quy.3.3.40.Tây.1980 | Cdt: 090 2281818")).toBeCloseTo(1.98, 4);
    });

    it("size glued to price and extra digits after ty are handled", () => {
      expect(price("Tây Bắc 91m2,3550 triệu")).toBeCloseTo(3.55, 4);
      expect(price("giá 2,99 tỷ 2 căn 3 tầng")).toBeCloseTo(2.99, 4);
    });

    it("price per square metre is multiplied by size", () => {
      expect(price("bán 300m2 đất, giá 20tr/m", 300.0)).toBeCloseTo(6.0, 4);
    });
  });

  // ---------- Diện tích ----------
  describe("Diện tích (Size extraction)", () => {
    it("size variants", () => {
      expect(size("🔸 55m2 🔸 2 tỷ")).toBeCloseTo(55.0, 2);
      expect(size("🔸 50,34m² 🔸")).toBeCloseTo(50.34, 2);
      expect(size("Dt 43m, 3 tầng")).toBeCloseTo(43.0, 2);
      expect(size("diện tích:75m hướng Bắc")).toBeCloseTo(75.0, 2);
      expect(size("Vân Tra .55m .4tầng")).toBeCloseTo(55.0, 2);
    });

    it("width lane and road lengths are not the size", () => {
      expect(size("Dt 42m ngang 5.1m, ngõ 6m")).toBeCloseTo(42.0, 2);
      expect(size("mặt đường 20m, ngõ 6m")).toBeNull();
    });
  });

  // ---------- SĐT ----------
  describe("SĐT (Phone extraction)", () => {
    it("phone formats", () => {
      expect(extractPhone("Chủ Mr A: 077 2216199")).toBe("0772216199");
      expect(extractPhone("LH 0912.345.678")).toBe("0912345678");
      expect(extractPhone("Cđt Thái +84915384832")).toBe("0915384832");
    });
  });

  // ---------- Hướng ----------
  describe("Hướng (Direction extraction)", () => {
    it("direction variants", () => {
      expect(dir("🔸hướng Tây Bắc 🔸 55m2")).toBe("Tây Bắc");
      expect(dir("Hướng : tây")).toBe("Tây");
      expect(dir("Tổ 6: 3tầng-3N-HB-45m2")).toBe("Bắc");
      expect(dir("Tổ 7: 3 tầng-HĐN-50m2")).toBe("Đông Nam");
      expect(dir("Dân hạnh, 2 tầng, 2 PN, Bắc, 47m2")).toBe("Bắc");
      expect(dir("Ngõ 35. 3, 3PN, 62,1m2, ĐB, 3550")).toBe("Đông Bắc");
      expect(dir("Quy.3.3.40.Tây.1980")).toBe("Tây");
      expect(dir("4tầng .51m.mặt ngõ 6m thông.Tây Tứ Trạch")).toBe("Tây");
    });

    it("place names containing direction words are not directions", () => {
      expect(dir("Nhà Kiều Đông 3 tầng 50m2")).toBeNull();
      expect(dir("Bán đất Nam Sơn 300m2")).toBeNull();
    });
  });

  // ---------- Loại ----------
  describe("Loại hình (Property type extraction)", () => {
    it("house vs land", () => {
      expect(type("Nhà 3 tầng lô góc 50m2")).toBe(UnverifiedPropertyType.HOUSE);
      expect(type("Căn 2 tầng 3pn\nThái Sơn Nhà Đất")).toBe(UnverifiedPropertyType.HOUSE);
      expect(type("Diện tích đất: 56 m2. 3 phòng ngủ")).toBe(UnverifiedPropertyType.HOUSE);
      expect(type("Bán lô đất 60m2, giá 1,35 tỷ")).toBe(UnverifiedPropertyType.LAND);
      expect(type("Đất thổ cư 100m2 mặt đường")).toBe(UnverifiedPropertyType.LAND);
    });
  });

  // ---------- Ranh giới từ tiếng Việt ----------
  describe("Ranh giới từ tiếng Việt", () => {
    it("vietnamese word boundaries", () => {
      // "nhà" là từ riêng → nhà; "nhàđất"/"nhà đất" không tính là dấu hiệu nhà
      expect(type("Bán căn nhà, giá tốt")).toBe(UnverifiedPropertyType.HOUSE);
      expect(type("Nhà đất Thái Sơn chuyên lô đất 100m2")).toBe(UnverifiedPropertyType.LAND);
      // "odt" nằm trong từ khác không tính là đất
      expect(type("Mã sản phẩm xodtx")).toBe(UnverifiedPropertyType.HOUSE);
      // "wc" trong từ khác không tính là nhà
      expect(type("Bán đất, liên hệ awcb")).toBe(UnverifiedPropertyType.LAND);
      // "bán" ngay trước giá (có dấu) vẫn là từ khoá giá; "bánh" thì không
      expect(price("Bánh 1500 cái. Bán 1,2 tỷ")).toBeCloseTo(1.2, 4);
      // "tr" dính chữ khác (vd "trệt") không phải đơn vị triệu
      expect(price("Nhà 1 trệt")).toBeNull();
      // SĐT sau chữ có dấu + dấu cách vẫn nhận; dính liền chữ (dễ là mã số) thì bỏ
      expect(extractPhone("Liên hệ Hùng: 0912345678 ngay")).toBe("0912345678");
      expect(extractPhone("Mã Hùng0912345678")).toBeNull();
    });
  });

  // ---------- B5: Khớp khu vực ----------
  describe("B5: Khớp khu vực xuất hiện nhiều lần hoặc nằm trong từ khác", () => {
    it("matchAddress B5 logic", () => {
      expect(
        matchAddress("Anh chủ kẹt tiền bán nhà ở An Ngãi", ["An", "An Ngãi"])
      ).toBe("An Ngãi");

      expect(
        matchAddress("Bán nhà mặt đường An Lão giá rẻ", ["An Lão", "Lão Hộ"])
      ).toBe("An Lão");
    });
  });

  // ---------- Tổng hợp ----------
  describe("Tổng hợp (End-to-end extraction)", () => {
    it("full listing is parsed end to end", () => {
      const p = parseWithRegex(
        "Nhà Kiều Trung 🔸 3 tầng 🔸 3 phòng ngủ🔸 3 wc 🔸hướng Đông 🔸 50,34m2 🔸 2 tỷ 250 triệu\nChủ Mr B: 0974 325 156",
        ["Kiều Trung", "Kiều Đông"]
      );
      expect(p.address).toBe("Kiều Trung");
      expect(p.price).toBeCloseTo(2.25, 4);
      expect(p.area).toBeCloseTo(50.34, 4);
      expect(p.direction).toBe("Đông");
      expect(p.ownerPhone).toBe("0974325156");
      expect(p.propertyType).toBe(UnverifiedPropertyType.HOUSE);
    });

    it("custom regex via JSON", () => {
      const customJson = JSON.stringify({
        REGEX_PRICE: "(\\d+(?:[.,]\\d+)?)\\s*củ"
      });
      const p = parseWithRegex("Bán nhà giá 900 củ", [], customJson);
      expect(p.price).toBeCloseTo(0.9, 4);
    });

    it("parseRawText fallback to manual and auto-fills address", () => {
      const rawText = "Tin không có giá diện tích sđt ở Kiều Trung";
      const p = parseRawText(rawText, ["Kiều Trung"]);
      expect(p.address).toBe("Kiều Trung");
      expect(p.extractedBy).toBe("MANUAL");
    });
  });
});
