import { describe, expect, it } from "vitest";
import { createDefaultProperty } from "../../src/core/models/property";
import {
  computeRouteCandidateProperties,
  computeRouteNearbyProperties,
  combineRouteAndNearbyProperties,
  toggleRouteSelection,
  formatRadiusLabel,
  formatRadiusButtonText,
  getPropertyKey,
  ROUTE_NEARBY_DEFAULT_RADIUS_KM,
  NORMAL_NEARBY_DEFAULT_RADIUS_KM
} from "../../src/core/engine/map-survey-engine";

describe("Map Nearby Route Engine (Parity with Android c010f60 + 37b1bd0)", () => {
  it("routeMode_setMapPointCenter_showsNearbyWithin1Km_andDoesNotDuplicateRouteItems", () => {
    const propRoute = createDefaultProperty({
      id: "route_1",
      area: "Quận 1",
      latitude: 10.7700,
      longitude: 106.7000,
      isVerified: true
    });
    const propNear = createDefaultProperty({
      id: "near_0_5km",
      area: "Quận 1",
      latitude: 10.7745,
      longitude: 106.7000, // ~0.5 km
      isVerified: true
    });
    const propFar = createDefaultProperty({
      id: "far_3km",
      area: "Quận 1",
      latitude: 10.7970,
      longitude: 106.7000, // ~3 km
      isVerified: true
    });

    const allProps = [propRoute, propNear, propFar];
    const routeKeys = ["official_route_1"];
    const selectedKeys = ["official_route_1"];

    // Ban đầu: chỉ có căn trong lộ trình, danh sách quanh đây rỗng
    const initialCandidates = computeRouteCandidateProperties(allProps, routeKeys, selectedKeys);
    expect(initialCandidates.map((p) => p.id)).toEqual(["route_1"]);

    const initialNearby = computeRouteNearbyProperties(allProps, initialCandidates, null);
    expect(initialNearby).toHaveLength(0);

    const initialCombined = combineRouteAndNearbyProperties(initialCandidates, initialNearby);
    expect(initialCombined.map((p) => p.id)).toEqual(["route_1"]);

    // Chọn tâm điểm quét tại (10.7700, 106.7000) với bán kính mặc định 1.0 km
    const center = { latitude: 10.7700, longitude: 106.7000 };
    const nearbyItems = computeRouteNearbyProperties(
      allProps,
      initialCandidates,
      center,
      ROUTE_NEARBY_DEFAULT_RADIUS_KM
    );

    expect(nearbyItems.map((p) => p.id)).toEqual(["near_0_5km"]);
    expect(nearbyItems[0].distanceKm).toBeCloseTo(0.5, 1);

    const combined = combineRouteAndNearbyProperties(initialCandidates, nearbyItems);
    const combinedIds = combined.map((p) => p.id);
    expect(combinedIds).toEqual(["route_1", "near_0_5km"]);
    expect(combinedIds).not.toContain("far_3km");
  });

  it("routeMode_toggleSelectionNearbyItem_addsToRoute_andPersistsAfterClearRouteNearby", () => {
    const propRoute = createDefaultProperty({
      id: "route_1",
      area: "Quận 1",
      latitude: 10.7700,
      longitude: 106.7000,
      isVerified: true
    });
    const propNear1 = createDefaultProperty({
      id: "near_1",
      area: "Quận 1",
      latitude: 10.7745,
      longitude: 106.7000,
      isVerified: true
    });
    const propNear2 = createDefaultProperty({
      id: "near_2",
      area: "Quận 1",
      latitude: 10.7720,
      longitude: 106.7000,
      isVerified: true
    });

    const allProps = [propRoute, propNear1, propNear2];
    const routeKeys = ["official_route_1"];
    let selectedKeys = ["official_route_1"];

    const center = { latitude: 10.7700, longitude: 106.7000 };
    let routeCandidates = computeRouteCandidateProperties(allProps, routeKeys, selectedKeys);
    let nearbyItems = computeRouteNearbyProperties(allProps, routeCandidates, center);

    // Người dùng bấm "Chọn lộ trình" ở near_1
    selectedKeys = toggleRouteSelection(selectedKeys, propNear1);
    expect(selectedKeys).toEqual(["official_route_1", "official_near_1"]);

    // Cập nhật lại candidate lộ trình sau khi chọn
    routeCandidates = computeRouteCandidateProperties(allProps, routeKeys, selectedKeys);
    expect(routeCandidates.map((p) => p.id)).toEqual(["route_1", "near_1"]);

    // Khi tắt quanh đây (clearRouteNearby => center = null)
    nearbyItems = computeRouteNearbyProperties(allProps, routeCandidates, null);
    expect(nearbyItems).toHaveLength(0);

    const filteredAfterClear = combineRouteAndNearbyProperties(routeCandidates, nearbyItems);
    const idsAfterClear = filteredAfterClear.map((p) => p.id);
    expect(idsAfterClear).toEqual(["route_1", "near_1"]);
    expect(idsAfterClear).not.toContain("near_2");
  });

  it("routeMode_unselectingAddedItemRemovesIt_whileOriginalRouteItemRemains", () => {
    const propRoute = createDefaultProperty({
      id: "route_1",
      area: "Quận 1",
      latitude: 10.7700,
      longitude: 106.7000,
      isVerified: true
    });
    const propNear = createDefaultProperty({
      id: "near_1",
      area: "Quận 1",
      latitude: 10.7745,
      longitude: 106.7000,
      isVerified: true
    });

    const allProps = [propRoute, propNear];
    const routeKeys = ["official_route_1"];
    let selectedKeys = ["official_route_1"];

    // Thêm near_1 vào lộ trình
    selectedKeys = toggleRouteSelection(selectedKeys, propNear);
    expect(selectedKeys).toEqual(["official_route_1", "official_near_1"]);

    let routeCandidates = computeRouteCandidateProperties(allProps, routeKeys, selectedKeys);
    expect(routeCandidates.map((p) => p.id)).toEqual(["route_1", "near_1"]);

    // Bỏ chọn near_1 -> near_1 bị loại khỏi lộ trình
    selectedKeys = toggleRouteSelection(selectedKeys, propNear);
    expect(selectedKeys).toEqual(["official_route_1"]);
    routeCandidates = computeRouteCandidateProperties(allProps, routeKeys, selectedKeys);
    expect(routeCandidates.map((p) => p.id)).toEqual(["route_1"]);

    // Bỏ chọn route_1 khỏi selectedKeys -> route_1 vẫn ở lại vì có trong routeKeys ban đầu
    selectedKeys = toggleRouteSelection(selectedKeys, propRoute);
    expect(selectedKeys).toEqual([]);
    routeCandidates = computeRouteCandidateProperties(allProps, routeKeys, selectedKeys);
    expect(routeCandidates.map((p) => p.id)).toEqual(["route_1"]);
  });

  it("normalMode_setMapPointCenter_usesDefault5KmRadius", () => {
    expect(NORMAL_NEARBY_DEFAULT_RADIUS_KM).toBe(5.0);

    const propNear = createDefaultProperty({
      id: "near_0_5km",
      area: "Quận 1",
      latitude: 10.7745,
      longitude: 106.7000,
      isVerified: true
    });
    const propFar = createDefaultProperty({
      id: "far_3km",
      area: "Quận 1",
      latitude: 10.7970,
      longitude: 106.7000,
      isVerified: true
    });

    const allProps = [propNear, propFar];
    const center = { latitude: 10.7700, longitude: 106.7000 };
    const nearby = computeRouteNearbyProperties(
      allProps,
      [],
      center,
      NORMAL_NEARBY_DEFAULT_RADIUS_KM
    );
    const nearbyIds = nearby.map((p) => p.id);

    expect(nearbyIds).toContain("near_0_5km");
    expect(nearbyIds).toContain("far_3km");
  });

  it("routeMode_setMapPointCenter_defaultsRadiusToOneKm", () => {
    expect(ROUTE_NEARBY_DEFAULT_RADIUS_KM).toBe(1.0);
  });

  it("routeMode_setRadius_updatesNearbyItemsByRadius", () => {
    const propRoute = createDefaultProperty({
      id: "route_1",
      latitude: 10.7700,
      longitude: 106.7000
    });
    const prop300m = createDefaultProperty({
      id: "near_0_3km",
      latitude: 10.7727,
      longitude: 106.7000 // ~0.3 km
    });
    const prop800m = createDefaultProperty({
      id: "near_0_8km",
      latitude: 10.7772,
      longitude: 106.7000 // ~0.8 km
    });
    const prop1500m = createDefaultProperty({
      id: "near_1_5km",
      latitude: 10.7835,
      longitude: 106.7000 // ~1.5 km
    });

    const allProps = [propRoute, prop300m, prop800m, prop1500m];
    const center = { latitude: 10.7700, longitude: 106.7000 };
    const routeCandidates = [propRoute];

    // Mặc định 1.0 km -> gồm căn 0.3 km và 0.8 km
    const defaultNearby = computeRouteNearbyProperties(allProps, routeCandidates, center, 1.0);
    expect(defaultNearby.map((p) => p.id)).toEqual(["near_0_3km", "near_0_8km"]);

    // Bán kính 0.5 km -> chỉ căn 0.3 km
    const nearby500m = computeRouteNearbyProperties(allProps, routeCandidates, center, 0.5);
    expect(nearby500m.map((p) => p.id)).toEqual(["near_0_3km"]);

    // Bán kính 2.0 km -> cả ba căn quanh đây
    const nearby2km = computeRouteNearbyProperties(allProps, routeCandidates, center, 2.0);
    expect(nearby2km.map((p) => p.id)).toEqual(["near_0_3km", "near_0_8km", "near_1_5km"]);
  });

  it("radiusFormatting_labelsAndButtonText", () => {
    // Dropdown / Option label format
    expect(formatRadiusLabel(0.5)).toBe("500 m");
    expect(formatRadiusLabel(1.0)).toBe("1 km");
    expect(formatRadiusLabel(2.0)).toBe("2 km");
    expect(formatRadiusLabel(5.0)).toBe("5 km");
    expect(formatRadiusLabel(null)).toBe("Tất cả");

    // Button compact text format (dạng mét khi dưới 1 km theo 37b1bd0)
    expect(formatRadiusButtonText(0.5)).toBe("500m");
    expect(formatRadiusButtonText(1.0)).toBe("1km");
    expect(formatRadiusButtonText(2.0)).toBe("2km");
    expect(formatRadiusButtonText(null)).toBe("Tất cả");
  });

  it("supportsUnverifiedProperties_routeAndNearby", () => {
    const unverifiedProp = createDefaultProperty({
      id: "uv_1",
      latitude: 10.7745,
      longitude: 106.7000,
      isVerified: false
    });
    expect(getPropertyKey(unverifiedProp)).toBe("unverified_uv_1");

    const selected = toggleRouteSelection([], unverifiedProp);
    expect(selected).toEqual(["unverified_uv_1"]);

    const unselected = toggleRouteSelection(selected, unverifiedProp);
    expect(unselected).toEqual([]);
  });
});
