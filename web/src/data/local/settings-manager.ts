import { FilterMode, MapZoomScope } from "../../core/models/enums";

export interface SettingsState {
  hasShownOnboarding: boolean;
  autoSyncEnabled: boolean;
  syncTime: string;
  wifiOnlyForMedia: boolean;
  filterMode: FilterMode;
  mapZoomScope: MapZoomScope;
  mapRadiusDefault: string; // "all", "1km", "2km", "5km", "10km"
  fabOnLeft: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string;
  geminiModel: string;
}

const STORAGE_KEY = "bds_web_settings";

const defaultSettings: SettingsState = {
  hasShownOnboarding: false,
  autoSyncEnabled: true,
  syncTime: "12:00",
  wifiOnlyForMedia: false,
  filterMode: FilterMode.LAST_USED,
  mapZoomScope: MapZoomScope.DISTRICT,
  mapRadiusDefault: "all",
  fabOnLeft: false,
  supabaseUrl: (import.meta as any).env?.VITE_SUPABASE_URL || "",
  supabaseAnonKey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "",
  geminiApiKey: (import.meta as any).env?.VITE_GEMINI_API_KEY || "",
  geminiModel: "gemini-1.5-flash"
};

export class SettingsManager {
  private state: SettingsState;
  private listeners: Set<(s: SettingsState) => void> = new Set();

  constructor() {
    this.state = this.load();
  }

  private load(): SettingsState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...defaultSettings, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error("Failed to load settings from localStorage", e);
    }
    return defaultSettings;
  }

  public getSettings(): SettingsState {
    return { ...this.state };
  }

  public update(partial: Partial<SettingsState>) {
    this.state = { ...this.state, ...partial };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error("Failed to save settings to localStorage", e);
    }
    this.notify();
  }

  public subscribe(listener: (s: SettingsState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const current = this.getSettings();
    for (const listener of this.listeners) {
      listener(current);
    }
  }
}

export const settingsManager = new SettingsManager();
