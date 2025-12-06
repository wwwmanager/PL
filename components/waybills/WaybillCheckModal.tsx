
import React, { useState, useEffect } from 'react';
import { getVehicles, getWaybills, getSeasonSettings } from '../../services/mockApi';
import { calculateStats } from '../../utils/waybillCalculations';
import { Vehicle, Waybill } from '../../types';
import Modal from '../shared/Modal';

type EnrichedWaybill = Awaited<ReturnType<typeof getWaybills>>[0];

interface WaybillCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWaybill: (waybillId: string) => void;
}

type CheckResult = {
  waybill: EnrichedWaybill;
  errors: string[];
}

const WaybillCheckModal: React.FC<WaybillCheckModalProps> = ({ isOpen, onClose, onOpenWaybill }) => {
  const [plateNumber, setPlateNumber] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CheckResult[]>([]);

  useEffect(() => {
    if (isOpen) {
        setPlateNumber('');
        setDateFrom('');
        setDateTo('');
        setError(null);
        setResults([]);
        setIsLoading(false);
    }
  }, [isOpen]);

  const handleCheck = async () => {
    if (!plateNumber || !dateFrom || !dateTo) {
      setError('Пожалуйста, заполните все поля.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const [allVehicles, allWaybills, seasonSettings] = await Promise.all([getVehicles(), getWaybills(), getSeasonSettings()]);
      
      const vehicle = allVehicles.find(v => v.plateNumber.replace(/\s/g, '').toLowerCase() === plateNumber.replace(/\s/g, '').toLowerCase());
      if (!vehicle) {
        setError(`ТС с номером "${plateNumber}" не найдено.`);
        setIsLoading(false);
        return;
      }

      const filteredWaybills = allWaybills
        .filter(w => w.vehicleId === vehicle.id && w.date >= dateFrom && w.date <= dateTo)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (filteredWaybills.length === 0) {
        setError('Путевые листы для данного ТС и периода не найдены.');
        setIsLoading(false);
        return;
      }
      
      const checkResults: CheckResult[] = [];
      let previousWaybill: EnrichedWaybill | null = null;

      for (const currentWaybill of filteredWaybills) {
        const errors: string[] = [];
        
        // Calculate stats using the utility
        const stats = calculateStats(
            currentWaybill.routes,
            vehicle,
            seasonSettings,
            currentWaybill.date
        );

        // Internal checks
        if (currentWaybill.odometerEnd !== undefined && currentWaybill.odometerEnd !== currentWaybill.odometerStart + stats.distance) {
            errors.push(`Неверный конечный пробег. Расчет: ${currentWaybill.odometerStart + stats.distance}, Факт: ${currentWaybill.odometerEnd}.`);
        }
        
        // Tolerance for float comparison
        if(Math.abs((currentWaybill.fuelPlanned ?? 0) - stats.consumption) > 0.1) {
            errors.push(`Неверный плановый расход. Расчет: ${stats.consumption.toFixed(2)}, Факт: ${currentWaybill.fuelPlanned}.`);
        }

        const calculatedFuelEnd = (currentWaybill.fuelAtStart ?? 0) + (currentWaybill.fuelFilled ?? 0) - (currentWaybill.fuelPlanned ?? 0);
         if (Math.abs((currentWaybill.fuelAtEnd ?? 0) - calculatedFuelEnd) > 0.1) {
            errors.push(`Неверный конечный остаток топлива. Расчет: ${calculatedFuelEnd.toFixed(2)}, Факт: ${currentWaybill.fuelAtEnd}.`);
        }
        
        if ((currentWaybill.fuelAtEnd ?? 0) < 0) {
            errors.push(`Отрицательный остаток топлива: ${currentWaybill.fuelAtEnd} л.`);
        }

        // Sequential checks
        if (previousWaybill) {
          if (currentWaybill.odometerStart < (previousWaybill.odometerEnd ?? 0)) {
            errors.push(`Начальный пробег (${currentWaybill.odometerStart}) меньше конечного пробега предыдущего ПЛ (${previousWaybill.odometerEnd}).`);
          }
          if (Math.abs((currentWaybill.fuelAtStart ?? 0) - (previousWaybill.fuelAtEnd ?? 0)) > 0.1) {
            errors.push(`Начальный остаток (${currentWaybill.fuelAtStart}) не совпадает с конечным остатком предыдущего ПЛ (${previousWaybill.fuelAtEnd}).`);
          }
        }
        
        checkResults.push({ waybill: currentWaybill, errors });
        previousWaybill = currentWaybill;
      }
      
      setResults(checkResults);

    } catch (e) {
      setError('Произошла ошибка при получении данных.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Проверка путевых листов"
    >
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input 
                    type="text" 
                    value={plateNumber} 
                    onChange={e => setPlateNumber(e.target.value)} 
                    placeholder="Гос. номер, напр. А123ВС777"
                    className="md:col-span-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200"
                />
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
            </div>
            
            <div className="flex justify-end">
                <button 
                    onClick={handleCheck} 
                    disabled={isLoading}
                    className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-blue-400"
                >
                    {isLoading ? 'Проверка...' : 'Проверить'}
                </button>
            </div>

            <div className="mt-4 space-y-3">
                {error && <p className="text-center text-red-500 bg-red-100 dark:bg-red-900 p-3 rounded-md">{error}</p>}
                
                {results.length > 0 && (
                     <ul className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                        {results.map(({ waybill, errors }) => (
                            <li key={waybill.id} className="p-3">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-white">ПЛ №{waybill.number} от {waybill.date}</p>
                                        <p className={`text-sm font-bold ${errors.length > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                            {errors.length > 0 ? `Найдено ошибок: ${errors.length}` : 'Проверка пройдена'}
                                        </p>
                                    </div>
                                    {errors.length > 0 && (
                                        <button 
                                            onClick={() => onOpenWaybill(waybill.id)}
                                            className="bg-yellow-500 text-white font-semibold text-sm py-1 px-3 rounded-lg hover:bg-yellow-600 transition-colors"
                                        >
                                            Открыть и исправить
                                        </button>
                                    )}
                                </div>
                                {errors.length > 0 && (
                                    <ul className="list-disc list-inside mt-2 pl-4 text-sm text-red-600 dark:text-red-400 space-y-1">
                                        {errors.map((err, index) => <li key={index}>{err}</li>)}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    </Modal>
  );
};

export default WaybillCheckModal;
