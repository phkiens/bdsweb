import { Property } from "../models/property";
import { Direction } from "../models/enums";
import { normalizeVietnamese } from "../utils/vietnamese";
import { formatPropertyPrice } from "../utils/property-price";
import { calculateDistanceKm } from "../utils/coordinates";
import { PropertyFilter } from "./property-filter";

/**
 * Kiểm tra xem cặp toạ độ có hợp lệ để hiển thị trên bản đồ hay không.
 * Bỏ qua null, undefined, NaN, và (0, 0). Toạ độ phải nằm trong dải [-90, 90] và [-180, 180].
 */
export function isValidCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  if (latitude == null || longitude == null) return false;
  if (isNaN(latitude) || isNaN(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return (
    latitude >= -90.0 &&
    latitude <= 90.0 &&
    longitude >= -180.0 &&
    longitude <= 180.0
  );
}

export type MapNavigationResult =
  | { type: "success"; route: string; skippedCount: number }
  | { type: "no_valid_coordinates"; skippedCount: number };

/**
 * Dựng route chuyển sang MapSurveyPage từ danh sách Property.
 * Lọc toạ độ hợp lệ, giữ nguyên thứ tự, thêm prefix official_ / unverified_.
 */
export class MapSurveyRoute {
  static build(properties: Property[]): MapNavigationResult {
    const withCoords = properties.filter((p) =>
      isValidCoordinate(p.latitude, p.longitude)
    );
    const skippedCount = properties.length - withCoords.length;

    if (withCoords.length === 0) {
      return {
        type: "no_valid_coordinates",
        skippedCount
      };
    }

    const keys = withCoords
      .map((p) => (p.isVerified ? "official_" : "unverified_") + p.id)
      .join(",");

    return {
      type: "success",
      route: `/map?selectedKeys=${keys}`,
      skippedCount
    };
  }
}

/**
 * Tạo thông báo tương ứng cho kết quả điều hướng bản đồ.
 */
export function getMapNavigationMessage(result: MapNavigationResult): string | null {
  if (result.type === "no_valid_coordinates") {
    return "Không có căn nào có toạ độ để xem trên bản đồ";
  }
  if (result.type === "success") {
    return result.skippedCount > 0
      ? `${result.skippedCount} căn bị bỏ qua do thiếu vị trí`
      : null;
  }
  return null;
}

/**
 * Dựng lộ trình bản đồ cho Giá vừa giảm kèm các căn ngoài danh sách (extras).
 * Thứ tự: các căn giảm giá được chọn trước, sau đó là extras (đã khử trùng lặp).
 */
export function buildMapSurveyRoute(
  items: { property: Property }[],
  selectedIds: Set<string>,
  extras: Property[] = []
): MapNavigationResult {
  const dropSelected = items
    .filter((it) => selectedIds.has(it.property.id))
    .map((it) => it.property);
  const orderedSelected = [
    ...dropSelected,
    ...extras.filter((e) => !dropSelected.some((d) => d.id === e.id))
  ];
  return MapSurveyRoute.build(orderedSelected);
}

export interface PickerCandidate {
  property: Property;
  distanceKm: number | null;
  hasLocation: boolean;
}

/**
 * Danh sách cho hộp "+ Thêm SP": lọc theo từ khoá, căn có toạ độ trước, căn chưa định vị cuối.
 * Có mốc (anchors = các căn giảm giá ĐÃ CHỌN có toạ độ) → sắp theo khoảng cách nhỏ nhất tới mốc;
 * không có mốc → updatedAt giảm dần.
 */
export function buildPickerCandidates(
  pool: Property[],
  anchors: Property[],
  query: string,
  allowOwnerIdentityMatch: boolean = true
): PickerCandidate[] {
  const validAnchors = anchors.filter((a) =>
    isValidCoordinate(a.latitude, a.longitude)
  );
  const filtered = pool.filter((p) =>
    PropertyFilter.matchesQuery(p, query, allowOwnerIdentityMatch)
  );

  const candidates: PickerCandidate[] = filtered.map((p) => {
    const hasLoc = isValidCoordinate(p.latitude, p.longitude);
    let dist: number | null = null;
    if (hasLoc && validAnchors.length > 0) {
      dist = Math.min(
        ...validAnchors.map((a) =>
          calculateDistanceKm(p.latitude!, p.longitude!, a.latitude!, a.longitude!)
        )
      );
    }
    return {
      property: p,
      distanceKm: dist,
      hasLocation: hasLoc
    };
  });

  return candidates.sort((c1, c2) => {
    // 1. hasLocation true trước
    if (c1.hasLocation !== c2.hasLocation) {
      return c1.hasLocation ? -1 : 1;
    }
    // 2. Nhóm có toạ độ
    if (c1.hasLocation) {
      if (validAnchors.length > 0) {
        const d1 = c1.distanceKm ?? Number.MAX_VALUE;
        const d2 = c2.distanceKm ?? Number.MAX_VALUE;
        const cmp = d1 - d2;
        if (cmp !== 0) return cmp;
        return (c2.property.updatedAt || 0) - (c1.property.updatedAt || 0);
      } else {
        return (c2.property.updatedAt || 0) - (c1.property.updatedAt || 0);
      }
    } else {
      // 3. Nhóm chưa định vị: updatedAt giảm dần
      return (c2.property.updatedAt || 0) - (c1.property.updatedAt || 0);
    }
  });
}

export interface PriceDropSelectionSyncResult {
  selectedIds: Set<string>;
  extraIds: string[];
}

/**
 * Quy tắc chuyển đổi chọn nhiều khi đổi khung ngày / bộ lọc (Quy tắc 258ba25):
 * - Căn extra xuất hiện lại trong availableIds → chuyển sang selectedIds.
 * - Căn selected bị che đi bởi bộ lọc/khung ngày → chuyển sang extraIds, không bỏ chọn âm thầm.
 * - Căn bị xoá khỏi kho → loại bỏ khỏi extraIds.
 */
export function syncPriceDropSelection(
  currentSelectedIds: Set<string>,
  currentExtraIds: string[],
  availableIds: Set<string>,
  propertiesMap: Map<string, Property>
): PriceDropSelectionSyncResult {
  const extrasInAvailable = currentExtraIds.filter((id) => availableIds.has(id));
  const newSelected = new Set(currentSelectedIds);
  extrasInAvailable.forEach((id) => newSelected.add(id));
  const remainingExtras = currentExtraIds.filter((id) => !availableIds.has(id));

  const validSelected = new Set(
    Array.from(newSelected).filter((id) => availableIds.has(id))
  );

  const droppedSelected = Array.from(newSelected).filter(
    (id) => !availableIds.has(id) && !remainingExtras.includes(id)
  );

  const validExtraIds = [...remainingExtras, ...droppedSelected].filter((id) =>
    propertiesMap.has(id)
  );

  return {
    selectedIds: validSelected,
    extraIds: validExtraIds
  };
}

/**
 * Lấy hướng hợp lệ đầu tiên nếu thuộc danh mục Direction.
 */
export function parseFirstValidDirection(direction?: string | null): string | null {
  if (!direction || !direction.trim()) return null;
  const first = direction.split("|||").map((s) => s.trim()).filter(Boolean)[0];
  if (!first) return null;
  const normalizedFirst = normalizeVietnamese(first).toLowerCase();
  const validDirValues = Object.values(Direction);
  const matched = validDirValues.find(
    (v) => normalizeVietnamese(v).toLowerCase() === normalizedFirst
  );
  return matched ?? null;
}

export const PropertyPickerFormat = {
  /** "2.8 tỷ · 100 m² · Đông Nam" — bỏ phần thiếu (m² null/<=0, hướng trống/không nhận ra). */
  detailLine(p: Property): string {
    const priceStr =
      formatPropertyPrice(p.price) ||
      (p.price != null && p.price > 0 ? `${p.price} tỷ` : null);
    const areaStr =
      p.areaSize != null && p.areaSize > 0
        ? `${Number(p.areaSize.toFixed(1))} m²`
        : null;
    const dir = parseFirstValidDirection(p.direction);
    return [priceStr, areaStr, dir].filter(Boolean).join(" · ");
  }
};
