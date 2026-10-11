import { Property } from "../models/property";
import {
  DataQualityIssue,
  IssueType,
  ALL_ISSUE_TYPES,
  compareDataQualityIssues
} from "./issue-type";
import {
  evaluateMediaState,
  CanonicalZeroMedia,
  NoMediaReference
} from "./media-state";
import { MedianUtils } from "./median-utils";
import { PriceUtils } from "./price-utils";
import {
  getLocalDateParts,
  PropertyStatusConstants,
  STATS_ZONE_ID,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey
} from "./statistics-filter";

export interface DataQualitySummary {
  totalIssues: number;
  issuesByType: Record<string, number>;
  issuesBySeverity: Record<string, number>;
  issues: DataQualityIssue[];
}

export const DATA_QUALITY_SENTINEL_KEYS = new Set<string>([
  "chưa xác định",
  "chua_ro",
  "null"
]);

function formatLocalDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export const DataQualityCalculator = {
  DATA_QUALITY_SENTINEL_KEYS,

  calculate(
    properties: Property[],
    now: number = Date.now(),
    ownerCountProvider?: ((propertyId: string) => number) | null,
    fileChecker: (path: string) => boolean = () => true
  ): DataQualitySummary {
    const activeProperties = properties.filter((p) => !p.isDeleted);
    const collectedIssues: DataQualityIssue[] = [];

    const pNow = getLocalDateParts(now, STATS_ZONE_ID);
    const nowDateStr = formatLocalDate(pNow.year, pNow.month, pNow.day);
    const nowDateUtc = Date.UTC(pNow.year, pNow.month - 1, pNow.day);

    for (const property of activeProperties) {
      // 1. INVALID_DATE: createdAt <= 0
      if (property.createdAt <= 0) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.INVALID_DATE,
          severity: IssueType.INVALID_DATE.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: `Ngày tạo không hợp lệ (createdAt = ${property.createdAt})`
        });
      } else {
        // 2. FUTURE_DATE: createdAt in future compared to now's calendar date
        const pCreated = getLocalDateParts(property.createdAt, STATS_ZONE_ID);
        const createdDateUtc = Date.UTC(pCreated.year, pCreated.month - 1, pCreated.day);
        if (createdDateUtc > nowDateUtc) {
          const createdDateStr = formatLocalDate(pCreated.year, pCreated.month, pCreated.day);
          collectedIssues.push({
            propertyId: property.id,
            issueType: IssueType.FUTURE_DATE,
            severity: IssueType.FUTURE_DATE.defaultSeverity,
            propertyCreatedAt: property.createdAt,
            context: `Ngày tạo ở tương lai (${createdDateStr} > ${nowDateStr})`
          });
        }
      }

      // 3. UNKNOWN_STATUS: status not in standard set ("Đang bán", "Đã bán", "Chờ khảo sát")
      if (!PropertyStatusConstants.isKnown(property.status)) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.UNKNOWN_STATUS,
          severity: IssueType.UNKNOWN_STATUS.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: `Trạng thái không chuẩn: '${property.status}'`
        });
      }

      // 4. MISSING_PRICE: price <= 0 or non-finite
      if (
        property.price <= 0.0 ||
        !Number.isFinite(property.price) ||
        Number.isNaN(property.price)
      ) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.MISSING_PRICE,
          severity: IssueType.MISSING_PRICE.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: `Giá bán không hợp lệ: ${property.price} tỷ`
        });
      }

      // 5. MISSING_AREA_SIZE: areaSize null, <= 0 or non-finite
      const size = property.areaSize;
      if (size == null || size <= 0.0 || !Number.isFinite(size) || Number.isNaN(size)) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.MISSING_AREA_SIZE,
          severity: IssueType.MISSING_AREA_SIZE.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: `Diện tích không hợp lệ: ${size} m²`
        });
      }

      // 6. MISSING_AREA_NAME: area blank or standard sentinel
      const canonicalArea = toCanonicalAreaKey(property.area);
      if (canonicalArea.length === 0 || DATA_QUALITY_SENTINEL_KEYS.has(canonicalArea)) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.MISSING_AREA_NAME,
          severity: IssueType.MISSING_AREA_NAME.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: `Tên khu vực trống hoặc chưa xác định: '${property.area}'`
        });
      }

      // 7. MISSING_PROPERTY_TYPE: propertyType blank or standard sentinel
      const canonicalType = toCanonicalPropertyTypeKey(property.propertyType);
      if (canonicalType.length === 0 || DATA_QUALITY_SENTINEL_KEYS.has(canonicalType)) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.MISSING_PROPERTY_TYPE,
          severity: IssueType.MISSING_PROPERTY_TYPE.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: `Loại hình BĐS trống hoặc chưa xác định: '${property.propertyType}'`
        });
      }

      // 8. MISSING_GPS: lat/lon null, non-finite, or out of physical bounds [-90,90], [-180,180]
      const lat = property.latitude;
      const lon = property.longitude;
      const isGpsValid =
        lat != null &&
        lon != null &&
        Number.isFinite(lat) &&
        !Number.isNaN(lat) &&
        Number.isFinite(lon) &&
        !Number.isNaN(lon) &&
        lat >= -90.0 &&
        lat <= 90.0 &&
        lon >= -180.0 &&
        lon <= 180.0;
      if (!isGpsValid) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.MISSING_GPS,
          severity: IssueType.MISSING_GPS.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: `Tọa độ GPS không hợp lệ: lat=${lat}, lon=${lon}`
        });
      }

      // 9. NO_MEDIA_REFERENCE
      const mediaState = evaluateMediaState(property);
      if (
        mediaState === NoMediaReference ||
        mediaState === CanonicalZeroMedia ||
        mediaState.type === "NoMediaReference" ||
        mediaState.type === "CanonicalZeroMedia"
      ) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.NO_MEDIA_REFERENCE,
          severity: IssueType.NO_MEDIA_REFERENCE.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: "BĐS không có bất kỳ tham chiếu media nào hợp lệ"
        });
      }

      // 10. BROKEN_LOCAL_MEDIA: physical check of local disk files via fileChecker
      const localPaths = property.imagePath
        ? property.imagePath
            .split("|||")
            .map((it) => it.trim())
            .filter((it) => it.length > 0 && it !== "null")
        : [];
      if (localPaths.length > 0) {
        const brokenCount = localPaths.filter((it) => !fileChecker(it)).length;
        if (brokenCount > 0) {
          collectedIssues.push({
            propertyId: property.id,
            issueType: IssueType.BROKEN_LOCAL_MEDIA,
            severity: IssueType.BROKEN_LOCAL_MEDIA.defaultSeverity,
            propertyCreatedAt: property.createdAt,
            context: `Có ${brokenCount}/${localPaths.length} file ảnh cục bộ không tồn tại trên đĩa`,
            brokenFileCount: brokenCount,
            totalLocalFiles: localPaths.length
          });
        }
      }

      // 11. OWNER EVIDENCE (Tri-state): MISSING_OWNER & MULTIPLE_OWNERS
      if (ownerCountProvider != null) {
        const ownerCount = ownerCountProvider(property.id);
        if (ownerCount === 0) {
          collectedIssues.push({
            propertyId: property.id,
            issueType: IssueType.MISSING_OWNER,
            severity: IssueType.MISSING_OWNER.defaultSeverity,
            propertyCreatedAt: property.createdAt,
            context: "BĐS chưa được liên kết với chủ nhà"
          });
        } else if (ownerCount > 1) {
          collectedIssues.push({
            propertyId: property.id,
            issueType: IssueType.MULTIPLE_OWNERS,
            severity: IssueType.MULTIPLE_OWNERS.defaultSeverity,
            propertyCreatedAt: property.createdAt,
            context: `BĐS có ${ownerCount} chủ nhà (dữ liệu bất thường)`
          });
        }
      }

      // 12. DRAFT_PENDING: property marked as draft
      if (property.isDraft) {
        collectedIssues.push({
          propertyId: property.id,
          issueType: IssueType.DRAFT_PENDING,
          severity: IssueType.DRAFT_PENDING.defaultSeverity,
          propertyCreatedAt: property.createdAt,
          context: "Tin nháp chưa hoàn thiện duyệt tin"
        });
      }
    }

    // 13. PRICE_OUTLIER: Evaluated on frozen population with sample count gate >= 5
    const eligibleForOutlier = activeProperties.filter((p) => {
      const canonicalArea = toCanonicalAreaKey(p.area);
      const canonicalType = toCanonicalPropertyTypeKey(p.propertyType);
      return (
        !p.isDraft &&
        PropertyStatusConstants.isActiveMarket(p.status) &&
        PriceUtils.isValidPriceAndArea(p.price, p.areaSize) &&
        canonicalArea.length > 0 &&
        !DATA_QUALITY_SENTINEL_KEYS.has(canonicalArea) &&
        canonicalType.length > 0 &&
        !DATA_QUALITY_SENTINEL_KEYS.has(canonicalType)
      );
    });

    const groups = new Map<string, Property[]>();
    for (const p of eligibleForOutlier) {
      const key = `${toCanonicalAreaKey(p.area)}|||${toCanonicalPropertyTypeKey(p.propertyType)}`;
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }

    for (const group of groups.values()) {
      if (group.length >= 5) {
        const perM2Values = group.map(
          (it) => PriceUtils.calculatePricePerM2(it.price, it.areaSize)!
        );
        const q1 = MedianUtils.calculatePercentile(perM2Values, 0.25);
        const q3 = MedianUtils.calculatePercentile(perM2Values, 0.75);
        if (q1 != null && q3 != null) {
          const iqr = q3 - q1;
          const lowerFence = q1 - 1.5 * iqr;
          const upperFence = q3 + 1.5 * iqr;

          for (const p of group) {
            const pPerM2 = PriceUtils.calculatePricePerM2(p.price, p.areaSize)!;
            if (pPerM2 < lowerFence || pPerM2 > upperFence) {
              const displayPrice =
                PriceUtils.calculateDisplayPricePerM2(p.price, p.areaSize) ?? 0.0;
              const displayLower = lowerFence * 1000.0;
              const displayUpper = upperFence * 1000.0;
              collectedIssues.push({
                propertyId: p.id,
                issueType: IssueType.PRICE_OUTLIER,
                severity: IssueType.PRICE_OUTLIER.defaultSeverity,
                propertyCreatedAt: p.createdAt,
                context: `Đơn giá ${PriceUtils.formatOneDecimal(displayPrice)} tr/m² nằm ngoài dải IQR [${PriceUtils.formatOneDecimal(displayLower)}..${PriceUtils.formatOneDecimal(displayUpper)}]`
              });
            }
          }
        }
      }
    }

    // Deterministic 4-tier sorting
    collectedIssues.sort(compareDataQualityIssues);

    const issuesByType: Record<string, number> = {};
    for (const type of ALL_ISSUE_TYPES) {
      issuesByType[type.name] = collectedIssues.filter(
        (it) => it.issueType.name === type.name
      ).length;
    }

    const issuesBySeverity: Record<string, number> = {
      CRITICAL: collectedIssues.filter((it) => it.severity.name === "CRITICAL").length,
      WARNING: collectedIssues.filter((it) => it.severity.name === "WARNING").length,
      INFO: collectedIssues.filter((it) => it.severity.name === "INFO").length
    };

    return {
      totalIssues: collectedIssues.length,
      issuesByType,
      issuesBySeverity,
      issues: collectedIssues
    };
  }
};
