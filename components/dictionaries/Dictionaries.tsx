import React, { useState, useEffect, lazy, Suspense, useMemo, useCallback } from 'react';
import FuelTypeManagement from '../admin/FuelTypeManagement';
import OrganizationManagement from '../admin/OrganizationManagement';
import { VehicleList } from '../vehicles/VehicleList';
import EmployeeList from '../employees/EmployeeList';
import RouteManagement from './RouteManagement';
import { DictionaryType } from '../../types';
import { useAuth } from '../../services/auth';

// DnD imports
import { DndContext, closestCenter, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSensors, useSensor, MouseSensor, TouchSensor } from '@dnd-kit/core';

const GarageManagement = lazy(() => import('./GarageManagement'));
const StorageManagement = lazy(() => import('./StorageManagement'));
const ProductionCalendarSettings = lazy(() => import('../admin/ProductionCalendarSettings'));

interface DictionariesProps {
    subViewToOpen?: DictionaryType | null;
}

interface DictTab {
    key: string;
    type: DictionaryType;
    label: string;
}

// Sortable Tab Component
const SortableTab: React.FC<{
    tab: DictTab;
    isActive: boolean;
    onClick: () => void;
}> = ({ tab, isActive, onClick }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tab.key });

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
    };

    return (
        <button
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className={`px-5 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap focus:outline-none select-none ${isActive
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
                }`}
        >
            {tab.label}
        </button>
    );
};

const STORAGE_KEY = 'dictionaries_tabs_order_v1';

const Dictionaries: React.FC<DictionariesProps> = ({ subViewToOpen }) => {
    const { can } = useAuth();

    // Default tab order (logical order for data entry)
    const defaultTabs: DictTab[] = useMemo(() => [
        { key: 'fuelTypes', type: 'fuelTypes', label: 'Топливо' },
        { key: 'organizations', type: 'organizations', label: 'Организации' },
        { key: 'employees', type: 'employees', label: 'Сотрудники' },
        { key: 'vehicles', type: 'vehicles', label: 'Транспорт' },
        { key: 'storageLocations', type: 'storageLocations', label: 'Склады' },
        { key: 'routes', type: 'routes', label: 'Маршруты' },
        { key: 'calendar', type: 'calendar', label: 'Календарь' },
    ], []);

    const [tabs, setTabs] = useState<DictTab[]>(defaultTabs);
    const [activeDictionary, setActiveDictionary] = useState<DictionaryType>(defaultTabs[0]?.type || 'fuelTypes');
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    // Load saved order from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const orderKeys: string[] = JSON.parse(saved);
                const tabMap = new Map(defaultTabs.map(t => [t.key, t]));
                const newTabs: DictTab[] = [];
                const processed = new Set<string>();

                orderKeys.forEach(key => {
                    const tab = tabMap.get(key);
                    if (tab) {
                        newTabs.push(tab);
                        processed.add(key);
                    }
                });

                // Add any new tabs not in saved order
                defaultTabs.forEach(tab => {
                    if (!processed.has(tab.key)) {
                        newTabs.push(tab);
                    }
                });

                setTabs(newTabs);
                setActiveDictionary(newTabs[0]?.type || 'fuelTypes');
            }
        } catch (e) {
            console.error('Failed to load tab order', e);
        }
    }, [defaultTabs]);

    // DnD sensors
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 5 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        })
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTabId(null);

        if (active.id !== over?.id) {
            setTabs(items => {
                const oldIndex = items.findIndex(t => t.key === active.id);
                const newIndex = items.findIndex(t => t.key === over?.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);

                // Save to localStorage
                const orderKeys = newOrder.map(t => t.key);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(orderKeys));

                return newOrder;
            });
        }
    }, []);

    // Handle navigation events
    useEffect(() => {
        const handleNavigate = (event: CustomEvent) => {
            const { view, subView } = event.detail;
            if (view === 'DICTIONARIES' && subView) {
                setActiveDictionary(subView);
            }
        };

        document.addEventListener('navigateTo', handleNavigate as EventListener);

        if (subViewToOpen) {
            setActiveDictionary(subViewToOpen);
        }

        return () => {
            document.removeEventListener('navigateTo', handleNavigate as EventListener);
        };
    }, [subViewToOpen]);

    const renderActiveDictionary = () => {
        switch (activeDictionary) {
            case 'fuelTypes': return <FuelTypeManagement />;
            case 'organizations': return <OrganizationManagement />;
            case 'vehicles': return <VehicleList />;
            case 'employees': return <EmployeeList />;
            case 'storageLocations': return <Suspense fallback={<div>Загрузка...</div>}><StorageManagement /></Suspense>;
            case 'routes': return <RouteManagement />;
            case 'calendar': return <Suspense fallback={<div>Загрузка...</div>}><ProductionCalendarSettings readOnly={!can('admin.panel')} /></Suspense>;
            default: return <div className="p-8 text-center text-gray-500">Выберите справочник.</div>;
        }
    };

    const activeTab = tabs.find(t => t.key === activeTabId);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col min-h-[600px]">
            {/* Tabs Header with DnD */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-2 overflow-x-auto">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    onDragStart={(e) => setActiveTabId(String(e.active.id))}
                >
                    <div className="flex space-x-1">
                        <SortableContext items={tabs.map(t => t.key)} strategy={horizontalListSortingStrategy}>
                            {tabs.map(tab => (
                                <SortableTab
                                    key={tab.key}
                                    tab={tab}
                                    isActive={activeDictionary === tab.type}
                                    onClick={() => setActiveDictionary(tab.type)}
                                />
                            ))}
                        </SortableContext>
                    </div>
                    <DragOverlay>
                        {activeTab && (
                            <div className="px-5 py-4 text-sm font-medium bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-lg shadow-lg">
                                {activeTab.label}
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>
            </div>

            {/* Content Area */}
            <div className="p-6 flex-1 overflow-x-auto">
                <Suspense fallback={
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
                        Загрузка компонента...
                    </div>
                }>
                    {renderActiveDictionary()}
                </Suspense>
            </div>
        </div>
    );
};

export default Dictionaries;