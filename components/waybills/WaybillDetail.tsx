
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Waybill, WaybillStatus, Route } from '../../types';
import { 
    getAvailableFuelExpenses
} from '../../services/mockApi';
import { PrinterIcon, PaperClipIcon, ChatBubbleLeftRightIcon, PaperAirplaneIcon, CheckCircleIcon, ArrowUturnLeftIcon, PencilIcon, TrashIcon } from '../Icons';
import { WAYBILL_STATUS_TRANSLATIONS, WAYBILL_STATUS_COLORS } from '../../constants';
import PrintableWaybill from './PrintableWaybill';
import CollapsibleSection from '../shared/CollapsibleSection';
import { useToast } from '../../hooks/useToast';
import ConfirmationModal from '../shared/ConfirmationModal';
import { RouteImportModal } from '../dictionaries/RouteImportModal';
import { RouteSegment } from '../../services/routeParserService';
import Modal from '../shared/Modal';
import { useAuth } from '../../services/auth';
import CorrectionModal from './CorrectionModal';
import CorrectionReasonModal from './CorrectionReasonModal';
import { generateId } from '../../services/mockApi';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, useChangeWaybillStatus } from '../../hooks/queries';

// New Imports
import { WaybillGeneralInfo } from './form/WaybillGeneralInfo';
import { WaybillFuelInfo } from './form/WaybillFuelInfo';
import { WaybillRoutesTab } from './form/WaybillRoutesTab';
import { useWaybillForm } from '../../hooks/useWaybillForm';


interface WaybillDetailProps {
  waybill: Waybill | null;
  isPrefill?: boolean;
  onClose: () => void;
}

