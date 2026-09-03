import { ExtractionType, PropertyStatus, PropertyType } from "./enums";

export interface Property {
  id: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  imagePath: string | null; // "|||" separated local/object URLs
  driveMediaIds: string | null;
  driveFolderId: string | null;
  priceAtFolderCreation: number | null;
  documentUrl: string;
  areaSize: number | null;
  price: number; // Tỷ VNĐ
  description: string;
  status: string; // PropertyStatus string
  surveyDate: string; // yyyy-MM-dd
  direction: string;
  ownerName: string;
  ownerPhone: string;
  propertyType: string; // "Nhà" | "Đất"
  needToViewToday: boolean;
  isDraft: boolean;
  isTextSynced: boolean;
  rawText: string;
  diary: string;
  updatedAt: number;
  isDeleted: boolean;
  propertyDetailJsonFileId: string | null;
  txtFileId: string | null;
  isMediaSynced: boolean;
  linkedCustomerId: string | null;
  title: string | null;
  mapLink: string | null;
  extractedBy: ExtractionType | null;
  createdAt: number;
  isVerified: boolean;
  lastEditedAt: number;
  r2MediaKeys: string | null;
}

export function generatePropertyId(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let random = "";
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${yyyy}${MM}${dd}-${HH}${mm}${ss}-${random}`;
}

export function createDefaultProperty(partial?: Partial<Property>): Property {
  const now = Date.now();
  const today = new Date().toISOString().split("T")[0];
  return {
    id: generatePropertyId(),
    area: "",
    latitude: null,
    longitude: null,
    imagePath: null,
    driveMediaIds: null,
    driveFolderId: null,
    priceAtFolderCreation: null,
    documentUrl: "",
    areaSize: null,
    price: 0,
    description: "",
    status: PropertyStatus.FOR_SALE,
    surveyDate: today,
    direction: "",
    ownerName: "",
    ownerPhone: "",
    propertyType: PropertyType.HOUSE,
    needToViewToday: false,
    isDraft: false,
    isTextSynced: false,
    rawText: "",
    diary: "",
    updatedAt: now,
    isDeleted: false,
    propertyDetailJsonFileId: null,
    txtFileId: null,
    isMediaSynced: false,
    linkedCustomerId: null,
    title: null,
    mapLink: null,
    extractedBy: null,
    createdAt: now,
    isVerified: true,
    lastEditedAt: now,
    r2MediaKeys: null,
    ...partial
  };
}
