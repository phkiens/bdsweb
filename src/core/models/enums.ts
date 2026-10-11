// Enum types corresponding to Android native Enums

export enum PropertyStatus {
  FOR_SALE = "Đang bán",
  SOLD = "Đã bán",
  PENDING_SURVEY = "Chờ khảo sát",
  PAUSED = "Tạm ngưng"
}

export enum PropertyType {
  HOUSE = "Nhà",
  LAND = "Đất"
}

export enum CustomerRole {
  BUYER = "BUYER",
  OWNER = "OWNER"
}

export enum CustomerStatus {
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED"
}

export enum CustomerPropertyRole {
  OWNER = "OWNER",
  CO_OWNER = "CO_OWNER",
  VIEWER = "VIEWER",
  VIEWED = "VIEWED"
}

export const LinkRole = CustomerPropertyRole;
export type LinkRole = CustomerPropertyRole;

export enum Direction {
  EAST = "Đông",
  WEST = "Tây",
  SOUTH = "Nam",
  NORTH = "Bắc",
  SOUTH_EAST = "Đông Nam",
  NORTH_EAST = "Đông Bắc",
  SOUTH_WEST = "Tây Nam",
  NORTH_WEST = "Tây Bắc"
}

export enum ExtractionType {
  GEMINI = "GEMINI",
  REGEX = "REGEX",
  MANUAL = "MANUAL"
}

export enum SyncStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  IN_PROGRESS = "IN_PROGRESS",
  CONFLICT = "CONFLICT"
}

export enum SyncType {
  PUSH = "PUSH",
  PULL = "PULL",
  PUSH_TEXT = "PUSH_TEXT",
  PULL_TEXT = "PULL_TEXT",
  MEDIA = "MEDIA",
  GENERAL = "GENERAL"
}

export enum FilterMode {
  LAST_USED = "LAST_USED",
  FIXED = "FIXED",
  ALL = "ALL"
}

export enum MapZoomScope {
  WARD = "WARD",
  DISTRICT = "DISTRICT",
  PROVINCE = "PROVINCE"
}

export enum CustomerFilter {
  ALL = "ALL",
  BUYER_ACTIVE = "BUYER_ACTIVE",
  OWNER_ACTIVE = "OWNER_ACTIVE",
  CLOSED = "CLOSED"
}

export enum OwnerStockFilter {
  ALL = "Tất cả",
  HAS_STOCK = "Còn hàng",
  SOLD_OUT = "Đã bán hết"
}

export enum OwnerPropertySort {
  DEFAULT = "Mặc định",
  DESCENDING = "Giảm dần số nhà",
  ASCENDING = "Tăng dần số nhà"
}

export enum FilterScope {
  CURRENT_TAB = "CURRENT_TAB",
  ALL = "ALL"
}

export enum PropertySortType {
  NEWEST = "NEWEST",
  PRICE_ASC = "PRICE_ASC",
  PRICE_DESC = "PRICE_DESC",
  SIZE = "SIZE"
}

export enum PropertyListMode {
  VERIFIED = "VERIFIED",
  UNVERIFIED = "UNVERIFIED",
  ALL = "ALL"
}

/** Hàng trên cùng của bảng lọc SP (giống Android): phạm vi tab / nguồn Chính thức-Chờ / không có. */
export enum FilterTopRow {
  SCOPE = "SCOPE",
  SOURCES = "SOURCES",
  NONE = "NONE"
}
