
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../services/auth';
import { AppSettings, DashboardWidgetsSettings } from '../../types';
import { getAppSettings, saveAppSettings } from '../../services/mockApi';
import { useToast } from '../../hooks/useToast';
import { UploadIcon, TrashIcon } from '../Icons';

export const AppSettingsComponent: React.FC = () => {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAppSettings().then((data) => {
        setSettings(data);
        setLoading(false);
    });
  }, []);

  const handleToggle = async (key: keyof AppSettings | string) => {
    if (!settings) return;
    let next = { ...settings };
    
    if (key === 'blanks.driverCanAddBatches') {
        next.blanks = { ...next.blanks, driverCanAddBatches: !next.blanks?.driverCanAddBatches };
    } else if (String(key).startsWith('dashboard.')) {
        const widgetKey = String(key).split('.')[1] as keyof DashboardWidgetsSettings;
        next.dashboardWidgets = {
            ...next.dashboardWidgets,
            [widgetKey]: !next.dashboardWidgets?.[widgetKey]
        } as DashboardWidgetsSettings;
    } else if (key === 'isParserEnabled' || key === 'enableWarehouseAccounting' || key === 'autoSaveRoutes') {
        next = { ...next, [key]: !next[key as keyof AppSettings] };
    }

    setSettings(next);
    try {
      await saveAppSettings(next);
      showToast('Настройки сохранены.', 'success');
    } catch {
      showToast('Ошибка сохранения настроек.', 'error');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !settings) return;

      if (file.size > 200 * 1024) { // 200KB limit
          showToast('Файл слишком большой. Максимум 200КБ.', 'error');
          return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          const next = { ...settings, customLogo: base64 };
          setSettings(next);
          try {
              await saveAppSettings(next);
              showToast('Логотип обновлен.', 'success');
          } catch {
              showToast('Ошибка сохранения логотипа.', 'error');
          }
      };
      reader.readAsDataURL(file);
  };

  const handleResetLogo = async () => {
      if (!settings) return;
      const next = { ...settings, customLogo: null };
      setSettings(next);
      try {
          await saveAppSettings(next);
          showToast('Логотип сброшен.', 'info');
      } catch {
          showToast('Ошибка сброса логотипа.', 'error');
      }
  };

  if (!can('admin.panel')) return <div className="text-gray-500">Доступ к общим настройкам ограничен.</div>;
  if (loading || !settings) return <div>Загрузка...</div>;

  const widgets = settings.dashboardWidgets || { showStatuses: true, showFleetStats: true, showCharts: true, showOverruns: true, showMaintenance: true, showBirthdays: true };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Общие настройки</h3>
        <div className="flex flex-col gap-3">
            <div className="p-4 border rounded-lg dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">Логотип приложения</div>
                <div className="flex items-center gap-4">
                    {settings.customLogo ? (
                        <div className="relative group">
                            <img src={settings.customLogo} alt="Custom Logo" className="h-16 w-auto object-contain border rounded p-1" />
                        </div>
                    ) : (
                        <div className="h-16 w-16 bg-gray-100 dark:bg-gray-700 rounded border border-dashed border-gray-400 flex items-center justify-center text-xs text-gray-500">
                            Стандартный
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        <input type="file" accept="image/png, image/jpeg, image/svg+xml" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" />
                        <button 
                            onClick={() => logoInputRef.current?.click()} 
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors"
                        >
                            <UploadIcon className="h-4 w-4" />
                            Загрузить
                        </button>
                        {settings.customLogo && (
                            <button 
                                onClick={handleResetLogo} 
                                className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm transition-colors"
                            >
                                <TrashIcon className="h-4 w-4" />
                                Сбросить
                            </button>
                        )}
                    </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">Рекомендуется: SVG или PNG с прозрачным фоном, макс. 200КБ.</div>
            </div>

            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
            <input
                type="checkbox"
                checked={settings.isParserEnabled}
                onChange={() => handleToggle('isParserEnabled')}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Парсер маршрутов из файла</div>
                <div className="text-xs text-gray-500">Включает кнопку импорта HTML-отчетов в путевом листе.</div>
            </div>
            </label>
            
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
            <input
                type="checkbox"
                checked={settings.blanks?.driverCanAddBatches ?? true}
                onChange={() => handleToggle('blanks.driverCanAddBatches')}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Водитель может добавлять пачки</div>
                <div className="text-xs text-gray-500">Разрешает водителям создавать свои пачки бланков (если отключено - только через выдачу).</div>
            </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
            <input
                type="checkbox"
                checked={settings.autoSaveRoutes ?? true}
                onChange={() => handleToggle('autoSaveRoutes')}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Автосохранение новых маршрутов</div>
                <div className="text-xs text-gray-500">При сохранении путевого листа новые маршруты автоматически добавляются в справочник.</div>
            </div>
            </label>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Настройка Панели управления</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showStatuses} onChange={() => handleToggle('dashboard.showStatuses')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Статусы документов</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showFleetStats} onChange={() => handleToggle('dashboard.showFleetStats')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Показатели парка (Пробег, Топливо)</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showCharts} onChange={() => handleToggle('dashboard.showCharts')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Графики</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showOverruns} onChange={() => handleToggle('dashboard.showOverruns')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Топ перерасходов</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showMaintenance} onChange={() => handleToggle('dashboard.showMaintenance')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Ближайшие ТО</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showBirthdays} onChange={() => handleToggle('dashboard.showBirthdays')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Именинники месяца</span>
            </label>
        </div>
      </div>
    </div>
  );
};
