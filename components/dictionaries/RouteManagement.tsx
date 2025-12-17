
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SavedRoute } from '../../types';
import { getSavedRoutes, addSavedRoute, updateSavedRoute, deleteSavedRoute, deleteSavedRoutesBulk, normalizeRouteString, areRoutesFuzzyDuplicate } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, SparklesIcon } from '../Icons';
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
    
    // Single delete state
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [routeToDelete, setRouteToDelete] = useState<SavedRoute | null>(null);
    
    // Bulk actions state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    
    // Cleanup state
    const [isCleanupConfirmOpen, setIsCleanupConfirmOpen] = useState(false);

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
            // Clear selection on refresh
            setSelectedIds(new Set());
        } catch (e) {
            setError('Не удалось загрузить справочник маршрутов.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- Selection Logic ---
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // Select all currently visible rows
            const allIds = new Set(rows.map(r => r.id));
            setSelectedIds(allIds);
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const isAllSelected = rows.length > 0 && rows.every(r => selectedIds.has(r.id));
    const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

    // --- CRUD Handlers ---

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

    const handleConfirmBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        try {
            // Use new bulk delete API to avoid race conditions
            await deleteSavedRoutesBulk(Array.from(selectedIds));
            showToast(`Удалено маршрутов: ${selectedIds.size}`, 'info');
            fetchData();
        } catch (error) {
            showToast('Ошибка при массовом удалении.', 'error');
        } finally {
            setIsBulkDeleteModalOpen(false);
            setSelectedIds(new Set());
        }
    };
    
    const handleCleanupDuplicates = async () => {
        setIsCleanupConfirmOpen(false);
        setIsLoading(true);
        try {
            const allRoutes = await getSavedRoutes();
            const uniqueRoutes: SavedRoute[] = [];
            const idsToDelete: string[] = [];

            // Проходим по всем маршрутам
            for (const route of allRoutes) {
                let duplicateIndex = -1;
                
                // Ищем, есть ли уже похожий маршрут в списке "уникальных"
                for (let i = 0; i < uniqueRoutes.length; i++) {
                    if (areRoutesFuzzyDuplicate(route, uniqueRoutes[i])) {
                        duplicateIndex = i;
                        break;
                    }
                }

                if (duplicateIndex !== -1) {
                    // Найден дубликат (нечеткий)
                    const existing = uniqueRoutes[duplicateIndex];
                    const existingLen = existing.from.length + existing.to.length;
                    const currentLen = route.from.length + route.to.length;

                    // Оставляем тот, у которого строка короче (считаем его "чище")
                    if (currentLen < existingLen) {
                        idsToDelete.push(existing.id);
                        uniqueRoutes[duplicateIndex] = route; // Заменяем на более короткий
                    } else {
                        idsToDelete.push(route.id); // Текущий длиннее, удаляем его
                    }
                } else {
                    // Уникальный маршрут
                    uniqueRoutes.push(route);
                }
            }

            if (idsToDelete.length > 0) {
                await deleteSavedRoutesBulk(idsToDelete);
                showToast(`Удалено нечетких дубликатов: ${idsToDelete.length}`, 'success');
                fetchData();
            } else {
                showToast('Дубликатов не найдено (умный поиск).', 'info');
            }
        } catch (e) {
            showToast('Ошибка при очистке.', 'error');
        } finally {
            setIsLoading(false);
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
        <div className="space-y-4">
            {/* Single Delete Confirmation */}
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Подтвердить удаление"
                message={`Вы уверены, что хотите удалить маршрут "${routeToDelete?.from} - ${routeToDelete?.to}"?`}
                confirmText="Удалить"
                confirmButtonClass="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            />

            {/* Bulk Delete Confirmation */}
            <ConfirmationModal
                isOpen={isBulkDeleteModalOpen}
                onClose={() => setIsBulkDeleteModalOpen(false)}
                onConfirm={handleConfirmBulkDelete}
                title="Удаление выбранных маршрутов"
                message={`Вы уверены, что хотите удалить выбранные маршруты (${selectedIds.size} шт.)? Это действие нельзя отменить.`}
                confirmText={`Удалить (${selectedIds.size})`}
                confirmButtonClass="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            />
            
            {/* Cleanup Confirmation */}
            <ConfirmationModal
                isOpen={isCleanupConfirmOpen}
                onClose={() => setIsCleanupConfirmOpen(false)}
                onConfirm={handleCleanupDuplicates}
                title="Умная очистка дубликатов"
                message="Система найдет похожие маршруты (игнорируя индексы, 'ул.', 'г.' и знаки препинания) с близким километражем (±0.5 км). В каждой группе останется только одна, самая короткая запись. Вы уверены?"
                confirmText="Очистить"
                confirmButtonClass="bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
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
            
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Маршруты</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <button 
                        onClick={() => setIsCleanupConfirmOpen(true)} 
                        className="flex items-center gap-2 bg-purple-100 text-purple-700 font-medium py-2 px-4 rounded-lg hover:bg-purple-200 transition-colors border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800"
                        title="Удалить нечеткие дубликаты"
                    >
                        <SparklesIcon className="h-5 w-5" />
                        Очистить дубли
                    </button>
                    {selectedIds.size > 0 && (
                        <button 
                            onClick={() => setIsBulkDeleteModalOpen(true)} 
                            className="flex items-center gap-2 bg-red-100 text-red-700 font-medium py-2 px-4 rounded-lg hover:bg-red-200 transition-colors border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                        >
                            <TrashIcon className="h-5 w-5" />
                            Удалить ({selectedIds.size})
                        </button>
                    )}
                    <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition-all active:scale-95">
                        <PlusIcon className="h-5 w-5" />
                        Добавить
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm text-left text-gray-700 dark:text-gray-300">
                    <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            <th className="px-4 py-3 w-10 text-center">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                                    checked={isAllSelected}
                                    ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            {columns.map(col => (
                                <th key={String(col.key)} scope="col" className="px-6 py-3 font-medium">
                                    <button type="button" onClick={() => handleSort(col.key)} className="flex items-center gap-1 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                                        {col.label}
                                        {sortColumn === col.key && (sortDirection === 'asc' ? <ArrowUpIcon className="h-3 w-3 text-blue-600" /> : <ArrowDownIcon className="h-3 w-3 text-blue-600" />)}
                                    </button>
                                </th>
                            ))}
                            <th scope="col" className="px-6 py-3 text-center font-medium">Действия</th>
                        </tr>
                        <tr className="bg-gray-50 dark:bg-gray-800/50">
                            <th className="px-2 py-2 border-b border-gray-200 dark:border-gray-700"></th>
                            {columns.map(col => (
                                <th key={`${String(col.key)}-filter`} className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
                                    <input
                                        type="text"
                                        value={filters[col.key as string] || ''}
                                        onChange={e => handleFilterChange(col.key, e.target.value)}
                                        placeholder={`Поиск...`}
                                        className="w-full text-xs p-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    />
                                </th>
                            ))}
                                <th className="px-2 py-2 border-b border-gray-200 dark:border-gray-700"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {isLoading ? (
                            <tr><td colSpan={columns.length + 2} className="text-center p-8 text-gray-500">Загрузка...</td></tr>
                        ) : error ? (
                            <tr><td colSpan={columns.length + 2} className="text-center p-8 text-red-500">{error}</td></tr>
                        ) : rows.map(r => (
                                <tr key={r.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedIds.has(r.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                                <td className="px-4 py-4 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                                        checked={selectedIds.has(r.id)}
                                        onChange={() => handleSelectRow(r.id)}
                                    />
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{r.from}</td>
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{r.to}</td>
                                <td className="px-6 py-4">{r.distanceKm}</td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex justify-center items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleEdit(r)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Редактировать">
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => handleRequestDelete(r)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Удалить">
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default RouteManagement;
