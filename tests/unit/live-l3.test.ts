import { describe, it, expect, beforeEach } from "vitest";
import { LiveCardBadges } from "../../src/core/live/live-card-badges";
import { LiveGrid } from "../../src/core/live/live-grid";
import { LiveSpotlight } from "../../src/core/live/live-spotlight";
import {
  interpolatePrice,
  fastOutSlowInEasing,
  computeLivePhaseMs
} from "../../src/core/live/live-card-motion";
import { settingsManager } from "../../src/data/local/settings-manager";
import { LiveFeedItem } from "../../src/core/live/live-feed";
import { LiveEventType } from "../../src/core/live/live-event";
import { Property, createDefaultProperty } from "../../src/core/models/property";
import { PropertyStatus } from "../../src/core/models/enums";

describe("Live L3 Parity Unit Tests (Ported from Android Native)", () => {
  const NOW = 1_800_000_000_000;

  function createProp(id: string, status: PropertyStatus = PropertyStatus.FOR_SALE): Property {
    return createDefaultProperty({
      id,
      area: "A",
      latitude: null,
      longitude: null,
      areaSize: 60.0,
      price: 5.0,
      description: "",
      propertyType: "Nhà phố",
      status,
      createdAt: 1_000,
      updatedAt: 1_000,
      isVerified: true,
      isDraft: false,
      isDeleted: false
    });
  }

  function item(
    key: string,
    type: LiveEventType,
    at: number,
    p: Property,
    oldPrice?: number | null,
    newPrice?: number | null
  ): LiveFeedItem {
    return {
      key,
      type,
      property: p,
      at,
      oldPrice,
      newPrice
    };
  }

  /* -------------------------------------------------------------------------- */
  /* 1. LiveCardBadges Tests (chuẩn LiveCardBadgesTest.kt)                       */
  /* -------------------------------------------------------------------------- */
  describe("LiveCardBadges", () => {
    it("NEW_LISTING not hidden isNew true, hidden means no entry", () => {
      const p1 = createProp("p1");
      const i1 = item("key1", LiveEventType.NEW_LISTING, 5_000, p1, null, null);

      const allItems = [i1];
      const badges1 = LiveCardBadges.build(allItems, new Set());
      expect(badges1.get("p1")?.isNew).toBe(true);
      expect(badges1.get("p1")?.dropPercent).toBeNull();
      expect(badges1["p1"]?.isNew).toBe(true);

      const badges2 = LiveCardBadges.build(allItems, new Set(["key1"]));
      expect(badges2.get("p1")).toBeUndefined();
      expect(badges2["p1"]).toBeUndefined();
    });

    it("PRICE_DROP 4.2 to 3.9 gives dropPercent 7, hiding ignores", () => {
      const p1 = createProp("p1");
      const i1 = item("drop1", LiveEventType.PRICE_DROP, 5_000, p1, 4.2, 3.9);

      const allItems = [i1];
      const badges1 = LiveCardBadges.build(allItems, new Set());
      expect(badges1.get("p1")?.dropPercent).toBe(7);
      expect(badges1.get("p1")?.oldPrice).toBe(4.2);

      const badges2 = LiveCardBadges.build(allItems, new Set(["drop1"]));
      expect(badges2.get("p1")?.dropPercent).toBe(7);
    });

    it("DROP then RISE means no drop, RISE then DROP means drop shown", () => {
      const p1 = createProp("p1");
      const drop = item("drop", LiveEventType.PRICE_DROP, 1000, p1, 4.2, 3.9);
      const rise = item("rise", LiveEventType.PRICE_RISE, 2000, p1, 3.9, 4.2);

      const badges1 = LiveCardBadges.build([drop, rise], new Set());
      expect(badges1.get("p1")).toBeUndefined();

      const dropLater = item("drop2", LiveEventType.PRICE_DROP, 3000, p1, 4.5, 4.0);
      const badges2 = LiveCardBadges.build([drop, rise, dropLater], new Set());
      expect(badges2.get("p1")?.dropPercent).toBe(11);
    });

    it("drop and new for same property", () => {
      const p1 = createProp("p1");
      const iNew = item("new", LiveEventType.NEW_LISTING, 1000, p1, null, null);
      const iDrop = item("drop", LiveEventType.PRICE_DROP, 2000, p1, 4.0, 3.0);

      const badges = LiveCardBadges.build([iNew, iDrop], new Set());
      expect(badges.get("p1")?.isNew).toBe(true);
      expect(badges.get("p1")?.dropPercent).toBe(25);
    });

    it("property status SOLD ignores entry", () => {
      const p1 = createProp("p1", PropertyStatus.SOLD);
      const iNew = item("new", LiveEventType.NEW_LISTING, 1000, p1, null, null);
      const iDrop = item("drop", LiveEventType.PRICE_DROP, 2000, p1, 4.0, 3.0);

      const badges = LiveCardBadges.build([iNew, iDrop], new Set());
      expect(badges.get("p1")).toBeUndefined();
    });

    it("tiny drop rounding to 0 means no drop", () => {
      const p1 = createProp("p1");
      // drop from 4.0 to 3.99, drop is 0.25%, rounds to 0
      const iDrop = item("drop", LiveEventType.PRICE_DROP, 2000, p1, 4.0, 3.99);
      const badges = LiveCardBadges.build([iDrop], new Set());
      expect(badges.get("p1")).toBeUndefined();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. LiveGrid Tests (chuẩn LiveGridTest.kt)                                  */
  /* -------------------------------------------------------------------------- */
  describe("LiveGrid", () => {
    it("testListColumns", () => {
      expect(LiveGrid.listColumns(400)).toBe(1);
      expect(LiveGrid.listColumns(599)).toBe(1);
      expect(LiveGrid.listColumns(600)).toBe(2);
      expect(LiveGrid.listColumns(839)).toBe(2);
      expect(LiveGrid.listColumns(840)).toBe(3);
      expect(LiveGrid.listColumns(1280)).toBe(3);
    });

    it("testFeedColumns", () => {
      expect(LiveGrid.feedColumns(599)).toBe(1);
      expect(LiveGrid.feedColumns(600)).toBe(2);
    });

    it("testRows", () => {
      const r1 = LiveGrid.rows(7, 3, -1);
      expect(r1.map((r) => [r.first, r.last])).toEqual([[0, 2], [3, 5], [6, 6]]);

      const r2 = LiveGrid.rows(7, 3, 2);
      expect(r2.map((r) => [r.first, r.last])).toEqual([[0, 1], [2, 4], [5, 6]]);

      const r3 = LiveGrid.rows(0, 3, -1);
      expect(r3).toEqual([]);

      const r4 = LiveGrid.rows(5, 1, -1);
      expect(r4.map((r) => [r.first, r.last])).toEqual([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);

      const r5 = LiveGrid.rows(4, 2, 4);
      expect(r5.map((r) => [r.first, r.last])).toEqual([[0, 1], [2, 3]]);

      const r6 = LiveGrid.rows(3, 3, 0);
      expect(r6.map((r) => [r.first, r.last])).toEqual([[0, 2]]);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. LiveSpotlight Tests (chuẩn LiveSpotlightTest.kt)                         */
  /* -------------------------------------------------------------------------- */
  describe("LiveSpotlight", () => {
    it("distanceFactorCalculations", () => {
      const viewportStart = 0;
      const viewportEnd = 1000;

      // item offset 400 size 200 (tâm 500) → 0
      const dCenter = LiveSpotlight.distanceFactor(400, 200, viewportStart, viewportEnd);
      expect(dCenter).toBeCloseTo(0, 4);

      // item tâm 600 (offset 500 size 200; dist 0.2 < 0.25) → 0
      const dCenterZone = LiveSpotlight.distanceFactor(500, 200, viewportStart, viewportEnd);
      expect(dCenterZone).toBeCloseTo(0, 4);

      // item tâm 1000 (offset 900 size 200; dist 1.0) → 1
      const dEdgeEnd = LiveSpotlight.distanceFactor(900, 200, viewportStart, viewportEnd);
      expect(dEdgeEnd).toBeCloseTo(1, 4);

      // item tâm 0 (offset -100 size 200) → 1
      const dEdgeStart = LiveSpotlight.distanceFactor(-100, 200, viewportStart, viewportEnd);
      expect(dEdgeStart).toBeCloseTo(1, 4);

      // item tâm 750 (offset 650 size 200; dist 0.5) → (0.5-0.25)/0.75 ≈ 0.3333
      const dIntermediate = LiveSpotlight.distanceFactor(650, 200, viewportStart, viewportEnd);
      expect(dIntermediate).toBeCloseTo(0.3333, 3);

      // viewport rỗng (0,0) → 0
      const dEmpty = LiveSpotlight.distanceFactor(100, 200, 0, 0);
      expect(dEmpty).toBeCloseTo(0, 4);
    });

    it("scale and alpha formulas", () => {
      // Ở tâm (d = 0): scale = 1.0, alpha = 1.0
      expect(LiveSpotlight.calculateScale(0)).toBe(1.0);
      expect(LiveSpotlight.calculateAlpha(0)).toBe(1.0);

      // Ở mép (d = 1): scale = 0.90, alpha = 0.55
      expect(LiveSpotlight.calculateScale(1)).toBeCloseTo(0.90, 4);
      expect(LiveSpotlight.calculateAlpha(1)).toBeCloseTo(0.55, 4);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Price Interpolation & Motion Tests                                      */
  /* -------------------------------------------------------------------------- */
  describe("Price Motion & Easing", () => {
    it("fastOutSlowInEasing clamps and eases smoothly", () => {
      expect(fastOutSlowInEasing(0)).toBe(0);
      expect(fastOutSlowInEasing(1)).toBe(1);
      const mid = fastOutSlowInEasing(0.5);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);
    });

    it("interpolatePrice counts down from oldPrice to newPrice", () => {
      const oldPrice = 3.2;
      const newPrice = 2.8;

      expect(interpolatePrice(oldPrice, newPrice, 0)).toBe(3.2);
      expect(interpolatePrice(oldPrice, newPrice, 1)).toBe(2.8);

      const atQuarter = interpolatePrice(oldPrice, newPrice, 0.25);
      const atHalf = interpolatePrice(oldPrice, newPrice, 0.5);
      const atThreeQuarters = interpolatePrice(oldPrice, newPrice, 0.75);

      expect(atQuarter).toBeLessThan(oldPrice);
      expect(atHalf).toBeLessThan(atQuarter);
      expect(atThreeQuarters).toBeLessThan(atHalf);
      expect(atThreeQuarters).toBeGreaterThan(newPrice);
    });

    it("computeLivePhaseMs returns deterministic phase in [0, 2499]", () => {
      const p1 = computeLivePhaseMs("prop-1");
      const p1Again = computeLivePhaseMs("prop-1");
      expect(p1).toBe(p1Again);
      expect(p1).toBeGreaterThanOrEqual(0);
      expect(p1).toBeLessThan(2500);

      const p2 = computeLivePhaseMs("prop-2");
      expect(p2).toBeGreaterThanOrEqual(0);
      expect(p2).toBeLessThan(2500);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Settings liveShowcaseList Defaults and Read/Write                      */
  /* -------------------------------------------------------------------------- */
  describe("Settings liveShowcaseList", () => {
    beforeEach(() => {
      settingsManager.reset();
    });

    it("defaults to true", () => {
      const settings = settingsManager.getSettings();
      expect(settings.liveShowcaseList).toBe(true);
    });

    it("updates and notifies subscribers", () => {
      settingsManager.setLiveShowcaseList(false);
      expect(settingsManager.getSettings().liveShowcaseList).toBe(false);

      let notifiedVal: boolean | undefined = undefined;
      const unsubscribe = settingsManager.subscribe((s) => {
        notifiedVal = s.liveShowcaseList;
      });
      expect(notifiedVal).toBe(false);

      settingsManager.setLiveShowcaseList(true);
      expect(notifiedVal).toBe(true);
      unsubscribe();
    });
  });
});
