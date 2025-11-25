import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Vehicle, FuelType, Employee, VehicleStatus, MaintenanceRecord, Organization } from '../../types';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { getVehicles, addVehicle, updateVehicle, deleteVehicle, getFuelTypes, getEmployees, generateId, getOrganizations } from '../../services/mockApi';
import { validation } from '../../services/faker';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, ArchiveBoxIcon, ArrowUpTrayIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import CollapsibleSection from '../shared/CollapsibleSection';
// FIX: Import VEHICLE_STATUS_COLORS and VEHICLE_STATUS_TRANSLATIONS to resolve compilation errors.
import { VEHICLE_STATUS_COLORS, VEHICLE_STATUS_TRANSLATIONS } from '../../constants';

// --- Zod Schema for Validation ---
// FIX: Removed 'invalid_type_error' as it is not a recognized property in this context, causing a compilation error.
// Zod will still provide a default type error message.
const fuelConsumptionRatesSchema = z.object({
    summerRate: z.number().positive('Норма должна быть > 0'),
    winterRate: z.number().positive('Норма должна быть > 0'),
    cityIncreasePercent: z.number().min(0, "Надбавка не может быть отрицательной").optional().nullable(),
    warmingIncreasePercent: z.number().min(0, "Надбавка не может быть отрицательной").optional().nullable(),
});

const maintenanceRecordSchema = z.object({
    id: z.string().optional(),
    date: z.string().min(1, "Дата обязательна"),
    workType: z.string().min(1, "Тип работ обязателен"),
    mileage: z.number().min(0),
    description: z.string().optional().nullable(),
    performer: z.string().optional().nullable(),
    cost: z.number().optional().nullable(),
});

