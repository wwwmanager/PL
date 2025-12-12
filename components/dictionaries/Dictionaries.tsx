
import React, { useState, useEffect, lazy, Suspense } from 'react';
import FuelTypeManagement from '../admin/FuelTypeManagement';
import OrganizationManagement from '../admin/OrganizationManagement';
import { VehicleList } from '../vehicles/VehicleList';
import EmployeeList from '../employees/EmployeeList';
import RouteManagement from './RouteManagement';
import { DictionaryType } from '../../types';
import { useAuth } from '../../services/auth';

const GarageManagement = lazy(() => import('./GarageManagement'));
const StorageManagement = lazy(() => import('./StorageManagement'));
const ProductionCalendarSettings = lazy(() => import('../admin/ProductionCalendarSettings'));

interface DictionaryButtonProps {
    dictType: DictionaryType;
    label: string;
}

interface DictionariesProps {
    subViewToOpen?: DictionaryType | null;
}

const Dictionaries: React.FC<DictionariesProps> = ({ subViewToOpen }) => {
    const { can } = useAuth();
    
    const allDicts: { type: DictionaryType; label: string; }[] = [
        { type: 'fuelTypes', label: 'Типы топлива' },
        { type: 'organizations', label: 'Организации' },
        { type: 'vehicles', label: 'Транспорт' },
        { type: 'employees', label: 'Сотрудники' },
        { type: 'storageLocations', label: 'Места хранения' },
        { type: 'routes', label: 'Маршруты' },
        { type: 'calendar', label: 'Производственный календарь' },
    ];

    const [activeDictionary, setActiveDictionary] = useState<DictionaryType>(allDicts[0]?.type || 'vehicles');

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

    const DictionaryButton: React.FC<DictionaryButtonProps> = ({ dictType, label }) => (
        <button 
            onClick={() => setActiveDictionary(dictType)} 
            className={`px-3 py-1 rounded-md text-sm transition-colors ${
                activeDictionary === dictType 
                ? 'bg-blue-500 text-white shadow' 
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
        >
            {label}
        </button>
    );

    const DictionarySubMenu = () => (
        <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg mb-6 flex items-center gap-4 flex-wrap">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mr-2">Выберите справочник:</h3>
            <div className="flex gap-2 flex-wrap">
                {allDicts.map(dict => (
                    <DictionaryButton key={dict.type} dictType={dict.type} label={dict.label} />
                ))}
            </div>
        </div>
    );
    
    const renderActiveDictionary = () => {
        switch(activeDictionary) {
            case 'fuelTypes': return <FuelTypeManagement />;
            case 'organizations': return <OrganizationManagement />;
            case 'vehicles': return <VehicleList />;
            case 'employees': return <EmployeeList />;
            case 'storageLocations': return <Suspense fallback={<div>Загрузка...</div>}><StorageManagement /></Suspense>;
            case 'routes': return <RouteManagement />;
            case 'calendar': return <Suspense fallback={<div>Загрузка...</div>}><ProductionCalendarSettings readOnly={!can('admin.panel')} /></Suspense>;
            default: return <p>Выберите справочник.</p>;
        }
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Справочники</h2>
            </div>
            
            <DictionarySubMenu />

            <div className="overflow-x-auto">
                {renderActiveDictionary()}
            </div>
        </div>
    );
};

export default Dictionaries;
