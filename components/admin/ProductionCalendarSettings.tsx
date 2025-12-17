
import React, { useState, useEffect, useMemo } from 'react';
import { CalendarEvent } from '../../types';
import { getCalendarEvents, updateCalendarEvent, fetchOfficialCalendar, processCalendarJson } from '../../services/mockApi';
import { useToast } from '../../hooks/useToast';
import { ArrowDownIcon, ArrowUpIcon, DownloadIcon, ClipboardCheckIcon, XIcon } from '../Icons';
import Modal from '../shared/Modal';

const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Helper to avoid timezone shifts when converting to string YYYY-MM-DD
const toLocalISO = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

interface ProductionCalendarSettingsProps {
    readOnly?: boolean;
}

const ProductionCalendarSettings: React.FC<ProductionCalendarSettingsProps> = ({ readOnly = false }) => {
    const [year, setYear] = useState(new Date().getFullYear());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Manual Import State
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [manualJson, setManualJson] = useState('');
    
    const { showToast } = useToast();

    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = async () => {
        setIsLoading(true);
        try {
            const data = await getCalendarEvents();
            setEvents(data);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        setIsLoading(true);
        try {
            const count = await fetchOfficialCalendar(year);
            showToast(`Загружено ${count} событий на ${year} год.`, 'success');
            await loadEvents();
        } catch (e) {
            showToast('Ошибка автоматической загрузки. Попробуйте ручной режим.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualImport = async () => {
        if (!manualJson.trim()) {
            showToast('Вставьте JSON код.', 'error');
            return;
        }
        
        setIsLoading(true);
        try {
            const data = JSON.parse(manualJson);
            const count = await processCalendarJson(data, year);
            
            if (count > 0) {
                showToast(`Успешно импортировано ${count} событий.`, 'success');
                setManualJson('');
                setIsManualModalOpen(false);
                await loadEvents();
            } else {
                showToast('Не удалось найти события в JSON. Проверьте формат.', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Ошибка при разборе JSON. Проверьте формат.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleDay = async (date: Date) => {
        if (readOnly) return; // Prevent toggle in read-only mode

        const dateStr = toLocalISO(date);
        const existing = events.find(e => e.date === dateStr);
        
        let newType: CalendarEvent['type'] = 'workday';
        
        // Logic: 
        // Default -> Holiday (if standard workday)
        // Default -> Workday (if standard weekend)
        
        const dayOfWeek = date.getDay();
        const isStandardWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (existing) {
            if (existing.type === 'holiday') newType = 'workday';
            else if (existing.type === 'workday') newType = 'short';
            else if (existing.type === 'short') newType = 'holiday'; // loop back
        } else {
            // No record. Create one.
            if (isStandardWeekend) newType = 'workday'; // Make working
            else newType = 'holiday'; // Make holiday
        }

        const newEvent: CalendarEvent = {
            id: existing?.id || '', // repo will ignore empty id on update if create
            date: dateStr,
            type: newType,
            note: 'Ручное изменение'
        };

        try {
            await updateCalendarEvent(newEvent);
            // Optimistic update
            const otherEvents = events.filter(e => e.date !== dateStr);
            setEvents([...otherEvents, newEvent]);
        } catch (e) {
            showToast('Ошибка сохранения.', 'error');
        }
    };

    const renderMonth = (monthIndex: number) => {
        const firstDay = new Date(year, monthIndex, 1);
        const lastDay = new Date(year, monthIndex + 1, 0);
        const daysInMonth = lastDay.getDate();
        
        // Adjust for Monday start (0-6, Mon-Sun)
        let startDayOfWeek = firstDay.getDay() - 1;
        if (startDayOfWeek === -1) startDayOfWeek = 6;

        const days = [];
        // Empty cells
        for (let i = 0; i < startDayOfWeek; i++) {
            days.push(<div key={`empty-${i}`} className="p-2"></div>);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, monthIndex, d);
            const dateStr = toLocalISO(date);
            const event = events.find(e => e.date === dateStr);
            
            const dayOfWeek = date.getDay();
            const isStandardWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            let bgClass = '';
            let textClass = 'text-gray-700 dark:text-gray-300';

            // Determine effective type
            let type = isStandardWeekend ? 'holiday' : 'workday';
            if (event) type = event.type;

            if (type === 'holiday') {
                bgClass = 'bg-red-100 dark:bg-red-900/50';
                textClass = 'text-red-800 dark:text-red-200 font-bold';
            } else if (type === 'workday' && isStandardWeekend) {
                // Explicit working weekend
                bgClass = 'bg-gray-200 dark:bg-gray-600'; 
                textClass = 'text-gray-900 dark:text-white font-bold';
            } else if (type === 'short') {
                bgClass = 'bg-yellow-100 dark:bg-yellow-900/50';
                textClass = 'text-yellow-800 dark:text-yellow-200';
            }

            days.push(
                <button 
                    key={d} 
                    onClick={() => toggleDay(date)}
                    disabled={readOnly}
                    className={`p-1 text-center rounded text-sm transition-opacity ${bgClass} ${textClass} ${!readOnly ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                    title={event?.note || (type === 'holiday' ? 'Выходной' : 'Рабочий')}
                >
                    {d}
                </button>
            );
        }

        return (
            <div key={monthIndex} className="border dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
                <h4 className="text-center font-bold mb-2 text-gray-800 dark:text-white">{MONTH_NAMES[monthIndex]}</h4>
                <div className="grid grid-cols-7 gap-1">
                    {WEEK_DAYS.map(day => (
                        <div key={day} className="text-center text-xs text-gray-500 font-medium">{day}</div>
                    ))}
                    {days}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <div className="flex items-center gap-4">
                    <button onClick={() => setYear(year - 1)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200"><ArrowDownIcon className="h-5 w-5 transform rotate-90" /></button>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{year}</h2>
                    <button onClick={() => setYear(year + 1)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200"><ArrowUpIcon className="h-5 w-5 transform rotate-90" /></button>
                </div>
                
                <div className="flex gap-4">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="w-3 h-3 bg-red-100 dark:bg-red-900/50 rounded-sm border border-red-200"></span> Выходной
                        <span className="w-3 h-3 bg-yellow-100 dark:bg-yellow-900/50 rounded-sm border border-yellow-200"></span> Сокр.
                        <span className="w-3 h-3 bg-gray-200 dark:bg-gray-600 rounded-sm"></span> Рабочий
                    </div>
                    {!readOnly && (
                        <>
                            <button 
                                onClick={handleSync} 
                                disabled={isLoading}
                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                title="Попробовать загрузить автоматически"
                            >
                                <DownloadIcon className="h-5 w-5" />
                                {isLoading ? '...' : `Авто-загрузка`}
                            </button>
                            <button 
                                onClick={() => setIsManualModalOpen(true)}
                                disabled={isLoading}
                                className="flex items-center gap-2 bg-gray-100 text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"
                                title="Вставить JSON вручную, если авто-загрузка не работает"
                            >
                                <ClipboardCheckIcon className="h-5 w-5" />
                                JSON вручную
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
            </div>

            <Modal
                isOpen={isManualModalOpen}
                onClose={() => setIsManualModalOpen(false)}
                title={`Ручная загрузка календаря на ${year} год`}
                footer={
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setIsManualModalOpen(false)} className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white">Отмена</button>
                        <button onClick={handleManualImport} disabled={isLoading} className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold">Импортировать</button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Если автоматическая загрузка не работает (блокировка CORS), выполните следующие шаги:
                    </p>
                    <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-200 space-y-2 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-md border dark:border-gray-700">
                        <li>
                            Откройте ссылку в новой вкладке: <br/>
                            <a 
                                href={`https://xmlcalendar.ru/data/ru/${year}/calendar.json`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 underline font-mono break-all"
                            >
                                https://xmlcalendar.ru/data/ru/{year}/calendar.json
                            </a>
                        </li>
                        <li>Скопируйте весь текст со страницы (Ctrl+A, Ctrl+C).</li>
                        <li>Вставьте текст в поле ниже.</li>
                    </ol>
                    <textarea 
                        value={manualJson}
                        onChange={e => setManualJson(e.target.value)}
                        placeholder='Вставьте JSON здесь (например: { "year": 2025, "days": [ { "d": "01.01", "t": 1 }, ... ] })'
                        className="w-full h-48 p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-xs"
                    />
                </div>
            </Modal>
        </div>
    );
};

export default ProductionCalendarSettings;
