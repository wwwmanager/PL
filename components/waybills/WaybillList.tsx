





import React, { useState, useEffect, useMemo, useRef } from 'react';
import { deleteWaybill, getWaybills, updateWaybill, getLatestWaybill } from '../../services/mockApi';
import { Waybill, WaybillStatus } from '../../types';
import { WAYBILL_STATUS_COLORS, WAYBILL_STATUS_TRANSLATIONS } from '../../constants';
import { PlusIcon, PencilIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, StatusCompletedIcon, CalendarDaysIcon } from '../Icons';
// FIX: Changed import to a named import to resolve module resolution error.
import { WaybillDetail } from './WaybillDetail';
import useTable from '../../hooks/useTable';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import SeasonSettingsModal from './SeasonSettingsModal';
import { subscribe } from '../../services/bus';


type EnrichedWaybill = Awaited<ReturnType<typeof getWaybills>>[0] & { mileage?: number; rowNumber?: number; };

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

const WaybillList: React.FC<WaybillListProps> = ({ waybillToOpen, onWaybillOpened }) => {
  const [waybills, setWaybills] = useState<EnrichedWaybill[]>([]);
  const [loading, setLoading] = useState(true);
  const [topLevelFilter, setTopLevelFilter] = useState({ dateFrom: '', dateTo: '', status: '' });
  const [selectedWaybillId, setSelectedWaybillId] = useState<string | null>(null);
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);
  const [waybillToPrefill, setWaybillToPrefill] = useState<Waybill | null>(null);
  const [isExtendedView, setIsExtendedView] = useState(false);
  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);

  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [modalProps, setModalProps] = useState({ title: '', message: '', confirmText: '', confirmButtonClass: '', onConfirm: () => {} });

  const { showToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const data = await getWaybills();
    setWaybills(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const unsubscribe = subscribe((msg) => {
        if (msg.topic === 'waybills' || msg.topic === 'employees' || msg.topic === 'vehicles' || msg.topic === 'organizations' || msg.topic === 'blanks') {
            fetchData();
        }
    });
    return unsubscribe;
  }, []);
  
  useEffect(() => {
    if (waybillToOpen) {
      setSelectedWaybillId(waybillToOpen);
      setWaybillToPrefill(null);
      setIsDetailViewOpen(true);
      onWaybillOpened();
    }
  }, [waybillToOpen, onWaybillOpened]);


  const preFilteredWaybills = useMemo(() => {
    return waybills.filter(w => {
        const date = new Date(w.date);
        const from = topLevelFilter.dateFrom ? new Date(topLevelFilter.dateFrom) : null;
        const to = topLevelFilter.dateTo ? new Date(topLevelFilter.dateTo) : null;
        
        if (from && date < from) return false;
        if (to && date > to) return false;
        if (topLevelFilter.status && w.status !== topLevelFilter.status) return false;
        
        return true;
    });
  }, [waybills, topLevelFilter]);

  const columns = useMemo(() => {
    if (isExtendedView) {
      return [
        { key: 'rowNumber', label: '№ п/п' },
        { key: 'number', label: '№ ПЛ' },
        { key: 'validFrom', label: 'Дата Выезда' },
        { key: 'validTo', label: 'Дата Возвращения' },
        { key: 'odometerStart', label: 'Пробег Начальный' },
        { key: 'odometerEnd', label: 'Пробег Конечный' },
        { key: 'mileage', label: 'Пробег по ПЛ' },
        { key: 'fuelAtStart', label: 'Топливо (выезд)' },
        { key: 'fuelAtEnd', label: 'Топливо (возврат)' },
        { key: 'status', label: 'Статус' },
      ];
    }
    return [
      { key: 'number', label: '№ Путевого листа' },
      { key: 'date', label: 'Дата' },
      { key: 'vehicle', label: 'ТС' },
      { key: 'driver', label: 'Водитель' },
      { key: 'organization', label: 'Организация' },
      { key: 'status', label: 'Статус' },
    ];
  }, [isExtendedView]);

  const enrichedData = useMemo(() => {
    return preFilteredWaybills.map((w, index) => ({
      ...w,
      rowNumber: index + 1,
      mileage: (w.odometerEnd ?? w.odometerStart) - w.odometerStart,
    }));
  }, [preFilteredWaybills]);


  const {
      rows,
      sortColumn,
      sortDirection,
      handleSort,
      filters,
      handleFilterChange,
  } = useTable(enrichedData, columns as any); // cast to any to handle dynamic columns

  const handleCreateNew = async () => {
    const latestWaybill = await getLatestWaybill();
    setWaybillToPrefill(latestWaybill);
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
        // We'll add a second button for the "No" case
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
        await deleteWaybill(waybillId, markAsSpoiled);
        showToast('Путевой лист удален.', 'info');
        fetchData();
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
    fetchData(); // Refetch data after closing detail view
  };

  if (isDetailViewOpen) {
    const selectedWaybill = selectedWaybillId ? waybills.find(w => w.id === selectedWaybillId) ?? null : waybillToPrefill;
    const isPrefill = !selectedWaybillId && !!waybillToPrefill;
    return <WaybillDetail waybill={selectedWaybill} isPrefill={isPrefill} onClose={handleCloseDetail} />;
  }
  
  const renderActionButtons = (waybill: EnrichedWaybill) => {
      return (
          <td className="px-6 py-4 text-center whitespace-nowrap">
              <button onClick={() => handleEdit(waybill)} className="p-2 text-blue-500 transition-all duration-200 transform hover:scale-110" title="Редактировать"><PencilIcon className="h-5 w-5" /></button>
              <button onClick={() => handleRequestDelete(waybill)} className="p-2 text-red-500 transition-all duration-200 transform hover:scale-110" title="Удалить"><TrashIcon className="h-5 w-5" /></button>
          </td>
      );
  };
  
  return (
    <>
      <ConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setIsConfirmationModalOpen(false)}
        {...modalProps}
      />
      <SeasonSettingsModal
        isOpen={isSeasonModalOpen}
        onClose={() => setIsSeasonModalOpen(false)}
      />
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Путевые листы</h2>
          <div className="flex items-center gap-4 flex-wrap">
             <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={isExtendedView} onChange={e => setIsExtendedView(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="ml-2">Расширенный журнал</span>
            </label>
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
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg items-center">
          <input type="date" value={topLevelFilter.dateFrom} onChange={e => setTopLevelFilter({...topLevelFilter, dateFrom: e.target.value})} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" placeholder="Дата с" />
          <input type="date" value={topLevelFilter.dateTo} onChange={e => setTopLevelFilter({...topLevelFilter, dateTo: e.target.value})} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" placeholder="Дата по" />
          <select value={topLevelFilter.status} onChange={e => setTopLevelFilter({...topLevelFilter, status: e.target.value})} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200">
            <option value="">Все статусы</option>
            {Object.entries(WAYBILL_STATUS_TRANSLATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="p-4">
                 <span className="sr-only">Отбор</span>
                </th>
                {columns.map(col => (
                  <th key={col.key as string} scope="col" className="px-6 py-3 cursor-pointer" onClick={() => handleSort(col.key as any)}>
                    <div className="flex items-center gap-1">
                        {col.label}
                        {sortColumn === col.key && (sortDirection === 'asc' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />)}
                    </div>
                  </th>
                ))}
                <th scope="col" className="px-6 py-3 text-center">Действия</th>
              </tr>
              {!isExtendedView && (
                <tr>
                    <th />
                    {columns.map(col => (
                        <th key={`${col.key}-filter`} className="px-2 py-1">
                            <input
                                type="text"
                                value={filters[col.key as string] || ''}
                                onChange={e => handleFilterChange(col.key as any, e.target.value)}
                                placeholder={`Поиск...`}
                                className="w-full text-xs p-1 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded"
                            />
                        </th>
                    ))}
                    <th className="px-2 py-1"></th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length + 2} className="text-center p-6">Загрузка...</td></tr>
              ) : (
                rows.map(w => {
                  const colors = WAYBILL_STATUS_COLORS[w.status];
                  return (
                    <tr key={w.id} className={'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-600 border-b dark:border-gray-700'}>
                      <td className="w-4 p-4"></td>
                      {isExtendedView ? (
                          <>
                            <td className="px-6 py-4">{w.rowNumber}</td>
                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{w.number}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{w.validFrom ? new Date(w.validFrom).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{w.validTo ? new Date(w.validTo).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—'}</td>
                            <td className="px-6 py-4">{w.odometerStart}</td>
                            <td className="px-6 py-4">{w.odometerEnd ?? '—'}</td>
                            <td className="px-6 py-4">{w.mileage}</td>
                            <td className="px-6 py-4">{w.fuelAtStart ?? '—'}</td>
                            <td className="px-6 py-4">{w.fuelAtEnd ?? '—'}</td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${colors?.bg} ${colors?.text}`}>
                                  {getStatusIcon(w.status)}
                                  {WAYBILL_STATUS_TRANSLATIONS[w.status]}
                                </span>
                            </td>
                          </>
                      ) : (
                          <>
                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{w.number}</td>
                            <td className="px-6 py-4">{new Date(w.date).toLocaleDateString('ru-RU')}</td>
                            <td className="px-6 py-4">{w.vehicle}</td>
                            <td className="px-6 py-4">{w.driver}</td>
                            <td className="px-6 py-4">{w.organization}</td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${colors?.bg} ${colors?.text}`}>
                                {getStatusIcon(w.status)}
                                {WAYBILL_STATUS_TRANSLATIONS[w.status]}
                                </span>
                            </td>
                          </>
                      )}
                      {renderActionButtons(w)}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default WaybillList;