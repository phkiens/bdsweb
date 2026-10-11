import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  LiveHideItem,
  LIVE_HIDE_ITEMS,
  parseLiveHidden,
  effectiveLiveHidden,
  visibleBottomNavRoutes,
  shouldShowBottomNav
} from "../../src/core/live/live-hide";
import { LiveHotlineLayout } from "../../src/core/live/hotline-layout";
import {
  maskOwnerPhone,
  maskOwnerName,
  MASKED_PHONE,
  MASKED_NAME
} from "../../src/core/live/privacy";
import { SettingsManager } from "../../src/data/local/settings-manager";
import { applyCustomerFilters } from "../../src/core/engine/customer-filter";
import { Customer } from "../../src/core/models/customer";
import {
  CustomerFilter,
  CustomerRole,
  CustomerStatus
} from "../../src/core/models/enums";
import { PropertyFilter, matchesQuery } from "../../src/core/engine/property-filter";
import { Property } from "../../src/core/models/property";
import { StatisticsSummaryExporter } from "../../src/core/statistics/statistics-summary-exporter";
import { StatisticsModel } from "../../src/core/statistics/statistics-model";
import { ownerSaveNoticeText } from "../../src/core/services/customer-linker";

describe("Live L1 Unit Tests", () => {
  // =========================================================================
  // 1. LiveHide
  // =========================================================================
  describe("LiveHide", () => {
    it("parseLiveHidden_null_or_undefined_returnsAll", () => {
      const fromNull = parseLiveHidden(null);
      expect(fromNull.size).toBe(6);
      expect(Array.from(fromNull)).toEqual(
        expect.arrayContaining(Object.values(LiveHideItem))
      );

      const fromUndefined = parseLiveHidden(undefined);
      expect(fromUndefined.size).toBe(6);
      expect(Array.from(fromUndefined)).toEqual(
        expect.arrayContaining(Object.values(LiveHideItem))
      );
    });

    it("parseLiveHidden_withBogus_ignoresBogus", () => {
      const result = parseLiveHidden(["tab_map", "bogus_key", "another_unknown"]);
      expect(result.size).toBe(1);
      expect(result.has(LiveHideItem.TAB_MAP)).toBe(true);
    });

    it("parseLiveHidden_emptySet_returnsEmpty", () => {
      const result = parseLiveHidden([]);
      expect(result.size).toBe(0);
    });

    it("effectiveLiveHidden_notLive_returnsEmpty", () => {
      const saved = new Set(Object.values(LiveHideItem));
      const result = effectiveLiveHidden(false, saved);
      expect(result.size).toBe(0);
    });

    it("effectiveLiveHidden_isLive_returnsSaved", () => {
      const saved = new Set([LiveHideItem.TAB_MAP, LiveHideItem.SETTINGS_BUTTON]);
      const result = effectiveLiveHidden(true, saved);
      expect(result).toBe(saved);
      expect(result.size).toBe(2);
    });

    it("visibleBottomNavRoutes_allHidden", () => {
      const routes = ["property_list", "unverified_list", "customer_list", "map_survey"];
      const hidden = new Set(Object.values(LiveHideItem));
      const visible = visibleBottomNavRoutes(routes, hidden);

      expect(visible).toEqual(["property_list"]);
      expect(shouldShowBottomNav(visible)).toBe(false);
    });

    it("visibleBottomNavRoutes_onlyTabMapHidden", () => {
      const routes = ["property_list", "unverified_list", "customer_list", "map_survey"];
      const hidden = new Set([LiveHideItem.TAB_MAP]);
      const visible = visibleBottomNavRoutes(routes, hidden);

      expect(visible).toEqual(["property_list", "unverified_list", "customer_list"]);
      expect(shouldShowBottomNav(visible)).toBe(true);
    });

    it("visibleBottomNavRoutes_webPaths_supported", () => {
      const paths = ["/", "/unverified", "/customers", "/map", "/settings"];
      const hidden = new Set([
        LiveHideItem.TAB_UNVERIFIED,
        LiveHideItem.TAB_CUSTOMERS,
        LiveHideItem.TAB_MAP,
        LiveHideItem.SETTINGS_BUTTON
      ]);
      const visible = visibleBottomNavRoutes(paths, hidden);

      expect(visible).toEqual(["/"]);
      expect(shouldShowBottomNav(visible)).toBe(false);
    });

    it("shouldShowBottomNav_boundary", () => {
      expect(shouldShowBottomNav([])).toBe(false);
      expect(shouldShowBottomNav(["/"])).toBe(false);
      expect(shouldShowBottomNav(["/", "/customers"])).toBe(true);
    });

    it("liveHideItemKeysAreUniqueAndStable", () => {
      const keys = LIVE_HIDE_ITEMS.map((it) => it.key);
      const expectedKeys = [
        "tab_unverified",
        "tab_customers",
        "tab_map",
        "settings_button",
        "diary_viewings",
        "customer_actions"
      ];
      expect(keys).toEqual(expectedKeys);
      expect(new Set(keys).size).toBe(6);
    });
  });

  // =========================================================================
  // 2. LiveHotlineLayout
  // =========================================================================
  describe("LiveHotlineLayout", () => {
    it("testToFraction", () => {
      expect(LiveHotlineLayout.toFraction(0, 100, 1000)).toBeCloseTo(0, 2);
      expect(LiveHotlineLayout.toFraction(900, 100, 1000)).toBeCloseTo(1, 2);
      expect(LiveHotlineLayout.toFraction(450, 100, 1000)).toBeCloseTo(0.5, 2);
      expect(LiveHotlineLayout.toFraction(5, 100, 100)).toBeCloseTo(0, 2); // no free space
    });

    it("testFromFraction", () => {
      expect(LiveHotlineLayout.fromFraction(0.5, 100, 1000)).toBeCloseTo(450, 2);
      expect(LiveHotlineLayout.fromFraction(2, 100, 1000)).toBeCloseTo(900, 2);
      expect(LiveHotlineLayout.fromFraction(-1, 100, 1000)).toBeCloseTo(0, 2);
    });

    it("testRoundTrip", () => {
      const fraction = LiveHotlineLayout.toFraction(300, 100, 1000);
      expect(LiveHotlineLayout.fromFraction(fraction, 100, 1000)).toBeCloseTo(300, 2);
    });

    it("testClamp", () => {
      expect(LiveHotlineLayout.clamp(-50, 100, 1000)).toBe(0);
      expect(LiveHotlineLayout.clamp(950, 100, 1000)).toBe(900);
    });

    it("testSnapX", () => {
      expect(LiveHotlineLayout.snapX(10, 100, 1000, 24)).toBe(0);
      expect(LiveHotlineLayout.snapX(880, 100, 1000, 24)).toBe(900);
      expect(LiveHotlineLayout.snapX(400, 100, 1000, 24)).toBe(400);
      expect(LiveHotlineLayout.snapX(30, 100, 1000, 24)).toBe(30);
    });
  });

  // =========================================================================
  // 3. LivestreamPrivacy
  // =========================================================================
  describe("LivestreamPrivacy", () => {
    it("maskOwnerPhone_whenLivestreamOff_returnsOriginalPhone", () => {
      const phone = "0912345678";
      expect(maskOwnerPhone(phone, false)).toBe(phone);
    });

    it("maskOwnerPhone_whenLivestreamOn_returnsMask", () => {
      const phone = "0912345678";
      expect(maskOwnerPhone(phone, true)).toBe(MASKED_PHONE);
      expect(maskOwnerPhone(phone, true)).toBe("••••••••••");
    });

    it("maskOwnerPhone_whenPhoneBlank_returnsBlankRegardlessOfLivestream", () => {
      expect(maskOwnerPhone("", false)).toBe("");
      expect(maskOwnerPhone("", true)).toBe("");
      expect(maskOwnerPhone("   ", false)).toBe("   ");
      expect(maskOwnerPhone("   ", true)).toBe("   ");
      expect(maskOwnerPhone(null, true)).toBe("");
      expect(maskOwnerPhone(undefined, true)).toBe("");
    });

    it("maskOwnerName_whenLivestreamOff_returnsOriginalName", () => {
      const name = "Nguyễn Văn A";
      expect(maskOwnerName(name, false)).toBe(name);
    });

    it("maskOwnerName_whenLivestreamOn_returnsMask", () => {
      const name = "Nguyễn Văn A";
      expect(maskOwnerName(name, true)).toBe(MASKED_NAME);
      expect(maskOwnerName(name, true)).toBe("••••••");
    });

    it("maskOwnerName_whenNameBlank_returnsBlankRegardlessOfLivestream", () => {
      expect(maskOwnerName("", false)).toBe("");
      expect(maskOwnerName("", true)).toBe("");
      expect(maskOwnerName("   ", false)).toBe("   ");
      expect(maskOwnerName("   ", true)).toBe("   ");
      expect(maskOwnerName(null, true)).toBe("");
      expect(maskOwnerName(undefined, true)).toBe("");
    });
  });

  // =========================================================================
  // 4. SettingsManager (defaults + read/write live settings)
  // =========================================================================
  describe("SettingsManager Live Settings", () => {
    let mockStorage: Map<string, string>;
    let originalLocalStorage: Storage;

    beforeEach(() => {
      mockStorage = new Map<string, string>();
      originalLocalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: (k: string) => mockStorage.get(k) ?? null,
        setItem: (k: string, v: string) => {
          mockStorage.set(k, String(v));
        },
        removeItem: (k: string) => {
          mockStorage.delete(k);
        },
        clear: () => {
          mockStorage.clear();
        },
        key: (_index: number) => null,
        length: 0
      } as Storage;
    });

    afterEach(() => {
      globalThis.localStorage = originalLocalStorage;
    });

    it("has expected defaults for live settings", () => {
      const mgr = new SettingsManager();
      const settings = mgr.getSettings();

      expect(settings.livestreamMode).toBe(false);
      expect(settings.liveHotlineText).toBe("");
      expect(settings.liveHiddenItems).toBeNull();
      expect(settings.liveHotlineFx).toBe(1);
      expect(settings.liveHotlineFy).toBe(0.25);
    });

    it("can toggle and persist livestream mode", () => {
      const mgr = new SettingsManager();
      mgr.setLivestreamMode(true);
      expect(mgr.getSettings().livestreamMode).toBe(true);

      mgr.setLivestreamMode(false);
      expect(mgr.getSettings().livestreamMode).toBe(false);
    });

    it("can set live hotline text and enforces max 40 chars", () => {
      const mgr = new SettingsManager();
      mgr.setLiveHotlineText("Hotline: 0912.345.678");
      expect(mgr.getSettings().liveHotlineText).toBe("Hotline: 0912.345.678");

      const longText = "A".repeat(50);
      mgr.setLiveHotlineText(longText);
      expect(mgr.getSettings().liveHotlineText.length).toBe(40);
      expect(mgr.getSettings().liveHotlineText).toBe("A".repeat(40));
    });

    it("can set live hidden items and hotline position", () => {
      const mgr = new SettingsManager();
      mgr.setLiveHidden(["tab_unverified", "tab_map"]);
      expect(mgr.getSettings().liveHiddenItems).toEqual(["tab_unverified", "tab_map"]);

      mgr.setLiveHotlinePosition(0.8, 0.45);
      expect(mgr.getSettings().liveHotlineFx).toBe(0.8);
      expect(mgr.getSettings().liveHotlineFy).toBe(0.45);
    });

    it("reset restores live settings to defaults", () => {
      const mgr = new SettingsManager();
      mgr.setLivestreamMode(true);
      mgr.setLiveHotlineText("Live 2026");
      mgr.setLiveHidden(["tab_map"]);
      mgr.setLiveHotlinePosition(0.2, 0.3);

      mgr.reset();
      const res = mgr.getSettings();
      expect(res.livestreamMode).toBe(false);
      expect(res.liveHotlineText).toBe("");
      expect(res.liveHiddenItems).toBeNull();
      expect(res.liveHotlineFx).toBe(1);
      expect(res.liveHotlineFy).toBe(0.25);
    });
  });

  // =========================================================================
  // 5. CustomerFilter (Livestream Privacy Search Constraints)
  // =========================================================================
  describe("CustomerFilter Privacy Search", () => {
    const sampleCustomer: Customer = {
      id: "c1",
      name: "Nguyễn Văn Anh",
      nameNormalized: "nguyen van anh",
      phone: "0905111111",
      role: CustomerRole.BUYER,
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "Quận 1",
      demandDirections: "Đông",
      priceMin: 3.0,
      priceMax: 5.0,
      note: "Quan tâm lô 3 dự án A",
      noteNormalized: "quan tam lo 3 du an a",
      status: CustomerStatus.ACTIVE,
      updatedAt: 1000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };

    const sampleOwner: Customer = {
      id: "o1",
      name: "Lê Thị Bình",
      nameNormalized: "le thi binh",
      phone: "0905222222",
      role: CustomerRole.OWNER,
      demandType: "Cần bán",
      propertyType: "Nhà",
      demandAreas: "Quận 3",
      demandDirections: "Tây",
      priceMin: 10.0,
      priceMax: 12.0,
      note: "Chủ nhà thiện chí",
      noteNormalized: "chu nha thien chi",
      status: CustomerStatus.ACTIVE,
      updatedAt: 2000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };

    it("purePhoneQuery_findsCustomerWhenAllowPhoneMatchTrue_andExcludesWhenFalse", () => {
      const list = [sampleCustomer, sampleOwner];

      const allowed = applyCustomerFilters(
        list,
        CustomerFilter.ALL,
        {},
        "0905111111",
        undefined,
        undefined,
        true, // allowPhoneMatch = true
        true
      );
      expect(allowed.length).toBe(1);
      expect(allowed[0].id).toBe("c1");

      const forbidden = applyCustomerFilters(
        list,
        CustomerFilter.ALL,
        {},
        "0905111111",
        undefined,
        undefined,
        false, // allowPhoneMatch = false
        true
      );
      expect(forbidden.length).toBe(0);
    });

    it("ownerNameQuery_findsOwnerWhenAllowOwnerNameMatchTrue_andExcludesWhenFalse", () => {
      const list = [sampleCustomer, sampleOwner];

      const allowed = applyCustomerFilters(
        list,
        CustomerFilter.ALL,
        {},
        "Lê Thị Bình",
        undefined,
        undefined,
        true,
        true // allowOwnerNameMatch = true
      );
      expect(allowed.length).toBe(1);
      expect(allowed[0].id).toBe("o1");

      const forbidden = applyCustomerFilters(
        list,
        CustomerFilter.ALL,
        {},
        "Lê Thị Bình",
        undefined,
        undefined,
        false,
        false // allowOwnerNameMatch = false
      );
      expect(forbidden.length).toBe(0);
    });

    it("buyerNameQuery_matchesByNameEvenWhenAllowPhoneMatchAndOwnerNameMatchFalse", () => {
      const list = [sampleCustomer, sampleOwner];

      const result = applyCustomerFilters(
        list,
        CustomerFilter.ALL,
        {},
        "Nguyễn Văn Anh",
        undefined,
        undefined,
        false, // allowPhoneMatch = false
        false // allowOwnerNameMatch = false
      );
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("c1");
    });

    it("noteQuery_matchesByNoteWhenAllowPhoneMatchFalse", () => {
      const list = [sampleCustomer, sampleOwner];

      const result = applyCustomerFilters(
        list,
        CustomerFilter.ALL,
        {},
        "Lô 3",
        undefined,
        undefined,
        false,
        false
      );
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("c1");
    });
  });

  // =========================================================================
  // 6. PropertyFilter (Livestream Privacy Search Constraints)
  // =========================================================================
  describe("PropertyFilter Privacy Search", () => {
    const sampleProperty: Property = {
      id: "prop-test-1",
      area: "Lê Chân, Hải Phòng",
      latitude: null,
      longitude: null,
      imagePath: null,
      driveMediaIds: null,
      driveFolderId: null,
      priceAtFolderCreation: null,
      documentUrl: "",
      areaSize: 75.0,
      price: 3.5,
      description: "Nhà mặt tiền đẹp",
      status: "Đang bán",
      surveyDate: "2026-10-01",
      direction: "Đông",
      ownerName: "Nguyễn Văn Nam",
      ownerPhone: "0912345678",
      propertyType: "Nhà",
      needToViewToday: false,
      isDraft: false,
      isTextSynced: true,
      rawText: "",
      diary: "",
      updatedAt: 1000,
      isDeleted: false,
      propertyDetailJsonFileId: null,
      txtFileId: null,
      isMediaSynced: true,
      linkedCustomerId: null,
      title: null,
      mapLink: null,
      extractedBy: null,
      createdAt: 1000,
      isVerified: true,
      lastEditedAt: 1000,
      r2MediaKeys: null,
      soldAt: null
    };

    it("propertyFilter_normalMode_matchesOwnerNameAndPhone", () => {
      expect(matchesQuery(sampleProperty, "Nguyễn Văn Nam", true)).toBe(true);
      expect(matchesQuery(sampleProperty, "0912345678", true)).toBe(true);
      expect(matchesQuery(sampleProperty, "Lê Chân", true)).toBe(true);
    });

    it("propertyFilter_livestreamMode_rejectsOwnerNameAndPhoneMatches_butKeepsArea", () => {
      // Rejects owner identity queries when allowOwnerIdentityMatch = false
      expect(matchesQuery(sampleProperty, "Nguyễn Văn Nam", false)).toBe(false);
      expect(matchesQuery(sampleProperty, "Nam", false)).toBe(false);
      expect(matchesQuery(sampleProperty, "0912345678", false)).toBe(false);

      // Still matches general area field
      expect(matchesQuery(sampleProperty, "Lê Chân", false)).toBe(true);

      // PropertyFilter.matches honors allowOwnerIdentityMatch = false
      const filter = {};
      expect(
        PropertyFilter.matches(sampleProperty, filter, "Nguyễn Văn Nam", false, undefined, false)
      ).toBe(false);
      expect(
        PropertyFilter.matches(sampleProperty, filter, "Lê Chân", false, undefined, false)
      ).toBe(true);
    });
  });

  // =========================================================================
  // 7. StatisticsSummaryExporter (Livestream Alias Masking)
  // =========================================================================
  describe("StatisticsSummaryExporter Livestream Alias", () => {
    it("exports owner performance with alias when isLivestream is true", () => {
      const state = StatisticsModel.createDefaultUiState();
      state.snapshotTimeMillis = 1700000000000;
      state.ownerPerformanceResult = {
        items: [
          {
            ownerId: "owner-1",
            ownerName: "Nguyễn Văn Nam",
            totalPropertiesListed: 5,
            soldPropertiesCount: 3,
            activePropertiesCount: 2,
            activeAgingMedianDays: 30,
            stalePropertiesCount: 0,
            soldRatioProxy: 0.6,
            displaySoldRatioPercent: 60.0,
            confidence: 0,
            drillDownFilter: {} as any
          }
        ],
        summary: {
          totalUniqueOwners: 1,
          totalPropertiesListed: 5,
          totalSoldPropertiesCount: 3,
          overallSoldRatioProxy: 0.6,
          displayOverallSoldRatioPercent: 60.0
        } as any,
        byArea: []
      };

      // Livestream = true: masks owner name to alias "Chủ nhà #1"
      const liveReport = StatisticsSummaryExporter.export(
        state,
        state.snapshotTimeMillis,
        true // isLivestream
      );
      expect(liveReport).toContain("Chủ nhà #1");
      expect(liveReport).not.toContain("Nguyễn Văn Nam");

      // Livestream = false: contains real owner name
      const normalReport = StatisticsSummaryExporter.export(
        state,
        state.snapshotTimeMillis,
        false // isLivestream
      );
      expect(normalReport).toContain("Nguyễn Văn Nam");
      expect(normalReport).not.toContain("Chủ nhà #1");
    });
  });

  // =========================================================================
  // 8. CustomerLinker OwnerSaveNoticeText (Livestream Anonymization)
  // =========================================================================
  describe("CustomerLinker ownerSaveNoticeText", () => {
    it("omits owner name from notice when isLivestream is true", () => {
      const newOwnerNotice = { type: "NewOwnerCreated" as const, name: "Anh Nam" };
      expect(ownerSaveNoticeText(newOwnerNotice, true)).toBe("Đã thêm khách chủ nhà mới");
      expect(ownerSaveNoticeText(newOwnerNotice, false)).toBe("Đã thêm khách chủ nhà mới: Anh Nam");

      const renameNoticeSingle = {
        type: "OwnerRenamed" as const,
        newName: "Anh Bắc",
        otherPropertyCount: 0
      };
      expect(ownerSaveNoticeText(renameNoticeSingle, true)).toBe("Đã đổi tên khách");
      expect(ownerSaveNoticeText(renameNoticeSingle, false)).toBe("Đã đổi tên khách thành Anh Bắc");

      const renameNoticeMulti = {
        type: "OwnerRenamed" as const,
        newName: "Anh Bắc",
        otherPropertyCount: 3
      };
      expect(ownerSaveNoticeText(renameNoticeMulti, true)).toBe("Đã đổi tên chủ ở cả 3 căn khác");
      expect(ownerSaveNoticeText(renameNoticeMulti, false)).toBe(
        "Đã đổi tên chủ thành Anh Bắc ở cả 3 căn khác"
      );
    });
  });
});
