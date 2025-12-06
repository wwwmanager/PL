
import React, { useState, useEffect, useMemo } from 'react';
import { Waybill, WaybillStatus } from '../../types';
import { WAYBILL_STATUS_COLORS, WAYBILL_STATUS_TRANSLATIONS } from '../../constants';
import { PlusIcon, PencilIcon, TrashIcon, StatusCompletedIcon, CalendarDaysIcon, ArrowUpTrayIcon, CheckCircleIcon, XIcon, ArrowUturnLeftIcon } from '../Icons';
import { WaybillDetail } from './WaybillDetail';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import SeasonSettingsModal from './SeasonSettingsModal';
import BatchGeneratorModal from './BatchGeneratorModal'; 
import { VirtualDataTable, Column } from '../shared/VirtualDataTable';
import { useAuth } from '../../services/auth';
import { broadcast } from '../../services/bus';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRepoCache, validateBatchCorrection } from '../../services/mockApi';
import { calculateStats } from '../../utils/waybillCalculations';
import { 
    useInfiniteWaybills,
    useVehicles, 
    useEmployees, 
    useOrganizations, 
    useAppSettings,
    useDeleteWaybill,
    useChangeWaybillStatus,
    useSeasonSettings
} from '../../hooks/queries';
import CorrectionReasonModal from './CorrectionReasonModal';

// Helper type for enriched data
type EnrichedWaybill = Waybill & { 
    mileage?: number; 
    vehicle?: string; 
    driver?: string; 
    organization?: string; 
    validFromFormatted?: string; 
    validToFormatted?: string; 
    dateFormatted?: string; 
    calculatedRate?: number;
};

interface WaybillListProps {
  waybillToOpen: string | null;
  onWaybillOpened: () => void;
}

const getStatusIcon = (status: WaybillStatus) => {
    switch (status) {
        case WaybillStatus.DRAFT: return <PencilIcon className="h-4 w-4" />;
        case WaybillStatus.POSTED: return <StatusCompletedIcon className="h-5 w-5" />;
        default: return null;
    }
};

const STORAGE_KEY_SETTINGS = 'waybill_journal_settings_v3'; // Incremented version for new structure

