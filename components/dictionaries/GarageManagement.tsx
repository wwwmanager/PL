
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { GarageStockItem, StockTransaction, Vehicle, Employee, StockTransactionType, Organization, FuelType, Waybill } from '../../types';
import {
    getGarageStockItems, addGarageStockItem, updateGarageStockItem, deleteGarageStockItem,
    getStockTransactions, addStockTransaction, updateStockTransaction, deleteStockTransaction,
    getVehicles, getEmployees, getOrganizations, getFuelTypes,
    fetchStorages,
    fetchWaybillById
} from '../../services/mockApi';
// Use 'import type' for type-only exports to avoid runtime issues
import type { MockStorage as StorageLocation } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import CollapsibleSection from '../shared/CollapsibleSection';
import { WaybillDetail } from '../waybills/WaybillDetail';
import TireManagement from './TireManagement';
import { VirtualDataTable, Column } from '../shared/VirtualDataTable';
import { subscribe } from '../../services/bus';

// --- Схемы валидации ---
const stockItemSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Наименование обязательно'),
    itemType: z.enum(['Товар', 'Услуга']),
    group: z.string().min(1, 'Группа обязательна'),
    unit: z.string().min(1, 'Ед. изм. обязательна'),
    balance: z.number().min(0, 'Остаток не может быть отрицательным'),
    code: z.string().optional(),
    storageLocation: z.string().optional(),
    notes: z.string().optional(),
    balanceAccount: z.string().optional(),
    budgetCode: z.string().optional(),
    isFuel: z.boolean().optional(),
    fuelTypeId: z.string().optional(),
    isActive: z.boolean(),
    organizationId: z.string().optional(),
}).refine(data => !data.isFuel || (data.isFuel && data.fuelTypeId), {
    message: "Выберите тип топлива",
    path: ["fuelTypeId"],
});

type StockItemFormData = z.infer<typeof stockItemSchema>;

const transactionItemSchema = z.object({
    stockItemId: z.string().min(1, 'Выберите товар'),
    quantity: z.number().positive('Кол-во > 0'),
    serialNumber: z.string().optional(),
});

const transactionSchema = z.object({
    id: z.string().optional(),
    docNumber: z.string().min(1, 'Номер документа обязателен'),
    date: z.string().min(1, 'Дата обязательна'),
    type: z.enum(['income', 'expense']),
    items: z.array(transactionItemSchema).min(1, 'Добавьте хотя бы один товар'),
    vehicleId: z.string().optional(),
    driverId: z.string().optional(),
    supplier: z.string().optional(),
    notes: z.string().optional(),
    organizationId: z.string().min(1, "Организация обязательна"),
}).refine(data => data.type === 'expense' ? !!data.vehicleId && !!data.driverId : true, {
    message: 'Для расхода необходимо выбрать ТС и водителя',
    path: ['vehicleId'],
});
type TransactionFormData = z.infer<typeof transactionSchema>;

const FormField: React.FC<{ label: string; children: React.ReactNode; error?: string }> = ({ label, children, error }) => (
  <div><label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>{children}{error && <p className="text-xs text-red-500 mt-1">{error}</p>}</div>
);
const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 read-only:bg-gray-200 dark:read-only:bg-gray-700" />;
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />;
const FormTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" rows={3} />;

