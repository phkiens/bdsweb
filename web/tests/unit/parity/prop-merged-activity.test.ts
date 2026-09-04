import { describe, it, expect } from "vitest";
import {
  parseActivityDate,
  parseDiaryEntries,
  buildMergedActivityTimeline,
  formatDiaryEntry,
  canAddViewingLink
} from "../../../src/core/engine/activity-timeline-engine";
import { Customer, CustomerPropertyLink } from "../../../src/core/models/customer";
import { CustomerRole, CustomerStatus } from "../../../src/core/models/enums";

describe("PROP-MERGED-ACTIVITY-001: Merged Activity Timeline Engine", () => {
  describe("parseActivityDate", () => {
    it("should parse dd/MM/yyyy correctly into epoch timestamp", () => {
      const ts = parseActivityDate("15/08/2024");
      expect(ts).toBeGreaterThan(0);
      const d = new Date(ts);
      expect(d.getDate()).toBe(15);
      expect(d.getMonth()).toBe(7); // 0-indexed August
      expect(d.getFullYear()).toBe(2024);
    });

    it("should parse dd/MM/yyyy HH:mm correctly", () => {
      const ts = parseActivityDate("15/08/2024 14:30");
      expect(ts).toBeGreaterThan(0);
      const d = new Date(ts);
      expect(d.getDate()).toBe(15);
      expect(d.getMonth()).toBe(7);
      expect(d.getFullYear()).toBe(2024);
      expect(d.getHours()).toBe(14);
      expect(d.getMinutes()).toBe(30);
    });

    it("should return 0 for null, empty or invalid date strings", () => {
      expect(parseActivityDate("")).toBe(0);
      expect(parseActivityDate(null)).toBe(0);
      expect(parseActivityDate(undefined)).toBe(0);
      expect(parseActivityDate("chua-khao-sat")).toBe(0);
    });
  });

  describe("parseDiaryEntries", () => {
    it("should parse lines separated by newline with 'date - note' format", () => {
      const diaryText = "15/08/2024 - Khách xem ưng ý, chốt giá\n10/08/2024 - Chủ nhà đồng ý bớt 50 triệu";
      const entries = parseDiaryEntries(diaryText);

      expect(entries).toHaveLength(2);
      expect(entries[0].displayDate).toBe("15/08/2024");
      expect(entries[0].text).toBe("Khách xem ưng ý, chốt giá");
      expect(entries[0].type).toBe("DIARY");
      expect(entries[0].sortDate).toBeGreaterThan(entries[1].sortDate);

      expect(entries[1].displayDate).toBe("10/08/2024");
      expect(entries[1].text).toBe("Chủ nhà đồng ý bớt 50 triệu");
    });

    it("should handle diary entries with brackets [HH:mm dd/MM/yyyy]", () => {
      const diaryText = "[14:30 15/08/2024] Đã khảo sát vị trí hẻm\nGhi chú không ngày tháng";
      const entries = parseDiaryEntries(diaryText);

      expect(entries).toHaveLength(2);
      expect(entries[0].text).toBe("Đã khảo sát vị trí hẻm");
      expect(entries[0].displayDate).toBe("14:30 15/08/2024");
      expect(entries[0].sortDate).toBeGreaterThan(0);

      expect(entries[1].text).toBe("Ghi chú không ngày tháng");
      expect(entries[1].displayDate).toBe("");
      expect(entries[1].sortDate).toBe(0);
    });

    it("should return empty array for empty or blank diary", () => {
      expect(parseDiaryEntries("")).toEqual([]);
      expect(parseDiaryEntries("   \n   ")).toEqual([]);
      expect(parseDiaryEntries(null)).toEqual([]);
    });
  });

  describe("buildMergedActivityTimeline", () => {
    const mockCustomers: Customer[] = [
      {
        id: "c-1",
        name: "Anh Hoàng",
        phone: "0901234567",
        role: CustomerRole.BUYER,
        demandType: "Cần mua",
        priceRange: "3-5 tỷ",
        preferredArea: "Bình Thạnh",
        note: null,
        status: CustomerStatus.ACTIVE,
        updatedAt: 1000,
        isSynced: true,
        isDeleted: false,
        avatarPath: null,
        avatarDriveUrl: null
      },
      {
        id: "c-2",
        name: "Chị Lan",
        phone: "0912345678",
        role: CustomerRole.BUYER,
        demandType: "Cần mua",
        priceRange: "5-7 tỷ",
        preferredArea: "Phú Nhuận",
        note: null,
        status: CustomerStatus.CLOSED,
        updatedAt: 1000,
        isSynced: true,
        isDeleted: false,
        avatarPath: null,
        avatarDriveUrl: null
      },
      {
        id: "c-deleted",
        name: "Khách Đã Xóa",
        phone: "0999999999",
        role: CustomerRole.BUYER,
        demandType: "Cần mua",
        priceRange: "",
        preferredArea: "",
        note: null,
        status: CustomerStatus.ACTIVE,
        updatedAt: 1000,
        isSynced: true,
        isDeleted: true,
        avatarPath: null,
        avatarDriveUrl: null
      }
    ];

    const customerMap = new Map(mockCustomers.map((c) => [c.id, c]));

    it("should merge diary notes and customer viewings in descending chronological order", () => {
      const diaryText = "12/08/2024 - Chủ nhà báo tạm ngưng bán 3 ngày";

      const links: CustomerPropertyLink[] = [
        {
          customerId: "c-1",
          propertyId: "p-1",
          role: "VIEWER",
          viewDate: "20/08/2024",
          viewNote: "Dẫn khách xem lần 1, khách thích phòng khách",
          updatedAt: 1000,
          isDeleted: false,
          isSynced: true
        },
        {
          customerId: "c-2",
          propertyId: "p-1",
          role: "VIEWER",
          viewDate: "05/08/2024",
          viewNote: "Chê ngõ hơi hẹp",
          updatedAt: 1000,
          isDeleted: false,
          isSynced: true
        }
      ];

      const merged = buildMergedActivityTimeline(diaryText, links, customerMap);

      expect(merged).toHaveLength(3);
      // Item 0: Viewing on 20/08/2024 (c-1)
      expect(merged[0].type).toBe("VIEWING");
      if (merged[0].type === "VIEWING") {
        expect(merged[0].customerName).toBe("Anh Hoàng");
        expect(merged[0].displayDate).toBe("20/08/2024");
        expect(merged[0].note).toBe("Dẫn khách xem lần 1, khách thích phòng khách");
      }

      // Item 1: Diary on 12/08/2024
      expect(merged[1].type).toBe("DIARY");
      if (merged[1].type === "DIARY") {
        expect(merged[1].displayDate).toBe("12/08/2024");
        expect(merged[1].text).toBe("Chủ nhà báo tạm ngưng bán 3 ngày");
      }

      // Item 2: Viewing on 05/08/2024 (c-2, CLOSED customer)
      expect(merged[2].type).toBe("VIEWING");
      if (merged[2].type === "VIEWING") {
        expect(merged[2].customerName).toBe("Chị Lan (Đã đóng)");
        expect(merged[2].displayDate).toBe("05/08/2024");
      }
    });

    it("should filter out deleted links, deleted customers, and non-viewer roles", () => {
      const links: CustomerPropertyLink[] = [
        {
          customerId: "c-deleted",
          propertyId: "p-1",
          role: "VIEWER",
          viewDate: "15/08/2024",
          viewNote: "Xem nhà",
          updatedAt: 1000,
          isDeleted: false,
          isSynced: true
        },
        {
          customerId: "c-1",
          propertyId: "p-1",
          role: "VIEWER",
          viewDate: "15/08/2024",
          viewNote: "Đã xóa",
          updatedAt: 1000,
          isDeleted: true,
          isSynced: true
        },
        {
          customerId: "c-1",
          propertyId: "p-1",
          role: "OWNER",
          viewDate: "15/08/2024",
          viewNote: "Chủ nhà liên kết",
          updatedAt: 1000,
          isDeleted: false,
          isSynced: true
        }
      ];

      const merged = buildMergedActivityTimeline("", links, customerMap);
      expect(merged).toHaveLength(0);
    });
  });

  describe("canAddViewingLink and formatDiaryEntry", () => {
    it("canAddViewingLink should disallow duplicate active links", () => {
      const existingLinks: CustomerPropertyLink[] = [
        {
          customerId: "c-1",
          propertyId: "p-1",
          role: "VIEWER",
          updatedAt: 1000,
          isDeleted: false,
          isSynced: true
        }
      ];

      expect(canAddViewingLink("c-1", "p-1", existingLinks)).toBe(false);
      expect(canAddViewingLink("c-2", "p-1", existingLinks)).toBe(true);

      // Soft deleted link should not block
      const deletedLinks: CustomerPropertyLink[] = [
        {
          customerId: "c-1",
          propertyId: "p-1",
          role: "VIEWER",
          updatedAt: 1000,
          isDeleted: true,
          isSynced: true
        }
      ];
      expect(canAddViewingLink("c-1", "p-1", deletedLinks)).toBe(true);
    });

    it("formatDiaryEntry should format as 'dd/MM/yyyy - content'", () => {
      const fixedDate = new Date(2024, 7, 25); // 25/08/2024
      const entry = formatDiaryEntry("Khách khen nhà đẹp", fixedDate);
      expect(entry).toBe("25/08/2024 - Khách khen nhà đẹp");
    });
  });
});
