import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Tire, TireSeason, TireStatus, Vehicle, StorageLocation, GarageStockItem } from '../../types';
import { getTires, addTire, updateTire, deleteTire, bulkDeleteTires, getVehicles, fetchStorages, getGarageStockItems, getAppSettings, saveAppSettings } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, CogIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import CollapsibleSection from '../shared/CollapsibleSection';
import { DataTable } from '../shared/DataTable';

// --- Zod Schema ---
const tireSchema = z.object({
    id: z.string().optional(),
    stockItemId: z.string().optional(), // Link to stock
    // Make quantity optional because default doesn't always reflect in type inference as we expect in all contexts
    quantity: z.number().min(1, 'Количество должно быть >= 1').optional(),
    brand: z.string().min(1, 'Бренд обязателен'),
    model: z.string().min(1, 'Модель обязательна'),
    size: z.string().min(1, 'Размер обязателен'),
    season: z.enum(['Summer', 'Winter', 'AllSeason']),
    status: z.enum(['InStock', 'Mounted', 'Disposed']),
    condition: z.enum(['New', 'Used', 'Retread']),
    currentVehicleId: z.string().optional().nullable(),
    storageLocationId: z.string().optional().nullable(),
    purchaseDate: z.string().optional().nullable(),
    purchasePrice: z.number().optional().nullable(),
    startDepth: z.number().optional().nullable(),
    currentDepth: z.number().optional().nullable(),
    
    // Lifecycle
    installDate: z.string().optional().nullable(),
    installOdometer: z.number().optional().nullable(),
    estimatedLifespanKm: z.number().optional().nullable(),
    disposalDate: z.string().optional().nullable(),
    utilizationDate: z.string().optional().nullable(),
    
    notes: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
    if (data.status === 'Mounted' && !data.currentVehicleId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Выберите автомобиль, если статус 'Установлена'",
            path: ["currentVehicleId"]
        });
    }
    if (data.status === 'InStock' && !data.storageLocationId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Выберите место хранения, если статус 'На складе'",
            path: ["storageLocationId"]
        });
    }
});

type TireFormData = z.infer<typeof tireSchema>;

// --- Components ---
const FormField: React.FC<{ label: string; children: React.ReactNode; error?: string }> = ({ label, children, error }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);
const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />;
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />;

// Flattened/Grouped View Model
interface TireGroupRow {
    id: string; // ID of the first tire in group (or unique group ID)
    count: number;
    brand: string;
    model: string;
    size: string;
    season: TireSeason;
    status: TireStatus;
    locationDisplay: string;
    vehicleName: string;
    vehicleId: string | null;
    installDate: string | null;
    
    // Aggregate data for display
    avgMileage: number;
    winterMileage: number;
    summerMileage: number;
    estimatedLifespanKm: number;
    
    ids: string[]; // All IDs in this group
}

