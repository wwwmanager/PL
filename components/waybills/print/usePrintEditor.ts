
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PrintPositions, PageKey, EditorPrefs, PageOffsets, FieldKey } from './types';
import { clonePositions } from './utils';
import { INITIAL_FIELD_POSITIONS, INITIAL_PAGE_OFFSETS, DEFAULT_PAGE_FIELD_MAP, DEFAULT_HIDDEN_FIELDS, getInitialFieldPages } from './constants';
import { loadJSON, saveJSON, removeKey } from '../../../services/storage';
import { DB_KEYS } from '../../../services/dbKeys';
import { useToast } from '../../../hooks/useToast';

interface HistoryState {
    positions: PrintPositions;
    fieldPages: Record<string, PageKey>;
}

export const usePrintEditor = () => {
    const { showToast } = useToast();

    // --- State ---
    const [positions, setPositions] = useState<PrintPositions>(() => clonePositions(INITIAL_FIELD_POSITIONS));
    const [fieldPages, setFieldPages] = useState<Record<string, PageKey>>(() => getInitialFieldPages());
    const [pageOffsets, setPageOffsets] = useState<PageOffsets>(INITIAL_PAGE_OFFSETS);
    const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set(DEFAULT_HIDDEN_FIELDS));
    
    // UI Config
    const [editingEnabled, setEditingEnabled] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showGrid, setShowGrid] = useState(false);
    const [gridSize, setGridSize] = useState(10);
    const [showPlaceholders, setShowPlaceholders] = useState(true);
    const [forcePage2, setForcePage2] = useState(false);

    // Font & Style Config
    const [fontSize, setFontSize] = useState(14);
    const [fontFamily, setFontFamily] = useState('Courier New');
    const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

    // Interaction State
    const [selectedIds, setSelectedIds] = useState<FieldKey[]>([]);
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    const [activePage, setActivePage] = useState<PageKey | null>(null);

    // History
    const [history, setHistory] = useState<{ past: HistoryState[], future: HistoryState[] }>({ past: [], future: [] });
    const historySnapshot = useRef<HistoryState | null>(null);
    const dragInfo = useRef<{
        type: 'drag' | 'resize';
        startPoint: { x: number; y: number };
        startPositions?: PrintPositions;
        initialWidths?: Record<string, number>;
        initialHeights?: Record<string, number | undefined>;
    } | null>(null);

    // --- Initialization ---
    useEffect(() => {
        (async () => {
            try {
                const savedPositions = await loadJSON<PrintPositions | null>(DB_KEYS.PRINT_POSITIONS, null);
                if (savedPositions) {
                    setPositions((prev) => ({ ...clonePositions(prev), ...clonePositions(savedPositions) }));
                }

                const prefs = await loadJSON<EditorPrefs | null>(DB_KEYS.PRINT_EDITOR_PREFS, null);
                if (prefs) {
                    if (prefs.showLabels !== undefined) setShowLabels(prefs.showLabels);
                    if (prefs.showGrid !== undefined) setShowGrid(prefs.showGrid);
                    if (prefs.gridSize && prefs.gridSize > 0) setGridSize(prefs.gridSize);
                    if (prefs.fieldPages) setFieldPages(prefs.fieldPages);
                    if (prefs.pageOffsets) {
                        setPageOffsets({
                            page1: { x: prefs.pageOffsets.page1?.x ?? 0, y: prefs.pageOffsets.page1?.y ?? 0 },
                            page2: { x: prefs.pageOffsets.page2?.x ?? 0, y: prefs.pageOffsets.page2?.y ?? 0 },
                        });
                    }
                    if (prefs.hiddenFields) setHiddenFields(new Set(prefs.hiddenFields));
                    
                    // Restore Style
                    if (prefs.fontSize) setFontSize(prefs.fontSize);
                    if (prefs.fontFamily) setFontFamily(prefs.fontFamily);
                    if (prefs.backgroundImage) setBackgroundImage(prefs.backgroundImage);
                }
            } catch {
                console.error('Error loading print prefs');
            }
        })();
    }, []);

    // --- History Logic ---
    const recordHistory = useCallback((oldState: HistoryState) => {
        setHistory(prev => {
            const newPast = [...prev.past, oldState];
            if (newPast.length > 50) newPast.shift();
            return { past: newPast, future: [] };
        });
    }, []);

    const handleUndo = useCallback(() => {
        setHistory(prev => {
            if (prev.past.length === 0) return prev;
            const previous = prev.past[prev.past.length - 1];
            const newPast = prev.past.slice(0, -1);
            
            const current: HistoryState = { positions: clonePositions(positions), fieldPages: { ...fieldPages } };
            setPositions(previous.positions);
            setFieldPages(previous.fieldPages);
            
            return { past: newPast, future: [current, ...prev.future] };
        });
    }, [positions, fieldPages]);

    const handleRedo = useCallback(() => {
        setHistory(prev => {
            if (prev.future.length === 0) return prev;
            const next = prev.future[0];
            const newFuture = prev.future.slice(1);

            const current: HistoryState = { positions: clonePositions(positions), fieldPages: { ...fieldPages } };
            setPositions(next.positions);
            setFieldPages(next.fieldPages);

            return { past: [...prev.past, current], future: newFuture };
        });
    }, [positions, fieldPages]);

    // --- Storage Logic ---
    const savePreferences = useCallback(async (currentHiddenFields: Set<string>, currentFieldPages: Record<string, PageKey>) => {
        try {
            await saveJSON(DB_KEYS.PRINT_EDITOR_PREFS, {
                showLabels, showGrid, gridSize,
                pageOffsets: { page1: { ...pageOffsets.page1 }, page2: { ...pageOffsets.page2 } },
                hiddenFields: Array.from(currentHiddenFields),
                fieldPages: currentFieldPages,
                fontSize, fontFamily, backgroundImage
            });
        } catch {}
    }, [showLabels, showGrid, gridSize, pageOffsets, fontSize, fontFamily, backgroundImage]);

    const handleSave = useCallback(async () => {
        try {
            await saveJSON(DB_KEYS.PRINT_POSITIONS, clonePositions(positions));
            await savePreferences(hiddenFields, fieldPages);
            showToast('Настройки печати сохранены.', 'success');
            setEditingEnabled(false);
            setSelectedIds([]);
            setHistory({ past: [], future: [] });
        } catch {
            showToast('Ошибка сохранения.', 'error');
        }
    }, [positions, hiddenFields, fieldPages, savePreferences, showToast]);

    const handleReset = useCallback(async () => {
        try {
            await removeKey(DB_KEYS.PRINT_POSITIONS);
            await removeKey(DB_KEYS.PRINT_EDITOR_PREFS);
        } catch {}

        setPositions(clonePositions(INITIAL_FIELD_POSITIONS));
        setPageOffsets(INITIAL_PAGE_OFFSETS);
        setFieldPages(getInitialFieldPages());
        setHiddenFields(new Set(DEFAULT_HIDDEN_FIELDS));
        setFontSize(14);
        setFontFamily('Courier New');
        setBackgroundImage(null);
        setSelectedIds([]);
        setHistory({ past: [], future: [] });
        showToast('Настройки сброшены.', 'info');
    }, [showToast]);

    // --- Mouse Handlers ---
    const handleDragStart = useCallback((id: FieldKey, e: React.MouseEvent) => {
        if (!editingEnabled) return;
        e.preventDefault(); e.stopPropagation();
        
        historySnapshot.current = { positions: clonePositions(positions), fieldPages: { ...fieldPages } };
        const multi = e.ctrlKey || e.metaKey;
        setSelectedIds(prev => multi ? (prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]) : (prev.includes(id) ? prev : [id]));

        dragInfo.current = {
            type: 'drag',
            startPoint: { x: e.clientX, y: e.clientY },
            startPositions: clonePositions(positions),
        };
        document.body.style.cursor = 'grabbing';
    }, [editingEnabled, positions, fieldPages]);

    const handleResizeStart = useCallback((id: FieldKey, e: React.MouseEvent) => {
        if (!editingEnabled) return;
        e.preventDefault(); e.stopPropagation();
        
        historySnapshot.current = { positions: clonePositions(positions), fieldPages: { ...fieldPages } };
        if (!selectedIds.includes(id)) setSelectedIds([id]);

        const targets = selectedIds.includes(id) ? selectedIds : [id];
        const initialWidths: Record<string, number> = {};
        const initialHeights: Record<string, number | undefined> = {};

        targets.forEach(tid => {
            initialWidths[tid] = positions[tid]?.width || 150;
            initialHeights[tid] = positions[tid]?.height;
        });

        dragInfo.current = {
            type: 'resize',
            startPoint: { x: e.clientX, y: e.clientY },
            initialWidths,
            initialHeights
        };
        document.body.style.cursor = 'nwse-resize';
    }, [editingEnabled, selectedIds, positions, fieldPages]);

    const handleGlobalMouseMove = useCallback((event: MouseEvent) => {
        if (!dragInfo.current) {
            // Marquee
            if (selectionBox && activePage) {
               const canvas = document.getElementById(`print-page-canvas-${activePage}`);
               if (canvas) {
                   const rect = canvas.getBoundingClientRect();
                   setSelectionBox(prev => prev ? { ...prev, currentX: event.clientX - rect.left, currentY: event.clientY - rect.top } : null);
               }
            }
            return;
        }

        const { type, startPoint } = dragInfo.current;
        const deltaX = event.clientX - startPoint.x;
        const deltaY = event.clientY - startPoint.y;

        if (type === 'drag') {
            const { startPositions } = dragInfo.current;
            if (!startPositions) return;
            setPositions(() => {
                const next = clonePositions(startPositions);
                for (const id of selectedIds) {
                    if (startPositions[id]) {
                        next[id] = { ...startPositions[id], x: startPositions[id].x + deltaX, y: startPositions[id].y + deltaY };
                    }
                }
                return next;
            });
        } else if (type === 'resize') {
            const { initialWidths, initialHeights } = dragInfo.current;
            if (!initialWidths || !initialHeights) return;
            setPositions((current) => {
                const next = clonePositions(current);
                Object.keys(initialWidths).forEach(id => {
                    if (next[id]) {
                        next[id].width = Math.max(20, initialWidths[id] + deltaX);
                        next[id].height = Math.max(10, (initialHeights[id] || 15) + deltaY);
                    }
                });
                return next;
            });
        }
    }, [selectedIds, selectionBox, activePage]);

    const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
        // Drag Drop Logic
        if (dragInfo.current) {
            const wasDrag = dragInfo.current.type === 'drag';
            let newPositions = clonePositions(positions);
            let newFieldPages = { ...fieldPages };
            
            if (wasDrag) {
                const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);
                let targetPage: PageKey | null = null;
                for (const el of elementsUnder) {
                    if (el.id === 'print-page-canvas-page1') { targetPage = 'page1'; break; }
                    if (el.id === 'print-page-canvas-page2') { targetPage = 'page2'; break; }
                }

                if (targetPage) {
                    const targetRect = document.getElementById(`print-page-canvas-${targetPage}`)?.getBoundingClientRect();
                    if (targetRect) {
                        selectedIds.forEach(fieldId => {
                             const currentPage = fieldPages[fieldId];
                             if (showGrid && gridSize > 0 && newPositions[fieldId]) {
                                 const p = newPositions[fieldId];
                                 newPositions[fieldId] = { ...p, x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
                             }
                             if (targetPage !== currentPage && newPositions[fieldId]) {
                                 const oldRect = document.getElementById(`print-page-canvas-${currentPage}`)?.getBoundingClientRect();
                                 if (oldRect) {
                                     const absX = oldRect.left + newPositions[fieldId].x;
                                     const absY = oldRect.top + newPositions[fieldId].y;
                                     newPositions[fieldId].x = absX - targetRect.left;
                                     newPositions[fieldId].y = absY - targetRect.top;
                                     newFieldPages[fieldId] = targetPage as PageKey;
                                     
                                     if (showGrid && gridSize > 0) {
                                         newPositions[fieldId].x = Math.round(newPositions[fieldId].x / gridSize) * gridSize;
                                         newPositions[fieldId].y = Math.round(newPositions[fieldId].y / gridSize) * gridSize;
                                     }
                                 }
                             }
                        });
                    }
                } else if (showGrid && gridSize > 0) {
                     // Snap even if not moving pages
                     selectedIds.forEach(id => {
                        const p = newPositions[id];
                        if (p) newPositions[id] = { ...p, x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
                     });
                }
            }
            
            setPositions(newPositions);
            setFieldPages(newFieldPages);

            if (historySnapshot.current) {
                const hasChanged = JSON.stringify(newPositions) !== JSON.stringify(historySnapshot.current.positions) ||
                                   JSON.stringify(newFieldPages) !== JSON.stringify(historySnapshot.current.fieldPages);
                if (hasChanged) recordHistory(historySnapshot.current);
            }
            dragInfo.current = null;
            historySnapshot.current = null;
            document.body.style.cursor = '';
        }

        // Marquee Logic
        if (selectionBox && activePage) {
            const { startX, startY, currentX, currentY } = selectionBox;
            const x = Math.min(startX, currentX);
            const y = Math.min(startY, currentY);
            const w = Math.abs(currentX - startX);
            const h = Math.abs(currentY - startY);

            if (w > 2 || h > 2) { 
                const newSelected: FieldKey[] = [];
                // Simple collision detection against DOM elements
                const canvas = document.getElementById(`print-page-canvas-${activePage}`);
                if (canvas) {
                    const canvasRect = canvas.getBoundingClientRect();
                    const elements = canvas.querySelectorAll('.print-field-wrapper');
                    elements.forEach(el => {
                         const elRect = el.getBoundingClientRect();
                         const elLeft = elRect.left - canvasRect.left;
                         const elTop = elRect.top - canvasRect.top;
                         const elRight = elLeft + elRect.width;
                         const elBottom = elTop + elRect.height;
                         
                         const selRight = x + w;
                         const selBottom = y + h;
                         
                         if (x < elRight && selRight > elLeft && y < elBottom && selBottom > elTop) {
                             const id = el.getAttribute('data-id');
                             if(id) newSelected.push(id);
                         }
                    });
                    setSelectedIds(newSelected);
                }
            } else {
                setSelectedIds([]);
            }
            setSelectionBox(null);
            setActivePage(null);
        }
    }, [selectedIds, selectionBox, activePage, positions, fieldPages, showGrid, gridSize, recordHistory]);

    // Global Listeners
    useEffect(() => {
        if (editingEnabled) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [editingEnabled, handleGlobalMouseMove, handleGlobalMouseUp]);

    // Keyboard Shortcuts
    useEffect(() => {
        if (!editingEnabled) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.shiftKey ? handleRedo() : handleUndo();
                e.preventDefault();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                handleRedo();
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingEnabled, handleUndo, handleRedo]);

    const handleBackgroundUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            setBackgroundImage(dataUrl);
        };
        reader.readAsDataURL(file);
    };

    const handleClearBackground = () => setBackgroundImage(null);

    return {
        // State
        positions, setPositions,
        fieldPages, setFieldPages,
        pageOffsets, setPageOffsets,
        hiddenFields, setHiddenFields,
        
        editingEnabled, setEditingEnabled,
        showLabels, setShowLabels,
        showGrid, setShowGrid,
        gridSize, setGridSize,
        showPlaceholders, setShowPlaceholders,
        forcePage2, setForcePage2,
        
        fontSize, setFontSize,
        fontFamily, setFontFamily,
        backgroundImage,
        
        selectedIds, setSelectedIds,
        selectionBox, setSelectionBox,
        activePage, setActivePage,
        history,

        // Actions
        handleDragStart,
        handleResizeStart,
        handleSave,
        handleReset,
        handleUndo,
        handleRedo,
        handleBackgroundUpload,
        handleClearBackground
    };
};
