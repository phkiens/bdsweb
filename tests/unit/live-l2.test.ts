import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { AppDatabase } from "../../src/data/local/db";
import {
  LiveEventType,
  LiveEvent,
  LiveEventDetector
} from "../../src/core/live/live-event";
import { LiveEventBus, liveEventBus } from "../../src/core/live/live-event-bus";
import { LiveNoticeBus, liveNoticeBus } from "../../src/core/live/live-notice-bus";
import { LiveMediaBanner } from "../../src/core/live/live-media-banner";
import { LiveOverlayState } from "../../src/core/live/live-overlay-state";
import { LiveFeedPrefs, liveFeedPrefs } from "../../src/core/live/live-feed-prefs";
import { LiveEventStyle } from "../../src/core/live/live-event-style";
import { LiveFeedBuilder, LiveFeedDay } from "../../src/core/live/live-feed";
import { LiveListScroll } from "../../src/core/live/live-list-scroll";
import {
  computeDefaultPriceDrops,
  computePriceDropLeaders,
  PriceDropWindow,
  PriceDropItem
} from "../../src/core/engine/price-drop-calculator";
import { Property, createDefaultProperty } from "../../src/core/models/property";
import { PropertyStatus } from "../../src/core/models/enums";
import {
  PropertyPriceHistory,
  PriceHistoryChangeType,
  PriceEditKind
} from "../../src/core/models/price-history";

