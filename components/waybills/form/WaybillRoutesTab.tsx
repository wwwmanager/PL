
import React from 'react';
import { Route, SavedRoute, Vehicle } from '../../../types';
import { SparklesIcon, TrashIcon, UploadIcon } from '../../Icons';

interface WaybillRoutesTabProps {
  routes: Route[];
  savedRoutes: SavedRoute[];
  uniqueLocations: string[];
  dayMode: 'single' | 'multi';
  waybillDate: string;
  isAIAvailable: boolean;
  isParserEnabled: boolean;
  aiPrompt: string;
  isGenerating: boolean;
  selectedVehicle: Vehicle | undefined;
  canEdit: boolean;
  
  onAiPromptChange: (val: string) => void;
  onGenerateRoutes: () => void;
  onImportClick: () => void;
  onAddRoute: () => void;
  onRemoveRoute: (id: string) => void;
  onRouteUpdate: (id: string, field: keyof Route, value: any) => void;
}

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
  </div>
);

export const WaybillRoutesTab: React.FC<WaybillRoutesTabProps> = ({
  routes,
  uniqueLocations,
  dayMode,
  waybillDate,
  isAIAvailable,
  isParserEnabled,
  aiPrompt,
  isGenerating,
  selectedVehicle,
  canEdit,
  onAiPromptChange,
  onGenerateRoutes,
  onImportClick,
  onAddRoute,
  onRemoveRoute,
  onRouteUpdate
}) => {
  return (
    <>
        {(isAIAvailable || isParserEnabled) && (
            <div className="flex gap-4 mb-4 items-center">
                {isAIAvailable && (
                    <>
                        <input type="text" value={aiPrompt} onChange={e => onAiPromptChange(e.target.value)} placeholder="Например: Гараж - Склад А - Клиент - Гараж" className="flex-grow bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200" disabled={!canEdit} />
                        <button onClick={onGenerateRoutes} disabled={isGenerating || !aiPrompt || !canEdit} className="flex items-center gap-2 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-purple-700 disabled:opacity-50 transition-colors">
                            <SparklesIcon className="h-5 w-5" />
                            {isGenerating ? 'Генерация...' : 'Сгенерировать (AI)'}
                        </button>
                    </>
                )}
                {isParserEnabled && (
                    <button onClick={onImportClick} disabled={!canEdit} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:opacity-50">
                       <UploadIcon className="h-5 w-5" /> Импорт из файла
                    </button>
                )}
            </div>
        )}
        <div className="space-y-4">
             {routes.map((route) => (
                <div key={route.id} className={`grid grid-cols-1 ${dayMode === 'multi' ? 'md:grid-cols-[auto,1fr,1fr,100px,auto,auto]' : 'md:grid-cols-[1fr,1fr,100px,auto,auto]'} gap-2 items-end p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-700`}>
                    {dayMode === 'multi' && (
                         <FormField label="Дата"><input type="date" value={route.date || waybillDate} onChange={e => onRouteUpdate(route.id, 'date', e.target.value)} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200" disabled={!canEdit} /></FormField>
                    )}
                    <FormField label="Откуда"><input list="locations" value={route.from} onChange={e => onRouteUpdate(route.id, 'from', e.target.value)} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200" disabled={!canEdit} /></FormField>
                    <FormField label="Куда"><input list="locations" value={route.to} onChange={e => onRouteUpdate(route.id, 'to', e.target.value)} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200" disabled={!canEdit} /></FormField>
                    <FormField label="Км"><input type="number" step="0.1" value={route.distanceKm} onChange={e => onRouteUpdate(route.id, 'distanceKm', Number(e.target.value))} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200" disabled={!canEdit} /></FormField>
                    <div className="flex items-center gap-4 pb-2">
                        {selectedVehicle?.useCityModifier && <label className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={route.isCityDriving} onChange={e => onRouteUpdate(route.id, 'isCityDriving', e.target.checked)} disabled={!canEdit} /> Город</label>}
                        {selectedVehicle?.useWarmingModifier && <label className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={route.isWarming} onChange={e => onRouteUpdate(route.id, 'isWarming', e.target.checked)} disabled={!canEdit} /> Прогрев</label>}
                    </div>
                    {canEdit && (
                        <button onClick={() => onRemoveRoute(route.id)} className="text-red-500 hover:text-red-700 pb-2 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"><TrashIcon className="h-5 w-5" /></button>
                    )}
                </div>
            ))}
             <datalist id="locations">{uniqueLocations.map(loc => <option key={loc} value={loc} />)}</datalist>
        </div>
        {canEdit && (
            <button onClick={onAddRoute} className="mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors">+ Добавить маршрут</button>
        )}
    </>
  );
};