const TireManagement: React.FC = () => {
    const [tires, setTires] = useState<Tire[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [storages, setStorages] = useState<StorageLocation[]>([]);
    const [stockItems, setStockItems] = useState<GarageStockItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState<Partial<Tire> | null>(null);
    const [deleteModal, setDeleteModal] = useState<string[] | null>(null);
    const [depreciationMethod, setDepreciationMethod] = useState<'seasonal' | 'usage'>('usage');
    
    // State for custom confirmation
    const [isCloseConfirmationOpen, setIsCloseConfirmationOpen] = useState(false);
    
    const { showToast } = useToast();

    const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = useForm<TireFormData>({ resolver: zodResolver(tireSchema) });
    const watchedStatus = watch('status');

    const fetchData = useCallback(async () => {
        const [tiresData, vehiclesData, storagesData, stockItemsData, appSettings] = await Promise.all([
            getTires(), 
            getVehicles(), 
            fetchStorages(),
            getGarageStockItems(),
            getAppSettings()
        ]);
        setTires(tiresData);
        setVehicles(vehiclesData);
        setStorages(storagesData.data);
        setStockItems(stockItemsData);
        setDepreciationMethod(appSettings?.tireDepreciationMethod || 'usage');
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const groupedData = useMemo(() => {
        const groups = new Map<string, TireGroupRow>();
        
        tires.forEach(t => {
            const locKey = t.status === 'Mounted' ? `veh:${t.currentVehicleId}` : (t.status === 'InStock' ? `sto:${t.storageLocationId}` : 'disp');
            const dateKey = t.installDate || 'no-date';
            const key = `${t.brand}|${t.model}|${t.size}|${t.status}|${locKey}|${dateKey}`;
            
            if (!groups.has(key)) {
                const vehicle = vehicles.find(v => v.id === t.currentVehicleId);
                const locationDisplay = t.status === 'Mounted' 
                    ? (vehicle ? `${vehicle.plateNumber} ${vehicle.brand}` : 'Неизвестное ТС')
                    : t.status === 'InStock' 
                        ? (storages.find(s => s.id === t.storageLocationId)?.name || 'Неизвестный склад')
                        : 'Списана';

                groups.set(key, {
                    id: t.id,
                    count: 0,
                    brand: t.brand,
                    model: t.model,
                    size: t.size,
                    season: t.season,
                    status: t.status,
                    locationDisplay,
                    vehicleName: vehicle ? vehicle.plateNumber : '',
                    vehicleId: t.currentVehicleId || null,
                    installDate: t.installDate || null,
                    avgMileage: 0,
                    winterMileage: 0,
                    summerMileage: 0,
                    estimatedLifespanKm: t.estimatedLifespanKm || 0,
                    ids: []
                });
            }
            
            const group = groups.get(key)!;
            group.count++;
            group.ids.push(t.id);
            group.avgMileage += (t.winterMileage || 0) + (t.summerMileage || 0);
            group.winterMileage += (t.winterMileage || 0);
            group.summerMileage += (t.summerMileage || 0);
        });

        return Array.from(groups.values()).map(g => ({
            ...g,
            avgMileage: Math.round(g.avgMileage / g.count),
            winterMileage: Math.round(g.winterMileage / g.count),
            summerMileage: Math.round(g.summerMileage / g.count)
        }));
    }, [tires, vehicles, storages]);

    const getStatusBadge = (status: TireStatus) => {
        switch (status) {
            case 'Mounted': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Установлена</span>;
            case 'InStock': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">На складе</span>;
            case 'Disposed': return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">Списана</span>;
            default: return null;
        }
    }

    const { rows, sortColumn, sortDirection, handleSort, filters, handleFilterChange } = useTable(groupedData, [
        { key: 'brand', label: 'Бренд' },
        { key: 'model', label: 'Модель' },
        { key: 'size', label: 'Размер' },
        { key: 'season', label: 'Сезон' },
        { key: 'status', label: 'Статус' },
        { key: 'locationDisplay', label: 'Местоположение' },
    ]);

    const handleAddNew = () => {
        reset({
            quantity: 1, stockItemId: '',
            brand: '', model: '', size: '', season: 'Summer', status: 'InStock', condition: 'New', 
            currentVehicleId: '', storageLocationId: '', startDepth: 8, currentDepth: 8,
            purchaseDate: new Date().toISOString().split('T')[0], purchasePrice: 0,
            installDate: '', installOdometer: 0, estimatedLifespanKm: 60000
        });
        setIsModalOpen(true);
    };

    const handleEdit = (groupId: string) => {
        const group = groupedData.find(g => g.id === groupId);
        if (!group) return;
        
        const tire = tires.find(t => t.id === groupId);
        if (!tire) return;

        reset({ 
            ...tire, 
            quantity: group.count, 
        });
        setIsModalOpen(true);
    };

    const handleForceClose = useCallback(() => {
        setIsModalOpen(false);
        setCurrentItem(null);
        setIsCloseConfirmationOpen(false);
        reset(); // Clean form state
    }, [reset]);

    const handleCancel = () => {
        if (isDirty) {
            setIsCloseConfirmationOpen(true);
        } else {
            handleForceClose();
        }
    };

    const handleFillFromStock = (stockItemId: string) => {
        const item = stockItems.find(i => i.id === stockItemId);
        if (!item) return;

        setValue('stockItemId', stockItemId);

        const parts = item.name.split(' ');
        let brand = '';
        let model = '';
        
        if (parts.length > 1) brand = parts[0]; 
        if (parts.length > 2) model = parts.slice(1).join(' ');

        setValue('brand', brand);
        setValue('model', model);
        
        if (item.lastPurchasePrice) setValue('purchasePrice', item.lastPurchasePrice);
        
        if (item.storageLocation) {
             const storage = storages.find(s => s.name === item.storageLocation);
             if (storage) setValue('storageLocationId', storage.id);
        }
    };

    const tireStockItems = useMemo(() => {
        return stockItems.filter(i => 
            i.group === 'Шины' || 
            i.name.toLowerCase().includes('шина') || 
            i.name.toLowerCase().includes('резина')
        );
    }, [stockItems]);

    const onSubmit = async (data: TireFormData) => {
        try {
            if (data.id) {
                const group = groupedData.find(g => g.ids.includes(data.id!));
                if (group) {
                    const updates = group.ids.map(tid => {
                        const payload: any = { ...data, id: tid };
                        delete payload.quantity;
                        const existing = tires.find(t => t.id === tid);
                        return updateTire({ ...existing, ...payload });
                    });
                    await Promise.all(updates);
                } else {
                    await updateTire(data as Tire);
                }
            } else {
                const count = data.quantity || 1;
                for (let i = 0; i < count; i++) {
                    const payload: any = { ...data };
                    delete payload.quantity; 
                    
                    if (data.status !== 'Mounted') payload.currentVehicleId = null;
                    if (data.status !== 'InStock') payload.storageLocationId = null;

                    await addTire(payload);
                }
            }
            
            showToast('Данные сохранены');
            handleForceClose();
            fetchData();
        } catch (e) { showToast('Ошибка сохранения', 'error'); }
    };

    const handleDeleteRequest = (group: TireGroupRow) => {
        setDeleteModal(group.ids);
    }

    const handleDelete = async () => {
        if (!deleteModal) return;
        try {
            await bulkDeleteTires(deleteModal);
            showToast(`Удалено шин: ${deleteModal.length}`);
            setDeleteModal(null);
            fetchData();
        } catch (e) { showToast('Ошибка удаления', 'error'); }
    };

    const handleMethodChange = async (method: 'usage' | 'seasonal') => {
        setDepreciationMethod(method);
        try {
            const currentSettings = await getAppSettings();
            await saveAppSettings({ ...currentSettings, tireDepreciationMethod: method });
            showToast('Настройки учета шин обновлены', 'success');
        } catch (e) {
            showToast('Не удалось сохранить настройки', 'error');
        }
    };

    // Columns config for DataTable
    const columnsConfig = [
        { 
            key: 'brand', 
            label: 'Бренд/Модель', 
            sortable: true,
            render: (g: TireGroupRow) => (
                <div>
                    <div className="text-gray-900 dark:text-white font-bold">{g.brand}</div>
                    <div className="text-xs text-gray-500">{g.model}</div>
                </div>
            )
        },
        { key: 'size', label: 'Размер', sortable: true },
        { 
            key: 'season', 
            label: 'Сезон', 
            sortable: true,
            render: (g: TireGroupRow) => g.season === 'Summer' ? 'Лето' : g.season === 'Winter' ? 'Зима' : 'Всесезон'
        },
        { 
            key: 'count', 
            label: 'Кол-во', 
            sortable: true,
            render: (g: TireGroupRow) => <span className="font-bold text-gray-900 dark:text-white">{g.count}</span>
        },
        { 
            key: 'status', 
            label: 'Статус', 
            sortable: true,
            render: (g: TireGroupRow) => getStatusBadge(g.status)
        },
        { 
            key: 'avgMileage', 
            label: 'Пробег (Общ/Зима/Лето)', 
            sortable: true,
            render: (g: TireGroupRow) => (
                <div>
                    <div className="font-mono text-gray-900 dark:text-white"><b>{g.avgMileage}</b> км</div>
                    <div className="text-xs text-gray-500 mt-1">З: {g.winterMileage} / Л: {g.summerMileage}</div>
                </div>
            )
        },
        { 
            key: 'estimatedLifespanKm', 
            label: 'Ресурс', 
            sortable: true,
            render: (g: TireGroupRow) => {
                const percent = g.estimatedLifespanKm > 0 ? Math.round((g.avgMileage / g.estimatedLifespanKm) * 100) : 0;
                const color = percent > 90 ? 'text-red-600' : percent > 75 ? 'text-orange-600' : 'text-green-600';
                return (
                    <div>
                        <div className="text-xs text-gray-500 mb-1">{g.estimatedLifespanKm} км</div>
                        <div className={`font-bold text-xs ${color}`}>{percent}% износа</div>
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${percent > 90 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${Math.min(100, percent)}%`}}></div>
                        </div>
                    </div>
                );
            }
        },
        { 
            key: 'locationDisplay', 
            label: 'Местоположение', 
            sortable: true,
            render: (g: TireGroupRow) => (
                <div>
                    <div className="text-sm text-gray-900 dark:text-white font-medium">{g.locationDisplay}</div>
                    {g.installDate && <div className="text-xs text-gray-500 mt-0.5">с {new Date(g.installDate).toLocaleDateString()}</div>}
                </div>
            )
        }
    ];

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 px-1">
                 <div>
                     <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Учет шин</h3>
                     <p className="text-sm text-gray-500 dark:text-gray-400">Управление комплектами и списание.</p>
                 </div>
                 
                 <div className="flex flex-wrap gap-4 items-center">
                    <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-2 flex items-center gap-3">
                        <div className="flex items-center gap-2 px-2 border-r border-gray-300 dark:border-gray-600">
                            <CogIcon className="h-4 w-4 text-gray-500" />
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Износ:</span>
                        </div>
                        <div className="flex gap-3 px-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="depreciationMethod" 
                                    value="usage" 
                                    checked={depreciationMethod === 'usage'} 
                                    onChange={() => handleMethodChange('usage')}
                                    className="h-3.5 w-3.5 text-blue-600 border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-700 dark:text-gray-300">По факту</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="depreciationMethod" 
                                    value="seasonal" 
                                    checked={depreciationMethod === 'seasonal'} 
                                    onChange={() => handleMethodChange('seasonal')}
                                    className="h-3.5 w-3.5 text-blue-600 border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-700 dark:text-gray-300">По сезону</span>
                            </label>
                        </div>
                    </div>

                    <button 
                        onClick={handleAddNew} 
                        className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow-sm hover:bg-blue-700 transition-all active:scale-95"
                    >
                        <PlusIcon className="h-5 w-5" /> Добавить
                    </button>
                 </div>
            </div>

            <DataTable
                data={rows}
                columns={columnsConfig}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                tableId="tires-list"
                actions={[
                    {
                        icon: <PencilIcon className="h-4 w-4"/>,
                        onClick: (g: any) => handleEdit(g.id),
                        className: "p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors",
                        title: "Редактировать"
                    },
                    {
                        icon: <TrashIcon className="h-4 w-4"/>,
                        onClick: (g: any) => handleDeleteRequest(g),
                        className: "p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors",
                        title: "Удалить"
                    }
                ]}
            />

            <Modal isOpen={isModalOpen} onClose={handleForceClose} isDirty={isDirty} title={currentItem?.id ? "Редактировать (группу)" : "Новая шина"} footer={<><button onClick={handleCancel}>Отмена</button><button onClick={handleSubmit(onSubmit)}>Сохранить</button></>}>
                <form className="space-y-4">
                    {!currentItem?.id && (
                        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md border border-blue-200 dark:border-blue-800 space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-blue-800 dark:text-blue-200 mb-1">Номенклатура (Склад)</label>
                                <select {...register('stockItemId')} onChange={(e) => handleFillFromStock(e.target.value)} className="w-full text-sm p-1 rounded border-gray-300">
                                    <option value="">-- Выберите товар для связки и заполнения --</option>
                                    {tireStockItems.map(i => <option key={i.id} value={i.id}>{i.name} (ост: {i.balance})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-blue-800 dark:text-blue-200 mb-1">Количество</label>
                                <input type="number" {...register('quantity', {valueAsNumber: true})} min={1} className="w-full text-sm p-1 rounded border-gray-300" />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Бренд" error={errors.brand?.message}><FormInput {...register('brand')} placeholder="напр. Michelin" /></FormField>
                        <FormField label="Модель" error={errors.model?.message}><FormInput {...register('model')} placeholder="напр. X-Ice North 4" /></FormField>
                        <FormField label="Размер" error={errors.size?.message}><FormInput {...register('size')} placeholder="напр. 205/55 R16" /></FormField>
                        <FormField label="Сезон">
                            <FormSelect {...register('season')}>
                                <option value="Summer">Лето</option>
                                <option value="Winter">Зима</option>
                                <option value="AllSeason">Всесезонная</option>
                            </FormSelect>
                        </FormField>
                        <FormField label="Состояние">
                            <FormSelect {...register('condition')}>
                                <option value="New">Новая</option>
                                <option value="Used">Б/У</option>
                                <option value="Retread">Восстановленная</option>
                            </FormSelect>
                        </FormField>
                        <FormField label="Статус">
                            <FormSelect {...register('status')}>
                                <option value="InStock">На складе</option>
                                <option value="Mounted">Установлена</option>
                                <option value="Disposed">Списана</option>
                            </FormSelect>
                        </FormField>
                    </div>

                    <CollapsibleSection title="Эксплуатация и Жизненный цикл" isCollapsed={false} onToggle={()=>{}}>
                        <div className="grid grid-cols-2 gap-4">
                            {watchedStatus === 'Mounted' && (
                                <>
                                    <FormField label="Автомобиль" error={errors.currentVehicleId?.message}>
                                        <FormSelect {...register('currentVehicleId')}>
                                            <option value="">Выберите ТС</option>
                                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} {v.brand}</option>)}
                                        </FormSelect>
                                    </FormField>
                                    <FormField label="Дата установки">
                                        <FormInput type="date" {...register('installDate')} />
                                    </FormField>
                                    <FormField label="Пробег при установке">
                                        <FormInput type="number" {...register('installOdometer', {valueAsNumber: true})} />
                                    </FormField>
                                </>
                            )}

                            {watchedStatus === 'InStock' && (
                                <FormField label="Место хранения" error={errors.storageLocationId?.message}>
                                    <FormSelect {...register('storageLocationId')}>
                                        <option value="">Выберите склад</option>
                                        {storages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </FormSelect>
                                </FormField>
                            )}
                            
                            <FormField label="Расчетный ресурс (км)">
                                <FormInput type="number" {...register('estimatedLifespanKm', {valueAsNumber: true})} />
                            </FormField>

                            {watchedStatus === 'Disposed' && (
                                <>
                                    <FormField label="Дата списания">
                                        <FormInput type="date" {...register('disposalDate')} />
                                    </FormField>
                                    <FormField label="Дата утилизации">
                                        <FormInput type="date" {...register('utilizationDate')} />
                                    </FormField>
                                </>
                            )}
                        </div>
                    </CollapsibleSection>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Цена покупки"><FormInput type="number" step="0.01" {...register('purchasePrice', {valueAsNumber: true})} /></FormField>
                        <FormField label="Дата покупки"><FormInput type="date" {...register('purchaseDate')} /></FormField>
                        <FormField label="Глубина протектора (мм)"><FormInput type="number" step="0.1" {...register('currentDepth', {valueAsNumber: true})} /></FormField>
                        <FormField label="Примечание"><FormInput {...register('notes')} /></FormField>
                    </div>
                </form>
            </Modal>

            <ConfirmationModal 
                isOpen={isCloseConfirmationOpen} 
                onClose={() => setIsCloseConfirmationOpen(false)} 
                onConfirm={handleForceClose}
                title="Выйти без сохранения?"
                message="У вас есть несохраненные изменения. Все изменения будут потеряны."
                confirmText="Выйти без сохранения"
                confirmButtonClass="bg-red-600 hover:bg-red-700"
            />

            <ConfirmationModal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} onConfirm={handleDelete} title="Удалить шины?" message={`Будет удалено ${deleteModal?.length} записей.`} confirmText="Удалить" />
        </div>
    );
};

export default TireManagement;