describe("Live L2 Parity Unit Tests (Ported from Android Native)", () => {
  const NOW = 1_800_000_000_000;

  function makeProp(overrides: Partial<Property> = {}): Property {
    return createDefaultProperty({
      id: "p1",
      area: "bắc sơn",
      areaSize: 60,
      price: 3.0,
      propertyType: "Nhà",
      updatedAt: NOW,
      createdAt: NOW,
      isVerified: true,
      isDraft: false,
      isDeleted: false,
      status: PropertyStatus.FOR_SALE,
      ...overrides
    });
  }

  /* -------------------------------------------------------------------------- */
  /* 1. LiveEventDetector Tests                                                  */
  /* -------------------------------------------------------------------------- */
  describe("LiveEventDetector", () => {
    it("beforeNull_afterVerified_NEW_LISTING", () => {
      const after = makeProp();
      const events = LiveEventDetector.detect(null, after, NOW);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LiveEventType.NEW_LISTING);
    });

    it("beforeUnverified_afterVerified_NEW_LISTING", () => {
      const before = makeProp({ isVerified: false });
      const after = makeProp({ isVerified: true });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LiveEventType.NEW_LISTING);
    });

    it("beforeDraft_afterNotDraft_NEW_LISTING", () => {
      const before = makeProp({ isDraft: true });
      const after = makeProp({ isDraft: false });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LiveEventType.NEW_LISTING);
    });

    it("afterUnverified_or_Draft_or_Deleted_returnsEmpty", () => {
      expect(
        LiveEventDetector.detect(makeProp(), makeProp({ isVerified: false }), NOW)
      ).toHaveLength(0);
      expect(
        LiveEventDetector.detect(makeProp(), makeProp({ isDraft: true }), NOW)
      ).toHaveLength(0);
      expect(
        LiveEventDetector.detect(makeProp(), makeProp({ isDeleted: true }), NOW)
      ).toHaveLength(0);
    });

    it("priceDrop_MARKET_CHANGE_PRICE_DROP", () => {
      const before = makeProp({ price: 3.0 });
      const after = makeProp({ price: 2.8, priceEditKind: PriceEditKind.MARKET_CHANGE });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LiveEventType.PRICE_DROP);
      expect(events[0].before?.price).toBe(3.0);
      expect(events[0].after.price).toBe(2.8);
    });

    it("priceRise_null_PRICE_RISE", () => {
      const before = makeProp({ price: 3.0 });
      const after = makeProp({ price: 3.2, priceEditKind: null });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LiveEventType.PRICE_RISE);
      expect(events[0].before?.price).toBe(3.0);
      expect(events[0].after.price).toBe(3.2);
    });

    it("priceDrop_DATA_CORRECTION_empty", () => {
      const before = makeProp({ price: 3.0 });
      const after = makeProp({ price: 2.8, priceEditKind: PriceEditKind.DATA_CORRECTION });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(0);
    });

    it("statusSold_BACK_ON_SALE", () => {
      const forSale = makeProp({ status: PropertyStatus.FOR_SALE });
      const sold = makeProp({ status: PropertyStatus.SOLD });

      const soldEvents = LiveEventDetector.detect(forSale, sold, NOW);
      expect(soldEvents).toHaveLength(1);
      expect(soldEvents[0].type).toBe(LiveEventType.SOLD);

      const backEvents = LiveEventDetector.detect(sold, forSale, NOW);
      expect(backEvents).toHaveLength(1);
      expect(backEvents[0].type).toBe(LiveEventType.BACK_ON_SALE);
    });

    it("imagePathAdded_PHOTOS_ADDED", () => {
      const before = makeProp({ imagePath: "a.jpg" });
      const after = makeProp({ imagePath: "a.jpg|||b.jpg|||c.jpg" });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LiveEventType.PHOTOS_ADDED);
      expect(events[0].photosAdded).toBe(2);
    });

    it("r2MediaKeysAdded_PHOTOS_ADDED", () => {
      const r2Old = JSON.stringify([{ objectKey: "properties/p1/a.jpg", fileName: "a.jpg" }]);
      const r2New = JSON.stringify([
        { objectKey: "properties/p1/a.jpg", fileName: "a.jpg" },
        { objectKey: "properties/p1/b.jpg", fileName: "b.jpg" },
        { objectKey: "properties/p1/c.jpg", fileName: "c.jpg" }
      ]);
      const before = makeProp({ r2MediaKeys: r2Old });
      const after = makeProp({ r2MediaKeys: r2New });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LiveEventType.PHOTOS_ADDED);
      expect(events[0].photosAdded).toBe(2);
    });

    it("soldAndPriceDrop_both", () => {
      const before = makeProp({ price: 3.0, status: PropertyStatus.FOR_SALE });
      const after = makeProp({ price: 2.8, status: PropertyStatus.SOLD });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(2);
      expect(events.some((e) => e.type === LiveEventType.SOLD)).toBe(true);
      expect(events.some((e) => e.type === LiveEventType.PRICE_DROP)).toBe(true);
    });

    it("staleUpdate_empty", () => {
      const before = makeProp({ price: 3.0 });
      const after = makeProp({
        price: 2.8,
        updatedAt: NOW - LiveEventDetector.FRESH_WINDOW_MS - 1
      });
      const events = LiveEventDetector.detect(before, after, NOW);
      expect(events).toHaveLength(0);
    });

    it("noChange_empty", () => {
      const p = makeProp();
      const events = LiveEventDetector.detect(p, p, NOW);
      expect(events).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. LiveFeedBuilder Tests                                                    */
  /* -------------------------------------------------------------------------- */
  describe("LiveFeedBuilder", () => {
    const oldCreatedAt = NOW - 10 * 24 * 3600 * 1000;

    it("testBuild_NewListing", () => {
      const p1 = makeProp({ id: "1", createdAt: NOW - 3600_000 });
      const p2 = makeProp({ id: "2", createdAt: NOW - 8 * 24 * 3600 * 1000 });
      const p3 = makeProp({ id: "3", createdAt: NOW + 3600_000 });

      const items = LiveFeedBuilder.build([p1, p2, p3], [], NOW, new Set());
      expect(items).toHaveLength(1);
      expect(items[0].key).toBe("new:1");
      expect(items[0].type).toBe(LiveEventType.NEW_LISTING);
    });

    it("testBuild_UnverifiedDraftDeleted", () => {
      const p1 = makeProp({ id: "1", createdAt: NOW - 1000, isVerified: false });
      const p2 = makeProp({ id: "2", createdAt: NOW - 1000, isDraft: true });
      const p3 = makeProp({ id: "3", createdAt: NOW - 1000, isDeleted: true });

      const items = LiveFeedBuilder.build([p1, p2, p3], [], NOW, new Set());
      expect(items).toHaveLength(0);
    });

    it("testBuild_Sold", () => {
      const p1 = makeProp({
        id: "1",
        createdAt: oldCreatedAt,
        status: PropertyStatus.SOLD,
        soldAt: NOW - 2 * 24 * 3600 * 1000
      });
      const p2 = makeProp({
        id: "2",
        createdAt: oldCreatedAt,
        status: PropertyStatus.SOLD,
        soldAt: null
      });

      const items = LiveFeedBuilder.build([p1, p2], [], NOW, new Set());
      expect(items).toHaveLength(1);
      expect(items[0].key).toBe(`sold:1:${p1.soldAt}`);
      expect(items[0].type).toBe(LiveEventType.SOLD);
    });

    it("testBuild_PriceChange", () => {
      const p1 = makeProp({ id: "1", createdAt: oldCreatedAt });

      const h1: PropertyPriceHistory = {
        id: "h1",
        propertyId: "1",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        previousPrice: 3.0,
        currentPrice: 2.5,
        recordedAt: NOW - 1000,
        editKind: PriceEditKind.MARKET_CHANGE,
        revision: 1
      };
      const h2: PropertyPriceHistory = {
        id: "h2",
        propertyId: "1",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        previousPrice: 2.5,
        currentPrice: 2.8,
        recordedAt: NOW - 2000,
        editKind: PriceEditKind.UNSPECIFIED,
        revision: 2
      };
      const h3: PropertyPriceHistory = {
        id: "h3",
        propertyId: "1",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        previousPrice: 3.0,
        currentPrice: 2.5,
        recordedAt: NOW - 3000,
        editKind: PriceEditKind.DATA_CORRECTION,
        revision: 3
      };
      const h4: PropertyPriceHistory = {
        id: "h4",
        propertyId: "1",
        changeType: PriceHistoryChangeType.BASELINE,
        previousPrice: 3.0,
        currentPrice: 2.5,
        recordedAt: NOW - 4000,
        editKind: PriceEditKind.UNSPECIFIED,
        revision: 4
      };
      const h5: PropertyPriceHistory = {
        id: "h5",
        propertyId: "1",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        previousPrice: null,
        currentPrice: 2.5,
        recordedAt: NOW - 5000,
        editKind: PriceEditKind.UNSPECIFIED,
        revision: 5
      };

      const items = LiveFeedBuilder.build([p1], [h1, h2, h3, h4, h5], NOW, new Set());
      const keys = new Set(items.map((it) => it.key));
      expect(keys).toEqual(new Set(["price:h1", "price:h2"]));

      const itemH1 = items.find((it) => it.key === "price:h1");
      expect(itemH1?.type).toBe(LiveEventType.PRICE_DROP);
      expect(itemH1?.oldPrice).toBe(3.0);
      expect(itemH1?.newPrice).toBe(2.5);

      const itemH2 = items.find((it) => it.key === "price:h2");
      expect(itemH2?.type).toBe(LiveEventType.PRICE_RISE);
    });

    it("testBuild_HiddenKeysAndOrdering", () => {
      const p1 = makeProp({ id: "1", createdAt: NOW - 1000 });
      const p2 = makeProp({ id: "2", createdAt: NOW - 2000 });

      const items1 = LiveFeedBuilder.build([p1, p2], [], NOW, new Set());
      expect(items1).toHaveLength(2);
      expect(items1[0].key).toBe("new:1");
      expect(items1[1].key).toBe("new:2");

      const items2 = LiveFeedBuilder.build([p1, p2], [], NOW, new Set(["new:1"]));
      expect(items2).toHaveLength(1);
      expect(items2[0].key).toBe("new:2");
    });

    it("testDayOf", () => {
      const timeZone = "Asia/Ho_Chi_Minh";
      const baseDate = new Date("2026-10-01T12:00:00+07:00").getTime();
      const today = baseDate;
      const yesterday = new Date("2026-09-30T23:59:00+07:00").getTime();
      const earlier = new Date("2026-09-28T12:00:00+07:00").getTime();

      expect(LiveFeedBuilder.dayOf(today, baseDate, timeZone)).toBe(LiveFeedDay.TODAY);
      expect(LiveFeedBuilder.dayOf(yesterday, baseDate, timeZone)).toBe(LiveFeedDay.YESTERDAY);
      expect(LiveFeedBuilder.dayOf(earlier, baseDate, timeZone)).toBe(LiveFeedDay.EARLIER);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. LiveEventBus Tests                                                       */
  /* -------------------------------------------------------------------------- */
  describe("LiveEventBus", () => {
    beforeEach(() => {
      liveEventBus.resetForTest();
    });

    it("publishTwoEvents_seqIncreasing", () => {
      const e1: LiveEvent = { type: LiveEventType.NEW_LISTING, after: makeProp() };
      const e2: LiveEvent = { type: LiveEventType.NEW_LISTING, after: makeProp() };
      const now = 1000;

      liveEventBus.publish([e1, e2], now);
      const history = liveEventBus.history;
      expect(history).toHaveLength(2);
      expect((history[0].seq ?? 0) < (history[1].seq ?? 0)).toBe(true);
      expect(history[0].publishedAt).toBe(now);
      expect(history[1].publishedAt).toBe(now);
      expect(history[1].seq).toBe(liveEventBus.latestSeq());
    });

    it("publish105Events_historyLimitedTo100", () => {
      for (let i = 1; i <= 105; i++) {
        liveEventBus.publish([{ type: LiveEventType.NEW_LISTING, after: makeProp() }]);
      }
      const history = liveEventBus.history;
      expect(history).toHaveLength(LiveEventBus.HISTORY_LIMIT);
      expect((history[history.length - 1].seq ?? 0) > (history[0].seq ?? 0)).toBe(true);
    });

    it("publishEmptyList_historyUnchanged", () => {
      liveEventBus.publish([{ type: LiveEventType.NEW_LISTING, after: makeProp() }]);
      const seqBefore = liveEventBus.latestSeq();
      liveEventBus.publish([]);
      const seqAfter = liveEventBus.latestSeq();
      expect(seqAfter).toBe(seqBefore);
      expect(liveEventBus.history).toHaveLength(1);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. LiveEventStyle Tests                                                     */
  /* -------------------------------------------------------------------------- */
  describe("LiveEventStyle", () => {
    it("priceDrop_detail", () => {
      const before = makeProp({ price: 4.2 });
      const after = makeProp({ price: 3.9 });
      const event: LiveEvent = { type: LiveEventType.PRICE_DROP, before, after };
      const text = LiveEventStyle.text(event);
      expect(text.detail).toBe("4.2 tỷ → 3.9 tỷ (−7%)");
    });

    it("priceRise_detail", () => {
      const before = makeProp({ price: 0.85 });
      const after = makeProp({ price: 0.9 });
      const event: LiveEvent = { type: LiveEventType.PRICE_RISE, before, after };
      const text = LiveEventStyle.text(event);
      expect(text.detail).toBe("850 triệu → 900 triệu (+6%)");
    });

    it("testPercentLabel", () => {
      const dropEvent: LiveEvent = {
        type: LiveEventType.PRICE_DROP,
        before: makeProp({ price: 4.2 }),
        after: makeProp({ price: 3.9 })
      };
      expect(LiveEventStyle.percentLabel(dropEvent)).toBe("−7%");

      const riseEvent: LiveEvent = {
        type: LiveEventType.PRICE_RISE,
        before: makeProp({ price: 0.85 }),
        after: makeProp({ price: 0.9 })
      };
      expect(LiveEventStyle.percentLabel(riseEvent)).toBe("+6%");

      const tinyRiseEvent: LiveEvent = {
        type: LiveEventType.PRICE_RISE,
        before: makeProp({ price: 3.0 }),
        after: makeProp({ price: 3.001 })
      };
      expect(LiveEventStyle.percentLabel(tinyRiseEvent)).toBeNull();

      const soldEvent: LiveEvent = {
        type: LiveEventType.SOLD,
        before: makeProp({ price: 3.0 }),
        after: makeProp({ price: 3.0 })
      };
      expect(LiveEventStyle.percentLabel(soldEvent)).toBeNull();
    });

    it("photosAdded_detail", () => {
      const before = makeProp({ price: 3.0 });
      const after = makeProp({ price: 3.0 });
      const event: LiveEvent = {
        type: LiveEventType.PHOTOS_ADDED,
        before,
        after,
        photosAdded: 3
      };
      const text = LiveEventStyle.text(event);
      expect(text.detail).toBe("+3 ảnh mới");
    });

    it("subtitle_and_owner_exclusion", () => {
      const before = makeProp({ price: 3.0 });
      const after = makeProp({
        price: 3.0,
        area: "bắc sơn",
        areaSize: 62.0,
        ownerName: "Anh Nam"
      });
      const event: LiveEvent = { type: LiveEventType.NEW_LISTING, before, after };
      const text = LiveEventStyle.text(event);
      expect(text.subtitle).toBe("Bắc Sơn · 62 m²");

      expect(text.title.includes("Anh Nam")).toBe(false);
      expect(text.subtitle.includes("Anh Nam")).toBe(false);
      expect((text.detail || "").includes("Anh Nam")).toBe(false);
    });

    it("validTitleAndEmoji", () => {
      const types = [
        LiveEventType.NEW_LISTING,
        LiveEventType.PRICE_DROP,
        LiveEventType.PRICE_RISE,
        LiveEventType.SOLD,
        LiveEventType.BACK_ON_SALE,
        LiveEventType.PHOTOS_ADDED
      ];
      for (const t of types) {
        const emoji = LiveEventStyle.emoji(t);
        const title = LiveEventStyle.text({ type: t, after: makeProp() }).title;
        expect(emoji).not.toBe("");
        expect(title).not.toBe("");
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. LiveFeedPrefs Tests                                                      */
  /* -------------------------------------------------------------------------- */
  describe("LiveFeedPrefs", () => {
    let mockStorage: Map<string, string>;

    beforeEach(() => {
      mockStorage = new Map<string, string>();
      const storageMock = {
        getItem: (k: string) => mockStorage.get(k) ?? null,
        setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
        removeItem: (k: string) => mockStorage.delete(k),
        clear: () => mockStorage.clear(),
        key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
        length: 0
      };
      if (typeof globalThis.localStorage === "undefined") {
        (globalThis as unknown as { localStorage: unknown }).localStorage = storageMock;
      } else {
        globalThis.localStorage.clear();
      }
    });

    it("testHideUnhideHiddenKeys", () => {
      const prefs = new LiveFeedPrefs();
      prefs.hide("key1", 1000);
      prefs.hide("key2", 2000);

      expect(prefs.hiddenKeys()).toEqual(new Set(["key1", "key2"]));

      prefs.unhide("key1");
      expect(prefs.hiddenKeys()).toEqual(new Set(["key2"]));
    });

    it("testPrune", () => {
      const prefs = new LiveFeedPrefs();
      const now = 1000000000;
      const oldAt = now - LiveFeedBuilder.WINDOW_MS - 1;
      const freshAt = now - 1000;

      prefs.hide("old", oldAt);
      prefs.hide("fresh", freshAt);

      expect(prefs.hiddenKeys()).toEqual(new Set(["old", "fresh"]));

      prefs.prune(now);
      expect(prefs.hiddenKeys()).toEqual(new Set(["fresh"]));
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 6. LiveMediaBanner Tests                                                    */
  /* -------------------------------------------------------------------------- */
  describe("LiveMediaBanner", () => {
    it("testShouldShow", () => {
      expect(LiveMediaBanner.shouldShow(594, 0)).toBe(true);
      expect(LiveMediaBanner.shouldShow(594, 594)).toBe(false);
      expect(LiveMediaBanner.shouldShow(600, 594)).toBe(true);
      expect(LiveMediaBanner.shouldShow(0, 0)).toBe(false);
    });

    it("testLowerAck", () => {
      expect(LiveMediaBanner.lowerAck(500, 594)).toBe(500);
      expect(LiveMediaBanner.lowerAck(600, 594)).toBe(594);
      expect(LiveMediaBanner.lowerAck(0, 594)).toBe(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 7. LiveNoticeBus Tests                                                      */
  /* -------------------------------------------------------------------------- */
  describe("LiveNoticeBus", () => {
    beforeEach(() => {
      liveNoticeBus.resetForTest();
    });

    it("testPublishMediaRestored_IncreasesSeq", () => {
      liveNoticeBus.publishMediaRestored(3, 5);
      const notice = liveNoticeBus.mediaRestored;
      expect(notice).not.toBeNull();
      expect(notice!.seq).toBeGreaterThan(0);
      expect(notice!.successCount).toBe(3);
      expect(notice!.totalCount).toBe(5);

      const firstSeq = notice!.seq;
      liveNoticeBus.publishMediaRestored(1, 2);
      const notice2 = liveNoticeBus.mediaRestored;
      expect(notice2).not.toBeNull();
      expect(notice2!.seq).toBeGreaterThan(firstSeq);
    });

    it("testPublishMediaRestored_ZeroSuccess_NoChange", () => {
      liveNoticeBus.publishMediaRestored(3, 5);
      const firstNotice = liveNoticeBus.mediaRestored;

      liveNoticeBus.publishMediaRestored(0, 5);
      const secondNotice = liveNoticeBus.mediaRestored;

      expect(secondNotice).toEqual(firstNotice);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 8. LiveOverlayState Tests                                                   */
  /* -------------------------------------------------------------------------- */
  describe("LiveOverlayState", () => {
    beforeEach(() => {
      liveEventBus.resetForTest();
      liveNoticeBus.resetForTest();
    });

    it("reset_skipsOldEvents_andAsksAboutPendingMediaOnce", () => {
      liveEventBus.publish([{ type: LiveEventType.SOLD, after: makeProp() }]);
      liveNoticeBus.publishMediaRestored(3, 5);
      LiveOverlayState.mediaAck = 99;

      LiveOverlayState.reset();

      expect(LiveOverlayState.lastShownSeq).toBe(liveEventBus.latestSeq());
      expect(LiveOverlayState.restoredAck).toBe(liveNoticeBus.mediaRestored!.seq);
      expect(LiveOverlayState.mediaAck).toBe(0);
    });

    it("dismissInOneHost_isSeenByTheOther", () => {
      LiveOverlayState.reset();
      liveEventBus.publish([
        { type: LiveEventType.PRICE_DROP, before: makeProp({ price: 3.0 }), after: makeProp({ price: 2.5 }) }
      ]);
      const newSeq = liveEventBus.latestSeq();

      LiveOverlayState.lastShownSeq = newSeq;

      expect(LiveOverlayState.lastShownSeq).toBe(newSeq);
      expect(liveEventBus.history.every((it) => (it.seq ?? 0) <= LiveOverlayState.lastShownSeq)).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 9. computeDefaultPriceDrops & computePriceDropLeaders Tests                */
  /* -------------------------------------------------------------------------- */
  describe("computeDefaultPriceDrops & computePriceDropLeaders", () => {
    it("computeDefaultPriceDrops filters deleted properties and data corrections", () => {
      const p1 = makeProp({ id: "p1", price: 2.5 });
      const pDeleted = makeProp({ id: "p2", price: 2.0, isDeleted: true });

      const h1: PropertyPriceHistory = {
        id: "h1",
        propertyId: "p1",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        previousPrice: 3.0,
        currentPrice: 2.5,
        recordedAt: NOW - 10_000,
        editKind: PriceEditKind.MARKET_CHANGE,
        revision: 1
      };
      const hDeleted: PropertyPriceHistory = {
        id: "h2",
        propertyId: "p2",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        previousPrice: 3.0,
        currentPrice: 2.0,
        recordedAt: NOW - 10_000,
        editKind: PriceEditKind.MARKET_CHANGE,
        revision: 1
      };

      const drops = computeDefaultPriceDrops([p1, pDeleted], [h1, hDeleted], NOW, PriceDropWindow.DAYS_7);
      expect(drops).toHaveLength(1);
      expect(drops[0].property.id).toBe("p1");
      expect(drops[0].dropAmount).toBe(0.5);
    });

    it("computePriceDropLeaders requires items.length >= 2", () => {
      const singleItem: PriceDropItem = {
        property: makeProp({ id: "p1" }),
        latestHistory: {
          id: "h1",
          propertyId: "p1",
          changeType: PriceHistoryChangeType.PRICE_CHANGE,
          previousPrice: 3.0,
          currentPrice: 2.5,
          recordedAt: NOW - 1000,
          editKind: PriceEditKind.MARKET_CHANGE,
          revision: 1
        },
        dropAmount: 0.5,
        dropPercent: 16.7,
        previousPrice: 3.0,
        currentPrice: 2.5,
        dropTimestamp: NOW - 1000
      };

      const leaders = computePriceDropLeaders([singleItem]);
      expect(leaders.topAmountId).toBeNull();
      expect(leaders.topPercentId).toBeNull();
    });

    it("computePriceDropLeaders correctly identifies topAmount and topPercent", () => {
      // p1 drops 1.0 ty (10.0 -> 9.0) = 10%
      const item1: PriceDropItem = {
        property: makeProp({ id: "p1" }),
        latestHistory: {
          id: "h1",
          propertyId: "p1",
          changeType: PriceHistoryChangeType.PRICE_CHANGE,
          previousPrice: 10.0,
          currentPrice: 9.0,
          recordedAt: NOW - 1000,
          editKind: PriceEditKind.MARKET_CHANGE,
          revision: 1
        },
        dropAmount: 1.0,
        dropPercent: 10.0,
        previousPrice: 10.0,
        currentPrice: 9.0,
        dropTimestamp: NOW - 1000
      };

      // p2 drops 0.5 ty (1.0 -> 0.5) = 50%
      const item2: PriceDropItem = {
        property: makeProp({ id: "p2" }),
        latestHistory: {
          id: "h2",
          propertyId: "p2",
          changeType: PriceHistoryChangeType.PRICE_CHANGE,
          previousPrice: 1.0,
          currentPrice: 0.5,
          recordedAt: NOW - 1000,
          editKind: PriceEditKind.MARKET_CHANGE,
          revision: 1
        },
        dropAmount: 0.5,
        dropPercent: 50.0,
        previousPrice: 1.0,
        currentPrice: 0.5,
        dropTimestamp: NOW - 1000
      };

      const leaders = computePriceDropLeaders([item1, item2]);
      expect(leaders.topAmountId).toBe("p1"); // Highest drop in absolute amount (1.0 tỷ)
      expect(leaders.topPercentId).toBe("p2"); // Highest drop in percentage (50%)
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 10. LiveListScroll Tests                                                   */
  /* -------------------------------------------------------------------------- */
  describe("LiveListScroll", () => {
    it("shouldAutoScroll behaves identically to Android TopTolerance 24px check", () => {
      expect(LiveListScroll.shouldAutoScroll(0, "")).toBe(true);
      expect(LiveListScroll.shouldAutoScroll(20, "")).toBe(true);
      expect(LiveListScroll.shouldAutoScroll(24, "")).toBe(true);
      expect(LiveListScroll.shouldAutoScroll(25, "")).toBe(false);
      expect(LiveListScroll.shouldAutoScroll(100, "")).toBe(false);
      expect(LiveListScroll.shouldAutoScroll(0, "hà nội")).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 11. Dexie Database Hooks Tests                                              */
  /* -------------------------------------------------------------------------- */
  describe("Dexie Database Hooks on properties", () => {
    let testDb: AppDatabase;

    beforeEach(async () => {
      liveEventBus.resetForTest();
      testDb = new AppDatabase();
      await testDb.properties.clear();
    });

    afterEach(async () => {
      await testDb.properties.clear();
      testDb.close();
    });

    it("sửa giá giảm → bus nhận PRICE_DROP", async () => {
      const initialProp = makeProp({
        id: "hook-test-1",
        price: 5.0,
        updatedAt: Date.now()
      });
      await testDb.properties.put(initialProp);

      // Chờ transaction hoàn tất
      await new Promise((resolve) => setTimeout(resolve, 50));

      const seqBefore = liveEventBus.latestSeq();

      // Sửa giá giảm 5.0 -> 4.5
      await testDb.properties.update("hook-test-1", {
        price: 4.5,
        updatedAt: Date.now(),
        priceEditKind: PriceEditKind.MARKET_CHANGE
      });

      // Chờ transaction complete callback
      await new Promise((resolve) => setTimeout(resolve, 50));

      const history = liveEventBus.history;
      expect(history.length).toBeGreaterThan(0);
      const latest = history[history.length - 1];
      expect(latest.seq).toBeGreaterThan(seqBefore);
      expect(latest.type).toBe(LiveEventType.PRICE_DROP);
      expect(latest.before?.price).toBe(5.0);
      expect(latest.after.price).toBe(4.5);
    });

    it("ghi bản updatedAt cũ (> 2 phút) → không phát sự kiện", async () => {
      const initialProp = makeProp({
        id: "hook-test-2",
        price: 5.0,
        updatedAt: Date.now()
      });
      await testDb.properties.put(initialProp);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const seqBefore = liveEventBus.latestSeq();

      // Ghi update với updatedAt quá 2 phút
      const staleTime = Date.now() - LiveEventDetector.FRESH_WINDOW_MS - 5000;
      await testDb.properties.update("hook-test-2", {
        price: 4.0,
        updatedAt: staleTime
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(liveEventBus.latestSeq()).toBe(seqBefore);
    });

    it("lỗi trong detector không làm hỏng việc ghi database", async () => {
      const initialProp = makeProp({
        id: "hook-test-3",
        price: 5.0,
        updatedAt: Date.now()
      });
      await testDb.properties.put(initialProp);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Giả lập lỗi ném ra từ detector
      const detectSpy = vi.spyOn(LiveEventDetector, "detect").mockImplementationOnce(() => {
        throw new Error("Simulated detector error");
      });

      let writeThrew = false;
      try {
        await testDb.properties.update("hook-test-3", {
          price: 3.5,
          updatedAt: Date.now()
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch {
        writeThrew = true;
      }

      // Việc ghi dữ liệu vào IndexedDB vẫn phải thành công
      expect(writeThrew).toBe(false);
      const readBack = await testDb.properties.get("hook-test-3");
      expect(readBack?.price).toBe(3.5);

      detectSpy.mockRestore();
    });
  });
});
