import { useEffect, useState } from 'react';
import { settingsManager } from '../../data/local/settings-manager';
import { effectiveLiveHidden, parseLiveHidden, LiveHideItem } from './live-hide';

export interface UseLivestreamResult {
  isLive: boolean;
  hidden: Set<LiveHideItem>;
}

export function useLivestream(): UseLivestreamResult {
  const [settings, setSettings] = useState(() => settingsManager.getSettings());

  useEffect(() => {
    return settingsManager.subscribe(newSettings => {
      setSettings(newSettings);
    });
  }, []);

  const isLive = settings.livestreamMode ?? false;
  const rawHidden = settings.liveHiddenItems;
  const parsed = parseLiveHidden(rawHidden);
  const hidden = effectiveLiveHidden(isLive, parsed);

  return { isLive, hidden };
}
