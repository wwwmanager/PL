
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

    if (!can('admin.panel')) return <div className="text-gray-500 p-4">Доступ к общим настройкам ограничен.</div>;
    if (loading || !settings) return <div className="p-4 text-gray-500">Загрузка настроек...</div>;

    const widgets = settings.dashboardWidgets || { showStatuses: true, showFleetStats: true, showCharts: true, showOverruns: true, showMaintenance: true, showBirthdays: true };

    const CheckboxItem = ({
        checked,
        onChange,
        title,
        description
    }: {
        checked: boolean,
        onChange: () => void,
        title: string,
        description: string
    }) => (
        <label className="flex items-start gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors bg-white dark:bg-gray-800">
            <input
                type="checkbox"
                checked={checked}
                onChange={onChange}
                className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{description}</div>
            </div>
        </label>
    );

    return (
        <div className="max-w-4xl space-y-10">

            {/* Branding Section */}
            <section>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                    Брендирование
                </h3>
                <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                        <div className="flex-shrink-0">
                            {settings.customLogo ? (
                                <div className="h-24 w-24 relative group rounded-lg border border-gray-100 dark:border-gray-600 p-2 flex items-center justify-center bg-gray-50 dark:bg-gray-700">
                                    <img src={settings.customLogo} alt="Custom Logo" className="max-h-full max-w-full object-contain" />
                                </div>
                            ) : (
                                <div className="h-24 w-24 bg-gray-100 dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-500 flex items-center justify-center text-xs text-gray-400 font-medium">
                                    Нет логотипа
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Логотип приложения</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Отображается на экране входа и в шапке бокового меню. <br />
                                Рекомендуемый формат: PNG или SVG с прозрачным фоном, до 200КБ.
                            </p>
                            <div className="flex gap-3">
                                <input type="file" accept="image/png, image/jpeg, image/svg+xml" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" />
                                <button
                                    onClick={() => logoInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm font-medium transition-colors"
                                >
                                    <UploadIcon className="h-4 w-4" />
                                    Загрузить
                                </button>
                                {settings.customLogo && (
                                    <button
                                        onClick={handleResetLogo}
                                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-red-300 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
                                    >
                                        <TrashIcon className="h-4 w-4" />
                                        Сбросить
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* App Mode Section */}
            <section>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                    Режим работы
                </h3>
                <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800">
                    <div className="space-y-4">
                        <label className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${settings.appMode === 'driver' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                            <input
                                type="radio"
                                name="appMode"
                                value="driver"
                                checked={settings.appMode === 'driver'}
                                onChange={async () => {
                                    const next = { ...settings, appMode: 'driver' as const };
                                    setSettings(next);
                                    try {
                                        await saveAppSettings(next);
                                        showToast('Режим изменен на Упрощенный.', 'success');
                                    } catch {
                                        showToast('Ошибка сохранения режима.', 'error');
                                    }
                                }}
                                className="mt-1 h-5 w-5 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-gray-100">Упрощенный режим (Driver Mode)</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Путевые листы сразу переходят в статус "Проведен" без дополнительной проверки.
                                    Подходит для небольших организаций.
                                </div>
                            </div>
                        </label>
                        <label className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${settings.appMode === 'central' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                            <input
                                type="radio"
                                name="appMode"
                                value="central"
                                checked={settings.appMode === 'central'}
                                onChange={async () => {
                                    const next = { ...settings, appMode: 'central' as const };
                                    setSettings(next);
                                    try {
                                        await saveAppSettings(next);
                                        showToast('Режим изменен на Центральный.', 'success');
                                    } catch {
                                        showToast('Ошибка сохранения режима.', 'error');
                                    }
                                }}
                                className="mt-1 h-5 w-5 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-gray-100">Центральный режим (Central Mode)</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Путевые листы проходят этап проверки ("На проверке") перед проведением.
                                    Рекомендуется для крупных организаций с централизованным контролем.
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </section>

            {/* General Settings Section */}
            <section>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                    Функциональность
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CheckboxItem
                        checked={settings.isParserEnabled}
                        onChange={() => handleToggle('isParserEnabled')}
                        title="Парсер маршрутов из файла"
                        description="Включает кнопку импорта HTML-отчетов в форме путевого листа для автоматического заполнения маршрута."
                    />
                    <CheckboxItem
                        checked={settings.blanks?.driverCanAddBatches ?? true}
                        onChange={() => handleToggle('blanks.driverCanAddBatches')}
                        title="Водитель может добавлять пачки"
                        description="Разрешает водителям регистрировать собственные пачки бланков. Если отключено — бланки выдает только диспетчер."
                    />
                    <CheckboxItem
                        checked={settings.autoSaveRoutes ?? true}
                        onChange={() => handleToggle('autoSaveRoutes')}
                        title="Автосохранение маршрутов"
                        description="При сохранении путевого листа новые пункты назначения автоматически добавляются в справочник маршрутов."
                    />
                </div>
            </section>

            {/* Dashboard Config Section */}
            <section>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                    Настройка Панели управления
                </h3>
                <p className="text-sm text-gray-500 mb-4">Выберите виджеты, которые будут отображаться на главном экране.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <CheckboxItem checked={widgets.showStatuses} onChange={() => handleToggle('dashboard.showStatuses')} title="Статусы документов" description="Сводка по черновикам, проведенным и проблемам." />
                    <CheckboxItem checked={widgets.showFleetStats} onChange={() => handleToggle('dashboard.showFleetStats')} title="Показатели парка" description="Общий пробег, остатки топлива." />
                    <CheckboxItem checked={widgets.showCharts} onChange={() => handleToggle('dashboard.showCharts')} title="Графики аналитики" description="Динамика расхода и медосмотров." />
                    <CheckboxItem checked={widgets.showOverruns} onChange={() => handleToggle('dashboard.showOverruns')} title="Топ перерасходов" description="Список водителей с перерасходом топлива." />
                    <CheckboxItem checked={widgets.showMaintenance} onChange={() => handleToggle('dashboard.showMaintenance')} title="Ближайшие ТО" description="Напоминания о техническом обслуживании." />
                    <CheckboxItem checked={widgets.showBirthdays} onChange={() => handleToggle('dashboard.showBirthdays')} title="Именинники" description="Дни рождения сотрудников в этом месяце." />
                </div>
            </section>
        </div>
    );
};
