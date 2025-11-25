import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { GarageStockItem, StockTransaction, StockTransactionItem, Vehicle, Employee, StockTransactionType, Organization, FuelType, Waybill } from '../../types';
import {
    getGarageStockItems, addGarageStockItem, updateGarageStockItem, deleteGarageStockItem,
    getStockTransactions, addStockTransaction, updateStockTransaction, deleteStockTransaction,
    getVehicles, getEmployees, getOrganizations, generateId, getFuelTypes,
    fetchStorages,
    fetchWaybillById
} from '../../services/mockApi';
import { MockStorage as StorageLocation } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import CollapsibleSection from '../shared/CollapsibleSection';
// FIX: Changed import to a named import to resolve module resolution error.
import { WaybillDetail } from '../waybills/WaybillDetail';

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
    // FIX: Added missing organizationId to schema to match StockTransaction type
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

    useEffect(() => { fetchData(); }, [fetchData]);
    
    useEffect(() => {
        if (isFuel === false) {
            setValue('fuelTypeId', undefined);
        }
    }, [isFuel, setValue]);

    const { rows } = useTable(items, [
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
            delete dataToSave.isFuel; // Don't save transient state
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
            <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md mb-4"><PlusIcon className="h-5 w-5" /> Добавить</button>
            <table className="w-full text-sm">
                <thead><tr className="text-left">{['Наименование', 'Код', 'Тип', 'Группа', 'Ед. изм.', 'Остаток', 'Статус', 'Действия'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
                <tbody>
                    {rows.map(item => (
                        <tr key={item.id} className="border-t dark:border-gray-700">
                            <td className="p-2">{item.name}</td>
                            <td className="p-2">{item.code}</td>
                            <td className="p-2">{item.itemType}</td>
                            <td className="p-2">{item.group}</td>
                            <td className="p-2">{item.unit}</td>
                            <td className={`p-2 font-bold ${item.balance <= 0 ? 'text-red-500' : ''}`}>{item.balance}</td>
                            <td className="p-2">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${item.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'}`}>
                                    {item.isActive ? 'Активен' : 'Неактивен'}
                                </span>
                            </td>
                            <td className="p-2"><button onClick={() => handleEdit(item)}><PencilIcon className="h-5 w-5 text-blue-500"/></button><button onClick={() => setDeleteModal(item)}><TrashIcon className="h-5 w-5 text-red-500"/></button></td>
                        </tr>
                    ))}
                </tbody>
            </table>

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

// --- Компонент управления транзакциями ---
const TransactionList: React.FC<TransactionListProps> = ({ onOpenWaybill, organizations, vehicles }) => {
    const [transactions, setTransactions] = useState<StockTransaction[]>([]);
    const [currentItem, setCurrentItem] = useState<Partial<TransactionFormData> | null>(null);
    const [deleteModal, setDeleteModal] = useState<StockTransaction | null>(null);
    const { showToast } = useToast();
    
    // Новое состояние для модалки пополнения карты
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [topUpDriverId, setTopUpDriverId] = useState<string>('');
    const [topUpStockItemId, setTopUpStockItemId] = useState<string>('');
    const [topUpQuantity, setTopUpQuantity] = useState<string>('');
    const [topUpDocNumber, setTopUpDocNumber] = useState<string>('');
    const [topUpDate, setTopUpDate] = useState<string>('');

    // Data for dropdowns
    const [stockItems, setStockItems] = useState<GarageStockItem[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);


    const { control, register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm<TransactionFormData>({ resolver: zodResolver(transactionSchema) });
    const { fields, append, remove } = useFieldArray({ control, name: "items" });
    const watchedType = watch("type");
    
    const fetchData = useCallback(async () => {
        const [transData, stockData, empData] = await Promise.all([getStockTransactions(), getGarageStockItems(), getEmployees()]);
        setTransactions(transData);
        setStockItems(stockData);
        setEmployees(empData.filter(e => e.employeeType === 'driver'));
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleEdit = (item: StockTransaction) => { reset(item); setCurrentItem(item); };
    const handleAddNew = (type: StockTransactionType) => {
        const nextDocNumber = (transactions.length > 0 ? (Math.max(...transactions.map(t => parseInt(t.docNumber, 10) || 0)) + 1) : 1).toString().padStart(5, '0');
        reset({ docNumber: nextDocNumber, date: new Date().toISOString().split('T')[0], type, items: [], organizationId: '' });
        setCurrentItem({});
    };
    const handleCancel = () => { setCurrentItem(null); };

    const handleOpenTopUpModal = () => {
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
            if (!topUpDriverId) {
                showToast('Выберите водителя', 'error');
                return;
            }
            if (!topUpStockItemId) {
                showToast('Выберите номенклатуру ГСМ', 'error');
                return;
            }
            const q = Number(topUpQuantity);
            if (!q || q <= 0) {
                showToast('Введите количество литров больше 0', 'error');
                return;
            }

            const driver = employees.find(e => e.id === topUpDriverId);
            if (!driver || !driver.organizationId) {
                showToast('Не удалось определить организацию водителя.', 'error');
                return;
            }

            const tx: Omit<StockTransaction, 'id'> = {
                type: 'expense',
                expenseReason: 'fuelCardTopUp',
                driverId: topUpDriverId,
                docNumber: topUpDocNumber,
                date: topUpDate,
                items: [{ stockItemId: topUpStockItemId, quantity: q }],
                organizationId: driver.organizationId,
            };

            await addStockTransaction(tx);
            fetchData();
            showToast('Баланс топливной карты пополнен', 'success');
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

    return (
        <div>
            <div className="flex gap-4 mb-4">
                <button onClick={() => handleAddNew('income')} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"><PlusIcon className="h-5 w-5" /> Приход</button>
                <button onClick={() => handleAddNew('expense')} className="flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"><PlusIcon className="h-5 w-5" /> Расход</button>
                <button onClick={handleOpenTopUpModal} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"><PlusIcon className="h-5 w-5" /> Пополнить карту</button>
            </div>
            <table className="w-full text-sm">
                 <thead>
                  <tr className="text-left">
                    {['№', 'Дата', 'Тип', 'Контрагент', 'Путевой лист', 'Действия'].map(h => (
                      <th key={h} className="p-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                 <tbody>
                  {transactions.map(t => {
                    const isIncome = t.type === 'income';
                    const counterparty = isIncome
                      ? organizations.find(o => o.id === t.supplierOrganizationId)?.shortName || t.supplier
                      : vehicles.find(v => v.id === t.vehicleId)?.plateNumber;

                    return (
                      <tr key={t.id} className="border-t dark:border-gray-700">
                        <td className="p-2">{t.docNumber}</td>
                        <td className="p-2">{t.date}</td>
                        <td className={`p-2 font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                          {isIncome ? 'Приход' : 'Расход'}
                        </td>
                        <td className="p-2">{counterparty || '—'}</td>
                        <td className="p-2">
                          {t.waybillId ? (
                            <button
                              type="button"
                              onClick={() => onOpenWaybill?.(t.waybillId!)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Открыть ПЛ
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <button onClick={() => handleEdit(t)}>
                            <PencilIcon className="h-5 w-5 text-blue-500" />
                          </button>
                          <button onClick={() => setDeleteModal(t)}>
                            <TrashIcon className="h-5 w-5 text-red-500" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
            </table>

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
             <Modal
                isOpen={isTopUpModalOpen}
                onClose={() => setIsTopUpModalOpen(false)}
                title="Пополнить топливную карту"
                footer={
                <div className="flex justify-end gap-2">
                    <button onClick={() => setIsTopUpModalOpen(false)} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600">Отмена</button>
                    <button onClick={handleSubmitTopUp} className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold">Пополнить</button>
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
    const [activeTab, setActiveTab] = useState<'stock' | 'transactions'>('stock');

    // Новое состояние для модалки ПЛ
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

    const TabButton: React.FC<{ tab: 'stock' | 'transactions'; label: string }> = ({ tab, label }) => (
        <button
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
                activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300'
            }`}
        >{label}</button>
    );

    return (
        <div>
            <div className="flex border-b dark:border-gray-700 mb-4">
                <TabButton tab="stock" label="Номенклатура" />
                <TabButton tab="transactions" label="Движение по складу" />
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