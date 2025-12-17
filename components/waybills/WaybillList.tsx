import React, { useState, useEffect, useMemo } from 'react';
import { Waybill, WaybillStatus } from '../../types';
import {
    useChangeWaybillStatus,
    useChangeWaybillStatusBulk,
    useDeleteWaybill,
    useVehicles,
    useEmployees,
    useOrganizations,
    useAppSettings,
    useWaybillsPaged,
    useFuelTypes
} from '../../hooks/queries';
import { validateBatchCorrection, fetchWaybillById, fixWaybillDates } from '../../services/mockApi';
import { WaybillDetail } from './WaybillDetail';
import WaybillCheckModal from './WaybillCheckModal';
import SeasonSettingsModal from './SeasonSettingsModal';
import RecalculateChainModal from './RecalculateChainModal';
import PrintableWaybill from './PrintableWaybill';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import {
    PlusIcon, PencilIcon, TrashIcon,
    CheckCircleIcon, ArrowUturnLeftIcon,
    SparklesIcon, PrinterIcon, CalendarDaysIcon,
    ArrowUpIcon, ArrowDownIcon, ExcelIcon, ArrowPathIcon,
    WrenchScrewdriverIcon, ShieldCheckIcon, FunnelIcon
} from '../Icons';
import { WAYBILL_STATUS_TRANSLATIONS, WAYBILL_STATUS_COLORS } from '../../constants';
import { useAuth } from '../../services/auth';
import BatchGeneratorModal from './BatchGeneratorModal';
import ExcelImportModal from './ExcelImportModal';
import * as XLSX from 'xlsx';

// DnD Imports
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useColumnPersistence } from '../../hooks/useColumnPersistence';
import { SortableHeader } from '../shared/SortableHeader';
import { createPortal } from 'react-dom';

// Хелпер для правильной сортировки дат
const dateSorter = (rowA: any, rowB: any, columnId: string) => {
    const valA = rowA[columnId];
    const valB = rowB[columnId];

    const toNum = (str: any) => {
        if (!str || typeof str !== 'string') return 0;
        if (str.includes('-')) {
            return Number(str.replace(/\D/g, '').substring(0, 8));
        }
        const parts = str.split('.');
        if (parts.length === 3) {
            return Number(parts[2] + parts[1] + parts[0]);
        }
        return 0;
    };

    return toNum(valA) - toNum(valB);
};

interface WaybillListProps {
    waybillToOpen: string | null;
    onWaybillOpened: () => void;
}

type EnrichedWaybill = Waybill & {
    vehiclePlate: string;
    vehicleBrand: string;
    driverName: string;
    organizationName: string;
    depDateStr: string;
    depTimeStr: string;
    retDateStr: string;
    retTimeStr: string;
    mileage: number;
    docDateStr: string;
};

interface ColumnConfig {
    id: string; // Used as key for DnD
    key: string; // Used for persistence hook
    label: React.ReactNode;
    sortKey?: keyof EnrichedWaybill | 'date';
    sortType?: (a: any, b: any, id: string) => number;
    render: (row: EnrichedWaybill) => React.ReactNode;
    className?: string;
}

