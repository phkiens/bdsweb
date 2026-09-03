import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SCROLL_STORAGE_KEY = "bds_scroll_positions";

export const ScrollRestoration: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    // 1. Phục hồi vị trí cuộn của route hiện tại nếu có trong sessionStorage
    try {
      const stored = sessionStorage.getItem(SCROLL_STORAGE_KEY);
      const positions = stored ? JSON.parse(stored) : {};
      const targetY = positions[location.pathname];
      if (typeof targetY === "number") {
        // Cho DOM một frame render trước khi scroll
        window.requestAnimationFrame(() => {
          window.scrollTo(0, targetY);
        });
      }
    } catch {
      // ignore
    }

    // 2. Lắng nghe sự kiện scroll để lưu vị trí hiện tại
    const handleScroll = () => {
      try {
        const stored = sessionStorage.getItem(SCROLL_STORAGE_KEY);
        const positions = stored ? JSON.parse(stored) : {};
        positions[location.pathname] = window.scrollY;
        sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(positions));
      } catch {
        // ignore
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      // Lưu vị trí lần cuối trước khi rời route
      handleScroll();
      window.removeEventListener("scroll", handleScroll);
    };
  }, [location.pathname]);

  return null;
};
