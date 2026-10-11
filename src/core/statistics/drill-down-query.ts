import { DrillDownFilter, DrillDownJsonCodec } from "./drill-down-filter";

/**
 * Encodes a DrillDownFilter into a URL query parameter string (e.g., "drilldown=<encodedJson>").
 */
export function encodeDrillDownQuery(filter: DrillDownFilter): string {
  const json = DrillDownJsonCodec.encodeJson(filter);
  const params = new URLSearchParams();
  params.set("drilldown", json);
  return params.toString();
}

/**
 * Decodes a DrillDownFilter from a query string, URL, or URLSearchParams.
 *
 * Supports:
 * - full search strings (e.g. "?drilldown=...")
 * - query strings (e.g. "drilldown=...")
 * - URLSearchParams instances
 * - null / undefined / empty strings (returns null)
 */
export function decodeDrillDownQuery(
  query?: string | URLSearchParams | null
): DrillDownFilter | null {
  if (!query) return null;
  let rawJson: string | null = null;
  if (typeof query === "string") {
    const trimmed = query.trim();
    if (trimmed.length === 0) return null;
    const search = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
    const params = new URLSearchParams(search);
    rawJson = params.get("drilldown");
  } else {
    rawJson = query.get("drilldown");
  }
  if (!rawJson || rawJson.trim().length === 0) return null;
  return DrillDownJsonCodec.decodeJson(rawJson);
}

/**
 * Builds a full URL with drilldown query parameter attached.
 */
export function createDrillDownUrl(basePath: string, filter: DrillDownFilter): string {
  const queryString = encodeDrillDownQuery(filter);
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}${queryString}`;
}

export const DrillDownQueryCodec = {
  encodeQuery: encodeDrillDownQuery,
  decodeQuery: decodeDrillDownQuery,
  createUrl: createDrillDownUrl
};
