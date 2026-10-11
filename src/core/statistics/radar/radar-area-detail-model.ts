import { Property } from "../../models/property";
import {
  normalizePropertyType,
  PropertyStatusConstants,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey
} from "../statistics-filter";
import { DealPropertyItem, ValuationCalculator } from "../valuation-calculator";
import { toTitleCase } from "../../utils/vietnamese";

export interface RadarAreaDetailContent {
  type: "CONTENT";
  areaDisplayName: string;
  propertyTypeDisplayName: string;
  allItems: DealPropertyItem[];
  recommendedItems: DealPropertyItem[];
  insufficientItems: DealPropertyItem[];
}

export interface RadarAreaDetailEmpty {
  type: "EMPTY";
}

export interface RadarAreaDetailInvalidArguments {
  type: "INVALID_ARGUMENTS";
  message: string;
}

export interface RadarAreaDetailError {
  type: "ERROR";
  message: string;
}

export interface RadarAreaDetailLoading {
  type: "LOADING";
}

export type RadarAreaDetailUiState =
  | RadarAreaDetailLoading
  | RadarAreaDetailContent
  | RadarAreaDetailEmpty
  | RadarAreaDetailInvalidArguments
  | RadarAreaDetailError;

export const RadarAreaDetailModel = {
  /**
   * Pure logic evaluation for Radar Area Detail view.
   */
  compute(
    allProperties: Property[],
    rawArea?: string | null,
    rawType?: string | null
  ): RadarAreaDetailUiState {
    const canonicalArea = toCanonicalAreaKey(rawArea);
    const canonicalType = toCanonicalPropertyTypeKey(rawType);

    if (canonicalArea.length === 0 || canonicalType.length === 0) {
      return {
        type: "INVALID_ARGUMENTS",
        message: "Tham số khu vực hoặc loại hình không hợp lệ"
      };
    }

    try {
      const segmentProperties = allProperties.filter((p) => {
        const size = p.areaSize;
        const price = p.price;
        return (
          !p.isDeleted &&
          !p.isDraft &&
          PropertyStatusConstants.isActiveMarket(p.status) &&
          toCanonicalAreaKey(p.area) === canonicalArea &&
          toCanonicalPropertyTypeKey(p.propertyType) === canonicalType &&
          price > 0.0 &&
          Number.isFinite(price) &&
          !Number.isNaN(price) &&
          size != null &&
          size > 0.0 &&
          Number.isFinite(size) &&
          !Number.isNaN(size)
        );
      });

      if (segmentProperties.length === 0) {
        return { type: "EMPTY" };
      }

      const dealResult = ValuationCalculator.calculate(
        segmentProperties,
        allProperties
      );
      const allItems = dealResult.items;
      const recommended = allItems.filter(
        (it) => it.deviationPercent != null && it.deviationPercent <= -5.0
      );
      const insufficient = allItems.filter((it) => it.deviationPercent == null);

      const areaDisplay = toTitleCase(canonicalArea);
      const typeDisplay = normalizePropertyType(canonicalType);

      return {
        type: "CONTENT",
        areaDisplayName: areaDisplay,
        propertyTypeDisplayName: typeDisplay,
        allItems,
        recommendedItems: recommended,
        insufficientItems: insufficient
      };
    } catch (e: any) {
      return {
        type: "ERROR",
        message: e?.message ?? "Lỗi khi phân tích danh sách BĐS phân khúc"
      };
    }
  }
};
