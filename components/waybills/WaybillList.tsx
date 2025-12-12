
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Waybill, WaybillStatus, Vehicle, Employee, Organization } from '../../types';
import { 
    useInfiniteWaybills, 
    useChangeWaybillStatus, 
    useChangeWaybillStatusBulk, // Added
    useDeleteWaybill,
    useVehicles,
    useEmployees,
    useOrganizations,
    useAppSettings,
    useWaybills,
    useFuelTypes 
} from '../../hooks/queries';
import { validateBatchCorrection, getWaybills, fetchWaybillById } from '../../services/mockApi';
import { WaybillDetail } from './WaybillDetail';
import WaybillCheckModal from './WaybillCheckModal';
import SeasonSettingsModal from './SeasonSettingsModal';
import RecalculateChainModal from './RecalculateChainModal';
import PrintableWaybill from './PrintableWaybill';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import { 
    PlusIcon, PencilIcon, TrashIcon, DocumentTextIcon, 
    CheckCircleIcon, ArrowUturnLeftIcon, FunnelIcon, 
    DownloadIcon, SparklesIcon, PrinterIcon, CalendarDaysIcon,
    ArrowUpIcon, ArrowDownIcon, ExcelIcon, ArrowPathIcon
} from '../Icons';
import { WAYBILL_STATUS_TRANSLATIONS, WAYBILL_STATUS_COLORS } from '../../constants';
import { useAuth } from '../../services/auth';
import BatchGeneratorModal from './BatchGeneratorModal';
import ExcelImportModal from './ExcelImportModal'; // NEW Import
import * as XLSX from 'xlsx';

interface WaybillListProps {
    waybillToOpen: string | null;
    onWaybillOpened: () => void;
}

// Helper type for enriched data row
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

// Column definition
interface ColumnConfig {
    id: string;
    label: React.ReactNode;
    sortKey?: keyof EnrichedWaybill | 'date'; // specific keys we want to sort by
    render: (row: EnrichedWaybill) => React.ReactNode;
    className?: string; // for header and cell alignment
}

