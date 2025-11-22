import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SavedRoute } from '../../types';
import { getSavedRoutes, addSavedRoute, updateSavedRoute, deleteSavedRoute } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
  </div>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
);

const RouteManagement: React.FC = () => {
    const [routes, setRoutes] = useState<SavedRoute[]>([]);
    const [currentItem, setCurrentItem] = useState<Partial<SavedRoute> | null>(null);
    const [initialItem, setInitialItem] = useState<Partial<SavedRoute> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [routeToDelete, setRouteToDelete] = useState<SavedRoute | null>(null);
    const { showToast } = useToast();

    const isDirty = useMemo(() => {
        if (!currentItem || !initialItem) return false;
        return JSON.stringify(currentItem) !== JSON.stringify(initialItem);
    }, [currentItem, initialItem]);

    const columns: { key: keyof SavedRoute; label: string }[] = [
        { key: 'from', label: 'Откуда' },
        { key: 'to', label: 'Куда' },
        { key: 'distanceKm', label: 'Расстояние, км' },
    ];

    const {
        rows,
        sortColumn,
        sortDirection,
        handleSort,
        filters,
        handleFilterChange,
    } = useTable(routes, columns);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const data = await getSavedRoutes();
            setRoutes(data);
            setError('');
        } catch (e) {
            setError('Не удалось загрузить справочник маршрутов.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleEdit = (route: SavedRoute) => {
        const copy = { ...route };
        setCurrentItem(copy);
        setInitialItem(JSON.parse(JSON.stringify(copy)));
    };

    const handleAddNew = () => {
        const newItem = { from: '', to: '', distanceKm: 0 };
        setCurrentItem(newItem);
        setInitialItem(JSON.parse(JSON.stringify(newItem)));
    };

    const handleCancel = useCallback(() => {
        setCurrentItem(null);
        setInitialItem(null);
    }, []);

    const handleRequestDelete = (item: SavedRoute) => {
        setRouteToDelete(item);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (routeToDelete === null) return;
        try {
            await deleteSavedRoute(routeToDelete.id);
            showToast('Маршрут удален.', 'info');
            fetchData();
        } catch (error) {
            showToast('Не удалось удалить маршрут.', 'error');
        } finally {
            setIsDeleteModalOpen(false);
            setRouteToDelete(null);
        }
    };

    const handleSave = async () => {
        if (!currentItem || !currentItem.from || !currentItem.to) {
            showToast('Поля "Откуда" и "Куда" обязательны для заполнения.', 'error');
            return;
        }

        try {
            if ( 'id' in currentItem && currentItem.id) {
                await updateSavedRoute(currentItem as SavedRoute);
            } else {
                await addSavedRoute(currentItem as Omit<SavedRoute, 'id'>);
            }
            showToast("Изменения сохранены");
            setCurrentItem(null);
            setInitialItem(null);
            fetchData();
        } catch (error) {
            showToast("Не удалось сохранить изменения.", 'error');
        }
    };

    const handleFormChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'number') {
            setCurrentItem(prev => (prev ? { ...prev, [name]: value === '' ? undefined : parseFloat(value) } : null));
            return;
        }
        
        setCurrentItem(prev => (prev ? { ...prev, [name]: value } : null));
    }, []);

    return (
        <>
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Подтвердить удаление"
                message={`Вы уверены, что хотите удалить маршрут "${routeToDelete?.from} - ${routeToDelete?.to}"?`}
                confirmText="Удалить"
                confirmButtonClass="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            />
            <Modal
                isOpen={!!currentItem}
                onClose={handleCancel}
                isDirty={isDirty}
                title={currentItem?.id ? 'Редактирование маршрута' : 'Добавить новый маршрут'}
                footer={
                    <>
                        <button onClick={handleCancel} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Отмена</button>
                        <button onClick={handleSave} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Сохранить</button>
                    </>
                }
            >
                {currentItem && (
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField label="Откуда"><FormInput name="from" value={currentItem.from || ''} onChange={handleFormChange} /></FormField>
                        <FormField label="Куда"><FormInput name="to" value={currentItem.to || ''} onChange={handleFormChange} /></FormField>
                        <FormField label="Расстояние, км"><FormInput name="distanceKm" type="number" step="0.1" value={currentItem.distanceKm || 0} onChange={handleFormChange} /></FormField>
                    </div>
                )}
            </Modal>
            
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Справочник: Маршруты</h3>
                    <div className="flex items-center gap-4">
                        <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                            <PlusIcon className="h-5 w-5" />
                            Добавить
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                           <tr>
                                {columns.map(col => (
                                    <th key={col.key as string} scope="col" className="px-6 py-3 cursor-pointer" onClick={() => handleSort(col.key)}>
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {sortColumn === col.key && (sortDirection === 'asc' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />)}
                                        </div>
                                    </th>
                                ))}
                                <th scope="col" className="px-6 py-3 text-center">Действия</th>
                            </tr>
                            <tr>
                                {columns.map(col => (
                                    <th key={`${col.key}-filter`} className="px-2 py-1">
                                        <input
                                            type="text"
                                            value={filters[col.key as string] || ''}
                                            onChange={e => handleFilterChange(col.key, e.target.value)}
                                            placeholder={`Поиск...`}
                                            className="w-full text-xs p-1 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded"
                                        />
                                    </th>
                                ))}
                                 <th className="px-2 py-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={columns.length + 1} className="text-center p-4">Загрузка...</td></tr>
                            ) : error ? (
                                <tr><td colSpan={columns.length + 1} className="text-center p-4 text-red-500">{error}</td></tr>
                            ) : rows.map(r => (
                                 <tr key={r.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{r.from}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{r.to}</td>
                                    <td className="px-6 py-4">{r.distanceKm}</td>
                                    <td className="px-6 py-4 text-center">
                                        <button onClick={() => handleEdit(r)} className="p-2 text-blue-500 transition-all duration-200 transform hover:scale-110 hover:shadow-lg hover:shadow-blue-500/40">
                                            <PencilIcon className="h-5 w-5 pointer-events-none" />
                                        </button>
                                        <button onClick={() => handleRequestDelete(r)} className="p-2 text-red-500 transition-all duration-200 transform hover:scale-110 hover:shadow-lg hover:shadow-red-500/40">
                                            <TrashIcon className="h-5 w-5 pointer-events-none" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
};

export default RouteManagement;