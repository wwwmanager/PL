
import React from 'react';
import { Route, Vehicle } from '../../../types';
import { TrashIcon } from '../../Icons';

interface WaybillRouteRowProps {
  route: Route;
  isMulti: boolean;
  waybillDate: string;
  uniqueLocations: string[];
  selectedVehicle: Vehicle | undefined;
  canEdit: boolean;
  onUpdate: (id: string, field: keyof Route, value: any) => void;
  onRemove: (id: string) => void;
}

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 truncate" title={label}>{label}</label>
    {children}
  </div>
);

export const WaybillRouteRow = React.memo(({
  route,
  isMulti,
  waybillDate,
  uniqueLocations,
  selectedVehicle,
  canEdit,
  onUpdate,
  onRemove
}: WaybillRouteRowProps) => {
  // Cols: [Date?], DepTime, ArrTime, From, To, Km, Opts, Del
  // Adjust grid columns for better spacing
  const gridClass = isMulti 
    ? 'md:grid-cols-[130px,90px,90px,1fr,1fr,80px,auto,auto]' 
    : 'md:grid-cols-[90px,90px,1fr,1fr,80px,auto,auto]';

  return (
    <div className={`grid grid-cols-1 ${gridClass} gap-2 items-end p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-700`}>
        {isMulti && (
                <FormField label="Дата"><input type="date" value={route.date || waybillDate} onChange={e => onUpdate(route.id, 'date', e.target.value)} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200 text-sm" disabled={!canEdit} /></FormField>
        )}
        <FormField label="Выезд">
            <input type="time" value={route.departureTime || ''} onChange={e => onUpdate(route.id, 'departureTime', e.target.value)} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200 text-sm" disabled={!canEdit} />
        </FormField>
        <FormField label="Прибытие">
            <input type="time" value={route.arrivalTime || ''} onChange={e => onUpdate(route.id, 'arrivalTime', e.target.value)} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200 text-sm" disabled={!canEdit} />
        </FormField>
        <FormField label="Откуда"><input list="locations" value={route.from} onChange={e => onUpdate(route.id, 'from', e.target.value)} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200 text-sm" disabled={!canEdit} /></FormField>
        <FormField label="Куда"><input list="locations" value={route.to} onChange={e => onUpdate(route.id, 'to', e.target.value)} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200 text-sm" disabled={!canEdit} /></FormField>
        <FormField label="Км"><input type="number" step="0.1" value={route.distanceKm} onChange={e => onUpdate(route.id, 'distanceKm', Number(e.target.value))} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200 text-sm" disabled={!canEdit} /></FormField>
        <div className="flex flex-col gap-1 pb-2">
            {selectedVehicle?.useCityModifier && <label className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap"><input type="checkbox" checked={route.isCityDriving} onChange={e => onUpdate(route.id, 'isCityDriving', e.target.checked)} disabled={!canEdit} /> Город</label>}
            {selectedVehicle?.useWarmingModifier && <label className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap"><input type="checkbox" checked={route.isWarming} onChange={e => onUpdate(route.id, 'isWarming', e.target.checked)} disabled={!canEdit} /> Прогрев</label>}
        </div>
        {canEdit && (
            <button onClick={() => onRemove(route.id)} className="text-red-500 hover:text-red-700 pb-2 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors self-center justify-self-center"><TrashIcon className="h-5 w-5" /></button>
        )}
    </div>
  );
});