const vehicleSchema = z.object({
    id: z.string().optional(),
    plateNumber: z.string().min(1, "Гос. номер обязателен").superRefine((val, ctx) => {
        const error = validation.plateNumber(val);
        if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    brand: z.string().min(1, "Марка/модель обязательна"),
    vin: z.string().min(1, "VIN обязателен").superRefine((val, ctx) => {
        const error = validation.vin(val);
        if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    // FIX: Removed `required_error` which was causing a compilation issue. The field is still required by default.
    mileage: z.number().min(0, "Пробег не может быть отрицательным"),
    fuelTypeId: z.string().min(1, "Тип топлива обязателен"),
    fuelConsumptionRates: fuelConsumptionRatesSchema,
    assignedDriverId: z.string().nullable(),
    organizationId: z.string().optional().nullable(),
    currentFuel: z.number().min(0).optional().nullable(),
    year: z.number().optional().nullable(),
    vehicleType: z.enum(['Легковой', 'Тягач', 'Прицеп', 'Автобус', 'Спецтехника']).optional().nullable(),
    status: z.nativeEnum(VehicleStatus),
    notes: z.string().optional().nullable(),
    ptsType: z.enum(['PTS', 'EPTS']).optional().nullable(),
    ptsSeries: z.string().optional().nullable(),
    ptsNumber: z.string().optional().nullable(),
    eptsNumber: z.string().optional().nullable(),
    diagnosticCardNumber: z.string().optional().nullable(),
    diagnosticCardIssueDate: z.string().optional().nullable(),
    diagnosticCardExpiryDate: z.string().optional().nullable(),
    maintenanceHistory: z.array(maintenanceRecordSchema).optional().nullable(),
    useCityModifier: z.boolean().optional(),
    useWarmingModifier: z.boolean().optional(),
    fuelTankCapacity: z.number().min(0).optional().nullable(),
    disableFuelCapacityCheck: z.boolean().optional(),
    osagoSeries: z.string().optional().nullable(),
    osagoNumber: z.string().optional().nullable(),
    osagoStartDate: z.string().optional().nullable(),
    osagoEndDate: z.string().optional().nullable(),
    storageLocationId: z.string().optional().nullable(),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

// --- Form Components ---
const FormField: React.FC<{ label: string; children: React.ReactNode, error?: string }> = ({ label, children, error }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);
const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
);
const FormTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} rows={3} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
);
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
);
const FormCheckbox = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="checkbox" {...props} className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500" />
);

// --- Main Component ---
export const VehicleList: React.FC = () => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [actionModal, setActionModal] = useState<{ isOpen: boolean; type?: 'delete' | 'archive' | 'unarchive'; item?: Vehicle }>({ isOpen: false });
    const [showArchived, setShowArchived] = useState(false);
    const { showToast } = useToast();

    const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm<VehicleFormData>({
        resolver: zodResolver(vehicleSchema),
    });

    const currentId = watch("id");
    const currentPlateNumber = watch("plateNumber");

    const COLLAPSED_SECTIONS_KEY = 'vehicleList_collapsedSections';
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });

    useEffect(() => {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSections));
    }, [collapsedSections]);

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [vehiclesData, fuelTypesData, employeesData, organizationsData] = await Promise.all([
                getVehicles(), 
                getFuelTypes(), 
                getEmployees(),
                getOrganizations()
            ]);
            setVehicles(vehiclesData);
            setFuelTypes(fuelTypesData);
            setEmployees(employeesData.filter(e => e.employeeType === 'driver'));
            setOrganizations(organizationsData);
        } catch (e) {
            console.error('Ошибка загрузки данных:', e);
            showToast('Не удалось загрузить данные', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { 
        fetchData(); 
    }, [showToast]);

    const enrichedData = useMemo(() => {
        if (!vehicles || !employees) return [];
        return vehicles
            .filter(v => showArchived || v.status !== VehicleStatus.ARCHIVED)
            .map(v => ({
                ...v,
                driverName: employees.find(d => d.id === v.assignedDriverId)?.shortName || 'Не назначен',
            }));
    }, [vehicles, employees, showArchived]);

    type EnrichedVehicle = typeof enrichedData[0];
    type EnrichedVehicleKey = Extract<keyof EnrichedVehicle, string>;

    const columns: { key: EnrichedVehicleKey; label: string }[] = [
        { key: 'plateNumber', label: 'Гос. номер' },
        { key: 'brand', label: 'Марка и модель' },
        { key: 'driverName', label: 'Водитель' },
        { key: 'status', label: 'Статус' },
    ];

    const { rows, sortColumn, sortDirection, handleSort, filters, handleFilterChange } = useTable(enrichedData, columns);

    const handleAddNew = () => {
        reset({
            status: VehicleStatus.ACTIVE,
            fuelConsumptionRates: { summerRate: 0, winterRate: 0 },
            assignedDriverId: null,
            organizationId: '',
        });
        setIsModalOpen(true);
    };

    const handleEdit = (item: Vehicle) => {
        reset(item);
        setIsModalOpen(true);
    };

    const handleCancel = useCallback(() => {
        setIsModalOpen(false);
    }, []);

    const onSubmit = async (data: VehicleFormData) => {
        const dataToSave = {
            ...data,
            organizationId: data.organizationId === '' ? null : data.organizationId,
        };

        try {
            if (dataToSave.id) {
                await updateVehicle(dataToSave as Vehicle);
            } else {
                await addVehicle(dataToSave as Omit<Vehicle, 'id'>);
            }
            showToast("Изменения сохранены");
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            showToast("Не удалось сохранить изменения.", 'error');
        }
    };
    
    const openActionModal = (type: 'delete' | 'archive' | 'unarchive', item: Vehicle) => {
        setActionModal({ isOpen: true, type, item });
    };

    const closeActionModal = () => setActionModal({ isOpen: false });

    const handleConfirmAction = async () => {
        const { type, item } = actionModal;
        if (!item) return;

        try {
            if (type === 'delete') {
                await deleteVehicle(item.id);
                showToast(`ТС "${item.plateNumber}" удалено.`, 'info');
            } else if (type === 'archive') {
                await updateVehicle({ ...item, status: VehicleStatus.ARCHIVED });
                showToast(`ТС "${item.plateNumber}" архивировано.`, 'info');
            } else if (type === 'unarchive') {
                await updateVehicle({ ...item, status: VehicleStatus.ACTIVE });
                showToast(`ТС "${item.plateNumber}" восстановлено.`, 'info');
            }
            fetchData();
        } catch (error) {
            showToast(`Не удалось выполнить действие.`, 'error');
        } finally {
            closeActionModal();
        }
    };
    
    const modalConfig = useMemo(() => {
        const { type, item } = actionModal;
        if (!type || !item) return { title: '', message: '', confirmText: '', confirmButtonClass: '' };
        
        switch (type) {
            case 'delete': return { title: 'Подтвердить удаление', message: `Удалить ТС "${item.plateNumber}"?`, confirmText: 'Удалить', confirmButtonClass: 'bg-red-600 hover:bg-red-700' };
            case 'archive': return { title: 'Подтвердить архивацию', message: `Архивировать "${item.plateNumber}"?`, confirmText: 'Архивировать', confirmButtonClass: 'bg-purple-600 hover:bg-purple-700' };
            case 'unarchive': return { title: 'Подтвердить восстановление', message: `Восстановить "${item.plateNumber}" из архива?`, confirmText: 'Восстановить', confirmButtonClass: 'bg-green-600 hover:bg-green-700' };
            default: return { title: '', message: '', confirmText: '', confirmButtonClass: '' };
        }
    }, [actionModal]);


    return (
      <>
        <ConfirmationModal isOpen={actionModal.isOpen} onClose={closeActionModal} onConfirm={handleConfirmAction} {...modalConfig} />
        <Modal 
            isOpen={isModalOpen} 
            onClose={handleCancel}
            isDirty={isDirty}
            title={currentId ? `Редактирование: ${currentPlateNumber}`: 'Добавить ТС'}
            footer={
                <>
                    <button onClick={handleCancel} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Отмена</button>
                    <button onClick={handleSubmit(onSubmit)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Сохранить</button>
                </>
            }
        >
             <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <CollapsibleSection title="Основная информация" isCollapsed={collapsedSections.basic || false} onToggle={() => toggleSection('basic')}>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField label="Гос. номер" error={errors.plateNumber?.message}><FormInput {...register("plateNumber")} /></FormField>
                        <FormField label="Марка, модель" error={errors.brand?.message}><FormInput {...register("brand")} /></FormField>
                        <FormField label="Организация" error={errors.organizationId?.message}>
                            <FormSelect {...register("organizationId")}>
                                <option value="">-</option>
                                {organizations.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}
                            </FormSelect>
                        </FormField>
                        <FormField label="VIN" error={errors.vin?.message}><FormInput {...register("vin")} /></FormField>
                        <FormField label="Год выпуска"><FormInput type="number" {...register("year", { valueAsNumber: true })} /></FormField>
                        <FormField label="Тип ТС"><FormSelect {...register("vehicleType")}><option value="">-</option><option>Легковой</option><option>Тягач</option><option>Прицеп</option><option>Автобус</option><option>Спецтехника</option></FormSelect></FormField>
                        <FormField label="Статус"><FormSelect {...register("status")}>{Object.values(VehicleStatus).map(s => <option key={s} value={s}>{VEHICLE_STATUS_TRANSLATIONS[s]}</option>)}</FormSelect></FormField>
                        <FormField label="Водитель"><FormSelect {...register("assignedDriverId")}><option value="">Не назначен</option>{employees.map(e => <option key={e.id} value={e.id}>{e.shortName}</option>)}</FormSelect></FormField>
                     </div>
                </CollapsibleSection>
                <CollapsibleSection title="Топливо и пробег" isCollapsed={collapsedSections.fuel || false} onToggle={() => toggleSection('fuel')}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                        <FormField label="Тип топлива" error={errors.fuelTypeId?.message}><FormSelect {...register("fuelTypeId")}><option value="">-</option>{fuelTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</FormSelect></FormField>
                        <FormField label="Объем бака, л"><FormInput type="number" {...register("fuelTankCapacity", { valueAsNumber: true, setValueAs: v => v || null })} /></FormField>
                        <FormField label="Текущий остаток, л"><FormInput type="number" {...register("currentFuel", { valueAsNumber: true, setValueAs: v => v || null })} /></FormField>
                        <FormField label="Пробег, км" error={errors.mileage?.message}><FormInput type="number" {...register("mileage", { valueAsNumber: true })} /></FormField>
                        
                        <div className="md:col-span-3 grid grid-cols-2 gap-4">
                            <FormField label="Летняя норма" error={errors.fuelConsumptionRates?.summerRate?.message}><FormInput type="number" step="0.1" {...register("fuelConsumptionRates.summerRate", { valueAsNumber: true })} /></FormField>
                            <FormField label="Зимняя норма" error={errors.fuelConsumptionRates?.winterRate?.message}><FormInput type="number" step="0.1" {...register("fuelConsumptionRates.winterRate", { valueAsNumber: true })} /></FormField>
                        </div>

                        <div className="md:col-span-3 mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 border rounded-lg dark:border-gray-600">
                                    <label className="flex items-center gap-2 mb-2">
                                        <FormCheckbox {...register("useCityModifier")} />
                                        <span className="font-medium text-gray-700 dark:text-gray-200">Городской цикл</span>
                                    </label>
                                    <FormField label="Надбавка, %" error={errors.fuelConsumptionRates?.cityIncreasePercent?.message}>
                                        <FormInput 
                                            type="number" 
                                            step="0.1" 
                                            {...register("fuelConsumptionRates.cityIncreasePercent", { setValueAs: v => v === "" ? null : parseFloat(v) })} 
                                            disabled={!watch("useCityModifier")}
                                        />
                                    </FormField>
                                </div>
                                <div className="p-4 border rounded-lg dark:border-gray-600">
                                    <label className="flex items-center gap-2 mb-2">
                                        <FormCheckbox {...register("useWarmingModifier")} />
                                        <span className="font-medium text-gray-700 dark:text-gray-200">Прогрев и работа на месте</span>
                                    </label>
                                    <FormField label="Надбавка, %" error={errors.fuelConsumptionRates?.warmingIncreasePercent?.message}>
                                        <FormInput 
                                            type="number" 
                                            step="0.1" 
                                            {...register("fuelConsumptionRates.warmingIncreasePercent", { setValueAs: v => v === "" ? null : parseFloat(v) })} 
                                            disabled={!watch("useWarmingModifier")}
                                        />
                                    </FormField>
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-3 mt-2">
                            <label className="flex items-center gap-2">
                                <FormCheckbox {...register("disableFuelCapacityCheck")} />
                                <span className="text-sm text-gray-700 dark:text-gray-200">Отключить проверку на превышение объема бака</span>
                            </label>
                        </div>
                    </div>
                </CollapsibleSection>
             </form>
        </Modal>

        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Справочник: Транспорт</h3>
                <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                    <PlusIcon className="h-5 w-5" /> Добавить
                </button>
            </div>
            <label className="flex items-center text-sm text-gray-600 dark:text-gray-300 cursor-pointer my-4">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500" />
                <span className="ml-2">Показать архивные</span>
            </label>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            {columns.map(col => (<th key={col.key} scope="col" className="px-6 py-3 cursor-pointer" onClick={() => handleSort(col.key)}><div className="flex items-center gap-1">{col.label}{sortColumn === col.key && (sortDirection === 'asc' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />)}</div></th>))}
                            <th scope="col" className="px-6 py-3 text-center">Действия</th>
                        </tr>
                        <tr>
                            {columns.map(col => (<th key={`${col.key}-filter`} className="px-2 py-1"><input type="text" value={filters[col.key] || ''} onChange={e => handleFilterChange(col.key, e.target.value)} placeholder={`Поиск...`} className="w-full text-xs p-1 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded" /></th>))}
                            <th className="px-2 py-1"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (<tr><td colSpan={columns.length + 1} className="text-center p-4">Загрузка...</td></tr>) 
                        : rows.map(v => (
                            <tr key={v.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{v.plateNumber}</td>
                                <td className="px-6 py-4">{v.brand}</td>
                                <td className="px-6 py-4">{v.driverName}</td>
                                <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${VEHICLE_STATUS_COLORS[v.status]}`}>{VEHICLE_STATUS_TRANSLATIONS[v.status]}</span></td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => handleEdit(v)} className="p-2 text-blue-500" title="Редактировать"><PencilIcon className="h-5 w-5" /></button>
                                    {v.status === VehicleStatus.ACTIVE ? <button onClick={() => openActionModal('archive', v)} className="p-2 text-purple-500" title="Архивировать"><ArchiveBoxIcon className="h-5 w-5" /></button> : <button onClick={() => openActionModal('unarchive', v)} className="p-2 text-green-500" title="Восстановить"><ArrowUpTrayIcon className="h-5 w-5" /></button>}
                                    <button onClick={() => openActionModal('delete', v)} className="p-2 text-red-500" title="Удалить"><TrashIcon className="h-5 w-5" /></button>
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

export default VehicleList;