const WaybillList: React.FC<WaybillListProps> = ({ waybillToOpen, onWaybillOpened }) => {
    const { showToast } = useToast();
    const { can, currentUser } = useAuth();
    const { data: settings } = useAppSettings();

    // --- State ---
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'date',
        direction: 'desc'
    });

    const [filters, setFilters] = useState(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const toISO = (d: Date) => d.toLocaleDateString('sv-SE');

        return {
            dateFrom: toISO(start),
            dateTo: toISO(end),
            status: '' as WaybillStatus | '',
            vehicleId: '',
            driverId: '',
        };
    });

    const { data: pagedData, isLoading, isFetching, refetch } = useWaybillsPaged({
        page,
        pageSize,
        filters,
        sort: sortConfig
    });

    const waybills = pagedData?.data || [];
    const totalPages = pagedData?.totalPages || 1;
    const totalCount = pagedData?.total || 0;

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isExtendedMode, setIsExtendedMode] = useState(true);

    // Modals
    const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);
    const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
    const [isRecalcChainModalOpen, setIsRecalcChainModalOpen] = useState(false);

    const [waybillToPrint, setWaybillToPrint] = useState<Waybill | null>(null);

    // Actions
    const [deleteConfirm, setDeleteConfirm] = useState<Waybill | null>(null);
    const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
    const [statusChangeConfirm, setStatusChangeConfirm] = useState<{ ids: string[]; status: WaybillStatus } | null>(null);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ processed: number; total: number } | null>(null);

    const [markBlanksAsSpoiled, setMarkBlanksAsSpoiled] = useState(false);

    // Data Hooks
    const { data: vehicles = [] } = useVehicles();
    const { data: employees = [] } = useEmployees();
    const { data: organizations = [] } = useOrganizations();
    const { data: fuelTypes = [] } = useFuelTypes();

    const changeStatusMutation = useChangeWaybillStatus();
    const changeStatusBulkMutation = useChangeWaybillStatusBulk();
    const deleteMutation = useDeleteWaybill();

    // --- Button Styles (Strict Business Palette) ---
    const btnUtility = "flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm whitespace-nowrap";
    const btnSecondary = "flex items-center gap-2 px-3 py-2 bg-white border border-blue-600 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors shadow-sm whitespace-nowrap";
    const btnPrimary = "flex items-center gap-2 px-4 py-2 bg-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors whitespace-nowrap";

    // --- Columns ---
    // Note: 'key' property is required for useColumnPersistence
    const extendedColumnsConfig = useMemo<ColumnConfig[]>(() => [
        {
            id: 'number', key: 'number',
            label: '№ ПЛ',
            sortKey: 'number',
            render: (w) => (
                <div className="flex flex-col">
                    <span className="font-medium text-gray-900 dark:text-white">{w.number}</span>
                    <span className="text-[11px] text-gray-500">{w.vehiclePlate}</span>
                </div>
            )
        },
        {
            id: 'validFrom', key: 'validFrom',
            label: 'Выезд',
            sortKey: 'validFrom',
            sortType: dateSorter,
            render: (w) => (
                <div className="flex flex-col">
                    <span className="text-gray-900 dark:text-gray-200">{w.depDateStr}</span>
                    <span className="text-xs text-gray-500">{w.depTimeStr}</span>
                </div>
            )
        },
        {
            id: 'validTo', key: 'validTo',
            label: 'Возврат',
            sortKey: 'validTo',
            sortType: dateSorter,
            render: (w) => (
                <div className="flex flex-col">
                    <span className="text-gray-900 dark:text-gray-200">{w.retDateStr}</span>
                    <span className="text-xs text-gray-500">{w.retTimeStr}</span>
                </div>
            )
        },
        {
            id: 'odometerStart', key: 'odometerStart',
            label: <>Одометр<br /><span className="text-[10px] font-normal text-gray-500">начало</span></>,
            sortKey: 'odometerStart',
            className: 'text-center font-mono text-gray-700 dark:text-gray-300',
            render: (w) => w.odometerStart
        },
        {
            id: 'odometerEnd', key: 'odometerEnd',
            label: <>Одометр<br /><span className="text-[10px] font-normal text-gray-500">конец</span></>,
            sortKey: 'odometerEnd',
            className: 'text-center font-mono text-gray-700 dark:text-gray-300',
            render: (w) => w.odometerEnd || '-'
        },
        {
            id: 'mileage', key: 'mileage',
            label: 'Пробег',
            sortKey: 'mileage',
            className: 'text-center font-bold text-gray-900 dark:text-white',
            render: (w) => w.mileage
        },
        {
            id: 'fuelAtStart', key: 'fuelAtStart',
            label: <>Топливо<br /><span className="text-[10px] font-normal text-gray-500">начало</span></>,
            sortKey: 'fuelAtStart',
            className: 'text-center font-mono',
            render: (w) => <span className={(w.fuelAtStart || 0) < 0 ? 'text-red-600 font-bold' : 'text-gray-700 dark:text-gray-300'}>{(w.fuelAtStart || 0).toFixed(2)}</span>
        },
        {
            id: 'fuelAtEnd', key: 'fuelAtEnd',
            label: <>Топливо<br /><span className="text-[10px] font-normal text-gray-500">конец</span></>,
            sortKey: 'fuelAtEnd',
            className: 'text-center font-mono',
            render: (w) => <span className={(w.fuelAtEnd || 0) < 0 ? 'text-red-600 font-bold' : 'text-gray-700 dark:text-gray-300'}>{(w.fuelAtEnd || 0).toFixed(2)}</span>
        },
        {
            id: 'status', key: 'status',
            label: 'Статус',
            sortKey: 'status',
            render: (w) => (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${WAYBILL_STATUS_COLORS[w.status]?.bg} ${WAYBILL_STATUS_COLORS[w.status]?.text} border-transparent`}>
                    {WAYBILL_STATUS_TRANSLATIONS[w.status]}
                </span>
            )
        }
    ], []);

    const standardColumnsConfig = useMemo<ColumnConfig[]>(() => [
        {
            id: 'number', key: 'number',
            label: '№ ПЛ',
            sortKey: 'number',
            render: (w) => <span className="font-medium text-gray-900 dark:text-white">{w.number}</span>
        },
        {
            id: 'date', key: 'date',
            label: 'Дата',
            sortKey: 'date',
            sortType: dateSorter,
            render: (w) => w.docDateStr
        },
        {
            id: 'vehicle', key: 'vehicle',
            label: 'Транспорт',
            sortKey: 'vehicleId',
            render: (w) => (
                <div className="flex flex-col">
                    <span className="font-medium text-gray-900 dark:text-white">{w.vehiclePlate}</span>
                    <span className="text-xs text-gray-500">{w.vehicleBrand}</span>
                </div>
            )
        },
        {
            id: 'driver', key: 'driver',
            label: 'Водитель',
            sortKey: 'driverId',
            render: (w) => <span className="text-gray-700 dark:text-gray-300">{w.driverName}</span>
        },
        {
            id: 'status', key: 'status',
            label: 'Статус',
            sortKey: 'status',
            render: (w) => (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${WAYBILL_STATUS_COLORS[w.status]?.bg} ${WAYBILL_STATUS_COLORS[w.status]?.text} border-transparent`}>
                    {WAYBILL_STATUS_TRANSLATIONS[w.status]}
                </span>
            )
        }
    ], []);

    // --- DnD Column Hook ---
    const initialColumns = isExtendedMode ? extendedColumnsConfig : standardColumnsConfig;
    const tableId = isExtendedMode ? 'waybill-list-extended' : 'waybill-list-standard';

    const { columns, sensors, onDragEnd } = useColumnPersistence(initialColumns, tableId);

    const [activeColId, setActiveColId] = useState<string | null>(null);
    const activeColumn = columns.find(c => c.id === activeColId);

    // --- Handlers ---
    const handleEdit = (wb: Waybill) => {
        setSelectedWaybill(wb);
        setIsDetailModalOpen(true);
    };

    const handleCreate = () => {
        setSelectedWaybill(null);
        setIsDetailModalOpen(true);
    };

    const handleDetailClose = async () => {
        setIsDetailModalOpen(false);
        await refetch();
    };

    const handleDeleteClick = (wb: Waybill) => {
        if (wb.status === WaybillStatus.POSTED) {
            showToast('Нельзя удалить проведенный ПЛ. Сначала отмените проведение.', 'error');
            return;
        }
        setMarkBlanksAsSpoiled(false);
        setDeleteConfirm(wb);
    };

    const handlePrintClick = async (wb: Waybill) => {
        setWaybillToPrint(wb);
    };

    const handleFixDates = async () => {
        try {
            const count = await fixWaybillDates();
            if (count > 0) {
                showToast(`Исправлено дат в ${count} документах.`, 'success');
                await refetch();
            } else {
                showToast('Все даты в порядке, исправлений не требуется.', 'info');
            }
        } catch (e) {
            showToast('Ошибка при исправлении дат: ' + (e as Error).message, 'error');
        }
    };

    // Deep link handler
    useEffect(() => {
        if (waybillToOpen) {
            const openAsync = async () => {
                let wb = waybills.find(w => w.id === waybillToOpen);
                if (!wb) {
                    try {
                        wb = await fetchWaybillById(waybillToOpen) || undefined;
                    } catch (e) {
                        console.error('Failed to fetch waybill by ID', e);
                    }
                }
                if (wb) {
                    handleEdit(wb);
                    onWaybillOpened();
                }
            };
            openAsync();
        }
    }, [waybillToOpen, waybills, onWaybillOpened]);

    const handleFilterChange = (newFilters: typeof filters) => {
        setFilters(newFilters);
        setPage(1);
        setSelectedIds(new Set());
    };

    const processedData = useMemo(() => {
        const enriched = waybills.map(w => {
            const vehicle = vehicles.find(v => v.id === w.vehicleId);
            const driver = employees.find(e => e.id === w.driverId);
            const org = organizations.find(o => o.id === w.organizationId);

            const depDate = w.validFrom ? new Date(w.validFrom) : null;
            const retDate = w.validTo ? new Date(w.validTo) : null;
            const docDate = w.date ? new Date(w.date) : null;

            return {
                ...w,
                vehiclePlate: vehicle ? vehicle.plateNumber : '—',
                vehicleBrand: vehicle ? vehicle.brand : '',
                driverName: driver ? driver.shortName : '—',
                organizationName: org ? org.shortName : '—',
                depDateStr: depDate ? depDate.toLocaleDateString('ru-RU') : '-',
                depTimeStr: depDate ? depDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-',
                retDateStr: retDate ? retDate.toLocaleDateString('ru-RU') : '-',
                retTimeStr: retDate ? retDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-',
                docDateStr: docDate ? docDate.toLocaleDateString('ru-RU') : '-',
                mileage: w.odometerEnd && w.odometerStart ? w.odometerEnd - w.odometerStart : 0
            } as EnrichedWaybill;
        });

        return enriched.sort((a, b) => {
            const { key, direction } = sortConfig;
            if (['date', 'validFrom', 'validTo', 'number', 'status', 'odometerStart', 'odometerEnd', 'fuelAtStart', 'fuelAtEnd', 'fuelPlanned', 'mileage'].includes(key)) {
                return 0;
            }
            const column = columns.find(c => c.sortKey === key);
            if (column?.sortType) {
                const res = column.sortType(a, b, key);
                return direction === 'asc' ? res : -res;
            }
            let valA = a[key as keyof EnrichedWaybill];
            let valB = b[key as keyof EnrichedWaybill];
            if (typeof valA === 'number' && typeof valB === 'number') {
                return direction === 'asc' ? valA - valB : valB - valA;
            }
            const strA = String(valA || '').toLowerCase();
            const strB = String(valB || '').toLowerCase();
            if (strA < strB) return direction === 'asc' ? -1 : 1;
            if (strA > strB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [waybills, vehicles, employees, organizations, sortConfig, columns]);

    const handleConfirmDelete = async () => {
        if (!deleteConfirm) return;
        try {
            await deleteMutation.mutateAsync({ id: deleteConfirm.id, markAsSpoiled: markBlanksAsSpoiled });
            showToast('Путевой лист удален', 'success');
            setDeleteConfirm(null);
        } catch (e) {
            showToast('Ошибка удаления', 'error');
        }
    };

    const handleBulkStatusChange = async (status: WaybillStatus) => {
        const ids = Array.from(selectedIds) as string[];
        if (ids.length === 0) return;

        if (status === WaybillStatus.DRAFT) {
            const invalid = processedData.filter(w => ids.includes(w.id) && w.status !== WaybillStatus.POSTED);
            if (invalid.length > 0) {
                showToast('Для возврата в черновик выберите только проведенные ПЛ.', 'error');
                return;
            }
            const validation = await validateBatchCorrection(ids);
            if (!validation.valid) {
                showToast(validation.error || 'Ошибка валидации последовательности.', 'error');
                return;
            }
        }
        setStatusChangeConfirm({ ids, status });
    };

    const performBulkStatusChange = async () => {
        if (!statusChangeConfirm) return;
        if (isBulkProcessing) return;

        const { ids, status } = statusChangeConfirm;
        setIsBulkProcessing(true);
        setBulkProgress({ processed: 0, total: ids.length });

        try {
            await changeStatusBulkMutation.mutateAsync({
                ids,
                status,
                context: {
                    userId: currentUser?.id,
                    appMode: settings?.appMode,
                    reason: status === WaybillStatus.DRAFT ? 'Массовая корректировка' : undefined
                }
            });
            showToast(`Статус обновлен для ${ids.length} документов`, 'success');
            setStatusChangeConfirm(null);
            setSelectedIds(new Set());
        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Ошибка при пакетной обработке', 'error');
        } finally {
            setIsBulkProcessing(false);
            setBulkProgress(null);
        }
    };

    const handleBulkDeleteClick = () => {
        const ids = Array.from(selectedIds) as string[];
        const hasPosted = processedData.some(w => ids.includes(w.id) && w.status === WaybillStatus.POSTED);

        if (hasPosted) {
            showToast('В выборке есть проведенные ПЛ. Удаление невозможно.', 'error');
            return;
        }
        setMarkBlanksAsSpoiled(false);
        setBulkDeleteIds(ids);
    };

    const performBulkDelete = async () => {
        if (!bulkDeleteIds) return;
        let successCount = 0;
        let failCount = 0;
        for (const id of bulkDeleteIds) {
            try {
                await deleteMutation.mutateAsync({ id, markAsSpoiled: markBlanksAsSpoiled });
                successCount++;
            } catch (e) {
                failCount++;
            }
        }
        showToast(`Удалено: ${successCount}. Ошибок: ${failCount}`, failCount > 0 ? 'info' : 'success');
        setBulkDeleteIds(null);
        setSelectedIds(new Set());
    };

    const handleCheckModalOpenWaybill = async (waybillId: string) => {
        setIsCheckModalOpen(false);
        try {
            let wb = waybills.find(w => w.id === waybillId);
            if (!wb) wb = await fetchWaybillById(waybillId) || undefined;
            if (wb) handleEdit(wb);
            else showToast('Путевой лист не найден', 'error');
        } catch (e) {
            showToast('Ошибка при загрузке путевого листа', 'error');
        }
    };

    const handleExportSelected = () => {
        const idsToExport = Array.from(selectedIds) as string[];
        const selectedRows = processedData.filter(r => idsToExport.includes(r.id));
        if (selectedRows.length === 0) {
            showToast('Не выбраны записи для экспорта.', 'info');
            return;
        }
        const data: any[][] = [];
        data.push([
            "№ ПЛ", "Статус", "Дата документа",
            "Выезд (дата)", "Выезд (время)", "Возврат (дата)", "Возврат (время)",
            "ТС", "Водитель", "Организация", "Пробег (км)",
            "Топливо (нач)", "Топливо (кон)", "Расход (норма)", "Заправлено"
        ]);
        for (const row of selectedRows) {
            const departureDate = row.validFrom ? new Date(row.validFrom) : null;
            const returnDate = row.validTo ? new Date(row.validTo) : null;
            data.push([
                row.number,
                WAYBILL_STATUS_TRANSLATIONS[row.status],
                row.date ? new Date(row.date) : null,
                departureDate, departureDate,
                returnDate, returnDate,
                row.vehiclePlate, row.driverName, row.organizationName,
                row.mileage ?? 0,
                row.fuelAtStart ?? 0, row.fuelAtEnd ?? 0,
                row.fuelPlanned ?? 0, row.fuelFilled ?? 0,
            ]);
        }
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Путевые листы");
        XLSX.writeFile(wb, `waybills_export_${new Date().toLocaleDateString('ru-RU')}.xlsx`);
        showToast(`Экспортировано ${selectedRows.length} записей.`, 'success');
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(processedData.map(w => w.id)));
        else setSelectedIds(new Set());
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
        });
    };

    const isAllSelected = processedData.length > 0 && processedData.every(w => selectedIds.has(w.id));

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getPrintProps = (wb: Waybill) => {
        const vehicle = vehicles.find(v => v.id === wb.vehicleId);
        const driver = employees.find(e => e.id === wb.driverId);
        const org = organizations.find(o => o.id === wb.organizationId);
        const dispatcher = employees.find(e => e.id === wb.dispatcherId);
        const controller = employees.find(e => e.id === wb.controllerId);
        const fuelType = fuelTypes.find(f => f.id === vehicle?.fuelTypeId);
        return { waybill: wb, vehicle, driver, organization: org, dispatcher, controller, fuelType, allOrganizations: organizations };
    };

    return (
        <div className="space-y-6">
            {/* --- TOOLBAR --- */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Путевые листы</h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-semibold">
                        {totalCount}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                    {/* View Switcher */}
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none mr-auto xl:mr-2">
                        <div className="relative inline-block w-9 h-5 align-middle select-none transition duration-200 ease-in">
                            <input type="checkbox" checked={isExtendedMode} onChange={(e) => setIsExtendedMode(e.target.checked)} className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300 checked:right-0 checked:border-blue-600" />
                            <label className="toggle-label block overflow-hidden h-5 rounded-full bg-gray-300 cursor-pointer"></label>
                        </div>
                        <span className="font-medium">Расширенный</span>
                    </label>

                    {/* Utility Group */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
                        <button onClick={() => setIsCheckModalOpen(true)} className={btnUtility} title="Проверить путевые листы">
                            <ShieldCheckIcon className="h-4 w-4 text-gray-500" /> Проверка
                        </button>
                        <button onClick={() => setIsSeasonModalOpen(true)} className={btnUtility} title="Настройки сезонов">
                            <CalendarDaysIcon className="h-4 w-4 text-gray-500" /> Сезоны
                        </button>
                        <button onClick={handleFixDates} className={btnUtility} title="Исправить формат дат">
                            <WrenchScrewdriverIcon className="h-4 w-4 text-gray-500" /> Даты
                        </button>
                        {can('waybill.create') && (
                            <button onClick={() => setIsRecalcChainModalOpen(true)} className={btnUtility} title="Пересчитать цепочку">
                                <ArrowPathIcon className="h-4 w-4 text-gray-500" /> Пересчет
                            </button>
                        )}
                    </div>

                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden xl:block mx-1"></div>

                    {/* Import/Export Group */}
                    <div className="flex items-center gap-2">
                        {can('waybill.create') && (
                            <>
                                <button onClick={() => setIsExcelImportModalOpen(true)} className={btnSecondary}>
                                    <ExcelIcon className="h-4 w-4" /> Импорт
                                </button>
                                <button onClick={() => setIsBatchModalOpen(true)} className={btnSecondary}>
                                    <SparklesIcon className="h-4 w-4" /> Пакетная
                                </button>
                            </>
                        )}
                    </div>

                    {/* Primary Action */}
                    {can('waybill.create') && (
                        <button onClick={handleCreate} className={btnPrimary}>
                            <PlusIcon className="h-5 w-5" /> Создать новый
                        </button>
                    )}
                </div>
            </div>

            {/* --- FILTERS --- */}
            <div className="flex flex-wrap gap-3 items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mr-2">
                    <FunnelIcon className="h-4 w-4" /> Фильтры:
                </div>
                <input type="date" className="p-2 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={filters.dateFrom} onChange={e => handleFilterChange({ ...filters, dateFrom: e.target.value })} />
                <span className="text-gray-400 text-sm">–</span>
                <input type="date" className="p-2 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={filters.dateTo} onChange={e => handleFilterChange({ ...filters, dateTo: e.target.value })} />

                <select className="p-2 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[140px]" value={filters.status} onChange={e => handleFilterChange({ ...filters, status: e.target.value as any })}>
                    <option value="">Все статусы</option>
                    {Object.values(WaybillStatus).map(s => <option key={s} value={s}>{WAYBILL_STATUS_TRANSLATIONS[s]}</option>)}
                </select>

                <select className="p-2 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[140px]" value={filters.vehicleId} onChange={e => handleFilterChange({ ...filters, vehicleId: e.target.value })}>
                    <option value="">Все ТС</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                </select>

                <select className="p-2 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[140px]" value={filters.driverId} onChange={e => handleFilterChange({ ...filters, driverId: e.target.value })}>
                    <option value="">Все водители</option>
                    {employees.filter(e => e.employeeType === 'driver').map(d => <option key={d.id} value={d.id}>{d.shortName}</option>)}
                </select>

                <button onClick={() => handleFilterChange({ dateFrom: '', dateTo: '', status: '', vehicleId: '', driverId: '' })} className="ml-auto px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors">
                    Сбросить
                </button>
            </div>

            {/* --- SELECTION TOOLBAR --- */}
            {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg animate-fade-in shadow-sm">
                    <span className="font-semibold text-blue-800 dark:text-blue-300 text-sm ml-2">Выбрано: {selectedIds.size}</span>
                    <div className="h-4 w-px bg-blue-200 dark:bg-blue-700"></div>

                    {can('waybill.post') && (
                        <button onClick={() => handleBulkStatusChange(WaybillStatus.POSTED)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors">
                            <CheckCircleIcon className="h-4 w-4" /> Провести
                        </button>
                    )}

                    {can('waybill.correct') && (
                        <button onClick={() => handleBulkStatusChange(WaybillStatus.DRAFT)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-yellow-500 text-white hover:bg-yellow-600 transition-colors">
                            <ArrowUturnLeftIcon className="h-4 w-4" /> Корректировка
                        </button>
                    )}

                    <button onClick={handleBulkDeleteClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">
                        <TrashIcon className="h-4 w-4" /> Удалить
                    </button>

                    <button onClick={handleExportSelected} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors ml-auto">
                        <ExcelIcon className="h-4 w-4 text-green-600" /> Экспорт
                    </button>
                </div>
            )}

            {/* --- TABLE WITH DnD --- */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => { setActiveColId(null); onDragEnd(e); }}
                onDragStart={(e) => setActiveColId(String(e.active.id))}
            >
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20">
                                <tr>
                                    <th className="p-4 w-10 text-center sticky left-0 z-20 bg-gray-50 dark:bg-gray-800">
                                        <input type="checkbox" checked={isAllSelected} onChange={e => handleSelectAll(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                    </th>
                                    <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                                        {columns.map((col) => (
                                            <SortableHeader
                                                key={col.id}
                                                id={col.id}
                                                asTh
                                                className={`p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none whitespace-nowrap bg-gray-50 dark:bg-gray-800 ${col.className?.includes('text-center') ? 'text-center' : ''}`}
                                                onClick={() => col.sortKey && handleSort(col.sortKey as string)}
                                            >
                                                <div className={`flex items-center gap-1 ${col.className?.includes('text-center') ? 'justify-center' : ''}`}>
                                                    {col.label}
                                                    {sortConfig.key === col.sortKey && (
                                                        <span className="text-blue-600 dark:text-blue-400">
                                                            {sortConfig.direction === 'asc' ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                                                        </span>
                                                    )}
                                                </div>
                                            </SortableHeader>
                                        ))}
                                    </SortableContext>
                                    <th className="p-4 text-center sticky right-0 z-20 bg-gray-50 dark:bg-gray-800 shadow-l">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {processedData.map(w => (
                                    <tr key={w.id} className={`group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedIds.has(w.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                                        <td className="p-4 text-center sticky left-0 bg-inherit z-10">
                                            <input type="checkbox" checked={selectedIds.has(w.id)} onChange={e => handleSelectRow(w.id, e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                        </td>
                                        {columns.map(col => (
                                            <td key={col.id} className={`p-4 whitespace-nowrap ${col.className || ''}`}>
                                                {col.render(w)}
                                            </td>
                                        ))}
                                        <td className="p-4 text-center sticky right-0 bg-inherit z-10 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 transition-colors">
                                            <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEdit(w)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Редактировать">
                                                    <PencilIcon className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handlePrintClick(w)} className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors" title="Печать">
                                                    <PrinterIcon className="h-4 w-4" />
                                                </button>
                                                {w.status !== WaybillStatus.POSTED && (
                                                    <button onClick={() => handleDeleteClick(w)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Удалить">
                                                        <TrashIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {processedData.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={columns.length + 2} className="p-12 text-center text-gray-500">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                                    <PrinterIcon className="h-8 w-8 text-gray-400" />
                                                </div>
                                                <p className="text-lg font-medium text-gray-900 dark:text-white">Список пуст</p>
                                                <p className="text-sm">Попробуйте изменить фильтры или создайте новый документ</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {isLoading && processedData.length === 0 && (
                                    <tr>
                                        <td colSpan={columns.length + 2} className="p-12 text-center text-gray-500">
                                            <div className="animate-pulse flex flex-col items-center">
                                                <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                                                <div className="h-3 w-24 bg-gray-200 rounded"></div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            Страница <span className="font-medium text-gray-900 dark:text-white">{page}</span> из {totalPages || 1}
                            <span className="ml-2 text-gray-400">|</span>
                            <span className="ml-2">Всего: {totalCount}</span>
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1 || isLoading}
                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                Назад
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages || totalPages === 0 || isLoading}
                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                Вперед
                            </button>
                        </div>
                    </div>
                </div>

                {createPortal(
                    <DragOverlay>
                        {activeColumn ? (
                            <div className="bg-white dark:bg-gray-800 shadow-lg p-3 rounded border dark:border-gray-600 font-bold opacity-80 cursor-grabbing flex items-center gap-2">
                                {activeColumn.label}
                            </div>
                        ) : null}
                    </DragOverlay>,
                    document.body
                )}
            </DndContext>

            {/* Modals Injection */}
            {isDetailModalOpen && (
                <Modal
                    isOpen={true}
                    onClose={handleDetailClose}
                    title={selectedWaybill ? `ПЛ №${selectedWaybill.number}` : "Новый путевой лист"}
                    isDraggable={true}
                    isResizable={true}
                >
                    <WaybillDetail
                        waybill={selectedWaybill}
                        onClose={handleDetailClose}
                        isPrefill={!selectedWaybill}
                    />
                </Modal>
            )}

            {isCheckModalOpen && (
                <WaybillCheckModal isOpen={true} onClose={() => setIsCheckModalOpen(false)} onOpenWaybill={handleCheckModalOpenWaybill} />
            )}

            {isBatchModalOpen && (
                <BatchGeneratorModal onClose={() => setIsBatchModalOpen(false)} onSuccess={() => { setIsBatchModalOpen(false); refetch(); }} />
            )}

            {isExcelImportModalOpen && (
                <ExcelImportModal onClose={() => setIsExcelImportModalOpen(false)} onSuccess={() => { refetch(); }} />
            )}

            {isSeasonModalOpen && (
                <SeasonSettingsModal isOpen={true} onClose={() => setIsSeasonModalOpen(false)} />
            )}

            {isRecalcChainModalOpen && (
                <RecalculateChainModal onClose={() => setIsRecalcChainModalOpen(false)} onSuccess={() => refetch()} />
            )}

            {waybillToPrint && (
                <PrintableWaybill
                    {...getPrintProps(waybillToPrint)}
                    onClose={() => setWaybillToPrint(null)}
                />
            )}

            <ConfirmationModal
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={handleConfirmDelete}
                title="Удалить путевой лист?"
                message={`Вы уверены, что хотите удалить ПЛ №${deleteConfirm?.number}?`}
                confirmText="Удалить"
                confirmButtonClass="bg-red-600 hover:bg-red-700"
                isLoading={isBulkProcessing}
            >
                <div className="mt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={markBlanksAsSpoiled}
                            onChange={(e) => setMarkBlanksAsSpoiled(e.target.checked)}
                            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Списать связанные бланки как испорченные</span>
                    </label>
                </div>
            </ConfirmationModal>

            <ConfirmationModal
                isOpen={!!statusChangeConfirm}
                onClose={() => setStatusChangeConfirm(null)}
                onConfirm={performBulkStatusChange}
                title="Изменить статус выбранных?"
                confirmText={isBulkProcessing ? "Обработка..." : "Подтвердить"}
                confirmButtonClass="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                isLoading={isBulkProcessing}
            >
                {isBulkProcessing ? (
                    <div className="flex flex-col items-center">
                        <p>Обработка...</p>
                        {bulkProgress && (
                            <p className="text-xs text-gray-500 mt-1">
                                {bulkProgress.processed} / {bulkProgress.total}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-gray-600 dark:text-gray-300">
                        {`Вы собираетесь изменить статус ${statusChangeConfirm?.ids.length} документов на "${WAYBILL_STATUS_TRANSLATIONS[statusChangeConfirm?.status || 'Draft']}". Это действие пересчитает балансы, пробеги и износ шин. Это может занять некоторое время.`}
                    </p>
                )}
            </ConfirmationModal>

            <ConfirmationModal
                isOpen={!!bulkDeleteIds}
                onClose={() => setBulkDeleteIds(null)}
                onConfirm={performBulkDelete}
                title="Удалить выбранные?"
                message={`Вы уверены, что хотите удалить ${bulkDeleteIds?.length} документов? Это действие необратимо (для черновиков).`}
                confirmText={`Удалить (${bulkDeleteIds?.length})`}
                confirmButtonClass="bg-red-600 hover:bg-red-700"
                isLoading={isBulkProcessing}
            >
                <div className="mt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={markBlanksAsSpoiled}
                            onChange={(e) => setMarkBlanksAsSpoiled(e.target.checked)}
                            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Списать связанные бланки как испорченные</span>
                    </label>
                </div>
            </ConfirmationModal>
        </div>
    );
};

export default WaybillList;