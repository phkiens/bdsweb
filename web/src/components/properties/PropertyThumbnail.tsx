import React, { useEffect, useState } from "react";
import { Home, FileText, Star, Loader2 } from "lucide-react";
import { Property } from "../../core/models/property";
import { mediaService } from "../../data/media/media-service";
import { parseR2MediaKeys, R2MediaItem } from "../../data/remote/r2-media-client";

export interface PropertyThumbnailProps {
  property: Property;
  size?: number; // Kích thước pixel (mặc định 60px theo Native)
  showStarBadge?: boolean; // Hiển thị ngôi sao tiềm năng ở góc trên-trái (chỉ verified)
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const PropertyThumbnail: React.FC<PropertyThumbnailProps> = ({
  property,
  size = 60,
  showStarBadge = true,
  className = "",
  onClick
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isUnverified = !property.isVerified;
  const isPotential = property.needToViewToday && !isUnverified;

  useEffect(() => {
    let isCancelled = false;
    setHasError(false);

    async function resolveImage() {
      // 1. Tầng 1: Ưu tiên Cloudflare R2
      const r2Items: R2MediaItem[] = parseR2MediaKeys(property.r2MediaKeys);
      if (r2Items.length > 0) {
        // Lấy item đầu tiên có sortOrder nhỏ nhất
        const primaryItem = r2Items[0];
        setIsLoading(true);
        try {
          const url = await mediaService.resolveImageUrl(property.id, primaryItem);
          if (!isCancelled) {
            if (url) {
              setResolvedUrl(url);
              setIsLoading(false);
              return;
            }
          }
        } catch {
          // Fallback sang các tầng tiếp theo
        }
        if (!isCancelled) setIsLoading(false);
      }

      // 2. Tầng 2: Local / Blob imagePath
      if (property.imagePath && property.imagePath.trim()) {
        const firstLocal = property.imagePath
          .split("|||")
          .map((s) => s.trim())
          .find((s) => s.length > 0);

        if (firstLocal) {
          // Kiểm tra nếu là URL hợp lệ hoặc blob/data URL
          if (
            firstLocal.startsWith("http://") ||
            firstLocal.startsWith("https://") ||
            firstLocal.startsWith("blob:") ||
            firstLocal.startsWith("data:")
          ) {
            if (!isCancelled) {
              setResolvedUrl(firstLocal);
              return;
            }
          }
        }
      }

      // 3. Tầng 3: Google Drive Thumbnail Legacy
      if (property.driveMediaIds && property.driveMediaIds.trim()) {
        const firstDriveId = property.driveMediaIds
          .split(/[|||,]/)
          .map((s) => s.trim())
          .find((s) => s.length > 0);

        if (firstDriveId) {
          if (!isCancelled) {
            setResolvedUrl(`https://drive.google.com/thumbnail?sz=w400&id=${firstDriveId}`);
            return;
          }
        }
      }

      // 4. Tầng 4: Không có ảnh -> Dùng Placeholder Icon
      if (!isCancelled) {
        setResolvedUrl(null);
      }
    }

    resolveImage();

    return () => {
      isCancelled = true;
    };
  }, [property.id, property.r2MediaKeys, property.imagePath, property.driveMediaIds]);

  const handleImageError = () => {
    // Khi ảnh bị lỗi 404 hoặc CORS, tự động fallback về placeholder
    setHasError(true);
  };

  const dimensionStyle = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`
  };

  return (
    <div
      style={dimensionStyle}
      onClick={onClick}
      className={`relative rounded-lg overflow-hidden shrink-0 select-none bg-slate-100 ${className}`}
    >
      {/* Khi đang tải URL từ R2 */}
      {isLoading ? (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        </div>
      ) : resolvedUrl && !hasError ? (
        /* Ảnh hiển thị thành công */
        <img
          src={resolvedUrl}
          alt={property.area || "BĐS"}
          onError={handleImageError}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        /* Placeholder Icon theo loại tin (Chính thức vs Tin chờ) */
        <div
          className={`w-full h-full flex items-center justify-center ${
            isUnverified ? "bg-amber-50/80" : "bg-slate-100"
          }`}
        >
          {isUnverified ? (
            <FileText
              className="text-amber-500/50"
              style={{ width: `${Math.round(size * 0.4)}px`, height: `${Math.round(size * 0.4)}px` }}
            />
          ) : (
            <Home
              className="text-slate-400"
              style={{ width: `${Math.round(size * 0.4)}px`, height: `${Math.round(size * 0.4)}px` }}
            />
          )}
        </div>
      )}

      {/* Ngôi sao tiềm năng ở góc trên bên trái (chỉ áp dụng với SP chính thức theo Native) */}
      {showStarBadge && isPotential && (
        <div
          className="absolute top-1 left-1 bg-white/90 backdrop-blur-xs rounded px-1 py-0.5 shadow-2xs flex items-center justify-center z-10"
          title="BĐS tiềm năng / Cần xem hôm nay"
        >
          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
        </div>
      )}
    </div>
  );
};
