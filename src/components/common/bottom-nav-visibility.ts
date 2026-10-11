import { useEffect } from "react";

// Ẩn thanh điều hướng đáy khi đang chọn nhiều (giống Android). Tách khỏi file component để giữ Fast Refresh.
type NavHiddenListener = (hidden: boolean) => void;
const navHiddenListeners = new Set<NavHiddenListener>();

export function setBottomNavHidden(hidden: boolean): void {
  navHiddenListeners.forEach((fn) => fn(hidden));
}

export function subscribeBottomNavHidden(fn: NavHiddenListener): () => void {
  navHiddenListeners.add(fn);
  return () => {
    navHiddenListeners.delete(fn);
  };
}

export function useHideBottomNavWhile(active: boolean): void {
  useEffect(() => {
    if (active) {
      setBottomNavHidden(true);
      return () => {
        setBottomNavHidden(false);
      };
    }
  }, [active]);
}
