
import React from 'react';
import { Waybill, StockTransaction, WaybillCalculationMethod } from '../../../types';
import { BanknotesIcon, CogIcon } from '../../Icons';

interface WaybillFuelInfoProps {
  formData: Omit<Waybill, 'id'> | Waybill;
  canEdit: boolean;
  linkedTxId: string | null;
  fuelFilledError: string | null;
  actualFuelConsumption: number;
  fuelEconomyOrOverrun: number;
  totalDistance: number;
  calculatedFuelRate: number;
  baseFuelRate: number;
  onNumericChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenGarageModal: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMethodChange?: (method: WaybillCalculationMethod) => void;
}

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
  </div>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className={`w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200 read-only:bg-gray-200 dark:read-only:bg-gray-800 dark:[color-scheme:dark] disabled:opacity-50 disabled:cursor-not-allowed ${props.className || ''}`} />
);

export const WaybillFuelInfo: React.FC<WaybillFuelInfoProps> = ({
  formData,
  canEdit,
  linkedTxId,
  fuelFilledError,
  actualFuelConsumption,
  fuelEconomyOrOverrun,
  totalDistance,
  calculatedFuelRate,
  baseFuelRate,
  onNumericChange,
  onOpenGarageModal,
  onChange,
  onMethodChange
}) => {
  const isOverrun = fuelEconomyOrOverrun < -0.005;
  const displayOverrun = isNaN(fuelEconomyOrOverrun) ? '0.00' : (fuelEconomyOrOverrun.toFixed(2) === '-0.00' ? '0.00' : fuelEconomyOrOverrun.toFixed(2));
  const displayActual = isNaN(actualFuelConsumption) ? '0.00' : actualFuelConsumption.toFixed(2);
  
  // Если есть пробег, показываем расчетную (среднюю) норму. Если пробега нет (новый ПЛ) — показываем базовую норму (лето/зима).
  const rateToShow = (totalDistance > 0 && calculatedFuelRate > 0) ? calculatedFuelRate : baseFuelRate;
  const displayRate = isNaN(rateToShow) ? '0.00' : rateToShow.toFixed(2);

  // Allow manual entry, but display formatted if not focused/editing? 
  // Standard input behavior handles raw numbers fine.
  const fuelPlannedValue = (formData.fuelPlanned !== undefined && formData.fuelPlanned !== null) ? formData.fuelPlanned : '';

  return (
    <div className="space-y-4">
        {onMethodChange && (
            <div className="flex justify-end mb-2">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 flex items-center gap-3">
                    <div className="group relative">
                        <CogIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 cursor-help" />
                        <div className="absolute right-0 top-full mt-2 w-80 max-w-[85vw] p-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 text-xs text-left">
                            <p className="font-bold text-gray-900 dark:text-white mb-2">Метод расчета:</p>
                            <p className="mb-1 text-gray-500 dark:text-gray-400">Выберите способ округления для соответствия вашим внутренним стандартам.</p>
                            
                            <div className="mt-3">
                                <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">По общему пробегу (рекомендуется):</p>
                                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                    Сначала суммируются расстояния всех отрезков пути, результат округляется до целого (по одометру), затем рассчитывается расход.
                                </p>
                            </div>

                            <div className="mt-3">
                                <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">По отрезкам:</p>
                                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                    Расход считается и округляется для каждого отрезка пути отдельно, затем суммируется. Этот метод актуален для организаций учитывающих прогрев и городской режим.
                                </p>
                            </div>
                        </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="radio" 
                            name="calcMethod" 
                            value="by_total" 
                            checked={formData.calculationMethod === 'by_total' || !formData.calculationMethod} 
                            onChange={() => onMethodChange('by_total')}
                            disabled={!canEdit}
                            className="h-4 w-4 text-blue-600"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300">По общему пробегу</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="radio" 
                            name="calcMethod" 
                            value="by_segment" 
                            checked={formData.calculationMethod === 'by_segment'} 
                            onChange={() => onMethodChange('by_segment')}
                            disabled={!canEdit}
                            className="h-4 w-4 text-blue-600"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300">По отрезкам</span>
                    </label>
                </div>
            </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
             <div>
                <FormField label="Пробег (выезд)"><FormInput type="number" step="1" name="odometerStart" value={formData.odometerStart || ''} onChange={onNumericChange} disabled={!canEdit} /></FormField>
                <div className="mt-4">
                    <FormField label="Пробег (возврат)"><FormInput type="number" step="1" name="odometerEnd" value={formData.odometerEnd || ''} onChange={onNumericChange} disabled={!canEdit} /></FormField>
                </div>
            </div>
             <div>
                <FormField label="Топливо (выезд)"><FormInput type="number" name="fuelAtStart" value={formData.fuelAtStart || ''} onChange={onNumericChange} disabled={!canEdit} /></FormField>
                <div className="mt-4">
                    <FormField label="Заправлено">
                        <div className="flex items-center gap-1">
                            <FormInput 
                                type="number" 
                                name="fuelFilled" 
                                value={formData.fuelFilled || ''} 
                                onChange={onNumericChange} 
                                disabled={!canEdit} 
                                className={`${linkedTxId ? '!bg-green-100 dark:!bg-green-900' : ''} ${fuelFilledError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                            />
                            <button 
                                onClick={onOpenGarageModal} 
                                title="Заполнить из Гаража" 
                                className="p-2 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50" 
                                disabled={!formData.driverId || !canEdit}
                            >
                                <BanknotesIcon className="h-5 w-5"/>
                            </button>
                        </div>
                        {fuelFilledError && (<div className="mt-1 text-xs text-red-500">{fuelFilledError}</div>)}
                    </FormField>
                </div>
            </div>
            <div>
                <FormField label="Топливо (возврат)"><FormInput type="number" name="fuelAtEnd" value={formData.fuelAtEnd || ''} onChange={onNumericChange} disabled={!canEdit} /></FormField>
                <div className="mt-4">
                    <FormField label="Расход (норма)">
                        <FormInput 
                            type="number" 
                            step="0.01"
                            name="fuelPlanned" 
                            value={fuelPlannedValue} 
                            onChange={onNumericChange}
                            disabled={!canEdit}
                        />
                    </FormField>
                    <p className="text-xs text-gray-500 mt-1">Факт: {displayActual}</p>
                    <p className={`text-xs mt-1 ${fuelEconomyOrOverrun > 0.005 ? 'text-green-600' : isOverrun ? 'text-red-600' : 'text-gray-500'}`}>
                        {fuelEconomyOrOverrun > 0.005 ? `Экономия: ${displayOverrun}` : isOverrun ? `Перерасход: ${Math.abs(fuelEconomyOrOverrun).toFixed(2)}` : 'Совпадает'}
                    </p>
                </div>
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Пройдено, км: {isNaN(totalDistance) ? 0 : totalDistance}</p>
               <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded-lg text-center">
                    <p className="text-xs text-green-700 dark:text-green-300">Расчетная норма</p>
                    <p className="font-bold text-green-800 dark:text-green-200">{displayRate} л/100км</p>
                </div>
            </div>
        </div>
         {isOverrun && (
            <div className="mt-4">
                <FormField label="Причина перерасхода">
                    <input name="deviationReason" value={formData.deviationReason || ''} onChange={onChange} className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200" disabled={!canEdit} />
                </FormField>
            </div>
        )}
    </div>
  );
};
