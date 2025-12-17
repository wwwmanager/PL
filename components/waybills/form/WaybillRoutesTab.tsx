
import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Route, SavedRoute, Vehicle } from '../../../types';
import { SparklesIcon, UploadIcon } from '../../Icons';
import { WaybillRouteRow } from './WaybillRouteRow';

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
  const isMulti = dayMode === 'multi';
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: routes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Approximate row height
    overscan: 5,
  });

  return (
    <>
        {(isAIAvailable || isParserEnabled) && (
            <div className="flex gap-4 mb-4 items-center flex-wrap">
                {isAIAvailable && (
                    <>
                        <input type="text" value={aiPrompt} onChange={e => onAiPromptChange(e.target.value)} placeholder="Например: Гараж - Склад А - Клиент - Гараж" className="flex-grow bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-700 dark:text-gray-200 min-w-[200px]" disabled={!canEdit} />
                        <button onClick={onGenerateRoutes} disabled={isGenerating || !aiPrompt || !canEdit} className="flex items-center gap-2 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-purple-700 disabled:opacity-50 transition-colors">
                            <SparklesIcon className="h-5 w-5" />
                            {isGenerating ? '...' : 'AI'}
                        </button>
                    </>
                )}
                {isParserEnabled && (
                    <button onClick={onImportClick} disabled={!canEdit} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:opacity-50">
                       <UploadIcon className="h-5 w-5" /> Импорт
                    </button>
                )}
            </div>
        )}
        
        {/* Virtualized Container */}
        <div 
            ref={parentRef} 
            className="h-[500px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 p-2"
        >
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const route = routes[virtualRow.index];
                    return (
                        <div
                            key={route.id} // Ensure route.id is used as key for React
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                            className="p-1"
                        >
                            <WaybillRouteRow 
                                route={route}
                                isMulti={isMulti}
                                waybillDate={waybillDate}
                                uniqueLocations={uniqueLocations}
                                selectedVehicle={selectedVehicle}
                                canEdit={canEdit}
                                onUpdate={onRouteUpdate}
                                onRemove={onRemoveRoute}
                            />
                        </div>
                    );
                })}
            </div>
             {/* Datalist must be available globally or within the container context */}
             <datalist id="locations">{uniqueLocations.map(loc => <option key={loc} value={loc} />)}</datalist>
        </div>

        {canEdit && (
            <button onClick={onAddRoute} className="mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors">+ Добавить маршрут</button>
        )}
    </>
  );
};
