import React, { useEffect } from "react";
import { setBottomNavHidden } from "./bottom-nav-visibility";
import { Map } from "lucide-react";

export interface MultiSelectBottomBarProps {
  count: number;
  onShowOnMap: () => void;
  secondaryAction?: React.ReactNode;
  className?: string;
}

export const MultiSelectBottomBar: React.FC<MultiSelectBottomBarProps> = ({
  count,
  onShowOnMap,
  secondaryAction,
  className = ""
}) => {
  useEffect(() => {
    setBottomNavHidden(true);
    return () => {
      setBottomNavHidden(false);
    };
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-4 py-3 shadow-lg safe-area-inset-bottom ${className}`}
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        {secondaryAction}
        <button
          onClick={onShowOnMap}
          disabled={count <= 0}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer truncate"
        >
          <Map className="w-4 h-4 shrink-0" />
          <span className="truncate">Xem trên bản đồ ({count})</span>
        </button>
      </div>
    </div>
  );
};