export const WaybillDetail: React.FC<WaybillDetailProps> = ({ waybill, isPrefill, onClose }) => {
  const {
      formData,
      setFormData,
      initialFormData,
      setInitialFormData,
      isDirty,
      isAIAvailable,
      aiPrompt,
      setAiPrompt,
      isGenerating,
      autoFillMessage,
      dayMode,
      minDate,
      fuelCardBalance,
      fuelFilledError,
      linkedTxId,
      linkedTransactions,
      
      selectedVehicle,
      selectedDriver,
      selectedFuelType,
      uniqueLocations,
      totalDistance,
      calculatedFuelRate,
      baseFuelRate,
      actualFuelConsumption,
      fuelEconomyOrOverrun,

      vehicles,
      drivers,
      dispatchers,
      controllers,
      organizations,
      stockItems,
      appSettings,

      handleChange,
      handleNumericChange,
      handleVehicleChange,
      handleDayModeChange,
      handleMethodChange,
      handleAddRoute,
      handleRouteUpdate,
      handleRemoveRoute,
      handleGenerateRoutes,
      handleSave: handleSaveInternal,
      handleStatusChange: handleStatusChangeInternal, // Rename to avoid conflict/confusion if needed, or just use logic inside
      handleSelectExpense,
      handleAttachmentUpload,
      removeAttachment,
      handleImportConfirm
  } = useWaybillForm(waybill, isPrefill || false);

  const { showToast } = useToast();
  const { currentUser, can } = useAuth();
  const queryClient = useQueryClient();
  const changeStatusMutation = useChangeWaybillStatus();
  
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isCorrectionReasonModalOpen, setIsCorrectionReasonModalOpen] = useState(false);
  const [isGarageModalOpen, setIsGarageModalOpen] = useState(false);
  const [availableExpenses, setAvailableExpenses] = useState<any[]>([]);
  
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const canEdit = useMemo(() => formData.status !== WaybillStatus.POSTED && formData.status !== WaybillStatus.CANCELLED, [formData.status]);

  const COLLAPSED_SECTIONS_KEY = 'waybillDetail_collapsedSections';
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
        const saved = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
        return saved ? JSON.parse(saved) : {
            basicInfo: false,
            vehicleDriver: false,
            staff: false,
            fuelMileage: false,
            route: false,
            attachments: false,
            stockLinks: false,
        };
    } catch {
        return {};
    }
  });

  useEffect(() => {
      localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  const toggleSection = (section: string) => {
      setCollapsedSections(prev => ({
          ...prev,
          [section]: !prev[section]
      }));
  };
  
  const handleCloseRequest = () => {
    if (isDirty) {
        setIsConfirmationModalOpen(true);
    } else {
        onClose();
    }
  };

  const handleConfirmClose = () => {
    setIsConfirmationModalOpen(false);
    onClose();
  };

  const onImportSegments = (segments: RouteSegment[]) => {
      const newRoutes: Route[] = segments.map(seg => {
        const dateParts = seg.date.split('.');
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : undefined;
        return {
            id: generateId(),
            from: seg.from,
            to: seg.to,
            distanceKm: seg.distanceKm,
            isCityDriving: selectedVehicle?.useCityModifier || false,
            isWarming: false,
            date: dayMode === 'multi' ? formattedDate : undefined,
        };
      });
      handleImportConfirm(newRoutes);
      setIsImportModalOpen(false);
  };

  const handleOpenGarageModal = async () => {
    if (!formData.driverId) {
      showToast('Сначала выберите водителя.', 'info');
      return;
    }
    // Using manual API call here as it's a specific transactional check
    const expenses = await getAvailableFuelExpenses(formData.driverId, 'id' in formData ? formData.id : null);
    setAvailableExpenses(expenses);
    setIsGarageModalOpen(true);
  };

  const onSelectExpenseWrapper = (tx: any) => {
      handleSelectExpense(tx);
      setIsGarageModalOpen(false);
  }

  const handleReturnToDraft = async (comment: string) => {
      setFormData(prev => ({ ...prev, reviewerComment: comment, status: WaybillStatus.DRAFT }));
      // We manually save here to persist the comment
      setTimeout(async () => {
          await handleSaveInternal(true);
          setIsCorrectionModalOpen(false);
          showToast('Комментарий добавлен, ПЛ возвращен в черновики.', 'info');
      }, 0);
  };
  
  // Custom Correction Handler
  const performCorrection = async (reason: string) => {
      if (!('id' in formData && formData.id)) return;
      
      try {
        // Use Mutation Hook instead of direct API import to ensure cache invalidation works globally
        const result = await changeStatusMutation.mutateAsync({
            id: formData.id, 
            status: WaybillStatus.DRAFT, 
            context: {
                userId: currentUser?.id,
                appMode: appSettings?.appMode || 'driver',
                reason: reason.trim(),
            }
        });

        // result.data is the updated waybill
        setFormData(result.data);
        // Sync initial form data to prevent "unsaved changes" modal
        setInitialFormData(JSON.parse(JSON.stringify(result.data))); 

        showToast('Путевой лист возвращен в черновики для корректировки.', 'success');
        setIsCorrectionReasonModalOpen(false);
        // Immediately close the main modal as requested
        onClose();
      } catch (e) {
        showToast((e as Error).message, 'error');
      }
  }

  // Wrapper around handleSave to close on success
  const handleSaveWrapper = async () => {
      const saved = await handleSaveInternal();
      if (saved) {
          onClose();
      }
  };

  const renderFooterActions = () => {
    const isNew = !('id' in formData && formData.id);
  
    return <>
        <button 
            onClick={handleCloseRequest} 
            className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-semibold py-2 px-6 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            aria-label="Закрыть"
        >
            Закрыть
        </button>
        
        <button 
            onClick={() => setIsPrintModalOpen(true)} 
            className="flex items-center gap-2 bg-teal-600 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:bg-teal-700 transition-colors disabled:opacity-50"
            aria-label="Печать на бланке"
            disabled={isNew}
        >
            <PrinterIcon className="h-5 w-5" />
            Печать
        </button>

        {canEdit && (
            <button onClick={handleSaveWrapper} className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:bg-blue-700">Сохранить</button>
        )}
    </>;
  };

  const handleStatusChangeWrapper = async (nextStatus: WaybillStatus) => {
        if (nextStatus === WaybillStatus.POSTED) {
             const fuelEnd = formData.fuelAtEnd ?? 0;
             if (fuelEnd < -0.05) { 
                 showToast(`Ошибка: Отрицательный остаток топлива (${fuelEnd.toFixed(2)} л). Проведение невозможно.`, 'error');
                 return;
             }
             
             // Check validation only for posting
             const isValid = await handleSaveInternal(true); // Save silently to check validity
             if (!isValid) return;
        } else {
             // Save for other statuses too
             const saved = await handleSaveInternal(true);
             if(!saved) return;
        }

        // Must rely on saved ID
        if (!('id' in formData && formData.id)) {
            showToast('Ошибка: ID документа не найден.', 'error');
            return;
        }

        try {
            // Use Mutation Hook for consistent updates
            const result = await changeStatusMutation.mutateAsync({
                id: formData.id,
                status: nextStatus,
                context: {
                    userId: currentUser?.id,
                    appMode: appSettings?.appMode || 'driver',
                }
            });
            
            const updatedWaybill = result.data as Waybill;
            setFormData({ ...updatedWaybill });
            setInitialFormData(JSON.parse(JSON.stringify(updatedWaybill)));
            
            const statusText = nextStatus === WaybillStatus.POSTED ? 'проведен' : 'обновлен';
            showToast(`Путевой лист успешно ${statusText}`, 'success');
            
            // Close after successful status change
            onClose();
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
  };

  const statusColors = WAYBILL_STATUS_COLORS[formData.status];
  
  // Prepare organization object for PrintableWaybill
  const selectedOrg = organizations.find(o => o.id === formData.organizationId);
  const selectedDispatcher = dispatchers.find(e => e.id === formData.dispatcherId);
  const selectedController = controllers.find(e => e.id === formData.controllerId);

  return (
    <>
      <ConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setIsConfirmationModalOpen(false)}
        onConfirm={handleConfirmClose}
        title="Выйти без сохранения?"
        message="У вас есть несохраненные изменения. Вы уверены, что хотите выйти? Все изменения будут потеряны."
        confirmText="Да, выйти"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
      <CorrectionModal isOpen={isCorrectionModalOpen} onClose={() => setIsCorrectionModalOpen(false)} onSubmit={handleReturnToDraft} />
      <CorrectionReasonModal 
        isOpen={isCorrectionReasonModalOpen} 
        onClose={() => setIsCorrectionReasonModalOpen(false)} 
        onSubmit={performCorrection}
      />
      {isPrintModalOpen && (
          <PrintableWaybill 
              waybill={formData as Waybill}
              vehicle={selectedVehicle}
              driver={selectedDriver}
              organization={selectedOrg}
              dispatcher={selectedDispatcher}
              controller={selectedController}
              fuelType={selectedFuelType}
              allOrganizations={organizations}
              onClose={() => setIsPrintModalOpen(false)} 
          />
      )}
      {isImportModalOpen && <RouteImportModal onClose={() => setIsImportModalOpen(false)} onConfirm={onImportSegments} />}
      <Modal isOpen={isGarageModalOpen} onClose={() => setIsGarageModalOpen(false)} title="Выбрать расходную накладную">
            <div className="space-y-2">
                {availableExpenses.length > 0 ? availableExpenses.map(tx => {
                    const fuelItem = tx.items.find((item: any) => stockItems.find(si => si.id === item.stockItemId)?.fuelTypeId);
                    if (!fuelItem) return null;
                    const stockItemDetails = stockItems.find(si => si.id === fuelItem.stockItemId);
                    return (
                        <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                            <div>
                                <p>Накладная №{tx.docNumber} от {tx.date}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300">{stockItemDetails?.name}: {fuelItem.quantity} {stockItemDetails?.unit}</p>
                            </div>
                            <button onClick={() => onSelectExpenseWrapper(tx)} className="bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg">Выбрать</button>
                        </div>
                    )
                }) : <p>Нет доступных накладных для этого водителя.</p>}
            </div>
      </Modal>

      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-2xl shadow-lg space-y-6 h-full flex flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{waybill && !isPrefill ? `Путевой лист №${formData.number}` : 'Новый путевой лист'}</h2>
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${statusColors?.bg} ${statusColors?.text}`}>
                    {WAYBILL_STATUS_TRANSLATIONS[formData.status]}
                </span>
            </div>
        </header>

        <div className="overflow-y-auto flex-grow space-y-6 pr-2">
            {formData.reviewerComment && formData.status === WaybillStatus.DRAFT && (
                <div className="p-4 bg-orange-100 dark:bg-orange-900/50 border-l-4 border-orange-500 rounded-r-lg">
                      <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200 font-semibold">
                          <ChatBubbleLeftRightIcon className="h-5 w-5" />
                          <span>Комментарий проверяющего:</span>
                      </div>
                      <p className="mt-2 text-orange-700 dark:text-orange-300 ml-7">{formData.reviewerComment}</p>
                </div>
            )}

            <CollapsibleSection title="Основная информация" isCollapsed={collapsedSections.basicInfo || false} onToggle={() => toggleSection('basicInfo')}>
                <WaybillGeneralInfo
                    formData={formData}
                    vehicles={vehicles}
                    drivers={drivers}
                    dispatchers={dispatchers}
                    controllers={controllers}
                    organizations={organizations}
                    canEdit={canEdit}
                    isPrefill={isPrefill || false}
                    autoFillMessage={autoFillMessage}
                    fuelCardBalance={fuelCardBalance}
                    dayMode={dayMode}
                    minDate={minDate}
                    onChange={handleChange}
                    onVehicleChange={handleVehicleChange}
                    onDayModeChange={handleDayModeChange}
                />
            </CollapsibleSection>
            
            <CollapsibleSection title="Пробег и топливо" isCollapsed={collapsedSections.fuelMileage || false} onToggle={() => toggleSection('fuelMileage')}>
                <WaybillFuelInfo
                    formData={formData}
                    canEdit={canEdit}
                    linkedTxId={linkedTxId}
                    fuelFilledError={fuelFilledError}
                    actualFuelConsumption={actualFuelConsumption}
                    fuelEconomyOrOverrun={fuelEconomyOrOverrun}
                    totalDistance={totalDistance}
                    calculatedFuelRate={calculatedFuelRate}
                    baseFuelRate={baseFuelRate}
                    onNumericChange={handleNumericChange}
                    onOpenGarageModal={handleOpenGarageModal}
                    onChange={handleChange as any}
                    onMethodChange={handleMethodChange}
                />
            </CollapsibleSection>
            
            {('id' in formData) && formData.id && (
              <CollapsibleSection
                title="Связанные складские операции"
                isCollapsed={collapsedSections.stockLinks || false}
                onToggle={() => toggleSection('stockLinks')}
              >
                {linkedTransactions.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Нет связанных операций на складе.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">Дата</th>
                        <th className="p-2">Тип</th>
                        <th className="p-2">Причина</th>
                        <th className="p-2">Номенклатура</th>
                        <th className="p-2">Количество</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedTransactions.flatMap(tx => {
                        const isIncome = tx.type === 'income';
                        const reason =
                          tx.expenseReason === 'waybill'
                            ? 'Списание по ПЛ'
                            : tx.expenseReason === 'fuelCardTopUp'
                            ? 'Пополнение карты'
                            : tx.type === 'income'
                            ? 'Приход'
                            : 'Расход';
                        const rowCount = tx.items?.length || 1;

                        if (!tx.items || tx.items.length === 0) {
                          return (
                             <tr key={tx.id} className="border-t dark:border-gray-700">
                                <td className="p-2">{tx.date}</td>
                                <td className={`p-2 font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                  {isIncome ? 'Приход' : 'Расход'}
                                </td>
                                <td className="p-2">{reason}</td>
                                <td className="p-2 text-gray-400" colSpan={2}>Нет позиций в документе</td>
                             </tr>
                          );
                        }

                        return tx.items.map((item, itemIndex) => {
                          const stockItem = stockItems.find(i => i.id === item.stockItemId);
                          return (
                            <tr key={`${tx.id}-${itemIndex}`} className="border-t dark:border-gray-700">
                              {itemIndex === 0 && (
                                <>
                                  <td className="p-2 align-top" rowSpan={rowCount}>{tx.date}</td>
                                  <td className={`p-2 align-top font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'}`} rowSpan={rowCount}>
                                    {isIncome ? 'Приход' : 'Расход'}
                                  </td>
                                  <td className="p-2 align-top" rowSpan={rowCount}>{reason}</td>
                                </>
                              )}
                              <td className="p-2">{stockItem?.name ?? '—'}</td>
                              <td className="p-2">
                                {item.quantity != null ? `${item.quantity} ${stockItem?.unit ?? ''}` : '—'}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                )}
              </CollapsibleSection>
            )}
            
            <CollapsibleSection title="Маршрут" isCollapsed={collapsedSections.route || false} onToggle={() => toggleSection('route')}>
                <WaybillRoutesTab
                    routes={formData.routes}
                    savedRoutes={[]} // Handled inside hook/components logic usually, but passing props
                    uniqueLocations={uniqueLocations}
                    dayMode={dayMode}
                    waybillDate={formData.date}
                    isAIAvailable={isAIAvailable}
                    isParserEnabled={appSettings?.isParserEnabled || false}
                    aiPrompt={aiPrompt}
                    isGenerating={isGenerating}
                    selectedVehicle={selectedVehicle}
                    canEdit={canEdit}
                    onAiPromptChange={setAiPrompt}
                    onGenerateRoutes={handleGenerateRoutes}
                    onImportClick={() => setIsImportModalOpen(true)}
                    onAddRoute={handleAddRoute}
                    onRemoveRoute={handleRemoveRoute}
                    onRouteUpdate={handleRouteUpdate}
                />
            </CollapsibleSection>

            <CollapsibleSection title="Приложения" isCollapsed={collapsedSections.attachments || false} onToggle={() => toggleSection('attachments')}>
                <input type="file" ref={attachmentInputRef} onChange={handleAttachmentUpload} className="hidden" />
                <button onClick={() => attachmentInputRef.current?.click()} className="flex items-center gap-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">
                    <PaperClipIcon className="h-5 w-5" />
                    Прикрепить файл
                </button>
                <div className="mt-4 space-y-2">
                    {(formData.attachments || []).map(att => (
                        <div key={att.name} className="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
                            <div>
                                <p className="font-medium text-gray-800 dark:text-white">{att.name}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{(att.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button onClick={() => removeAttachment(att.name)} className="text-red-500 hover:text-red-700"><TrashIcon className="h-5 w-5" /></button>
                        </div>
                    ))}
                </div>
            </CollapsibleSection>
        </div>
        
        {/* Status Actions */}
        <div className="pt-6 border-t dark:border-gray-600 flex flex-wrap justify-between items-center gap-4 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
                {formData.status === WaybillStatus.DRAFT && can('waybill.submit') && appSettings?.appMode === 'central' && (
                    <button onClick={() => handleStatusChangeWrapper(WaybillStatus.SUBMITTED)} className="flex items-center gap-2 bg-blue-500 text-white py-2 px-4 rounded-lg shadow hover:bg-blue-600"><PaperAirplaneIcon className="h-5 w-5" /> Отправить на проверку</button>
                )}
                {formData.status === WaybillStatus.DRAFT && can('waybill.post') && (appSettings?.appMode === 'driver' || !appSettings?.appMode) && (
                    <button onClick={() => handleStatusChangeWrapper(WaybillStatus.POSTED)} className="flex items-center gap-2 bg-green-600 text-white py-2 px-4 rounded-lg shadow hover:bg-green-700"><CheckCircleIcon className="h-5 w-5" /> Провести</button>
                )}
                {formData.status === WaybillStatus.SUBMITTED && can('waybill.post') && (
                    <button onClick={() => handleStatusChangeWrapper(WaybillStatus.POSTED)} className="flex items-center gap-2 bg-green-600 text-white py-2 px-4 rounded-lg shadow hover:bg-green-700"><CheckCircleIcon className="h-5 w-5" /> Провести</button>
                )}
                {formData.status === WaybillStatus.SUBMITTED && can('waybill.submit') && ( 
                    <button onClick={() => setIsCorrectionModalOpen(true)} className="flex items-center gap-2 bg-yellow-500 text-white py-2 px-4 rounded-lg shadow hover:bg-yellow-600"><ArrowUturnLeftIcon className="h-5 w-5" /> Вернуть на доработку</button>
                )}
                {formData.status === WaybillStatus.POSTED && can('waybill.correct') && (
                     <button onClick={() => setIsCorrectionReasonModalOpen(true)} className="flex items-center gap-2 bg-yellow-500 text-white py-2 px-4 rounded-lg shadow hover:bg-yellow-600"><PencilIcon className="h-5 w-5" /> Скорректировать</button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
                {renderFooterActions()}
            </div>
        </div>
      </div>
    </>
  );
};
