
import React, { useState, useEffect } from 'react';
import { getSeasonSettings, saveSeasonSettings } from '../../services/mockApi';
import { SeasonSettings } from '../../types';
import { XIcon } from '../Icons';

interface SeasonSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const defaultRecurringSettings = {
    type: 'recurring' as const,
    summerDay: 1, summerMonth: 4, // April 1st
    winterDay: 1, winterMonth: 11, // November 1st
};

const defaultManualSettings = {
    type: 'manual' as const,
    winterStartDate: `${new Date().getFullYear()}-11-01`,
    winterEndDate: `${new Date().getFullYear() + 1}-03-31`,
};

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, name: new Date(0, i).toLocaleString('ru-RU', { month: 'long' }) }));
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const SeasonSettingsModal: React.FC<SeasonSettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<SeasonSettings>(defaultRecurringSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      getSeasonSettings()
        .then(setSettings)
        .catch(() => setError('Не удалось загрузить настройки.'))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleTypeChange = (type: 'recurring' | 'manual') => {
    if (type === 'recurring') {
      setSettings(prev => ({ ...defaultRecurringSettings, ...(prev.type === 'recurring' && prev) }));
    } else {
      setSettings(prev => ({ ...defaultManualSettings, ...(prev.type === 'manual' && prev) }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };
  
  const handleNumericChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: parseInt(value, 10) }));
  };

  const handleSave = async () => {
    try {
      await saveSeasonSettings(settings);
      onClose();
    } catch (e) {
      setError('Не удалось сохранить настройки.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300"
      aria-labelledby="modal-title" role="dialog" aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col transform transition-all duration-300"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 id="modal-title" className="text-xl font-bold text-gray-900 dark:text-white">Настройка сезонов</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Закрыть">
            <XIcon className="h-6 w-6" />
          </button>
        </header>

        <main className="p-6 space-y-6 overflow-y-auto">
          {isLoading ? (
            <div className="text-center">Загрузка...</div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Тип настройки</label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input type="radio" name="settingsType" value="recurring" checked={settings.type === 'recurring'} onChange={() => handleTypeChange('recurring')} className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                    <span className="ml-2 text-gray-800 dark:text-gray-200">Циклический (ежегодно)</span>
                  </label>
                  <label className="flex items-center">
                    <input type="radio" name="settingsType" value="manual" checked={settings.type === 'manual'} onChange={() => handleTypeChange('manual')} className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                    <span className="ml-2 text-gray-800 dark:text-gray-200">Ручной (на год)</span>
                  </label>
                </div>
              </div>

              {settings.type === 'recurring' && (
                <div className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg space-y-4 bg-gray-50 dark:bg-gray-700">
                    <h4 className="font-semibold text-gray-800 dark:text-white">Даты перехода</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <label className="block space-y-1">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Переход на летние нормы</span>
                            <div className="flex gap-2">
                                <select name="summerDay" value={settings.summerDay} onChange={handleNumericChange} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2">
                                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <select name="summerMonth" value={settings.summerMonth} onChange={handleNumericChange} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2">
                                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                                </select>
                            </div>
                        </label>
                         <label className="block space-y-1">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Переход на зимние нормы</span>
                            <div className="flex gap-2">
                                <select name="winterDay" value={settings.winterDay} onChange={handleNumericChange} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2">
                                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <select name="winterMonth" value={settings.winterMonth} onChange={handleNumericChange} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2">
                                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                                </select>
                            </div>
                        </label>
                    </div>
                </div>
              )}

              {settings.type === 'manual' && (
                <div className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg space-y-4 bg-gray-50 dark:bg-gray-700">
                    <h4 className="font-semibold text-gray-800 dark:text-white">Зимний период</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <label className="block space-y-1">
                             <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Дата начала</span>
                            <input type="date" name="winterStartDate" value={settings.winterStartDate} onChange={handleChange} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                        </label>
                        <label className="block space-y-1">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Дата окончания</span>
                            <input type="date" name="winterEndDate" value={settings.winterEndDate} onChange={handleChange} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                        </label>
                    </div>
                </div>
              )}

              {error && <p className="text-red-500 text-sm">{error}</p>}
            </>
          )}
        </main>
        
        <footer className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
            <button onClick={onClose} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Отмена</button>
            <button onClick={handleSave} disabled={isLoading} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-blue-400">Сохранить</button>
        </footer>

      </div>
    </div>
  );
};

export default SeasonSettingsModal;