const WaybillList: React.FC<WaybillListProps> = ({ waybillToOpen, onWaybillOpened }) => {
  // --- Persistent Settings ---
  const [savedSettings, setSavedSettings] = useState(() => {
      try {
          const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
          return saved ? JSON.parse(saved) : { 
              filters: { dateFrom: '', dateTo: '', status: '', driverId: '', vehicleId: '' },
              sort: { key: 'date', direction: 'desc' }
          };
      } catch {
          return { 
              filters: { dateFrom: '', dateTo: '', status: '', driverId: '', vehicleId: '' },
              sort: { key: 'date', direction: 'desc' }
          };
      }
  });

  const [filters, setFilters] = useState(savedSettings.filters);
  const [sort, setSort] = useState(savedSettings.sort);

  // Clean filters before passing to query (remove empty strings)
  const activeFilters = useMemo(() => {
      const clean: any = {};
      Object.keys(filters).forEach(key => {
          if (filters[key] !== '') clean[key] = filters[key];
      });
      return clean;
  }, [filters]);

  // --- Queries ---
  const { 
      data, 
      fetchNextPage, 
      hasNextPage, 
      isFetchingNextPage, 
      isLoading: isWaybillsLoading 
  } = useInfiniteWaybills(activeFilters, sort);

  const { data: vehicles = [] } = useVehicles();
  const { data: employees = [] } = useEmployees();
  const { data: organizations = [] } = useOrganizations();
  const { data: appSettings } = useAppSettings();
  const { data: seasonSettings } = useSeasonSettings();

  // Mutations
  const deleteWaybillMutation = useDeleteWaybill();
  const changeStatusMutation = useChangeWaybillStatus();
  const queryClient = useQueryClient();

  // Local UI State
  const [selectedWaybillId, setSelectedWaybillId] = useState<string | null>(null);
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);
  const [waybillToPrefill, setWaybillToPrefill] = useState<Waybill | null>(null);
  // Defaulting to true for Extended View
  const [isExtendedView, setIsExtendedView] = useState(true);
  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkCorrectionModalOpen, setIsBulkCorrectionModalOpen] = useState(false);
  const [modalProps, setModalProps] = useState({ title: '', message: '', confirmText: '', confirmButtonClass: '', onConfirm: () => {}, secondaryAction: undefined as any });

  const { showToast } = useToast();
  const { currentUser, can } = useAuth();

  // Persist settings
  useEffect(() => {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({ filters, sort }));
  }, [filters, sort]);
  
  // Handle external link to waybill
  useEffect(() => {
    if (waybillToOpen) {
      setSelectedWaybillId(waybillToOpen);
      setWaybillToPrefill(null);
      setIsDetailViewOpen(true);
      onWaybillOpened();
    }
  }, [waybillToOpen, onWaybillOpened]);

  // Flatten pages for the virtual table
  const flatWaybills = useMemo(() => {
      return data?.pages.flatMap(page => page.data) || [];
  }, [data]);
  
  const totalCount = data?.pages[0]?.total || 0;

  // Enrich data for display
  const enrichedData = useMemo(() => {
    return flatWaybills.map((w) => {
        const vehicle = vehicles.find(v => v.id === w.vehicleId);
        const driver = employees.find(e => e.id === w.driverId);
        const org = organizations.find(o => o.id === w.organizationId);
        
        const mileage = (w.odometerEnd ?? w.odometerStart) - w.odometerStart;
        
        let calculatedRate = 0;
        
        if (vehicle && seasonSettings) {
             const dayMode = w.date === (w.validTo ? w.validTo.split('T')[0] : w.date) ? 'single' : 'multi';
             const stats = calculateStats(
                w.routes,
                vehicle,
                seasonSettings,
                w.date,
                dayMode
             );
             calculatedRate = stats.averageRate;
        } else {
             // Fallback
             if (mileage > 0 && w.fuelPlanned) {
                calculatedRate = (w.fuelPlanned / mileage) * 100;
             }
        }
        
        calculatedRate = Math.round(calculatedRate * 100) / 100;

        return {
            ...w,
            mileage,
            calculatedRate,
            vehicle: vehicle ? `${vehicle.plateNumber} (${vehicle.brand})` : '—',
            driver: driver ? driver.shortName : '—',
            organization: org ? org.shortName : '—',
            dateFormatted: new Date(w.date).toLocaleDateString('ru-RU'),
            validFromFormatted: w.validFrom ? new Date(w.validFrom).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—',
            validToFormatted: w.validTo ? new Date(w.validTo).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—',
        };
    });
  }, [flatWaybills, vehicles, employees, organizations, seasonSettings]);

  // --- Selection Handlers ---
  const handleSelectAll = (checked: boolean) => {
      if (checked) {
          // Select all currently loaded IDs
          setSelectedIds(new Set(flatWaybills.map(w => w.id)));
      } else {
          setSelectedIds(new Set());
      }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (checked) next.add(id);
          else next.delete(id);
          return next;
      });
  };

  const isAllLoadedSelected = flatWaybills.length > 0 && selectedIds.size === flatWaybills.length;

  const handleBulkPost = async () => {
      const idsToPost = Array.from(selectedIds);
      const targets = flatWaybills.filter(w => idsToPost.includes(w.id) && (w.status === WaybillStatus.DRAFT || w.status === WaybillStatus.SUBMITTED));
      
      if (targets.length === 0) {
          showToast('Нет подходящих ПЛ для проведения (только Черновики/Отправленные).', 'info');
          return;
      }

      setModalProps({
        title: 'Подтверждение проведения',
        message: `Вы уверены, что хотите провести ${targets.length} путевых листов?`,
        confirmText: 'Провести',
        confirmButtonClass: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
        onConfirm: async () => {
            setIsConfirmationModalOpen(false);
            try {
                // Sequential execution to handle potential conflicts safely
                for (const w of targets) {
                    await changeStatusMutation.mutateAsync({ 
                        id: w.id, 
                        status: WaybillStatus.POSTED, 
                        context: { userId: currentUser?.id, appMode: appSettings?.appMode || 'driver' } 
                    });
                }
                showToast(`Успешно проведено: ${targets.length}`, 'success');
                setSelectedIds(new Set());
            } catch (e) {
                showToast(`Ошибка при пакетном проведении: ${(e as Error).message}`, 'error');
            }
        },
        secondaryAction: undefined
      });
      setIsConfirmationModalOpen(true);
  };

  const handleBulkCorrectionStart = async () => {
      const ids = Array.from(selectedIds);
      const targets = flatWaybills.filter(w => ids.includes(w.id) && w.status === WaybillStatus.POSTED);
      
      if (targets.length === 0) {
          showToast('Нет подходящих ПЛ для корректировки (только Проведенные).', 'info');
          return;
      }
      
      // Perform strict validation: continuous chain from last posted per vehicle
      try {
          const validationResult = await validateBatchCorrection(targets.map(t => t.id));
          if (!validationResult.valid) {
              showToast(validationResult.error || 'Ошибка валидации.', 'error');
              return;
          }
          
          setIsBulkCorrectionModalOpen(true);
      } catch (e) {
          showToast('Ошибка при валидации: ' + (e as Error).message, 'error');
      }
  };

  const handleBulkCorrectionConfirm = async (reason: string) => {
      setIsBulkCorrectionModalOpen(false);
      const ids = Array.from(selectedIds);
      const targets = flatWaybills.filter(w => ids.includes(w.id) && w.status === WaybillStatus.POSTED);
      
      // Sort targets: NEWEST to OLDEST (LIFO unposting) to respect logic
      targets.sort((a, b) => {
          const timeA = new Date(a.date).getTime();
          const timeB = new Date(b.date).getTime();
          if (timeA !== timeB) return timeB - timeA;
          return b.number.localeCompare(a.number);
      });

      try {
          for (const w of targets) {
              await changeStatusMutation.mutateAsync({ 
                  id: w.id, 
                  status: WaybillStatus.DRAFT, 
                  context: { 
                      userId: currentUser?.id, 
                      appMode: appSettings?.appMode || 'driver',
                      reason: reason 
                  } 
              });
          }
          showToast(`Успешно возвращено в черновик: ${targets.length}`, 'success');
          setSelectedIds(new Set());
      } catch (e) {
          showToast(`Ошибка при корректировке: ${(e as Error).message}`, 'error');
      }
  };

  const handleBulkDelete = async () => {
      const idsToDelete = Array.from(selectedIds);
      const targets = flatWaybills.filter(w => idsToDelete.includes(w.id));
      
      // Filter out POSTED waybills
      const deletable = targets.filter(w => w.status !== WaybillStatus.POSTED);
      
      if (deletable.length === 0) {
          showToast('Нет подходящих ПЛ для удаления (Проведенные удалять нельзя).', 'info');
          return;
      }
      
      const skipped = targets.length - deletable.length;
      
      // Show Confirmation Modal for Bulk Delete
      const confirmDelete = async (markAsSpoiled: boolean) => {
          setIsBulkDeleteModalOpen(false);
          try {
              for (const w of deletable) {
                  await deleteWaybillMutation.mutateAsync({ id: w.id, markAsSpoiled });
              }
              showToast(`Удалено: ${deletable.length}. ${skipped > 0 ? `Пропущено (проведенные): ${skipped}` : ''}`, 'success');
              setSelectedIds(new Set());
          } catch (e) {
              showToast('Ошибка при удалении.', 'error');
          }
      };

      setModalProps({
        title: 'Пакетное удаление',
        message: `Удалить ${deletable.length} путевых листов? ${skipped > 0 ? `(${skipped} проведенных будет пропущено)` : ''} Что сделать с бланками?`,
        confirmText: 'Удалить (бланки испорчены)',
        confirmButtonClass: 'bg-yellow-600 hover:bg-yellow-700',
        onConfirm: () => confirmDelete(true),
        secondaryAction: {
            text: 'Удалить (вернуть бланки)',
            className: 'bg-red-600 hover:bg-red-700',
            onClick: () => confirmDelete(false)
        }
      });
      setIsBulkDeleteModalOpen(true);
  };


  const handleSort = (key: string) => {
      setSort((prev: any) => ({
          key,
          direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

  const handleResetFilters = () => {
      setFilters({ dateFrom: '', dateTo: '', status: '', driverId: '', vehicleId: '' });
      setSort({ key: 'date', direction: 'desc' });
      // Force refresh data from disk in case of "invisible" records after import
      broadcast('waybills');
      invalidateRepoCache('waybills');
      queryClient.invalidateQueries({ queryKey: ['waybills'] });
      showToast('Фильтры сброшены', 'info');
  };

  const columns: Column<EnrichedWaybill>[] = useMemo(() => {
    const statusRenderer = (w: EnrichedWaybill) => {
        const colors = WAYBILL_STATUS_COLORS[w.status];
        return (
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${colors?.bg} ${colors?.text}`}>
                {getStatusIcon(w.status)}
                {WAYBILL_STATUS_TRANSLATIONS[w.status]}
            </span>
        );
    };

    const numericRenderer = (val: number | undefined) => {
        if (val === undefined || val === null) return null;
        return <span className={val < 0 ? "text-red-600 font-bold" : ""}>{val}</span>;
    };

    const extendedColumns: Column<EnrichedWaybill>[] = [
        { key: 'number', label: '№ ПЛ', sortable: true, width: '100px' },
        { key: 'validFromFormatted', label: 'Выезд', sortable: true, width: '140px' },
        { key: 'validToFormatted', label: 'Возврат', sortable: true, width: '140px' },
        { key: 'odometerStart', label: 'Одометр (нач)', sortable: true, width: '120px' },
        { key: 'odometerEnd', label: 'Одометр (кон)', sortable: true, width: '120px' },
        { key: 'mileage', label: 'Пробег', sortable: true, width: '100px', render: (w) => numericRenderer(w.mileage) },
        { key: 'fuelAtStart', label: 'Топливо (нач)', sortable: true, width: '120px', render: (w) => numericRenderer(w.fuelAtStart) },
        { key: 'fuelAtEnd', label: 'Топливо (кон)', sortable: true, width: '120px', render: (w) => numericRenderer(w.fuelAtEnd) },
        { key: 'calculatedRate', label: 'Норма л/100км', sortable: true, width: '120px', render: (w) => numericRenderer(w.calculatedRate) },
        { key: 'status', label: 'Статус', sortable: true, render: statusRenderer, width: '140px' },
    ];

    const simpleColumns: Column<EnrichedWaybill>[] = [
        { key: 'number', label: '№ ПЛ', sortable: true, width: '100px' },
        { key: 'dateFormatted', label: 'Дата', sortable: true, width: '120px' },
        { key: 'vehicle', label: 'ТС', sortable: true },
        { key: 'driver', label: 'Водитель', sortable: true },
        { key: 'organization', label: 'Организация', sortable: true },
        { key: 'status', label: 'Статус', sortable: true, render: statusRenderer, width: '140px' },
    ];

    return isExtendedView ? extendedColumns : simpleColumns;
  }, [isExtendedView]); 


  const handleCreateNew = () => {
    setWaybillToPrefill(null); 
    setSelectedWaybillId(null);
    setIsDetailViewOpen(true);
  };

  const handleEdit = (waybill: Waybill) => {
    setSelectedWaybillId(waybill.id);
    setWaybillToPrefill(null);
    setIsDetailViewOpen(true);
  };
  
  const handleRequestDelete = (waybill: EnrichedWaybill) => {
    const onConfirmDelete = (markAsSpoiled: boolean) => {
        setIsConfirmationModalOpen(false);
        handleConfirmDelete(waybill.id, markAsSpoiled);
    };

    setModalProps({
        title: 'Подтвердить удаление',
        message: `Вы уверены, что хотите удалить путевой лист №${waybill.number}? Пометить бланк как испорченный?`,
        confirmText: 'Да, пометить испорченным',
        confirmButtonClass: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
        onConfirm: () => onConfirmDelete(true),
        secondaryAction: {
            text: 'Нет, вернуть в пачку',
            className: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
            onClick: () => onConfirmDelete(false),
        },
    } as any);
    setIsConfirmationModalOpen(true);
  };
  
  const handleConfirmDelete = async (waybillId: string, markAsSpoiled: boolean) => {
    try {
        await deleteWaybillMutation.mutateAsync({ id: waybillId, markAsSpoiled });
        showToast('Путевой лист удален.', 'info');
    } catch (error) {
        showToast((error as Error).message, 'error');
    } finally {
        setIsConfirmationModalOpen(false);
    }
  };

  const handleCloseDetail = () => {
    setIsDetailViewOpen(false);
    setSelectedWaybillId(null);
    setWaybillToPrefill(null);
  };

  if (isDetailViewOpen) {
    const selectedWaybill = selectedWaybillId ? flatWaybills.find(w => w.id === selectedWaybillId) ?? null : waybillToPrefill;
    const isPrefill = !selectedWaybillId && !!waybillToPrefill;
    return <WaybillDetail waybill={selectedWaybill} isPrefill={isPrefill} onClose={handleCloseDetail} />;
  }
  
  return (
    <>
      <ConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setIsConfirmationModalOpen(false)}
        {...modalProps}
      />
      <ConfirmationModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        {...modalProps}
      />
      <CorrectionReasonModal 
        isOpen={isBulkCorrectionModalOpen} 
        onClose={() => setIsBulkCorrectionModalOpen(false)} 
        onSubmit={handleBulkCorrectionConfirm} 
      />
      <SeasonSettingsModal
        isOpen={isSeasonModalOpen}
        onClose={() => setIsSeasonModalOpen(false)}
      />
      {isBatchModalOpen && (
        <BatchGeneratorModal 
            onClose={() => setIsBatchModalOpen(false)} 
            onSuccess={() => { setIsBatchModalOpen(false); }} 
        />
      )}
      
      {/* Explicitly setting height for virtual scrolling to work within the flex layout */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 flex flex-col h-[calc(100vh-10rem)]">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 flex-shrink-0">
          <div className="flex items-baseline gap-4">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Путевые листы</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">Найдено записей: {totalCount}</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
             <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={isExtendedView} onChange={e => setIsExtendedView(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="ml-2">Расширенный журнал</span>
            </label>
            <button onClick={() => setIsBatchModalOpen(true)} className="flex items-center gap-2 bg-indigo-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-600 transition-colors">
                <ArrowUpTrayIcon className="h-5 w-5" />
                Пакетная загрузка
            </button>
            <button onClick={() => setIsSeasonModalOpen(true)} className="flex items-center gap-2 bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-gray-600 transition-colors">
                <CalendarDaysIcon className="h-5 w-5" />
                Настроить сезоны
            </button>
            <button onClick={handleCreateNew} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                <PlusIcon className="h-5 w-5" />
                Создать новый
            </button>
          </div>
        </div>
        
        {/* Filters or Bulk Actions */}
        {selectedIds.size > 0 ? (
            <div className="flex flex-wrap gap-4 mb-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-lg items-center flex-shrink-0 animate-in fade-in slide-in-from-top-2">
                <span className="font-semibold text-blue-800 dark:text-blue-200">Выбрано: {selectedIds.size}</span>
                <div className="h-6 w-px bg-blue-200 dark:bg-blue-700 mx-2"></div>
                {can('waybill.post') && (
                    <button onClick={handleBulkPost} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-1.5 px-4 rounded-lg shadow hover:bg-green-700 transition-colors">
                        <CheckCircleIcon className="h-5 w-5" /> Провести
                    </button>
                )}
                {can('waybill.correct') && (
                    <button onClick={handleBulkCorrectionStart} className="flex items-center gap-2 bg-yellow-500 text-white font-semibold py-1.5 px-4 rounded-lg shadow hover:bg-yellow-600 transition-colors">
                        <ArrowUturnLeftIcon className="h-5 w-5" /> Корректировка
                    </button>
                )}
                {can('waybill.cancel') && (
                    <button onClick={handleBulkDelete} className="flex items-center gap-2 bg-red-600 text-white font-semibold py-1.5 px-4 rounded-lg shadow hover:bg-red-700 transition-colors">
                        <TrashIcon className="h-5 w-5" /> Удалить
                    </button>
                )}
                <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline">
                    Отмена
                </button>
            </div>
        ) : (
            <div className="flex flex-wrap gap-4 mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg items-center flex-shrink-0">
            <input type="date" value={filters.dateFrom || ''} onChange={e => setFilters({...filters, dateFrom: e.target.value})} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" placeholder="Дата с" />
            <input type="date" value={filters.dateTo || ''} onChange={e => setFilters({...filters, dateTo: e.target.value})} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" placeholder="Дата по" />
            
            <select value={filters.status || ''} onChange={e => setFilters({...filters, status: e.target.value as any})} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200">
                <option value="">Все статусы</option>
                {Object.entries(WAYBILL_STATUS_TRANSLATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>

            <select value={filters.vehicleId || ''} onChange={e => setFilters({...filters, vehicleId: e.target.value})} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200">
                <option value="">Все ТС</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} - {v.brand}</option>)}
            </select>

            <select value={filters.driverId || ''} onChange={e => setFilters({...filters, driverId: e.target.value})} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200">
                <option value="">Все водители</option>
                {employees.filter(e => e.employeeType === 'driver').map(d => <option key={d.id} value={d.id}>{d.shortName}</option>)}
            </select>

            <button onClick={handleResetFilters} title="Сбросить все фильтры" className="flex items-center gap-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2 px-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors ml-auto">
                <XIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Сбросить</span>
            </button>
            </div>
        )}

        {/* The VirtualDataTable will take 100% of this container */}
        <div className="flex-1 min-h-0 relative">
            <VirtualDataTable
                data={enrichedData}
                columns={columns}
                sortColumn={sort.key}
                sortDirection={sort.direction}
                onSort={handleSort}
                isLoading={isWaybillsLoading}
                isFetchingNextPage={isFetchingNextPage}
                onEndReached={() => {
                    if (hasNextPage) fetchNextPage();
                }}
                height="100%"
                selection={{
                    selectedIds,
                    onSelectAll: handleSelectAll,
                    onSelectRow: handleSelectRow,
                    isAllSelected: isAllLoadedSelected
                }}
                actions={[
                    {
                        icon: <PencilIcon className="h-5 w-5" />,
                        onClick: (w) => handleEdit(w),
                        title: "Редактировать",
                        className: "text-blue-500"
                    },
                    {
                        icon: <TrashIcon className="h-5 w-5" />,
                        onClick: (w) => handleRequestDelete(w),
                        title: "Удалить",
                        className: "text-red-500"
                    }
                ]}
            />
        </div>
      </div>
    </>
  );
};

export default WaybillList;
