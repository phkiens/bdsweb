export interface IIssueSeverity {
  readonly name: string;
  readonly rank: number;
}

export class IssueSeverityItem implements IIssueSeverity {
  constructor(
    public readonly name: string,
    public readonly rank: number
  ) {}
}

const SEVERITY_CRITICAL = new IssueSeverityItem("CRITICAL", 3);
const SEVERITY_WARNING = new IssueSeverityItem("WARNING", 2);
const SEVERITY_INFO = new IssueSeverityItem("INFO", 1);

export const IssueSeverity = {
  CRITICAL: SEVERITY_CRITICAL,
  WARNING: SEVERITY_WARNING,
  INFO: SEVERITY_INFO
};

export type IssueSeverity = IssueSeverityItem;

export interface IIssueType {
  readonly name: string;
  readonly defaultSeverity: IssueSeverity;
  readonly vietnameseTitle: string;
}

export class IssueTypeItem implements IIssueType {
  constructor(
    public readonly name: string,
    public readonly defaultSeverity: IssueSeverity,
    public readonly vietnameseTitle: string
  ) {}
}

export const IssueType = {
  // 5 CRITICAL issues
  INVALID_DATE: new IssueTypeItem("INVALID_DATE", IssueSeverity.CRITICAL, "Ngày tạo không hợp lệ"),
  FUTURE_DATE: new IssueTypeItem("FUTURE_DATE", IssueSeverity.CRITICAL, "Ngày tạo ở tương lai"),
  UNKNOWN_STATUS: new IssueTypeItem("UNKNOWN_STATUS", IssueSeverity.CRITICAL, "Trạng thái không xác định"),
  MULTIPLE_OWNERS: new IssueTypeItem("MULTIPLE_OWNERS", IssueSeverity.CRITICAL, "Đa chủ nhà bất thường"),
  MISSING_PRICE: new IssueTypeItem("MISSING_PRICE", IssueSeverity.CRITICAL, "Thiếu giá bán hợp lệ"),

  // 7 WARNING issues
  MISSING_AREA_SIZE: new IssueTypeItem("MISSING_AREA_SIZE", IssueSeverity.WARNING, "Thiếu diện tích hợp lệ"),
  MISSING_AREA_NAME: new IssueTypeItem("MISSING_AREA_NAME", IssueSeverity.WARNING, "Thiếu tên khu vực"),
  MISSING_PROPERTY_TYPE: new IssueTypeItem("MISSING_PROPERTY_TYPE", IssueSeverity.WARNING, "Thiếu loại hình BĐS"),
  MISSING_GPS: new IssueTypeItem("MISSING_GPS", IssueSeverity.WARNING, "Thiếu tọa độ GPS"),
  NO_MEDIA_REFERENCE: new IssueTypeItem("NO_MEDIA_REFERENCE", IssueSeverity.WARNING, "Không có ảnh / tài liệu"),
  BROKEN_LOCAL_MEDIA: new IssueTypeItem("BROKEN_LOCAL_MEDIA", IssueSeverity.WARNING, "Ảnh máy nội bộ bị hỏng"),
  PRICE_OUTLIER: new IssueTypeItem("PRICE_OUTLIER", IssueSeverity.WARNING, "Cảnh báo ngoại lai giá"),

  // 2 INFO issues
  MISSING_OWNER: new IssueTypeItem("MISSING_OWNER", IssueSeverity.INFO, "Chưa gán chủ nhà"),
  DRAFT_PENDING: new IssueTypeItem("DRAFT_PENDING", IssueSeverity.INFO, "Tin nháp chờ duyệt")
};

export type IssueType = IssueTypeItem;

export const ALL_ISSUE_TYPES: IssueType[] = [
  IssueType.INVALID_DATE,
  IssueType.FUTURE_DATE,
  IssueType.UNKNOWN_STATUS,
  IssueType.MULTIPLE_OWNERS,
  IssueType.MISSING_PRICE,
  IssueType.MISSING_AREA_SIZE,
  IssueType.MISSING_AREA_NAME,
  IssueType.MISSING_PROPERTY_TYPE,
  IssueType.MISSING_GPS,
  IssueType.NO_MEDIA_REFERENCE,
  IssueType.BROKEN_LOCAL_MEDIA,
  IssueType.PRICE_OUTLIER,
  IssueType.MISSING_OWNER,
  IssueType.DRAFT_PENDING
];

export interface DataQualityIssue {
  propertyId: string;
  issueType: IssueType;
  severity: IssueSeverity;
  propertyCreatedAt: number;
  context: string;
  brokenFileCount?: number;
  totalLocalFiles?: number;
}

/**
 * Deterministic sorting order (4 tiers per Data Contract v1.2.2 & PR2 Plan Section 2.2):
 * 1. severity descending (CRITICAL > WARNING > INFO)
 * 2. propertyCreatedAt descending (newest first)
 * 3. propertyId ascending
 * 4. issueType.name ascending (tie-breaker)
 */
export function compareDataQualityIssues(a: DataQualityIssue, b: DataQualityIssue): number {
  const sevCmp = b.severity.rank - a.severity.rank; // descending
  if (sevCmp !== 0) return sevCmp;
  const createdCmp = b.propertyCreatedAt - a.propertyCreatedAt; // descending
  if (createdCmp !== 0) return createdCmp;
  const idCmp = a.propertyId.localeCompare(b.propertyId); // ascending
  if (idCmp !== 0) return idCmp;
  return a.issueType.name.localeCompare(b.issueType.name); // ascending
}
