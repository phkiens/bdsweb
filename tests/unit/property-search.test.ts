import { describe, expect, it } from "vitest";
import { PropertyFilter, matchesQuery, rankSearchResults } from "../../src/core/engine/property-filter";
import { PropertyStatus } from "../../src/core/models/enums";
import { Property } from "../../src/core/models/property";

describe("Property Search Query & Filter Tests (Diff 5 Parity)", () => {
  const property = (overrides: {
    id?: string;
    area?: string;
    description?: string;
    rawText?: string;
    ownerName?: string;
    ownerPhone?: string;
    price?: number;
    title?: string;
  } = {}): Property => ({
    id: overrides.id || "p1",
    area: overrides.area !== undefined ? overrides.area : "Hòa Xuân",
    latitude: 0,
    longitude: 0,
    areaSize: 100.0,
    price: overrides.price !== undefined ? overrides.price : 3.5,
    description: overrides.description || "",
    rawText: overrides.rawText || "",
    status: PropertyStatus.FOR_SALE,
    direction: "Đông",
    propertyType: "Đất",
    ownerName: overrides.ownerName || "",
    ownerPhone: overrides.ownerPhone || "",
    title: overrides.title,
    updatedAt: Date.now(),
    isVerified: true,
    isDeleted: false
  });

  const matches = (p: Property, query: string, allowOwner: boolean = true) =>
    matchesQuery(p, query, allowOwner);

  const rank = (list: Property[], query: string, allowOwner: boolean = true) =>
    rankSearchResults(list, query, allowOwner);

  const ranked = (list: Property[], query: string, allowOwner: boolean = true) =>
    rank(list, query, allowOwner).items.map((it) => it.id);

  // ===== Bỏ dấu =====
  describe("Diacritics stripping", () => {
    it("query without diacritics matches accented area", () => {
      const p = property({ area: "Hòa Xuân" });
      expect(matches(p, "hoa xuan")).toBe(true);
      expect(matches(p, "HÒA XUÂN")).toBe(true);
    });

    it("old and new tone mark placement match each other", () => {
      // "Hoà" (dấu trên a, kiểu cũ) vs "Hòa" (dấu trên o, kiểu mới)
      expect(matches(property({ area: "Hoà Xuân" }), "Hòa Xuân")).toBe(true);
      expect(matches(property({ area: "Hòa Xuân" }), "Hoà Xuân")).toBe(true);
    });

    it("decomposed unicode text from pasted listing still matches", () => {
      const nfdArea = "Hòa Xuân".normalize("NFD");
      expect(matches(property({ area: nfdArea }), "Hòa Xuân")).toBe(true);
    });
  });

  // ===== Nhiều từ, khác ô, khác thứ tự =====
  describe("Multi-word matching across fields", () => {
    it("each word may match area or owner in any order", () => {
      const p = property({ area: "Hòa Xuân", ownerName: "Nguyễn Văn Nam" });
      expect(matches(p, "Hòa Xuân Nam")).toBe(true);
      expect(matches(p, "nam hoa xuan")).toBe(true);
      expect(matches(p, "nam hoa khanh")).toBe(false);
    });

    it("listing text title and raw text are not searched", () => {
      const p = property({
        area: "Văn Cú",
        title: "Lô góc",
        description: "Nhà 3 phòng ngủ, kiệt ô tô",
        rawText: "Văn phòng công chứng gần nhà"
      });
      expect(matches(p, "lo goc")).toBe(false);
      expect(matches(p, "kiệt")).toBe(false);
      expect(matches(p, "công chứng")).toBe(false);
    });

    it("van phong only matches the Van Phong area, not phong ngu or Van Cu", () => {
      const vanCu = property({ area: "Văn Cú", description: "Nhà 3 tầng 3 phòng ngủ" });
      const vanPhong = property({ area: "Văn Phong" });
      expect(matches(vanCu, "văn phong")).toBe(false);
      expect(matches(vanPhong, "văn phong")).toBe(true);
      expect(matches(vanPhong, "van phong")).toBe(true);
    });
  });

  // ===== SĐT chủ =====
  describe("Owner phone query", () => {
    it("short phone prefix starting with 0 searches owner phone, not price", () => {
      const owner = property({ ownerPhone: "0905123456", price: 7.0 });
      const cheap = property({ ownerPhone: "0987654321", price: 0.905 });
      expect(matches(owner, "0905")).toBe(true);
      expect(matches(cheap, "0905")).toBe(false);
    });

    it("formatted phone query matches", () => {
      const p = property({ ownerPhone: "0905123456" });
      expect(matches(p, "0905 123 456")).toBe(true);
      expect(matches(p, "0905.123.456")).toBe(true);
      expect(matches(p, "+84 905 123 456")).toBe(true);
    });

    it("phone only inside listing text is not searched", () => {
      const p = property({ rawText: "Bán lô đất, LH 0905.123.456 anh Nam" });
      expect(matches(p, "0905123")).toBe(false);
    });

    it("incomplete international prefix does not filter yet", () => {
      expect(matches(property({ ownerPhone: "0905123456" }), "+84")).toBe(true);
    });
  });

  // ===== Livestream =====
  describe("Livestream privacy mode", () => {
    it("livestream mode does not search owner phone or raw listing text", () => {
      const p = property({
        rawText: "Chủ Nam bán gấp, LH 0905123456",
        ownerName: "Nam",
        ownerPhone: "0905123456"
      });
      expect(matches(p, "0905", false)).toBe(false);
      expect(matches(p, "Nam", false)).toBe(false);
      expect(matches(p, "Nam", true)).toBe(true);
      expect(matches(p, "0905", true)).toBe(true);
      expect(matches(p, "hoa xuan", false)).toBe(true);
    });
  });

  // ===== Giá =====
  describe("Price query", () => {
    it("price queries keep working, including ty suffix and leading zero decimals", () => {
      const p = property({ price: 2.5 });
      expect(matches(p, "2.5")).toBe(true);
      expect(matches(p, "2,5")).toBe(true);
      expect(matches(p, "2.5 tỷ")).toBe(true);
      expect(matches(p, "2 ty")).toBe(true);
      expect(matches(p, "3")).toBe(false);
      expect(matches(property({ price: 0.95 }), "0.95")).toBe(true);
    });
  });

  // ===== Ưu tiên khớp đúng dấu & xếp hạng chủ sau khu vực =====
  describe("Accent priority & Owner ranking", () => {
    it("accented query puts exact-accent area first", () => {
      const list = [
        property({ id: "van-mu", area: "Kiệt Nguyễn Vân" }),
        property({ id: "van-sac", area: "Kiệt Lê Văn Hiến" })
      ];
      expect(ranked(list, "văn")).toEqual(["van-sac", "van-mu"]);
      expect(ranked(list, "Vân")).toEqual(["van-mu", "van-sac"]);
    });

    it("unaccented query keeps sorted order", () => {
      const list = [
        property({ id: "a", area: "Vân" }),
        property({ id: "b", area: "Văn" })
      ];
      expect(ranked(list, "van")).toEqual(["a", "b"]);
    });

    it("area matches come before owner-only matches", () => {
      const list = [
        property({ id: "owner", area: "Hòa Xuân", ownerName: "Lê Văn Tám" }),
        property({ id: "area", area: "Kiệt Nguyễn Vân" })
      ];
      expect(ranked(list, "văn")).toEqual(["area", "owner"]);
      expect(rank(list, "văn").ownerMatchStart).toBe(1);
      expect(ranked(list, "van")).toEqual(["area", "owner"]);
      expect(rank(list, "van").ownerMatchStart).toBe(1);
    });

    it("owner group puts exact accent first with decomposed unicode", () => {
      const nfd = "Lê Văn Tám".normalize("NFD");
      const list = [
        property({ id: "van-mu", area: "Hòa Xuân", ownerName: "Trần Vân" }),
        property({ id: "van-sac", area: "Nại Hiên", ownerName: nfd })
      ];
      expect(ranked(list, "văn")).toEqual(["van-sac", "van-mu"]);
      expect(rank(list, "văn").ownerMatchStart).toBe(0);
    });

    it("no owner group when only area matches or livestream", () => {
      const list = [
        property({ id: "a", area: "Vân Đồn" }),
        property({ id: "b", area: "Lê Văn Hiến" })
      ];
      expect(ranked(list, "văn", false)).toEqual(["b", "a"]);
      expect(rank(list, "văn", false).ownerMatchStart).toBe(-1);
      expect(rank(list, "văn").ownerMatchStart).toBe(-1);
    });

    it("price and phone queries keep sorted order", () => {
      const list = [
        property({ id: "a", price: 2.5 }),
        property({ id: "b", price: 2.5 })
      ];
      expect(ranked(list, "2.5")).toEqual(["a", "b"]);
      expect(rank(list, "2.5").ownerMatchStart).toBe(-1);
      expect(ranked(list, "0905")).toEqual(["a", "b"]);
    });
  });

  // ===== B8: Bộ lọc khu vực =====
  describe("B8: PropertyFilter area filter whole words and accents", () => {
    const prop = (area: string) =>
      property({
        area,
        price: 3.0,
        status: PropertyStatus.FOR_SALE
      });

    const matchesAreaFilter = (area: string, ...selected: string[]) =>
      PropertyFilter.matches(prop(area), { areas: new Set(selected) });

    it("khac cach dat dau van khop", () => {
      expect(matchesAreaFilter("Hoà Xuân", "Hòa Xuân")).toBe(true);
      expect(matchesAreaFilter("Hòa Xuân", "hoa xuan")).toBe(true);
    });

    it("quan 1 khong khop quan 10", () => {
      expect(matchesAreaFilter("Quận 10", "Quận 1")).toBe(false);
      expect(matchesAreaFilter("Quận 1", "Quận 1")).toBe(true);
    });

    it("khu vuc chon nam trong ten dai hon theo nguyen tu van khop", () => {
      expect(matchesAreaFilter("Hòa Xuân, Cẩm Lệ", "Cẩm Lệ")).toBe(true);
      expect(matchesAreaFilter("Thanh Khê", "An")).toBe(false);
    });
  });
});