// --- Компонент управления номенклатурой ---
const StockItemList = () => {
    const [items, setItems] = useState<GarageStockItem[]>([]);
    const [currentItem, setCurrentItem] = useState<Partial<GarageStockItem> | null>(null);
    const [deleteModal, setDeleteModal] = useState<GarageStockItem | null>(null);
    const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [storages, setStorages] = useState<StorageLocation[]>([]);
    const { showToast } = useToast();

    const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = useForm<StockItemFormData>({ resolver: zodResolver(stockItemSchema) });
    const isFuel = watch('isFuel');
    
    const fetchData = useCallback(async () => {
        const [data, fuelData, orgsData, storagesData] = await Promise.all([getGarageStockItems(), getFuelTypes(), getOrganizations(), fetchStorages()]);
        setItems(data);
        setFuelTypes(fuelData);
        setOrganizations(orgsData);
        setStorages(storagesData.data);
    }, []);

    useEffect(() => { 
        fetchData();
        // Subscribe to stock events to refresh list when transactions happen
        const unsubscribe = subscribe(msg => {
            if (msg.topic === 'stock') {
                fetchData();
            }
        });
        return unsubscribe;
    }, [fetchData]);
    
    useEffect(() => {
        if (isFuel === false) {
            setValue('fuelTypeId', undefined);
        }
    }, [isFuel, setValue]);

    const columnsConfig: Column<GarageStockItem>[] = [
        { key: 'name', label: 'Наименование', sortable: true },
        { key: 'code', label: 'Код', sortable: true },
        { key: 'group', label: 'Группа', sortable: true },
        { key: 'balance', label: 'Остаток', sortable: true, render: (i) => <span className={i.balance <= 0 ? 'text-red-500 font-bold' : 'font-bold'}>{i.balance}</span> },
        { 
            key: 'isActive', 
            label: 'Статус', 
            sortable: true,
            render: (item) => (
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${item.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'}`}>
                    {item.isActive ? 'Активен' : 'Неактивен'}
                </span>
            )
        }
    ];

    // Use useTable for filtering and sorting logic
    const { rows, sortColumn, sortDirection, handleSort } = useTable(items, [
        { key: 'name', label: 'Наименование' },
        { key: 'code', label: 'Код' },
        { key: 'group', label: 'Группа' },
        { key: 'balance', label: 'Остаток' },
        { key: 'isActive', label: 'Статус' },
    ]);

    const handleEdit = (item: GarageStockItem) => { reset({...item, isFuel: !!item.fuelTypeId}); setCurrentItem(item); };
    const handleAddNew = () => { 
        reset({ 
            name: '', 
            itemType: 'Товар',
            group: 'ГСМ', 
            unit: 'л', 
            balance: 0, 
            code: '', 
            storageLocation: '', 
            notes: '', 
            balanceAccount: '', 
            budgetCode: '', 
            isFuel: false, 
            fuelTypeId: undefined,
            isActive: true,
            organizationId: undefined,
        }); 
        setCurrentItem({}); 
    };
    const handleCancel = () => { setCurrentItem(null); };

    const onSubmit = async (data: StockItemFormData) => {
        try {
            const dataToSave: any = { ...data };
            delete dataToSave.isFuel;
            if (!dataToSave.isFuel) {
                dataToSave.fuelTypeId = undefined;
            }
            if (data.id) {
                await updateGarageStockItem(dataToSave as GarageStockItem);
            } else {
                await addGarageStockItem(dataToSave);
            }
            showToast('Изменения сохранены');
            handleCancel();
            fetchData();
        } catch (e) {
            showToast('Не удалось сохранить', 'error');
        }
    };
    
    const handleDelete = async () => {
        if (!deleteModal) return;
        try {
            await deleteGarageStockItem(deleteModal.id);
            showToast('Элемент удален');
            setDeleteModal(null);
            fetchData();
        } catch(e) { showToast('Не удалось удалить', 'error'); }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold dark:text-white">Справочник номенклатуры</h3>
                <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"><PlusIcon className="h-5 w-5" /> Добавить</button>
            </div>
            
            <div className="h-[calc(100vh-16rem)]">
                <VirtualDataTable
                    data={rows}
                    columns={columnsConfig}
                    rowKey="id"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    actions={[
                        {
                            icon: <PencilIcon className="h-5 w-5" />,
                            onClick: (item) => handleEdit(item),
                            title: "Редактировать",
                            className: "text-blue-500"
                        },
                        {
                            icon: <TrashIcon className="h-5 w-5" />,
                            onClick: (item) => setDeleteModal(item),
                            title: "Удалить",
                            className: "text-red-500"
                        }
                    ]}
                />
            </div>

            <Modal isOpen={!!currentItem} onClose={handleCancel} isDirty={isDirty} title={currentItem?.id ? "Редактировать" : "Новый товар"} footer={<><button onClick={handleCancel}>Отмена</button><button onClick={handleSubmit(onSubmit)}>Сохранить</button></>}>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField label="Тип номенклатуры" error={errors.itemType?.message}>
                            <FormSelect {...register("itemType")}>
                                <option value="Товар">Товар</option>
                                <option value="Услуга">Услуга</option>
                            </FormSelect>
                        </FormField>
                         <FormField label="Организация" error={errors.organizationId?.message}>
                            <FormSelect {...register("organizationId")}>
                                <option value="">Не указана</option>
                                {organizations.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}
                            </FormSelect>
                        </FormField>
                        <FormField label="Статус">
                            <div className="flex items-center h-full">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    <span>Активен</span>
                                </label>
                            </div>
                        </FormField>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" {...register('isFuel')} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span>Является топливом</span>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {isFuel ? (
                           <FormField label="Тип топлива" error={errors.fuelTypeId?.message}>
                                <FormSelect {...register("fuelTypeId")} onChange={(e) => {
                                    const fuelId = e.target.value;
                                    const selectedFuel = fuelTypes.find(f => f.id === fuelId);
                                    setValue('fuelTypeId', fuelId, { shouldValidate: true });
                                    if (selectedFuel) {
                                        setValue('name', `Топливо ${selectedFuel.name}`, { shouldValidate: true });
                                        setValue('group', 'ГСМ');
                                        setValue('unit', 'л');
                                    }
                                }}>
                                    <option value="">Выберите топливо</option>
                                    {fuelTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </FormSelect>
                            </FormField>
                        ) : (
                             <FormField label="Наименование" error={errors.name?.message}><FormInput {...register("name")} /></FormField>
                        )}
                        <FormField label="Код" error={errors.code?.message}><FormInput {...register("code")} /></FormField>
                        <FormField label="Группа" error={errors.group?.message}><FormInput {...register("group")} readOnly={isFuel} /></FormField>
                        <FormField label="Ед. изм." error={errors.unit?.message}><FormInput {...register("unit")} readOnly={isFuel} /></FormField>
                        <FormField label="Место хранения" error={errors.storageLocation?.message}>
                            <FormSelect {...register("storageLocation")}>
                                <option value="">Не указано</option>
                                {storages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </FormSelect>
                        </FormField>
                        <FormField label="Начальный остаток" error={errors.balance?.message}><FormInput type="number" {...register("balance", { valueAsNumber: true })} disabled={!!currentItem?.id} /></FormField>
                    </div>
                    <CollapsibleSection title="Бюджетный учет" isCollapsed={true} onToggle={()=>{}}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Балансовый счет" error={errors.balanceAccount?.message}><FormInput {...register("balanceAccount")} /></FormField>
                            <FormField label="КБК/КОСГУ" error={errors.budgetCode?.message}><FormInput {...register("budgetCode")} /></FormField>
                        </div>
                    </CollapsibleSection>
                    <FormField label="Описание" error={errors.notes?.message}><FormTextarea {...register("notes")} /></FormField>
                </form>
            </Modal>
            <ConfirmationModal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} onConfirm={handleDelete} title="Удалить товар?" message={`Вы уверены, что хотите удалить "${deleteModal?.name}"?`} confirmText="Удалить" />
        </div>
    );
};

