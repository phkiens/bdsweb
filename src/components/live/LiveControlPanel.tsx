import React, { useEffect, useState } from 'react';
import {
  Inbox,
  Users,
  MapPin,
  Settings,
  BookOpen,
  UserPlus,
  Power,
  X,
} from 'lucide-react';
import {
  LiveHideItem,
  LIVE_HIDE_ITEMS,
  parseLiveHidden,
} from '../../core/live/live-hide';
import { settingsManager } from '../../data/local/settings-manager';
import { liveControlBus } from '../../core/live/live-control-bus';
import { useLivestream } from '../../core/live/use-livestream';

export const LiveControlPanel: React.FC = () => {
  const { isLive } = useLivestream();
  const [isOpen, setIsOpen] = useState(false);
  const [hiddenSet, setHiddenSet] = useState<Set<LiveHideItem>>(() =>
    parseLiveHidden(settingsManager.getSettings().liveHiddenItems)
  );

  useEffect(() => {
    return liveControlBus.subscribe(() => {
      if (settingsManager.getSettings().livestreamMode) {
        setHiddenSet(parseLiveHidden(settingsManager.getSettings().liveHiddenItems));
        setIsOpen(true);
      }
    });
  }, []);

  useEffect(() => {
    return settingsManager.subscribe(s => {
      if (!s.livestreamMode) {
        setIsOpen(false);
      } else {
        setHiddenSet(parseLiveHidden(s.liveHiddenItems));
      }
    });
  }, []);

  if (!isOpen || !isLive) return null;

  const handleToggle = (item: LiveHideItem) => {
    const next = new Set(hiddenSet);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    setHiddenSet(next);
    settingsManager.setLiveHidden(Array.from(next));
  };

  const handleTurnOffLive = () => {
    settingsManager.setLivestreamMode(false);
    setIsOpen(false);
  };

  const getItemIcon = (key: LiveHideItem) => {
    switch (key) {
      case LiveHideItem.TAB_UNVERIFIED:
        return <Inbox className="w-5 h-5 mb-2" />;
      case LiveHideItem.TAB_CUSTOMERS:
        return <Users className="w-5 h-5 mb-2" />;
      case LiveHideItem.TAB_MAP:
        return <MapPin className="w-5 h-5 mb-2" />;
      case LiveHideItem.SETTINGS_BUTTON:
        return <Settings className="w-5 h-5 mb-2" />;
      case LiveHideItem.DIARY_VIEWINGS:
        return <BookOpen className="w-5 h-5 mb-2" />;
      case LiveHideItem.CUSTOMER_ACTIONS:
        return <UserPlus className="w-5 h-5 mb-2" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        data-testid="live_control_panel"
        className="relative z-10 w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl border border-slate-200 transition-all select-none"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Ẩn khi live
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ô sáng = đang ẩn
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-column grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {LIVE_HIDE_ITEMS.map(({ key, label }) => {
            const isHidden = hiddenSet.has(key);
            return (
              <button
                key={key}
                type="button"
                data-testid={`live_hide_tile_${key}`}
                onClick={() => handleToggle(key)}
                className={`flex flex-col items-start text-left p-3.5 rounded-xl border transition-all ${
                  isHidden
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80'
                }`}
              >
                {getItemIcon(key)}
                <span className="text-sm font-semibold leading-snug">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Turn off live button */}
        <button
          type="button"
          data-testid="live_turn_off_button"
          onClick={handleTurnOffLive}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold transition-colors shadow-sm"
        >
          <Power className="w-5 h-5" />
          <span>Tắt live</span>
        </button>
      </div>
    </div>
  );
};
