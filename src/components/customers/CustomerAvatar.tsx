import React, { useState } from "react";

export interface CustomerAvatarProps {
  name: string;
  avatarPath?: string | null;
  avatarDriveUrl?: string | null;
  size?: number; // Kích thước pixel (mặc định 44px theo Native Android)
  className?: string;
}

/**
 * Bảng màu sinh ngẫu nhiên nhưng nhất quán theo chữ cái đầu tên khách,
 * khớp chính xác 100% với hàm getAvatarColor trong Native Android CustomerCard.kt
 */
export function getAvatarColorHex(name: string): string {
  if (!name || name.trim().length === 0) return "#2563EB";
  const charValue = name.trim().charCodeAt(0);
  const colors = [
    "#2563EB", // Blue
    "#059669", // Green
    "#D97706", // Amber
    "#DB2777", // Pink
    "#7C3AED", // Purple
    "#DC2626", // Red
    "#0891B2"  // Cyan
  ];
  return colors[charValue % colors.length];
}

export const CustomerAvatar: React.FC<CustomerAvatarProps> = ({
  name,
  avatarPath,
  avatarDriveUrl,
  size = 44,
  className = ""
}) => {
  const [imageError, setImageError] = useState(false);

  // Thứ tự ưu tiên ảnh: avatarPath (nếu là http/blob) -> Google Drive URL -> Initials
  let imageSrc: string | null = null;
  if (!imageError) {
    if (
      avatarPath &&
      (avatarPath.startsWith("http://") ||
        avatarPath.startsWith("https://") ||
        avatarPath.startsWith("blob:") ||
        avatarPath.startsWith("data:"))
    ) {
      imageSrc = avatarPath;
    } else if (avatarDriveUrl && avatarDriveUrl.trim()) {
      imageSrc = `https://drive.google.com/thumbnail?sz=w400&id=${avatarDriveUrl.trim()}`;
    }
  }

  const initialLetter = name && name.trim().length > 0 ? name.trim().charAt(0).toUpperCase() : "?";
  const backgroundColor = getAvatarColorHex(name);

  const dimensionStyle = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`
  };

  return (
    <div
      style={dimensionStyle}
      className={`rounded-full overflow-hidden shrink-0 select-none flex items-center justify-center relative shadow-2xs ${className}`}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={name}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover rounded-full"
        />
      ) : (
        <div
          style={{ backgroundColor }}
          className="w-full h-full flex items-center justify-center text-white font-bold tracking-wider"
        >
          <span style={{ fontSize: `${Math.round(size * 0.42)}px` }}>{initialLetter}</span>
        </div>
      )}
    </div>
  );
};
