
import React, { useState, useEffect, useMemo } from 'react';
import { getVehicles, getWaybills, getSeasonSettings } from '../../services/mockApi';
import { calculateStats } from '../../utils/waybillCalculations';
import { Vehicle, Waybill } from '../../types';
import Modal from '../shared/Modal';
import { CheckCircleIcon, XIcon, ExclamationCircleIcon, FunnelIcon } from '../Icons';

type EnrichedWaybill = Awaited<ReturnType<typeof getWaybills>>[0];

interface WaybillCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWaybill: (waybillId: string) => void;
}

type CheckResult = {
  waybill: EnrichedWaybill;
  errors: string[];
  summary: {
    distance: number;
    consumption: number;
    fuelEnd: number;
    // Extra fields for formula display
    rate: number;
    startFuel: number;
    fuelFilled: number;
  };
}

const WaybillCheckModal: React.FC<WaybillCheckModalProps> = ({ isOpen, onClose, onOpenWaybill }) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showOnlyErrors, setShowOnlyErrors] = useState(true); // Default to true
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [checkPerformed, setCheckPerformed] = useState(false);
  
  // Data state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [availableVehicleIds, setAvailableVehicleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
        // Load data for dropdown
        Promise.all([getVehicles(), getWaybills()]).then(([vehs, wbs]) => {
            setVehicles(vehs);
            // Collect vehicle IDs that actually have waybills
            const ids = new Set(wbs.map(w => w.vehicleId));
            setAvailableVehicleIds(ids);
        });

        setSelectedVehicleId('');
        // Default to current year
        const now = new Date();
        setDateFrom(`${now.getFullYear()}-01-01`);
        setDateTo(`${now.getFullYear()}-12-31`);
        
        setError(null);
        setResults([]);
        setCheckPerformed(false);
        setIsLoading(false);
    }
  }, [isOpen]);

  // Filter vehicles
  const vehiclesWithWaybills = useMemo(() => {
      return vehicles.filter(v => availableVehicleIds.has(v.id));
  }, [vehicles, availableVehicleIds]);

  const handleCheck = async () => {
    // 1. Валидация входных данных
    if (!selectedVehicleId || !dateFrom || !dateTo) {
        setError('Пожалуйста, выберите ТС и период.');
        return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);
    setCheckPerformed(false);

    try {
        const [allWaybills, seasonSettings] = await Promise.all([
            getWaybills(), 
            getSeasonSettings()
        ]);

        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (!vehicle) throw new Error(`ТС с ID ${selectedVehicleId} не найдено.`);

        // 2. Фильтрация и надежная сортировка
        const filteredWaybills = allWaybills
            .filter(w => w.vehicleId === vehicle.id && w.date >= dateFrom && w.date <= dateTo)
            .sort((a, b) => {
                const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
                // Если даты равны, сортируем по номеру ПЛ или времени выезда (если есть)
                if (timeDiff === 0) {
                   // Предполагаем, что number - это строка или число
                   return (a.number > b.number) ? 1 : -1; 
                }
                return timeDiff;
            });

        if (filteredWaybills.length === 0) {
            setError('Путевые листы для данного ТС и периода не найдены.');
            return; // isLoading сбросится в finally
        }

        const checkResults: CheckResult[] = [];
        let previousWaybill: EnrichedWaybill | null = null;

        // 3. Итерация
        for (const currentWaybill of filteredWaybills) {
            const errors: string[] = [];
            
            // --- БЛОК 1: Внутренняя консистентность документа ---

            const dayMode = currentWaybill.date === currentWaybill.validTo.split('T')[0] ? 'single' : 'multi';
            const method = currentWaybill.calculationMethod || 'by_total';

            // Расчет эталона (Normative Calculation)
            const stats = calculateStats(
                currentWaybill.routes,
                vehicle,
                seasonSettings,
                currentWaybill.date,
                dayMode,
                method
            );

            // Проверка: Одометр (Start + Dist = End)
            // Допуск 1-2 км для погрешности одометра допустим
            const calcOdometerEnd = currentWaybill.odometerStart + stats.distance;
            if (currentWaybill.odometerEnd !== undefined && Math.abs(currentWaybill.odometerEnd - calcOdometerEnd) > 2) {
                errors.push(`Не сходится пробег внутри ПЛ. Расчет: ${calcOdometerEnd.toFixed(0)}, В документе: ${currentWaybill.odometerEnd}. Разница: ${(currentWaybill.odometerEnd - calcOdometerEnd).toFixed(0)} км.`);
            }

            // Проверка: Топливная арифметика (Start + Filled - Planned = End)
            const calculatedFuelEnd = (currentWaybill.fuelAtStart ?? 0) + (currentWaybill.fuelFilled ?? 0) - (currentWaybill.fuelPlanned ?? 0);
            
            // Проверка фактического остатка против расчетного (арифметическая ошибка записи)
            if (Math.abs((currentWaybill.fuelAtEnd ?? 0) - calculatedFuelEnd) > 0.1) {
                errors.push(`Ошибка арифметики топлива. Должно быть: ${calculatedFuelEnd.toFixed(2)}, Записано: ${currentWaybill.fuelAtEnd}.`);
            }

            // Проверка планового расхода против нормы
            if (Math.abs((currentWaybill.fuelPlanned ?? 0) - stats.consumption) > 0.1) {
                errors.push(`Нормативный расход не совпадает. По норме: ${stats.consumption.toFixed(2)}, В документе: ${currentWaybill.fuelPlanned}.`);
            }

            if ((currentWaybill.fuelAtEnd ?? 0) < 0) {
                errors.push(`Отрицательный остаток топлива: ${currentWaybill.fuelAtEnd} л.`);
            }

            // --- БЛОК 2: Непрерывность цепочки (Continuity Checks) ---
            
            if (previousWaybill) {
                const prevEndOdo = previousWaybill.odometerEnd ?? 0;
                const currStartOdo = currentWaybill.odometerStart;
                const prevEndFuel = previousWaybill.fuelAtEnd ?? 0;
                const currStartFuel = currentWaybill.fuelAtStart ?? 0;

                // 1. Проверка одометра
                if (currStartOdo < prevEndOdo) {
                    errors.push(`Скручивание пробега! Начало: ${currStartOdo}, конец пред.: ${prevEndOdo}.`);
                } else if ((currStartOdo - prevEndOdo) > 1) {
                    // НОВАЯ ПРОВЕРКА: Разрыв
                    errors.push(`Разрыв в пробеге (пропущенный ПЛ?). Начало: ${currStartOdo}, конец пред.: ${prevEndOdo}. Разница: ${currStartOdo - prevEndOdo} км.`);
                }

                // 2. Проверка топлива
                if (Math.abs(currStartFuel - prevEndFuel) > 0.1) {
                    errors.push(`Разрыв в топливе. Начало: ${currStartFuel}, конец пред.: ${prevEndFuel}.`);
                }
            }

            checkResults.push({
                waybill: currentWaybill,
                errors,
                summary: {
                    distance: stats.distance,
                    consumption: stats.consumption,
                    fuelEnd: currentWaybill.fuelAtEnd ?? 0,
                    rate: stats.averageRate > 0 ? stats.averageRate : stats.baseRate,
                    startFuel: currentWaybill.fuelAtStart ?? 0,
                    fuelFilled: currentWaybill.fuelFilled ?? 0
                }
            });

            previousWaybill = currentWaybill;
        }

        setResults(checkResults);
        setCheckPerformed(true);

    } catch (e: any) {
        setError(e.message || 'Произошла ошибка при проверке.');
        console.error(e);
    } finally {
        setIsLoading(false);
    }
  };

  const filteredResults = useMemo(() => {
      if (showOnlyErrors) {
          return results.filter(r => r.errors.length > 0);
      }
      return results;
  }, [results, showOnlyErrors]);

  const hasResultsButAllGood = checkPerformed && results.length > 0 && filteredResults.length === 0 && showOnlyErrors;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Проверка путевых листов"
    >
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg border dark:border-gray-700">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Автомобиль</label>
                    <select 
                        value={selectedVehicleId} 
                        onChange={e => setSelectedVehicleId(e.target.value)} 
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200"
                    >
                        <option value="">Выберите ТС</option>
                        {vehiclesWithWaybills.map(v => (
                            <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand})</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">С даты</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">По дату</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
                </div>
                
                <div className="md:col-span-2 flex items-center pt-2">
                    <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors w-full md:w-auto">
                        <input 
                            type="checkbox" 
                            checked={showOnlyErrors} 
                            onChange={(e) => setShowOnlyErrors(e.target.checked)} 
                            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1">
                            <FunnelIcon className="h-4 w-4" /> Показывать только ошибки
                        </span>
                    </label>
                </div>

                <div className="md:col-span-2 flex justify-end">
                    <button 
                        onClick={handleCheck} 
                        disabled={isLoading}
                        className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-blue-400 w-full md:w-auto"
                    >
                        {isLoading ? 'Проверка...' : 'Запустить проверку'}
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {error && <p className="text-center text-red-500 bg-red-100 dark:bg-red-900 p-3 rounded-md border border-red-200 dark:border-red-800">{error}</p>}
                
                {hasResultsButAllGood && (
                    <div className="text-center p-8 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                        <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
                        <h4 className="text-xl font-bold text-green-700 dark:text-green-300">Проверка завершена успешно!</h4>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                            Ошибок в выбранном диапазоне не найдено.
                        </p>
                        <button 
                            onClick={() => setShowOnlyErrors(false)}
                            className="mt-4 text-blue-600 hover:text-blue-800 underline text-sm"
                        >
                            Показать все {results.length} проверенных ПЛ
                        </button>
                    </div>
                )}

                {filteredResults.length > 0 && (
                     <div className="space-y-4">
                        {filteredResults.map(({ waybill, errors, summary }) => {
                            const isSuccess = errors.length === 0;
                            const containerClass = isSuccess 
                                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30' 
                                : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30';
                            
                            const headerClass = isSuccess
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-red-700 dark:text-red-400';

                            // Calculation details
                            const rawCalc = (summary.distance * summary.rate) / 100;
                            const formulaString = `(Пробег: ${Math.round(summary.distance)} км * Норма ${summary.rate.toFixed(2)})/100`;
                            const fuelBalanceFormula = `= ${summary.startFuel.toFixed(2)} ${summary.fuelFilled > 0 ? `- ${summary.fuelFilled.toFixed(2)}` : ''} - ${summary.consumption.toFixed(2)}`;

                            return (
                                <div key={waybill.id} className={`rounded-lg border p-4 ${containerClass}`}>
                                    {/* HEADER */}
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-3">
                                            <h4 className="font-bold text-gray-800 dark:text-gray-100 text-base">
                                                ПЛ №{waybill.number} от {new Date(waybill.date).toLocaleDateString()}
                                            </h4>
                                            <span className={`font-bold ${headerClass}`}>
                                                {isSuccess ? 'Проверка пройдена' : `Проверка не пройдена (${errors.length})`}
                                            </span>
                                        </div>
                                        {!isSuccess && (
                                            <button 
                                                onClick={() => onOpenWaybill(waybill.id)}
                                                className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold text-xs py-1 px-3 rounded shadow-sm transition-colors"
                                            >
                                                Исправить
                                            </button>
                                        )}
                                    </div>

                                    {/* DATA LINES */}
                                    <div className="text-xs sm:text-sm space-y-1 font-mono text-gray-700 dark:text-gray-300">
                                        <div className="border-b border-gray-200 dark:border-gray-700/50 pb-1 mb-1">
                                            <span className="font-bold mr-2">Данные ПЛ:</span>
                                            Од. выезд: <span className="font-semibold">{waybill.odometerStart} км</span>; 
                                            {' '}Од. возвращение: <span className="font-semibold">{waybill.odometerEnd} км</span>;
                                            {' '}Пробег: <span className="font-semibold">{(waybill.odometerEnd || 0) - waybill.odometerStart} км</span>;
                                            {' '}Расход~<span className="font-semibold">{(waybill.fuelPlanned || 0).toFixed(2)} л</span>;
                                            {' '}Ост = <span className="font-semibold">{(waybill.fuelAtEnd || 0).toFixed(2)} л</span>;
                                        </div>

                                        <div>
                                            <span className="font-bold mr-2">Проверка:</span>
                                            {formulaString} = Расход: {rawCalc.toFixed(3)} ~ <span className="font-semibold">{summary.consumption.toFixed(2)} л</span>;
                                            {' '}Ост: {fuelBalanceFormula} = <span className="font-semibold">{summary.fuelEnd.toFixed(2)} л</span>;
                                        </div>
                                    </div>

                                    {/* Errors List */}
                                    {errors.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800/30">
                                            <ul className="space-y-1">
                                                {errors.map((err, index) => (
                                                    <li key={index} className="flex items-start gap-2 text-red-700 dark:text-red-300 text-sm">
                                                        <ExclamationCircleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                                        <span>{err}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    </Modal>
  );
};

export default WaybillCheckModal;
