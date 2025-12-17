import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Vehicle, FuelType, Employee, VehicleStatus, Organization } from '../../types';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { addVehicle, updateVehicle, deleteVehicle, recalculateVehicleStats } from '../../services/mockApi';
import { useVehicles, useFuelTypes, useEmployees, useOrganizations } from '../../hooks/queries';
import { validation } from '../../services/faker';
import { PencilIcon, TrashIcon, PlusIcon, ArchiveBoxIcon, ArrowUpTrayIcon, ArrowUturnLeftIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import CollapsibleSection from '../shared/CollapsibleSection';
import { VEHICLE_STATUS_COLORS, VEHICLE_STATUS_TRANSLATIONS } from '../../constants';
import { DataTable, Column } from '../shared/DataTable';

// --- Zod Schema for Validation ---
const fuelConsumptionRatesSchema = z.object({
    summerRate: z.number().positive('Норма должна быть > 0'),
    winterRate: z.number().positive('Норма должна быть > 0'),
    cityIncreasePercent: z.number().min(0, "Надбавка не может быть отрицательной").nullish(),
    warmingIncreasePercent: z.number().min(0, "Надбавка не может быть отрицательной").nullish(),
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
    // Maintenance
    maintenanceIntervalKm: z.number().min(0).optional().nullable(),
    lastMaintenanceMileage: z.number().min(0).optional().nullable(),
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
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
);
const FormCheckbox = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="checkbox" {...props} className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500" />
);

// --- Main Component ---
export const VehicleList: React.FC = () => {
    // Queries hooks automatically handle loading states and caching
    const { data: vehicles = [], isLoading: isLoadingVehicles, refetch } = useVehicles();
    const { data: fuelTypes = [] } = useFuelTypes();
    const { data: allEmployees = [] } = useEmployees();
    const { data: organizations = [] } = useOrganizations();

    // Filter only drivers for the dropdown
    const drivers = useMemo(() => allEmployees.filter(e => e.employeeType === 'driver'), [allEmployees]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [actionModal, setActionModal] = useState<{ isOpen: boolean; type?: 'delete' | 'archive' | 'unarchive'; item?: Vehicle }>({ isOpen: false });
    const [showArchived, setShowArchived] = useState(false);
    const { showToast } = useToast();

    const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = useForm<VehicleFormData>({
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

    // Save section state to local storage
    useEffect(() => {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSections));
    }, [collapsedSections]);

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const enrichedData = useMemo(() => {
        return vehicles
            .filter(v => showArchived || v.status !== VehicleStatus.ARCHIVED)
            .map(v => ({
                ...v,
                driverName: drivers.find(d => d.id === v.assignedDriverId)?.shortName || 'Не назначен',
            }));
    }, [vehicles, drivers, showArchived]);

    type EnrichedVehicle = typeof enrichedData[0];

    // Explicitly type useTable to prevent TS from narrowing T to the inline columns keys
    const { rows, sortColumn, sortDirection, handleSort, filters, handleFilterChange } = useTable<EnrichedVehicle>(enrichedData, [
        { key: 'plateNumber', label: 'Гос. номер' },
        { key: 'brand', label: 'Марка и модель' },
        { key: 'mileage', label: 'Пробег, км' },
        { key: 'driverName', label: 'Водитель' },
        { key: 'status', label: 'Статус' },
    ]);

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
        reset(item as any); // Cast to any to bypass strict type checking for vehicleType enum and null/undefined mismatches
        setIsModalOpen(true);
    };

    const handleCancel = useCallback(() => {
        setIsModalOpen(false);
    }, []);

    const handleSyncWithWaybills = async () => {
        if (!currentId) return;
        try {
            const updatedVehicle = await recalculateVehicleStats(currentId);
            if (updatedVehicle) {
                setValue('mileage', updatedVehicle.mileage, { shouldDirty: true });
                setValue('currentFuel', updatedVehicle.currentFuel, { shouldDirty: true });
                showToast('Данные синхронизированы с последним проведенным ПЛ', 'success');
            } else {
                showToast('Не удалось обновить данные', 'error');
            }
        } catch (e) {
            showToast('Ошибка при синхронизации', 'error');
        }
    };

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
            refetch(); // Manually refresh list to be sure
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
            refetch();
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

    const columns: Column<EnrichedVehicle>[] = [
        { key: 'plateNumber', label: 'Гос. номер', sortable: true },
        { key: 'brand', label: 'Марка и модель', sortable: true },
        { key: 'mileage', label: 'Пробег, км', sortable: true },
        { key: 'driverName', label: 'Водитель', sortable: true },
        {
            key: 'status',
            label: 'Статус',
            sortable: true,
            render: (v) => <span className={`px-2 py-1 text-xs font-semibold rounded-full ${VEHICLE_STATUS_COLORS[v.status]}`}>{VEHICLE_STATUS_TRANSLATIONS[v.status]}</span>
        }
    ];

    return (
        <div className="space-y-4">
            <ConfirmationModal isOpen={actionModal.isOpen} onClose={closeActionModal} onConfirm={handleConfirmAction} {...modalConfig} />
            <Modal
                isOpen={isModalOpen}
                onClose={handleCancel}
                isDirty={isDirty}
                title={currentId ? `Редактирование: ${currentPlateNumber}` : 'Добавить ТС'}
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
                            <FormField label="Водитель"><FormSelect {...register("assignedDriverId")}><option value="">Не назначен</option>{drivers.map(e => <option key={e.id} value={e.id}>{e.shortName}</option>)}</FormSelect></FormField>
                        </div>
                    </CollapsibleSection>
                    <CollapsibleSection title="Топливо и пробег" isCollapsed={collapsedSections.fuel || false} onToggle={() => toggleSection('fuel')}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                            <FormField label="Тип топлива" error={errors.fuelTypeId?.message}><FormSelect {...register("fuelTypeId")}><option value="">-</option>{fuelTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</FormSelect></FormField>
                            <FormField label="Объем бака, л">
                                <FormInput
                                    type="number"
                                    {...register("fuelTankCapacity", {
                                        setValueAs: v => (v === "" || isNaN(Number(v))) ? null : Number(v)
                                    })}
                                />
                            </FormField>
                            <FormField label="Текущий остаток, л">
                                <FormInput
                                    type="number"
                                    step="0.01"
                                    {...register("currentFuel", {
                                        setValueAs: v => (v === "" || isNaN(Number(v))) ? null : Number(v)
                                    })}
                                />
                            </FormField>
                            <FormField label="Пробег, км" error={errors.mileage?.message}>
                                <div className="flex gap-2">
                                    <FormInput type="number" {...register("mileage", { valueAsNumber: true })} />
                                    {currentId && (
                                        <button
                                            type="button"
                                            onClick={handleSyncWithWaybills}
                                            title="Синхронизировать с последним проведенным ПЛ"
                                            className="px-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md text-gray-700 dark:text-gray-200 transition-colors"
                                        >
                                            <ArrowUturnLeftIcon className="w-5 h-5 transform rotate-180" />
                                        </button>
                                    )}
                                </div>
                            </FormField>

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
                                                {...register("fuelConsumptionRates.cityIncreasePercent", {
                                                    setValueAs: v => (v === "" || isNaN(Number(v))) ? null : Number(v)
                                                })}
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
                                                {...register("fuelConsumptionRates.warmingIncreasePercent", {
                                                    setValueAs: v => (v === "" || isNaN(Number(v))) ? null : Number(v)
                                                })}
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
                    <CollapsibleSection title="Техническое обслуживание" isCollapsed={collapsedSections.maintenance || false} onToggle={() => toggleSection('maintenance')}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Интервал ТО (км)" error={errors.maintenanceIntervalKm?.message}>
                                <FormInput type="number" {...register("maintenanceIntervalKm", { setValueAs: v => (v === "" || isNaN(Number(v))) ? null : Number(v) })} />
                            </FormField>
                            <FormField label="Пробег последнего ТО (км)" error={errors.lastMaintenanceMileage?.message}>
                                <FormInput type="number" {...register("lastMaintenanceMileage", { setValueAs: v => (v === "" || isNaN(Number(v))) ? null : Number(v) })} />
                            </FormField>
                        </div>
                    </CollapsibleSection>
                </form>
            </Modal>

            {/* Header Section */}
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Транспортные средства</h3>
                <div className="flex items-center gap-4">
                    <label className="flex items-center text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                        <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500" />
                        <span className="ml-2">Показать архивные</span>
                    </label>
                    <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition-all active:scale-95">
                        <PlusIcon className="h-5 w-5" /> Добавить
                    </button>
                </div>
            </div>

            <DataTable
                data={rows}
                columns={columns}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                tableId="vehicles-list"
                filters={filters}
                onFilterChange={handleFilterChange}
                isLoading={isLoadingVehicles}
                actions={[
                    {
                        icon: <PencilIcon className="h-4 w-4" />,
                        onClick: (v) => handleEdit(v),
                        title: "Редактировать",
                        className: "text-blue-500"
                    },
                    {
                        icon: <ArchiveBoxIcon className="h-4 w-4" />,
                        onClick: (v) => openActionModal('archive', v),
                        title: "Архивировать",
                        show: (v) => v.status === VehicleStatus.ACTIVE,
                        className: "text-purple-500"
                    },
                    {
                        icon: <ArrowUpTrayIcon className="h-4 w-4" />,
                        onClick: (v) => openActionModal('unarchive', v),
                        title: "Восстановить",
                        show: (v) => v.status !== VehicleStatus.ACTIVE,
                        className: "text-green-500"
                    },
                    {
                        icon: <TrashIcon className="h-4 w-4" />,
                        onClick: (v) => openActionModal('delete', v),
                        title: "Удалить",
                        className: "text-red-500"
                    }
                ]}
            />
        </div>
    );
};