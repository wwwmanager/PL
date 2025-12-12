
import React, { useState, useEffect } from 'react';
import { getSeasonSettings, saveSeasonSettings } from '../../services/mockApi';
import { SeasonSettings } from '../../types';
import Modal from '../shared/Modal';

interface SeasonSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const defaultRecurringSettings: SeasonSettings = {
    type: 'recurring',
    summerDay: 1, summerMonth: 4, // April 1st
    winterDay: 1, winterMonth: 11, // November 1st
};

const defaultManualSettings: SeasonSettings = {
    type: 'manual',
    winterStartDate: `${new Date().getFullYear()}-11-01`,
    winterEndDate: `${new Date().getFullYear() + 1}-03-31`,
};

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, name: new Date(0, i).toLocaleString('ru-RU', { month: 'long' }) }));
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const SeasonSettingsModal: React.FC<SeasonSettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<SeasonSettings>(defaultRecurringSettings);
  const [initialSettings, setInitialSettings] = useState<SeasonSettings>(defaultRecurringSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      getSeasonSettings()
        .then(data => {
            if (data) {
                setSettings(data);
                setInitialSettings(JSON.parse(JSON.stringify(data)));
            } else {
                setSettings(defaultRecurringSettings);
                setInitialSettings(JSON.parse(JSON.stringify(defaultRecurringSettings)));
            }
        })
        .catch(() => setError('Не удалось загрузить настройки.'))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleTypeChange = (type: 'recurring' | 'manual') => {
    if (type === 'recurring') {
      setSettings(prev => ({ ...defaultRecurringSettings, ...(prev?.type === 'recurring' && prev) }));
    } else {
      setSettings(prev => ({ ...defaultManualSettings, ...(prev?.type === 'manual' && prev) }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value } as SeasonSettings));
  };
  
  const handleNumericChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: parseInt(value, 10) } as SeasonSettings));
  };

  const handleSave = async () => {
    try {
      await saveSeasonSettings(settings);
      onClose();
    } catch (e) {
      setError('Не удалось сохранить настройки.');
    }
  };

  const isDirty = JSON.stringify(settings) !== JSON.stringify(initialSettings);

  const footer = (
    <>
        <button onClick={onClose} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Отмена</button>
        <button onClick={handleSave} disabled={isLoading || !settings} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-blue-400">Сохранить</button>
    </>
  );

  return (
    <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Настройка сезонов"
        isDirty={isDirty}
        footer={footer}
    >
          {isLoading ? (
            <div className="text-center">Загрузка...</div>
          ) : !settings ? (
             <div className="text-center text-red-500">Ошибка: настройки не найдены.</div>
          ) : (
            <div className="space-y-6">
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
            </div>
          )}
    </Modal>
  );
};

export default SeasonSettingsModal;
