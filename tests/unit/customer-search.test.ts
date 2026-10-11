import { describe, expect, it } from "vitest";
import {
  applyCustomerFilters,
  matchesName,
  matchesPhone,
  normalizePhoneQuery,
} from "../../src/core/engine/customer-filter";
import { CustomerFilter, CustomerRole, CustomerStatus, OwnerPropertySort, OwnerStockFilter } from "../../src/core/models/enums";
import { Customer } from "../../src/core/models/customer";

describe("Customer Search Tests (Diff 6 Parity)", () => {
  const customer = (
    id: string,
    name: string,
    phone: string = "0900000000",
    note: string = "",
    role: CustomerRole | string = CustomerRole.BUYER
  ): Customer => ({
    id,
    name,
    nameNormalized: "",
    phone,
    role,
    demandType: role === CustomerRole.OWNER || role === "OWNER" ? "Cần bán" : "Cần mua",
    propertyType: "Nhà",
    demandAreas: "",
    demandDirections: "",
    priceMin: 0,
    priceMax: 0,
    note,
    noteNormalized: "",
    status: CustomerStatus.ACTIVE,
    updatedAt: Date.now(),
    isSynced: false,
    isDeleted: false,
    avatarPath: null,
    avatarDriveUrl: null,
  });

  const search = (customers: Customer[], query: string): string[] => {
    return applyCustomerFilters(customers, CustomerFilter.ALL, {}, query).map((it) => it.id);
  };

  describe("normalizePhoneQuery", () => {
    it("handles 84 prefixes and phone lengths correctly (B6)", () => {
      // 84 độc lập: giữ nguyên 84, không tự đổi thành 0
      expect(normalizePhoneQuery("84")).toBe("84");

      // 84 kèm số phía sau nhưng CHƯA đủ dài để là SĐT có mã quốc gia: có thể là đoạn giữa số → giữ nguyên
      expect(normalizePhoneQuery("84905")).toBe("84905");

      // Đủ 84 + 9 số mới coi là mã quốc gia
      expect(normalizePhoneQuery("84905123456")).toBe("0905123456");

      // Số thông thường 2 chữ số trở lên
      expect(normalizePhoneQuery("09")).toBe("09");
      expect(normalizePhoneQuery("0905 123")).toBe("0905123");
    });

    it("partial query starting with 84 matches digits in the middle of the number", () => {
      expect(matchesPhone("0938412345", "8412")).toBe(true);
      expect(matchesPhone("0938412345", "384123")).toBe(true);
    });
  });

  describe("matchesName", () => {
    it("matchesName only matches at word start, not middle of word", () => {
      expect(matchesName("An", "an")).toBe(true);
      expect(matchesName("Nguyễn Văn Anh", "an")).toBe(true);
      expect(matchesName("Thanh", "an")).toBe(false);
      expect(matchesName("Lan", "an")).toBe(false);
      expect(matchesName("Hoàng", "ng")).toBe(false);
      expect(matchesName("Anh Tú (chủ lô)", "chu")).toBe(true);
    });

    it("short name query does not return names containing it mid-word", () => {
      const list = [
        customer("thanh", "Thanh"),
        customer("lan", "Lan"),
        customer("anh", "Anh Tuấn"),
        customer("an", "An"),
      ];

      // "An" khớp nguyên từ đứng trước "Anh Tuấn" (chỉ khớp đầu từ); Thanh/Lan bị loại
      expect(search(list, "an")).toEqual(["an", "anh"]);
    });
  });

  describe("searchable note & rankings", () => {
    it("auto generated owner note does not pollute name search", () => {
      const autoOwner = customer(
        "auto",
        "Chủ Nhà",
        "0900000000",
        "Tự động tạo từ thông tin BĐS: Hòa Xuân",
        CustomerRole.OWNER
      );
      const autoOwnerWithUserNote = customer(
        "autoNote",
        "Chủ Khác",
        "0900000000",
        "Tự động tạo từ thông tin BĐS: Hòa Khánh\nKhách quen",
        CustomerRole.OWNER
      );
      const tu = customer("tu", "Anh Tú");
      const list = [autoOwner, autoOwnerWithUserNote, tu];

      expect(search(list, "Tú")).toEqual(["tu"]);
      expect(search(list, "tu")).toEqual(["tu"]);
      expect(search(list, "Hòa")).toEqual([]);
      expect(search(list, "thong tin")).toEqual([]);
      // Phần người dùng ghi thêm dưới dòng tự sinh vẫn tìm được
      expect(search(list, "quen")).toEqual(["autoNote"]);
    });

    it("note matches by word start only and ranks after name", () => {
      const list = [
        customer("note", "Trần Bình", "0900000000", "Khách quan tâm mặt phố"),
        customer("name", "Quang"),
      ];

      // "an" nằm giữa "quan", "tâm" → không khớp ghi chú
      expect(search(list, "an")).toEqual([]);
      // "qua" khớp đầu từ "quan" trong ghi chú và đầu từ tên "Quang"; tên đứng trước
      expect(search(list, "qua")).toEqual(["name", "note"]);
    });

    it("name plus phone digits narrows to the right customer", () => {
      const list = [
        customer("h1", "Nguyễn Hùng", "0912345678"),
        customer("h2", "Trần Hùng", "0987654321"),
        customer("b", "Bình", "0912000000"),
      ];

      expect(search(list, "Hùng 0912")).toEqual(["h1"]);
      expect(search(list, "0912 hung")).toEqual(["h1"]);
    });

    it("name plus phone query does not use phone in livestream mode", () => {
      const list = [customer("h1", "Nguyễn Hùng", "0912345678")];

      const result = applyCustomerFilters(
        list,
        CustomerFilter.ALL,
        {},
        "Hùng 0912",
        OwnerStockFilter.ALL,
        OwnerPropertySort.DEFAULT,
        false // allowPhoneMatch = false
      );
      expect(result).toHaveLength(0);
    });
  });

  describe("accent priority (ea70292)", () => {
    it("query with diacritics puts exact-accent names first", () => {
      const list = [
        customer("tuyen-hoi", "Anh Tuyển"),
        customer("tuyen-sac", "Chị Tuyến"),
      ];

      // Gõ "tuyến" → Tuyến trước Tuyển (dù Tuyển đứng trước trong danh sách gốc)
      expect(search(list, "tuyến")).toEqual(["tuyen-sac", "tuyen-hoi"]);
      // Gõ "Tuyển" → Tuyển trước
      expect(search(list, "Tuyển")).toEqual(["tuyen-hoi", "tuyen-sac"]);
      // Gõ không dấu → cả hai, giữ thứ tự gốc
      expect(search(list, "tuyen")).toEqual(["tuyen-hoi", "tuyen-sac"]);
    });

    it("accent tie-break works with decomposed unicode names", () => {
      const nfdName = "Chị Tuyến".normalize("NFD");
      const list = [customer("hoi", "Anh Tuyển"), customer("sac", nfdName)];

      expect(search(list, "tuyến")).toEqual(["sac", "hoi"]);
    });
  });
});