interface TransactionListProps {
  onOpenWaybill?: (waybillId: string) => void;
  organizations: Organization[];
  vehicles: Vehicle[];
}

// Flattened row type for display
interface FlattenedTransaction {
    id: string; // Composite ID to be unique in table
    transactionId: string;
    docNumber: string;
    date: string;
    formattedDate: string;
    type: StockTransactionType;
    itemName: string;
    quantity: number;
    unit: string;
    counterparty: string;
    waybillId?: string | null;
    isIncome: boolean;
}

// --- Компонент управления транзакциями ---
const TransactionList: React.FC<TransactionListProps> = ({ onOpenWaybill, organizations, vehicles }) => {
    const [transactions, setTransactions] = useState<StockTransaction[]>([]);
    const [currentItem, setCurrentItem] = useState<Partial<TransactionFormData> | null>(null);
    const [deleteModal, setDeleteModal] = useState<StockTransaction | null>(null);
    const { showToast } = useToast();
    
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [topUpId, setTopUpId] = useState<string | null>(null); 
    const [topUpDriverId, setTopUpDriverId] = useState<string>('');
    const [topUpStockItemId, setTopUpStockItemId] = useState<string>('');
    const [topUpQuantity, setTopUpQuantity] = useState<string>('');
    const [topUpDocNumber, setTopUpDocNumber] = useState<string>('');
    const [topUpDate, setTopUpDate] = useState<string>('');

    const [stockItems, setStockItems] = useState<GarageStockItem[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    const [sort, setSort] = useState({ key: 'date', direction: 'desc' as 'asc' | 'desc' });
    const [filters, setFilters] = useState<Record<string, string>>({});

    const { control, register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm<TransactionFormData>({ resolver: zodResolver(transactionSchema) });
    const { fields, append, remove } = useFieldArray({ control, name: "items" });
    const watchedType = watch("type");
    
    const fetchData = useCallback(async () => {
        const [transData, stockData, empData] = await Promise.all([getStockTransactions(), getGarageStockItems(), getEmployees()]);
        setTransactions(transData);
        setStockItems(stockData);
        setEmployees(empData.filter(e => e.employeeType === 'driver'));
        setSelectedIds(new Set());
    }, []);

    useEffect(() => { 
        fetchData(); 
    }, [fetchData]);

    const flattenedData = useMemo(() => {
        const flat: FlattenedTransaction[] = [];
        
        transactions.forEach(t => {
            const isIncome = t.type === 'income';
            let counterparty = '';
            if (isIncome) {
                const org = organizations.find(o => o.id === t.supplierOrganizationId || o.id === t.supplier);
                counterparty = org ? org.shortName : (t.supplier || '—');
            } else {
                if (t.expenseReason === 'fuelCardTopUp') {
                    const driver = employees.find(e => e.id === t.driverId);
                    counterparty = driver ? driver.shortName : '—';
                } else {
                    const vehicle = vehicles.find(v => v.id === t.vehicleId);
                    if (vehicle) {
                        counterparty = vehicle.plateNumber;
                    } else if (t.driverId) {
                        const driver = employees.find(e => e.id === t.driverId);
                        counterparty = driver ? driver.shortName : '—';
                    } else {
                        counterparty = '—';
                    }
                }
            }

            const formattedDate = new Date(t.date).toLocaleDateString('ru-RU', {
                year: 'numeric', month: '2-digit', day: '2-digit',
            });

            if (!t.items || t.items.length === 0) {
                 flat.push({
                    id: `${t.id}_0`,
                    transactionId: t.id,
                    docNumber: t.docNumber,
                    date: t.date,
                    formattedDate,
                    type: t.type,
                    isIncome,
                    itemName: '—',
                    quantity: 0,
                    unit: '',
                    counterparty,
                    waybillId: t.waybillId
                });
            } else {
                t.items.forEach((item, index) => {
                    const stockItem = stockItems.find(si => si.id === item.stockItemId);
                    flat.push({
                        id: `${t.id}_${index}`,
                        transactionId: t.id,
                        docNumber: t.docNumber,
                        date: t.date,
                        formattedDate,
                        type: t.type,
                        isIncome,
                        itemName: stockItem ? stockItem.name : 'Неизвестный товар',
                        quantity: item.quantity,
                        unit: stockItem ? stockItem.unit : '',
                        counterparty,
                        waybillId: t.waybillId
                    });
                });
            }
        });
        
        // Filtering
        let result = flat;
        if (Object.values(filters).some(f => f)) {
            result = result.filter(item => {
                return Object.entries(filters).every(([key, val]) => {
                    if (!val) return true;
                    const itemVal = item[key as keyof FlattenedTransaction];
                    return String(itemVal).toLowerCase().includes(String(val).toLowerCase());
                });
            });
        }

        // Sorting
        result.sort((a, b) => {
            const valA = a[sort.key as keyof FlattenedTransaction];
            const valB = b[sort.key as keyof FlattenedTransaction];
            if (valA === valB) return 0;
            const dir = sort.direction === 'asc' ? 1 : -1;
            return valA > valB ? dir : -dir;
        });

        return result;
    }, [transactions, organizations, vehicles, employees, stockItems, filters, sort]);

    const handleSort = (key: string) => {
        setSort(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleFilterChange = (key: string, val: string) => {
        setFilters(prev => ({ ...prev, [key]: val }));
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allTxIds = new Set(flattenedData.map(r => r.transactionId));
            setSelectedIds(allTxIds);
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (txId: string, checked: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(txId);
            else next.delete(txId);
            return next;
        });
    };

    const isAllSelected = flattenedData.length > 0 && flattenedData.every(r => selectedIds.has(r.transactionId));

    const handleEdit = (txId: string) => { 
        const item = transactions.find(t => t.id === txId);
        if(!item) return;

        if (item.type === 'expense' && item.expenseReason === 'fuelCardTopUp') {
            setTopUpId(item.id);
            setTopUpDocNumber(item.docNumber);
            setTopUpDate(item.date);
            setTopUpDriverId(item.driverId || '');
            if (item.items && item.items.length > 0) {
                setTopUpStockItemId(item.items[0].stockItemId);
                setTopUpQuantity(String(item.items[0].quantity));
            } else {
                setTopUpStockItemId('');
                setTopUpQuantity('');
            }
            setIsTopUpModalOpen(true);
        } else {
            reset(item); 
            setCurrentItem(item); 
        }
    };

    const handleAddNew = (type: StockTransactionType) => {
        const nextDocNumber = (transactions.length > 0 ? (Math.max(...transactions.map(t => parseInt(t.docNumber, 10) || 0)) + 1) : 1).toString().padStart(5, '0');
        reset({ docNumber: nextDocNumber, date: new Date().toISOString().split('T')[0], type, items: [], organizationId: '' });
        setCurrentItem({});
    };
    const handleCancel = () => { setCurrentItem(null); };

    const handleOpenTopUpModal = () => {
        setTopUpId(null);
        const nextDocNumber = (transactions.length > 0 ? (Math.max(...transactions.map(t => parseInt(t.docNumber, 10) || 0)) + 1) : 1).toString().padStart(5, '0');
        setTopUpDriverId('');
        const defaultGsmItem = stockItems.find(i => i.group === 'ГСМ');
        setTopUpStockItemId(defaultGsmItem?.id ?? '');
        setTopUpQuantity('');
        setTopUpDocNumber(nextDocNumber);
        setTopUpDate(new Date().toISOString().split('T')[0]);
        setIsTopUpModalOpen(true);
    };

    const handleSubmitTopUp = async () => {
        try {
            if (!topUpDriverId) { showToast('Выберите водителя', 'error'); return; }
            if (!topUpStockItemId) { showToast('Выберите номенклатуру ГСМ', 'error'); return; }
            const q = Number(topUpQuantity);
            if (!q || q <= 0) { showToast('Введите количество литров больше 0', 'error'); return; }

            const driver = employees.find(e => e.id === topUpDriverId);
            if (!driver || !driver.organizationId) { showToast('Не удалось определить организацию водителя.', 'error'); return; }

            const txData: any = {
                type: 'expense',
                expenseReason: 'fuelCardTopUp',
                driverId: topUpDriverId,
                docNumber: topUpDocNumber,
                date: topUpDate,
                items: [{ stockItemId: topUpStockItemId, quantity: q }],
                organizationId: driver.organizationId,
            };

            if (topUpId) {
                await updateStockTransaction({ ...txData, id: topUpId });
                showToast('Транзакция обновлена', 'success');
            } else {
                await addStockTransaction(txData);
                showToast('Баланс топливной карты пополнен', 'success');
            }
            fetchData();
            setIsTopUpModalOpen(false);
        } catch (e: any) {
            showToast(e?.message || 'Ошибка при пополнении топливной карты', 'error');
        }
    };

    const onSubmit = async (data: TransactionFormData) => {
        try {
            if (data.id) {
                await updateStockTransaction(data as StockTransaction);
            } else {
                await addStockTransaction(data as Omit<StockTransaction, 'id'>);
            }
            showToast('Транзакция сохранена');
            handleCancel();
            fetchData();
        } catch(e) { showToast('Не удалось сохранить', 'error'); }
    };

    const handleDelete = async () => {
        if (!deleteModal) return;
        try {
            await deleteStockTransaction(deleteModal.id);
            showToast('Документ удален');
            setDeleteModal(null);
            fetchData();
        } catch(e) { showToast('Не удалось удалить', 'error'); }
    };

    const handleBulkDelete = async () => {
        setIsBulkDeleteModalOpen(false);
        const ids = Array.from(selectedIds) as string[];
        let successCount = 0;
        let failCount = 0;
        
        for (const id of ids) {
            try {
                await deleteStockTransaction(id);
                successCount++;
            } catch (e) {
                failCount++;
            }
        }
        
        showToast(`Удалено: ${successCount}. Ошибок: ${failCount}`, failCount > 0 ? 'info' : 'success');
        setSelectedIds(new Set());
        fetchData();
    };

    const columns: Column<FlattenedTransaction>[] = [
        { key: 'docNumber', label: '№', sortable: true, width: '80px' },
        { key: 'formattedDate', label: 'Дата', sortable: true, width: '100px' },
        { 
            key: 'type', 
            label: 'Тип', 
            sortable: true, 
            width: '100px',
            render: (r) => <span className={`font-semibold ${r.isIncome ? 'text-green-600' : 'text-red-600'}`}>{r.isIncome ? 'Приход' : 'Расход'}</span>
        },
        { key: 'itemName', label: 'Наименование товара', sortable: true },
        { key: 'quantity', label: 'Кол-во', sortable: true, width: '80px', render: (r) => <>{r.quantity}</> },
        { key: 'unit', label: 'Ед.', width: '60px' },
        { key: 'counterparty', label: 'Контрагент', sortable: true },
    ];

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-4">
                    <button onClick={() => handleAddNew('income')} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"><PlusIcon className="h-5 w-5" /> Приход</button>
                    <button onClick={() => handleAddNew('expense')} className="flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"><PlusIcon className="h-5 w-5" /> Расход</button>
                    <button onClick={handleOpenTopUpModal} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"><PlusIcon className="h-5 w-5" /> Пополнить карту</button>
                </div>
                {selectedIds.size > 0 && (
                    <button onClick={() => setIsBulkDeleteModalOpen(true)} className="flex items-center gap-2 bg-red-100 text-red-700 font-semibold py-2 px-4 rounded-lg border border-red-200 hover:bg-red-200 transition-colors">
                        <TrashIcon className="h-5 w-5"/> Удалить выбранные ({selectedIds.size})
                    </button>
                )}
            </div>

            <div className="h-[calc(100vh-16rem)]">
                <VirtualDataTable
                    data={flattenedData}
                    columns={columns}
                    rowKey="id"
                    sortColumn={sort.key}
                    sortDirection={sort.direction}
                    onSort={handleSort}
                    selection={{
                        selectedIds: new Set(flattenedData.filter(r => selectedIds.has(r.transactionId)).map(r => r.id)), // Map generic selection to row selection for visual check
                        onSelectAll: handleSelectAll,
                        onSelectRow: (id: string, checked: boolean) => {
                            // Map row id back to transaction id
                            const row = flattenedData.find(r => r.id === id);
                            if(row) handleSelectRow(row.transactionId, checked);
                        },
                        isAllSelected
                    }}
                    actions={[
                        {
                            icon: <PencilIcon className="h-5 w-5" />,
                            onClick: (r) => handleEdit(r.transactionId),
                            title: "Редактировать",
                            className: "text-blue-500"
                        },
                        {
                            icon: <TrashIcon className="h-5 w-5" />,
                            onClick: (r) => { 
                                const tx = transactions.find(t => t.id === r.transactionId);
                                if(tx) setDeleteModal(tx);
                            },
                            title: "Удалить",
                            className: "text-red-500"
                        }
                    ]}
                />
            </div>

            <Modal isOpen={!!currentItem} onClose={handleCancel} isDirty={isDirty} title={currentItem?.id ? "Редактировать документ" : "Новый документ"} footer={<><button onClick={handleCancel}>Отмена</button><button onClick={handleSubmit(onSubmit)}>Сохранить</button></>}>
                 <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <FormField label="Тип"><FormInput value={watchedType === 'income' ? 'Приход' : 'Расход'} readOnly /></FormField>
                        <FormField label="Номер" error={errors.docNumber?.message}><FormInput {...register("docNumber")} /></FormField>
                        <FormField label="Дата" error={errors.date?.message}><FormInput type="date" {...register("date")} /></FormField>
                    </div>
                    <FormField label="Организация" error={errors.organizationId?.message}>
                        <FormSelect {...register("organizationId")}>
                            <option value="">Выберите</option>
                            {organizations.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}
                        </FormSelect>
                    </FormField>
                    {watchedType === 'expense' && (
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="ТС" error={errors.vehicleId?.message}><FormSelect {...register("vehicleId")}><option value="">Выберите</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}</FormSelect></FormField>
                            <FormField label="Водитель" error={errors.driverId?.message}><FormSelect {...register("driverId")}><option value="">Выберите</option>{employees.map(e => <option key={e.id} value={e.id}>{e.shortName}</option>)}</FormSelect></FormField>
                        </div>
                    )}
                    {watchedType === 'income' && <FormField label="Поставщик"><FormSelect {...register("supplier")}><option value="">Выберите</option>{organizations.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}</FormSelect></FormField>}
                    
                    <div className="pt-4">
                        <h4 className="font-semibold mb-2">Товары</h4>
                        {fields.map((field, index) => (
                            <div key={field.id} className={`grid ${watchedType === 'expense' ? 'grid-cols-[1fr,1fr,100px,auto]' : 'grid-cols-[1fr,100px,auto]'} gap-2 items-end mb-2`}>
                                <FormField label="Товар">
                                    <Controller name={`items.${index}.stockItemId`} control={control} render={({ field }) => <FormSelect {...field}><option value="">Выберите</option>{stockItems.map(si => <option key={si.id} value={si.id}>{si.name} ({si.unit})</option>)}</FormSelect>} />
                                </FormField>
                                {watchedType === 'expense' &&
                                    <FormField label="Серийный/Инв. номер">
                                        <Controller name={`items.${index}.serialNumber`} control={control} render={({ field }) => <FormInput type="text" {...field} />} />
                                    </FormField>
                                }
                                <FormField label="Кол-во">
                                    <Controller name={`items.${index}.quantity`} control={control} render={({ field }) => <FormInput type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />} />
                                </FormField>
                                <button type="button" onClick={() => remove(index)} className="text-red-500 mb-2"><TrashIcon className="h-5 w-5"/></button>
                            </div>
                        ))}
                        {errors.items?.message && <p className="text-red-500 text-xs">{errors.items.message}</p>}
                        <button type="button" onClick={() => append({ stockItemId: '', quantity: 0, serialNumber: '' })} className="text-blue-600 mt-2">+ Добавить товар</button>
                    </div>
                 </form>
            </Modal>
             <ConfirmationModal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} onConfirm={handleDelete} title="Удалить документ?" message={`Вы уверены, что хотите удалить документ №${deleteModal?.docNumber}? Это действие изменит остатки на складе.`} confirmText="Удалить" />
             <ConfirmationModal isOpen={isBulkDeleteModalOpen} onClose={() => setIsBulkDeleteModalOpen(false)} onConfirm={handleBulkDelete} title="Удалить выбранные?" message={`Удалить ${selectedIds.size} документов?`} confirmText="Удалить" />
             
             <Modal
                isOpen={isTopUpModalOpen}
                onClose={() => setIsTopUpModalOpen(false)}
                title={topUpId ? "Редактировать пополнение карты" : "Пополнить топливную карту"}
                footer={
                <div className="flex justify-end gap-2">
                    <button onClick={() => setIsTopUpModalOpen(false)} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600">Отмена</button>
                    <button onClick={handleSubmitTopUp} className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold">{topUpId ? "Сохранить" : "Пополнить"}</button>
                </div>
                }
            >
                <div className="space-y-4">
                    <FormField label="Водитель"><FormSelect value={topUpDriverId} onChange={e => setTopUpDriverId(e.target.value)}><option value="">Выберите водителя</option>{employees.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}</FormSelect></FormField>
                    <FormField label="Номенклатура ГСМ"><FormSelect value={topUpStockItemId} onChange={e => setTopUpStockItemId(e.target.value)}><option value="">Выберите товар</option>{stockItems.filter(i => i.group === 'ГСМ').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</FormSelect></FormField>
                    <FormField label="Количество, л"><FormInput type="number" value={topUpQuantity} onChange={e => setTopUpQuantity(e.target.value)} min={0} step="0.1" /></FormField>
                    <FormField label="Номер документа"><FormInput type="text" value={topUpDocNumber} onChange={e => setTopUpDocNumber(e.target.value)} /></FormField>
                    <FormField label="Дата документа"><FormInput type="date" value={topUpDate} onChange={e => setTopUpDate(e.target.value)} /></FormField>
                </div>
            </Modal>
        </div>
    );
};

// --- Основной компонент "Гараж" ---
const GarageManagement: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'stock' | 'transactions' | 'tires'>('stock');

    const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);
    const [isWaybillModalOpen, setIsWaybillModalOpen] = useState(false);
    const { showToast } = useToast();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);

    useEffect(() => {
        getOrganizations().then(setOrganizations);
        getVehicles().then(setVehicles);
    }, []);

    const handleOpenWaybillFromStock = async (waybillId: string) => {
        try {
            const w = await fetchWaybillById(waybillId);
            if (!w) {
                showToast('Путевой лист не найден', 'error');
                return;
            }
            setSelectedWaybill(w);
            setIsWaybillModalOpen(true);
        } catch (e) {
            console.error('Ошибка при загрузке ПЛ', e);
            showToast('Ошибка при загрузке ПЛ', 'error');
        }
    };

    const handleCloseWaybillModal = () => {
        setIsWaybillModalOpen(false);
        setSelectedWaybill(null);
    };

    const TabButton: React.FC<{ tab: 'stock' | 'transactions' | 'tires'; label: string }> = ({ tab, label }) => (
        <button
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
                activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300'
            }`}
        >{label}</button>
    );

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <div className="flex border-b dark:border-gray-700 mb-4">
                <TabButton tab="stock" label="Номенклатура" />
                <TabButton tab="transactions" label="Движение по складу" />
                <TabButton tab="tires" label="Учет шин" />
            </div>
            <div>
                {activeTab === 'stock' && <StockItemList />}
                {activeTab === 'transactions' && (
                  <TransactionList 
                    onOpenWaybill={handleOpenWaybillFromStock}
                    organizations={organizations}
                    vehicles={vehicles}
                  />
                )}
                {activeTab === 'tires' && <TireManagement />}
            </div>

            {isWaybillModalOpen && selectedWaybill && (
                <Modal
                  isOpen={isWaybillModalOpen}
                  onClose={handleCloseWaybillModal}
                  title={`Путевой лист №${selectedWaybill.number}`}
                >
                  <WaybillDetail
                    waybill={selectedWaybill}
                    onClose={handleCloseWaybillModal}
                  />
                </Modal>
            )}
        </div>
    );
};

export default GarageManagement;
