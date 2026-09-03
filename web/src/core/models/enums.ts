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
  VIEWED = "VIEWED"
}

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
  IN_PROGRESS = "IN_PROGRESS"
}

export enum SyncType {
  PUSH = "PUSH",
  PULL = "PULL",
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