const WaybillList: React.FC<WaybillListProps> = ({ waybillToOpen, onWaybillOpened }) => {
    const { showToast } = useToast();
    const { can, currentUser } = useAuth();
    const { data: settings } = useAppSettings();

    // --- State ---
    const [filters, setFilters] = useState({
        dateFrom: '',
        dateTo: '',
        status: '' as WaybillStatus | '',
        vehicleId: '',
        driverId: '',
    });
    
    const { data: allWaybills = [], refetch } = useWaybills(); 

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isExtendedMode, setIsExtendedMode] = useState(true);

    // Modals
    const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false); // NEW State
    const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
    const [isRecalcChainModalOpen, setIsRecalcChainModalOpen] = useState(false);
    
    // Print State
    const [waybillToPrint, setWaybillToPrint] = useState<Waybill | null>(null);
    
    // Actions
    const [deleteConfirm, setDeleteConfirm] = useState<Waybill | null>(null);
    const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
    const [statusChangeConfirm, setStatusChangeConfirm] = useState<{ ids: string[]; status: WaybillStatus } | null>(null);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ processed: number; total: number } | null>(null);
    
    // Checkbox state for delete actions
    const [markBlanksAsSpoiled, setMarkBlanksAsSpoiled] = useState(false);

    // Sorting State: Default oldest first (asc)
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ 
        key: 'date', 
        direction: 'asc' 
    });

    // --- Data Hooks ---
    const { data: vehicles = [] } = useVehicles();
    const { data: employees = [] } = useEmployees();
    const { data: organizations = [] } = useOrganizations();
    const { data: fuelTypes = [] } = useFuelTypes();

    // Mutations
    const changeStatusMutation = useChangeWaybillStatus();
    const changeStatusBulkMutation = useChangeWaybillStatusBulk(); // New bulk mutation
    const deleteMutation = useDeleteWaybill();

    // --- Handlers Definitions (moved up to be used in columns) ---
    const handleEdit = (wb: Waybill) => {
        setSelectedWaybill(wb);
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
        setMarkBlanksAsSpoiled(false); // Reset to default: return to driver
        setDeleteConfirm(wb);
    };

    const handlePrintClick = async (wb: Waybill) => {
        setWaybillToPrint(wb);
    };

    // --- Column Configuration ---
    
    const extendedColumnsConfig: ColumnConfig[] = [
        { 
            id: 'number', 
            label: '№ ПЛ', 
            sortKey: 'number',
            render: (w) => (
                <>
                    {w.number}
                    <div className="text-[10px] text-gray-500 font-normal">{w.vehiclePlate}</div>
                </>
            )
        },
        { 
            id: 'validFrom', 
            label: 'Выезд', 
            sortKey: 'validFrom',
            render: (w) => (
                <>
                    <div>{w.depDateStr}</div>
                    <div className="text-gray-400 text-xs">{w.depTimeStr}</div>
                </>
            )
        },
        { 
            id: 'validTo', 
            label: 'Возврат', 
            sortKey: 'validTo',
            render: (w) => (
                <>
                    <div>{w.retDateStr}</div>
                    <div className="text-gray-400 text-xs">{w.retTimeStr}</div>
                </>
            )
        },
        { 
            id: 'odometerStart', 
            label: <>Одометр<br/>(Нач)</>, 
            sortKey: 'odometerStart',
            className: 'text-right',
            render: (w) => <span className="font-mono">{w.odometerStart}</span>
        },
        { 
            id: 'odometerEnd', 
            label: <>Одометр<br/>(Кон)</>, 
            sortKey: 'odometerEnd',
            className: 'text-right',
            render: (w) => <span className="font-mono">{w.odometerEnd || '-'}</span>
        },
        { 
            id: 'mileage', 
            label: 'Пробег', 
            sortKey: 'mileage',
            className: 'text-right',
            render: (w) => <span className="font-bold text-gray-800 dark:text-white">{w.mileage}</span>
        },
        { 
            id: 'fuelAtStart', 
            label: <>Топливо<br/>(Нач)</>, 
            sortKey: 'fuelAtStart',
            className: 'text-right',
            render: (w) => <span className={`font-mono ${ (w.fuelAtStart || 0) < 0 ? 'text-red-600 font-bold' : '' }`}>{(w.fuelAtStart || 0).toFixed(2)}</span>
        },
        { 
            id: 'fuelAtEnd', 
            label: <>Топливо<br/>(Кон)</>, 
            sortKey: 'fuelAtEnd',
            className: 'text-right',
            render: (w) => <span className={`font-mono ${ (w.fuelAtEnd || 0) < 0 ? 'text-red-600 font-bold' : '' }`}>{(w.fuelAtEnd || 0).toFixed(2)}</span>
        },
        { 
            id: 'norm', 
            label: <>Норма<br/>л/100км</>, 
            className: 'text-right',
            render: (w) => <span className="text-gray-500">{w.mileage > 0 ? ((w.fuelPlanned || 0) / w.mileage * 100).toFixed(1) : '-'}</span>
        },
        { 
            id: 'status', 
            label: 'Статус', 
            sortKey: 'status',
            render: (w) => (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border ${WAYBILL_STATUS_COLORS[w.status]?.bg} ${WAYBILL_STATUS_COLORS[w.status]?.text} ${WAYBILL_STATUS_COLORS[w.status]?.iconBorder}`}>
                    {WAYBILL_STATUS_TRANSLATIONS[w.status]}
                </span>
            )
        }
    ];

    const standardColumnsConfig: ColumnConfig[] = [
        { 
            id: 'number', 
            label: '№ ПЛ', 
            sortKey: 'number',
            render: (w) => <span className="font-medium">{w.number}</span>
        },
        { 
            id: 'date', 
            label: 'Дата', 
            sortKey: 'date',
            render: (w) => w.docDateStr
        },
        { 
            id: 'vehicle', 
            label: 'ТС', 
            sortKey: 'vehicleId',
            render: (w) => (
                <div>
                    <div className="font-medium">{w.vehiclePlate}</div>
                    <div className="text-xs text-gray-500">{w.vehicleBrand}</div>
                </div>
            )
        },
        { 
            id: 'driver', 
            label: 'Водитель', 
            sortKey: 'driverId',
            render: (w) => w.driverName
        },
        { 
            id: 'org', 
            label: 'Организация', 
            sortKey: 'organizationId',
            render: (w) => w.organizationName
        },
        { 
            id: 'status', 
            label: 'Статус', 
            sortKey: 'status',
            render: (w) => (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border ${WAYBILL_STATUS_COLORS[w.status]?.bg} ${WAYBILL_STATUS_COLORS[w.status]?.text} ${WAYBILL_STATUS_COLORS[w.status]?.iconBorder}`}>
                    {WAYBILL_STATUS_TRANSLATIONS[w.status]}
                </span>
            )
        }
    ];

    const [columns, setColumns] = useState(extendedColumnsConfig);
    const [draggedColumnIndex, setDraggedColumnIndex] = useState<number | null>(null);

    useEffect(() => {
        setColumns(isExtendedMode ? extendedColumnsConfig : standardColumnsConfig);
    }, [isExtendedMode]);

    // --- Effects ---
    useEffect(() => {
        if (waybillToOpen) {
            const wb = allWaybills.find(w => w.id === waybillToOpen);
            if (wb) {
                handleEdit(wb);
                onWaybillOpened();
            }
        }
    }, [waybillToOpen, allWaybills]);

    // --- Filtering & Enrichment & Sorting ---
    
    const rawEnrichedData = useMemo(() => {
        return allWaybills.map(w => {
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
    }, [allWaybills, vehicles, employees, organizations]);

    const processedData = useMemo(() => {
        let data = rawEnrichedData.filter(w => {
            const wDate = w.date ? w.date.split('T')[0] : '';
            if (filters.dateFrom && wDate < filters.dateFrom) return false;
            if (filters.dateTo && wDate > filters.dateTo) return false;
            if (filters.status && w.status !== filters.status) return false;
            if (filters.vehicleId && w.vehicleId !== filters.vehicleId) return false;
            if (filters.driverId && w.driverId !== filters.driverId) return false;
            return true;
        });

        data.sort((a, b) => {
            const { key, direction } = sortConfig;
            let valA = a[key as keyof EnrichedWaybill];
            let valB = b[key as keyof EnrichedWaybill];

            if (key === 'date' || key === 'validFrom' || key === 'validTo') {
                const timeA = new Date(valA as string).getTime();
                const timeB = new Date(valB as string).getTime();
                return direction === 'asc' ? timeA - timeB : timeB - timeA;
            }

            if (typeof valA === 'number' && typeof valB === 'number') {
                return direction === 'asc' ? valA - valB : valB - valA;
            }

            const strA = String(valA || '').toLowerCase();
            const strB = String(valB || '').toLowerCase();
            if (strA < strB) return direction === 'asc' ? -1 : 1;
            if (strA > strB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        return data;
    }, [rawEnrichedData, filters, sortConfig]);


    // --- Other Handlers ---

    const handleCreate = () => {
        setSelectedWaybill(null);
        setIsDetailModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!deleteConfirm) return;
        try {
            await deleteMutation.mutateAsync({ id: deleteConfirm.id, markAsSpoiled: markBlanksAsSpoiled });
            showToast('Путевой лист удален', 'success');
            setDeleteConfirm(null);
            refetch();
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
        const { ids, status } = statusChangeConfirm;
        setIsBulkProcessing(true);
        setBulkProgress({ processed: 0, total: ids.length });
        
        // Chunk size for UI responsiveness (200 is a good balance)
        const CHUNK_SIZE = 200; 
        let totalProcessed = 0;
        let totalErrors = 0;
        const allErrors: string[] = [];

        try {
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                
                // Execute bulk mutation for this chunk
                const result = await changeStatusBulkMutation.mutateAsync({
                    ids: chunk,
                    status,
                    context: { 
                        userId: currentUser?.id,
                        appMode: settings?.appMode,
                        reason: status === WaybillStatus.DRAFT ? 'Массовая корректировка' : undefined 
                    }
                });

                if (result.success) {
                    totalProcessed += result.updatedWaybills.length;
                    totalErrors += result.errors.length;
                    if (result.errors.length > 0) allErrors.push(...result.errors);
                } else {
                    totalErrors += chunk.length;
                    allErrors.push('Chunk failed completely');
                }
                
                setBulkProgress({ processed: Math.min(i + CHUNK_SIZE, ids.length), total: ids.length });

                // YIELD TO EVENT LOOP to unfreeze UI
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            if (totalProcessed > 0) {
                showToast(`Обработано документов: ${totalProcessed}`, 'success');
            }
            
            if (totalErrors > 0) {
                console.warn('Errors during bulk processing:', allErrors);
                showToast(`Не удалось обработать: ${totalErrors} документов.`, 'info');
            }

            setStatusChangeConfirm(null);
            setSelectedIds(new Set());
            await refetch();
        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Критическая ошибка при пакетной обработке', 'error');
        } finally {
            setIsBulkProcessing(false);
            setBulkProgress(null);
        }
    };

    const handleBulkDeleteClick = () => {
        const ids = Array.from(selectedIds) as string[];
        const hasPosted = processedData.some(w => ids.includes(w.id) && w.status === WaybillStatus.POSTED);
        
        if (hasPosted) {
            showToast('В выборке есть проведенные ПЛ. Удаление невозможно. Сначала отмените проведение или исключите их.', 'error');
            return;
        }
        setMarkBlanksAsSpoiled(false); 
        setBulkDeleteIds(ids);
    };

    const performBulkDelete = async () => {
        if (!bulkDeleteIds) return;
        
        let successCount = 0;
        let failCount = 0;

        // Note: Bulk Delete API not yet available, using loop for delete is less critical than status change
        // as deletions are rare and usually on drafts.
        for (const id of bulkDeleteIds) {
            try {
                await deleteMutation.mutateAsync({ id, markAsSpoiled: markBlanksAsSpoiled });
                successCount++;
            } catch (e) {
                console.error(e);
                failCount++;
            }
        }

        showToast(`Удалено: ${successCount}. Ошибок: ${failCount}`, failCount > 0 ? 'info' : 'success');
        setBulkDeleteIds(null);
        setSelectedIds(new Set());
        refetch();
    };

    const handleCheckModalOpenWaybill = (waybillId: string) => {
        setIsCheckModalOpen(false);
        const wb = allWaybills.find(w => w.id === waybillId);
        if (wb) {
            setSelectedWaybill(wb);
            setIsDetailModalOpen(true);
        } else {
            showToast('Путевой лист не найден', 'error');
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
        if (checked) {
            setSelectedIds(new Set(processedData.map(w => w.id)));
        } else {
            setSelectedIds(new Set());
        }
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

    const onDragStart = (e: React.DragEvent<HTMLTableHeaderCellElement>, index: number) => {
        setDraggedColumnIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = (e: React.DragEvent<HTMLTableHeaderCellElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const onDrop = (e: React.DragEvent<HTMLTableHeaderCellElement>, index: number) => {
        e.preventDefault();
        if (draggedColumnIndex === null || draggedColumnIndex === index) return;

        const newColumns = [...columns];
        const [movedColumn] = newColumns.splice(draggedColumnIndex, 1);
        newColumns.splice(index, 0, movedColumn);
        
        setColumns(newColumns);
        setDraggedColumnIndex(null);
    };

    const getPrintProps = (wb: Waybill) => {
        const vehicle = vehicles.find(v => v.id === wb.vehicleId);
        const driver = employees.find(e => e.id === wb.driverId);
        const org = organizations.find(o => o.id === wb.organizationId);
        const dispatcher = employees.find(e => e.id === wb.dispatcherId);
        const controller = employees.find(e => e.id === wb.controllerId);
        const fuelType = fuelTypes.find(f => f.id === vehicle?.fuelTypeId);

        return {
            waybill: wb,
            vehicle,
            driver,
            organization: org,
            dispatcher,
            controller,
            fuelType,
            allOrganizations: organizations
        };
    };

    return (
        <div className="space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                <div className="flex items-center gap-4">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Путевые листы</h3>
                    <span className="text-sm text-gray-500">Найдено записей: {processedData.length}</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                        <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                            checked={isExtendedMode}
                            onChange={(e) => setIsExtendedMode(e.target.checked)}
                        />
                        Расширенный журнал
                    </label>
                    
                    {can('waybill.create') && (
                        <button onClick={() => setIsRecalcChainModalOpen(true)} className="flex items-center gap-2 bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold py-2 px-4 rounded-lg shadow-sm hover:bg-indigo-200 transition-colors text-sm" title="Пересчитать цепочку черновиков">
                            <ArrowPathIcon className="h-4 w-4" /> Пересчет цепочки
                        </button>
                    )}

                    {can('waybill.create') && (
                        <button onClick={() => setIsExcelImportModalOpen(true)} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-sm hover:bg-green-700 transition-colors text-sm">
                            <ExcelIcon className="h-4 w-4" /> Импорт из Excel
                        </button>
                    )}

                    {can('waybill.create') && (
                        <button onClick={() => setIsBatchModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors text-sm">
                            <SparklesIcon className="h-4 w-4" /> Пакетная загрузка
                        </button>
                    )}
                    
                    <button onClick={() => setIsSeasonModalOpen(true)} className="flex items-center gap-2 bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg shadow-sm hover:bg-gray-700 transition-colors text-sm">
                        <CalendarDaysIcon className="h-4 w-4" /> Настроить сезоны
                    </button>

                    {can('waybill.create') && (
                        <button onClick={handleCreate} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-sm hover:bg-blue-700 transition-colors text-sm">
                            <PlusIcon className="h-4 w-4" /> Создать новый
                        </button>
                    )}
                </div>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap gap-2 items-center">
                <input type="date" className="p-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} placeholder="ДД.ММ.ГГГГ" />
                <input type="date" className="p-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} placeholder="ДД.ММ.ГГГГ" />
                
                <select className="p-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value as any})}>
                    <option value="">Все статусы</option>
                    {Object.values(WaybillStatus).map(s => <option key={s} value={s}>{WAYBILL_STATUS_TRANSLATIONS[s]}</option>)}
                </select>

                <select className="p-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white max-w-xs" value={filters.vehicleId} onChange={e => setFilters({...filters, vehicleId: e.target.value})}>
                    <option value="">Все ТС</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                </select>

                <select className="p-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white max-w-xs" value={filters.driverId} onChange={e => setFilters({...filters, driverId: e.target.value})}>
                    <option value="">Все водители</option>
                    {employees.filter(e => e.employeeType === 'driver').map(d => <option key={d.id} value={d.id}>{d.shortName}</option>)}
                </select>

                <button onClick={() => setFilters({ dateFrom: '', dateTo: '', status: '', vehicleId: '', driverId: '' })} className="px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-sm text-gray-700 dark:text-gray-300">
                    ✕ Сбросить
                </button>
            </div>

            {/* Selection Toolbar */}
            {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg animate-fade-in">
                    <span className="font-semibold text-blue-800 dark:text-blue-300 text-sm">Выбрано: {selectedIds.size}</span>
                    
                    {can('waybill.post') && (
                        <button onClick={() => handleBulkStatusChange(WaybillStatus.POSTED)} className="flex items-center gap-1.5 bg-green-600 text-white py-1.5 px-3 rounded text-sm hover:bg-green-700">
                            <CheckCircleIcon className="h-4 w-4" /> Провести
                        </button>
                    )}
                    
                    {can('waybill.correct') && (
                        <button onClick={() => handleBulkStatusChange(WaybillStatus.DRAFT)} className="flex items-center gap-1.5 bg-yellow-500 text-white py-1.5 px-3 rounded text-sm hover:bg-yellow-600">
                            <ArrowUturnLeftIcon className="h-4 w-4" /> Корректировка
                        </button>
                    )}
                    
                    <button onClick={handleBulkDeleteClick} className="flex items-center gap-1.5 bg-red-600 text-white py-1.5 px-3 rounded text-sm hover:bg-red-700">
                        <TrashIcon className="h-4 w-4" /> Удалить
                    </button>

                    <button onClick={handleExportSelected} className="flex items-center gap-1.5 bg-green-600 text-white py-1.5 px-3 rounded text-sm hover:bg-green-700 ml-auto">
                        <ExcelIcon className="h-4 w-4" /> Экспорт
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300">
                        <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase font-bold border-b border-gray-200 dark:border-gray-600">
                            <tr>
                                <th className="p-3 w-8 text-center sticky left-0 z-10 bg-gray-50 dark:bg-gray-700">
                                    <input type="checkbox" checked={isAllSelected} onChange={e => handleSelectAll(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                </th>
                                
                                {columns.map((col, index) => (
                                    <th 
                                        key={col.id} 
                                        className={`p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors select-none ${col.className || ''}`}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, index)}
                                        onDragOver={onDragOver}
                                        onDrop={(e) => onDrop(e, index)}
                                        onClick={() => col.sortKey && handleSort(col.sortKey as string)}
                                        title="Перетащите, чтобы изменить порядок. Нажмите, чтобы сортировать."
                                    >
                                        <div className={`flex items-center gap-1 ${col.className?.includes('text-right') ? 'justify-end' : ''}`}>
                                            {col.label}
                                            {sortConfig.key === col.sortKey && (
                                                <span className="text-blue-600 dark:text-blue-400">
                                                    {sortConfig.direction === 'asc' ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                ))}

                                <th className="p-3 text-center sticky right-0 z-10 bg-gray-50 dark:bg-gray-700">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {processedData.map(w => (
                                <tr key={w.id} className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${selectedIds.has(w.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                    <td className="p-3 text-center sticky left-0 bg-inherit z-10">
                                        <input type="checkbox" checked={selectedIds.has(w.id)} onChange={e => handleSelectRow(w.id, e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    </td>
                                    
                                    {columns.map(col => (
                                        <td key={col.id} className={`p-3 whitespace-nowrap ${col.className || ''}`}>
                                            {col.render(w)}
                                        </td>
                                    ))}

                                    <td className="p-3 text-center flex justify-center gap-2 sticky right-0 bg-inherit z-10">
                                        <button onClick={() => handleEdit(w)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="Редактировать">
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => handlePrintClick(w)} className="p-1 text-teal-600 hover:bg-teal-100 rounded" title="Печать">
                                            <PrinterIcon className="h-4 w-4" />
                                        </button>
                                        {w.status !== WaybillStatus.POSTED && (
                                            <button onClick={() => handleDeleteClick(w)} className="p-1 text-red-600 hover:bg-red-100 rounded" title="Удалить">
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {processedData.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length + 2} className="p-8 text-center text-gray-500">Записей не найдено</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {isDetailModalOpen && (
                <Modal isOpen={true} onClose={handleDetailClose} title={selectedWaybill ? `ПЛ №${selectedWaybill.number}` : "Новый путевой лист"}>
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
            
            {/* Floating FAB for Check Modal */}
            <button 
                onClick={() => setIsCheckModalOpen(true)} 
                className="fixed bottom-6 right-6 bg-indigo-600 text-white p-3 rounded-full shadow-lg hover:bg-indigo-700 transition-transform hover:scale-105 z-40 flex items-center justify-center"
                title="Проверка ПЛ"
            >
                <CheckCircleIcon className="h-6 w-6" />
            </button>
        </div>
    );
};

export default WaybillList;
