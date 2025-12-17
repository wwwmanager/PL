
import React, { FC, useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Waybill, Vehicle, Employee, Organization, FuelType } from '../../types';
import { XIcon, ListBulletIcon, ArrowUturnLeftIcon, UploadIcon, TrashIcon } from '../Icons';
import ConfirmationModal from '../shared/ConfirmationModal';

// Imported Logic & Components (Using Relative Paths)
import { usePrintEditor } from './print/usePrintEditor';
import { DraggableField } from './print/DraggableField';
import { getFieldValue } from './print/mapper';
import { FIELD_LABELS, PAGE_LABELS, PRINT_STYLES, AVAILABLE_FONTS } from './print/constants';
import { PageKey, PrintDataBundle } from './print/types';
import { getShortName } from './print/utils';

interface PrintableWaybillProps {
  waybill: Waybill;
  vehicle: Vehicle | undefined;
  driver: Employee | undefined;
  organization: Organization | undefined;
  dispatcher: Employee | undefined;
  controller: Employee | undefined;
  fuelType: FuelType | undefined;
  allOrganizations: Organization[];
  onClose: () => void;
}

const PrintableWaybill: FC<PrintableWaybillProps> = ({
  waybill,
  vehicle,
  driver,
  organization,
  dispatcher,
  controller,
  fuelType,
  allOrganizations,
  onClose,
}) => {
  const portalNodeRef = useRef<HTMLDivElement | null>(
    typeof document !== 'undefined' ? document.createElement('div') : null,
  );
  
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const portalNode = portalNodeRef.current;
    if (!portalNode || typeof document === 'undefined') return;

    portalNode.id = 'print-modal-portal';
    portalNode.classList.add('print-modal-portal');
    document.body.appendChild(portalNode);
    return () => {
      portalNode.classList.remove('print-modal-portal');
      portalNode.parentNode?.removeChild(portalNode);
    };
  }, []);

  // --- Logic Hook ---
  const editor = usePrintEditor();
  
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isFieldSettingsOpen, setIsFieldSettingsOpen] = useState(false);

  // --- Data Prep ---
  const dataBundle = useMemo<PrintDataBundle>(() => {
      const fuelActual = (waybill.fuelAtStart ?? 0) + (waybill.fuelFilled ?? 0) - (waybill.fuelAtEnd ?? 0);
      const totalDistance = waybill.routes.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0);
      
      const effectiveOrgFields = { name: '', address: '', inn: '', phone: '' };
      if (organization) {
          let sourceOrg = organization;
          if (organization.parentOrganizationId) {
             const parent = allOrganizations.find(o => o.id === organization.parentOrganizationId);
             if (parent) sourceOrg = parent;
          }
          effectiveOrgFields.name = sourceOrg.fullName || sourceOrg.shortName;
          effectiveOrgFields.address = sourceOrg.address || '';
          effectiveOrgFields.inn = sourceOrg.inn || '';
          effectiveOrgFields.phone = sourceOrg.phone || '';
      }

      return {
          waybill, vehicle, driver, dispatcher, controller, fuelType, organization,
          medicalOrg: allOrganizations.find(o => o.id === driver?.medicalInstitutionId),
          effectiveOrgFields,
          computed: {
              fuelActual,
              totalDistance,
              controllerShortName: getShortName(controller?.fullName)
          }
      };
  }, [waybill, vehicle, driver, dispatcher, controller, fuelType, organization, allOrganizations]);

  // --- Render Helpers ---

  const handlePageMouseDown = (pageKey: PageKey, e: React.MouseEvent<HTMLDivElement>) => {
      if (!editor.editingEnabled) return;
      if (e.target !== e.currentTarget) return;
      
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      editor.setActivePage(pageKey);
      editor.setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y });
      editor.setSelectedIds([]);
  };

  const toggleFieldVisibility = (field: string) => {
      const isHidden = editor.hiddenFields.has(field);
      const existsInPositions = editor.positions[field] !== undefined;

      const nextHidden = new Set(editor.hiddenFields);
      if (!isHidden && existsInPositions) {
          nextHidden.add(field);
      } else {
          nextHidden.delete(field);
          if (!existsInPositions) {
              // Spawn new field
              editor.setPositions(prev => ({ ...prev, [field]: { x: 50, y: 50 } }));
              editor.setFieldPages(prev => ({ ...prev, [field]: 'page1' }));
          }
      }
      editor.setHiddenFields(nextHidden);
  };

  const pageKeysToRender = useMemo(() => {
    const keys: PageKey[] = ['page1'];
    // Logic: Page 2 if forced, or fields assigned to it, or routes/distance exist
    const hasFieldsP2 = Object.values(editor.fieldPages).some(p => p === 'page2');
    const hasRouteData = dataBundle.computed.totalDistance > 0 || waybill.routes.some(r => r.distanceKm > 0 || !!r.notes);
    
    if (editor.forcePage2 || hasFieldsP2 || hasRouteData) {
        keys.push('page2');
    }
    return keys;
  }, [editor.forcePage2, editor.fieldPages, dataBundle.computed.totalDistance, waybill.routes]);

  if (!portalNodeRef.current) return null;

  return createPortal(
    <div className="print-modal fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <ConfirmationModal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={() => { editor.handleReset(); setIsResetConfirmOpen(false); }}
        title="Сбросить настройки?"
        message="Вернуться к заводским настройкам расположения?"
        confirmText="Сбросить"
        confirmButtonClass="bg-yellow-600 hover:bg-yellow-700"
      />

      {isFieldSettingsOpen && (
          <div className="absolute top-16 right-4 z-[60] bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-xl p-4 w-96 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3 pb-2 border-b dark:border-gray-700">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Настройка полей</h4>
                  <button onClick={() => { editor.handleSave(); setIsFieldSettingsOpen(false); }} className="text-gray-500 hover:text-gray-700"><XIcon className="h-5 w-5" /></button>
              </div>
              <div className="overflow-y-auto flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {Object.entries(FIELD_LABELS).map(([key, label]) => {
                      const isActive = editor.positions[key] !== undefined && !editor.hiddenFields.has(key);
                      return (
                          <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded">
                              <input type="checkbox" checked={isActive} onChange={() => toggleFieldVisibility(key)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                              <span className={`truncate ${!isActive ? 'text-gray-500' : 'text-gray-700 dark:text-gray-200 font-medium'}`}>{label as string}</span>
                          </label>
                      );
                  })}
              </div>
          </div>
      )}

      <div className="print-modal__content bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col border border-gray-300" onClick={(e) => e.stopPropagation()}>
        
        {/* --- Toolbar --- */}
        <header className="print-modal__toolbar flex flex-wrap gap-4 items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Печать путевого листа</h3>

          <div className="flex flex-col gap-3 items-end w-full lg:w-auto">
             <div className="flex flex-wrap items-center gap-3 justify-end text-sm text-gray-700 dark:text-gray-200">
                {editor.editingEnabled && (
                  <div className="flex items-center gap-1 mr-2 border-r pr-3 dark:border-gray-600">
                      <button onClick={editor.handleUndo} disabled={editor.history.past.length === 0} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"><ArrowUturnLeftIcon className="h-4 w-4" /></button>
                      <button onClick={editor.handleRedo} disabled={editor.history.future.length === 0} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transform scale-x-[-1]"><ArrowUturnLeftIcon className="h-4 w-4" /></button>
                  </div>
                )}

                <button type="button" onClick={() => setIsFieldSettingsOpen(!isFieldSettingsOpen)} className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${isFieldSettingsOpen ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white dark:bg-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                    <ListBulletIcon className="h-4 w-4" /> Поля
                </button>
                
                <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editor.editingEnabled} onChange={(e) => { editor.setEditingEnabled(e.target.checked); if(!e.target.checked) { editor.setSelectedIds([]); editor.setSelectionBox(null); } }} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    Режим ред.
                </label>

                {editor.editingEnabled && (
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-1 rounded border dark:border-gray-600">
                        <input 
                            type="number" 
                            value={editor.fontSize} 
                            onChange={e => editor.setFontSize(Number(e.target.value))} 
                            className="w-12 text-center text-xs p-1 rounded border-gray-300"
                            title="Размер шрифта"
                        />
                        <select 
                            value={editor.fontFamily} 
                            onChange={e => editor.setFontFamily(e.target.value)}
                            className="text-xs p-1 rounded border-gray-300 max-w-[100px]"
                            title="Шрифт"
                        >
                            {AVAILABLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <input type="file" ref={bgInputRef} onChange={e => e.target.files?.[0] && editor.handleBackgroundUpload(e.target.files[0])} className="hidden" accept="image/*" />
                        <button onClick={() => bgInputRef.current?.click()} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" title="Загрузить фон"><UploadIcon className="h-4 w-4" /></button>
                        {editor.backgroundImage && <button onClick={editor.handleClearBackground} className="p-1 text-red-500 hover:bg-red-100 rounded" title="Удалить фон"><TrashIcon className="h-4 w-4" /></button>}
                    </div>
                )}

                {editor.editingEnabled && (
                    <>
                        <button onClick={editor.handleSave} className="bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 transition-colors">Сохранить</button>
                        <button onClick={() => setIsResetConfirmOpen(true)} className="bg-yellow-500 text-white font-semibold py-1 px-3 rounded-lg hover:bg-yellow-600 transition-colors">Сбросить</button>
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editor.showLabels} onChange={e => editor.setShowLabels(e.target.checked)} className="h-4 w-4" /> Подписи</label>
                        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editor.showGrid} onChange={e => editor.setShowGrid(e.target.checked)} className="h-4 w-4" /> Сетка</label>
                        {editor.showGrid && <label className="inline-flex items-center gap-2"><input type="number" min={1} value={editor.gridSize} onChange={e => editor.setGridSize(Math.max(1, Number(e.target.value)))} className="w-12 p-1 text-sm border rounded" /> px</label>}
                    </>
                )}
                
                {!editor.editingEnabled && (
                     <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editor.showPlaceholders} onChange={e => editor.setShowPlaceholders(e.target.checked)} className="h-4 w-4" /> Пустые поля</label>
                )}
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editor.forcePage2} onChange={e => editor.setForcePage2(e.target.checked)} className="h-4 w-4" /> Всегда 2 стр.</label>

                <button type="button" onClick={() => window.print()} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">Печать</button>
                <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="h-6 w-6" /></button>
             </div>
             
             {editor.editingEnabled && (
                <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-gray-700 dark:text-gray-200">
                    {(Object.keys(PAGE_LABELS) as PageKey[]).map(pk => (
                        <div key={pk} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            <span className="font-semibold">{PAGE_LABELS[pk] as string}</span>
                            <span>X:</span><input type="number" value={editor.pageOffsets[pk].x} onChange={e => editor.setPageOffsets(prev => ({...prev, [pk]: { ...prev[pk], x: parseInt(e.target.value)||0 }}))} className="w-12 p-1 border rounded" />
                            <span>Y:</span><input type="number" value={editor.pageOffsets[pk].y} onChange={e => editor.setPageOffsets(prev => ({...prev, [pk]: { ...prev[pk], y: parseInt(e.target.value)||0 }}))} className="w-12 p-1 border rounded" />
                        </div>
                    ))}
                </div>
             )}
          </div>
        </header>

        {/* --- Canvas Area --- */}
        <main id="printable-area" className="p-4 overflow-auto flex-grow bg-gray-200 dark:bg-gray-900">
            <div className="print-pages flex flex-col items-center gap-6">
                {pageKeysToRender.map(pageKey => {
                    const pageOffset = editor.pageOffsets[pageKey];
                    const isPageActive = editor.activePage === pageKey && editor.selectionBox !== null;
                    
                    const selectionStyle = isPageActive && editor.selectionBox ? {
                        left: Math.min(editor.selectionBox.startX, editor.selectionBox.currentX),
                        top: Math.min(editor.selectionBox.startY, editor.selectionBox.currentY),
                        width: Math.abs(editor.selectionBox.currentX - editor.selectionBox.startX),
                        height: Math.abs(editor.selectionBox.currentY - editor.selectionBox.startY)
                    } : {};

                    // --- Dynamic Background Construction ---
                    const layers: string[] = [];
                    const sizes: string[] = [];
                    const positions: string[] = [];
                    const repeats: string[] = [];

                    // 1. Grid Layers (if enabled)
                    if (editor.editingEnabled && editor.showGrid) {
                        // Vertical lines
                        layers.push(`linear-gradient(to right, #ccc 1px, transparent 1px)`);
                        sizes.push(`${editor.gridSize}px ${editor.gridSize}px`);
                        positions.push('-1px -1px');
                        repeats.push('repeat');
                        
                        // Horizontal lines
                        layers.push(`linear-gradient(to bottom, #ccc 1px, transparent 1px)`);
                        sizes.push(`${editor.gridSize}px ${editor.gridSize}px`);
                        positions.push('-1px -1px');
                        repeats.push('repeat');
                    }

                    // 2. Image Layer (if exists)
                    if (editor.backgroundImage) {
                        layers.push(`url(${editor.backgroundImage})`);
                        sizes.push('100% 100%'); // Stretch to fit A4
                        positions.push('center center');
                        repeats.push('no-repeat');
                    }

                    const bgStyle = {
                        transform: `translate(${pageOffset.x}px, ${pageOffset.y}px)`, 
                        transformOrigin: 'top left',
                        backgroundImage: layers.length > 0 ? layers.join(', ') : 'none',
                        backgroundSize: sizes.length > 0 ? sizes.join(', ') : 'auto',
                        backgroundPosition: positions.length > 0 ? positions.join(', ') : '0% 0%',
                        backgroundRepeat: repeats.length > 0 ? repeats.join(', ') : 'repeat'
                    };

                    // Filter fields for this page
                    const fieldsOnPage = Object.entries(editor.fieldPages)
                        .filter(([, p]) => p === pageKey)
                        .map(([id]) => id);

                    return (
                        <div className="print-page" key={pageKey}>
                            <div 
                                id={`print-page-canvas-${pageKey}`}
                                className="print-page__canvas"
                                onMouseDown={(e) => handlePageMouseDown(pageKey, e)}
                                style={bgStyle}
                            >
                                {isPageActive && <div className="selection-marquee" style={selectionStyle} />}
                                
                                {fieldsOnPage.map(id => {
                                    if (editor.hiddenFields.has(id)) return null;
                                    return (
                                        <DraggableField
                                            key={id}
                                            id={id}
                                            label={FIELD_LABELS[id] as string}
                                            value={getFieldValue(id, dataBundle)}
                                            positions={editor.positions}
                                            isSelected={editor.selectedIds.includes(id)}
                                            editingEnabled={editor.editingEnabled}
                                            showPlaceholders={editor.showPlaceholders}
                                            showLabels={editor.showLabels}
                                            fontSize={editor.fontSize}
                                            fontFamily={editor.fontFamily}
                                            onDragStart={editor.handleDragStart}
                                            onResizeStart={editor.handleResizeStart}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </main>
      </div>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
    </div>,
    portalNodeRef.current
  );
};

export default PrintableWaybill;
