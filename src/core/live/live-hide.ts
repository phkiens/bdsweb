export enum LiveHideItem {
  TAB_UNVERIFIED = 'tab_unverified',
  TAB_CUSTOMERS = 'tab_customers',
  TAB_MAP = 'tab_map',
  SETTINGS_BUTTON = 'settings_button',
  DIARY_VIEWINGS = 'diary_viewings',
  CUSTOMER_ACTIONS = 'customer_actions',
}

export interface LiveHideItemMeta {
  key: LiveHideItem;
  label: string;
}

export const LIVE_HIDE_ITEMS: readonly LiveHideItemMeta[] = [
  { key: LiveHideItem.TAB_UNVERIFIED, label: 'Tab SP chờ' },
  { key: LiveHideItem.TAB_CUSTOMERS, label: 'Tab Khách hàng' },
  { key: LiveHideItem.TAB_MAP, label: 'Tab Bản đồ' },
  { key: LiveHideItem.SETTINGS_BUTTON, label: 'Nút Cài đặt' },
  { key: LiveHideItem.DIARY_VIEWINGS, label: 'Nhật ký, khách xem' },
  { key: LiveHideItem.CUSTOMER_ACTIONS, label: 'Thêm/Quét khách' },
];

export const ALL_LIVE_HIDE_ITEMS: Set<LiveHideItem> = new Set(Object.values(LiveHideItem));

export function parseLiveHidden(raw: Iterable<string> | null | undefined): Set<LiveHideItem> {
  if (raw == null) {
    return new Set(ALL_LIVE_HIDE_ITEMS);
  }
  const result = new Set<LiveHideItem>();
  const validKeys = new Set<string>(Object.values(LiveHideItem));
  for (const item of raw) {
    if (validKeys.has(item)) {
      result.add(item as LiveHideItem);
    }
  }
  return result;
}

export function effectiveLiveHidden(isLive: boolean, saved: Set<LiveHideItem>): Set<LiveHideItem> {
  if (!isLive) return new Set<LiveHideItem>();
  return saved;
}

export function visibleBottomNavRoutes(routes: string[], hidden: Set<LiveHideItem>): string[] {
  return routes.filter(route => {
    switch (route) {
      case 'unverified_list':
      case '/unverified':
        return !hidden.has(LiveHideItem.TAB_UNVERIFIED);
      case 'customer_list':
      case '/customers':
        return !hidden.has(LiveHideItem.TAB_CUSTOMERS);
      case 'map_survey':
      case '/map':
        return !hidden.has(LiveHideItem.TAB_MAP);
      case 'settings':
      case '/settings':
        return !hidden.has(LiveHideItem.SETTINGS_BUTTON);
      default:
        return true;
    }
  });
}

export function shouldShowBottomNav(visibleRoutes: string[]): boolean {
  return visibleRoutes.length > 1;
}
