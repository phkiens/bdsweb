import { Customer, CustomerPropertyLink } from "../models/customer";
import { CustomerStatus } from "../models/enums";

export type ActivityType = "DIARY" | "VIEWING";

export interface DiaryActivityItem {
  type: "DIARY";
  id: string;
  text: string;
  displayDate: string;
  sortDate: number;
}

export interface ViewingActivityItem {
  type: "VIEWING";
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  note?: string | null;
  displayDate: string;
  sortDate: number;
  linkRole: string;
}

export type MergedActivityItem = DiaryActivityItem | ViewingActivityItem;

/**
 * Parses Vietnamese date strings into epoch milliseconds timestamp.
 * Supports:
 * - dd/MM/yyyy (e.g. 15/08/2024)
 * - dd/MM/yyyy HH:mm (e.g. 15/08/2024 14:30)
 * - HH:mm dd/MM/yyyy (e.g. 14:30 15/08/2024)
 * - yyyy-MM-dd / yyyy-MM-dd HH:mm
 */
export function parseActivityDate(dateStr?: string | null): number {
  if (!dateStr || typeof dateStr !== "string") return 0;
  const clean = dateStr.trim().replace(/^\[|\]$/g, "").trim();
  if (!clean) return 0;

  // 1. Check "HH:mm dd/MM/yyyy"
  const timeDateMatch = clean.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (timeDateMatch) {
    const [, hour, min, day, month, year] = timeDateMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // 2. Check "dd/MM/yyyy HH:mm"
  const dateTimeMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (dateTimeMatch) {
    const [, day, month, year, hour, min] = dateTimeMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // 3. Check "dd/MM/yyyy"
  const dateOnlyMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateOnlyMatch) {
    const [, day, month, year] = dateOnlyMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // 4. Fallback ISO / Date.parse (e.g. yyyy-MM-dd)
  const parsed = Date.parse(clean);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parses multi-line property diary string into structured DiaryActivityItems.
 */
export function parseDiaryEntries(diaryText?: string | null): DiaryActivityItem[] {
  if (!diaryText || !diaryText.trim()) return [];

  const lines = diaryText.split("\n").filter((line) => line.trim().length > 0);
  const items: DiaryActivityItem[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    let datePart = "";
    let textPart = trimmed;

    // Check [date] format
    const bracketMatch = trimmed.match(/^\[(.*?)\]\s*(.*)$/);
    if (bracketMatch) {
      datePart = bracketMatch[1].trim();
      textPart = bracketMatch[2].trim();
    } else if (trimmed.includes(" - ")) {
      const idx = trimmed.indexOf(" - ");
      datePart = trimmed.slice(0, idx).trim();
      textPart = trimmed.slice(idx + 3).trim();
    }

    const sortDate = parseActivityDate(datePart);

    items.push({
      type: "DIARY",
      id: `diary-${index}-${sortDate}`,
      text: textPart,
      displayDate: datePart,
      sortDate
    });
  });

  return items;
}

/**
 * Builds the merged activity timeline combining diary notes and customer viewings.
 * Sorts all entries in descending chronological order (newest first).
 */
export function buildMergedActivityTimeline(
  diaryText: string | null | undefined,
  viewingLinks: CustomerPropertyLink[],
  customersMap: Map<string, Customer> | Record<string, Customer>
): MergedActivityItem[] {
  const diaryItems = parseDiaryEntries(diaryText);
  const viewingItems: ViewingActivityItem[] = [];

  const getCustomer = (id: string): Customer | undefined => {
    if (customersMap instanceof Map) {
      return customersMap.get(id);
    }
    return customersMap[id];
  };

  viewingLinks.forEach((link, index) => {
    // Only include viewer roles and active (non-deleted) links
    const isViewerRole = link.role === "VIEWER" || link.role === "VIEWED";
    if (!isViewerRole || link.isDeleted) return;

    const customer = getCustomer(link.customerId);
    if (!customer || customer.isDeleted) return;

    const displayName =
      customer.status === CustomerStatus.CLOSED
        ? `${customer.name} (Đã đóng)`
        : customer.name;

    const dateStr = link.viewDate || "";
    const sortDate = parseActivityDate(dateStr) || link.updatedAt || 0;

    viewingItems.push({
      type: "VIEWING",
      id: `viewing-${link.customerId}-${link.propertyId}-${index}`,
      customerId: link.customerId,
      customerName: displayName,
      customerPhone: customer.phone,
      note: link.viewNote || null,
      displayDate: dateStr,
      sortDate,
      linkRole: link.role
    });
  });

  const merged: MergedActivityItem[] = [...diaryItems, ...viewingItems];

  // Sort descending by sortDate
  merged.sort((a, b) => b.sortDate - a.sortDate);

  return merged;
}

/**
 * Validates whether a viewing link can be created for a customer and property.
 * Returns false if an active (non-deleted) link already exists.
 */
export function canAddViewingLink(
  customerId: string,
  propertyId: string,
  existingLinks: CustomerPropertyLink[]
): boolean {
  return !existingLinks.some(
    (l) => l.customerId === customerId && l.propertyId === propertyId && !l.isDeleted
  );
}

/**
 * Formats a new diary entry string matching Android native pattern: `dd/MM/yyyy - content`.
 */
export function formatDiaryEntry(text: string, date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year} - ${text.trim()}`;
}
