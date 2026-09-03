import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="bg-red-600 text-white text-xs md:text-sm font-medium py-1.5 px-4 flex items-center justify-center gap-2 sticky top-0 z-50 shadow-sm animate-in fade-in duration-200">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Không có kết nối mạng. Dữ liệu đang được lưu ngoại tuyến.</span>
    </div>
  );
};
