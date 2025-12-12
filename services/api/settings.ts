
import { AppSettings, SeasonSettings } from '../../types';
import { loadJSON, saveJSON } from '../storage';
import { DB_KEYS } from '../dbKeys';
import { broadcast } from '../bus';

export const getAppSettings = async (): Promise<AppSettings> => {
    const defaults: AppSettings = { 
        isParserEnabled: true, 
        appMode: 'driver',
        autoSaveRoutes: true,
        customLogo: null,
        blanks: {
            driverCanAddBatches: true
        },
        dashboardWidgets: {
            showStatuses: true,
            showFleetStats: true,
            showCharts: true,
            showOverruns: true,
            showMaintenance: true,
            showBirthdays: true
        }
    };
    const loaded = await loadJSON<AppSettings | null>(DB_KEYS.APP_SETTINGS, null);
    
    if (!loaded) return defaults;

    // Merge loaded settings with defaults to ensure all keys exist
    return {
        ...defaults,
        ...loaded,
        blanks: { ...defaults.blanks, ...loaded.blanks },
        dashboardWidgets: { ...defaults.dashboardWidgets, ...loaded.dashboardWidgets }
    };
};
export const saveAppSettings = async (settings: AppSettings) => {
    await saveJSON(DB_KEYS.APP_SETTINGS, settings);
    broadcast('settings');
};

export const getSeasonSettings = async (): Promise<SeasonSettings> => {
    const defaults: SeasonSettings = { type: 'recurring', summerDay: 1, summerMonth: 4, winterDay: 1, winterMonth: 11 };
    const loaded = await loadJSON<SeasonSettings | null>(DB_KEYS.SEASON_SETTINGS, null);
    // Ensure we never return null, even if "null" is stored in DB
    return loaded || defaults;
};
export const saveSeasonSettings = async (settings: SeasonSettings) => {
    await saveJSON(DB_KEYS.SEASON_SETTINGS, settings);
};
export const isWinterDate = (dateStr: string, settings: SeasonSettings) => {
    if (!settings) return false;
    const date = new Date(dateStr);
    if (settings.type === 'manual') {
        const start = new Date(settings.winterStartDate);
        const end = new Date(settings.winterEndDate);
        return date >= start && date <= end;
    } else {
        const m = date.getMonth() + 1;
        if (m >= settings.winterMonth || m < settings.summerMonth) return true;
        return false;
    }
};