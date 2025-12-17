import React, { useState, useEffect } from 'react';
import { XIcon, ArrowUpIcon, ArrowDownIcon, CogIcon, ExclamationCircleIcon } from '../../../../components/Icons';
import { DB_KEYS } from '../../../../services/dbKeys';
import {
    isEntityArray,
    entityIdField,
    inferCategoryByKeyName,
    makeLabel
} from '../../../../services/auditLog';
import {
    ExportBundle,
    ImportPolicy,
    ImportRow,
    ImportSubItem,
    UpdateMode
} from '../types';
import {
    DATA_GROUPS,
    prettifyKey,
    analyzeCounts,
    isRowAllowedByPolicy
} from '../utils/importLogic';
import { getDataForKey } from '../utils/storageHelpers';

interface ImportPreviewModalProps {
    bundle: ExportBundle;
    policy: ImportPolicy;
    onClose: () => void;
    onApply: (rows: ImportRow[]) => void;
}

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({ bundle, policy, onClose, onApply }) => {
    // Nested Accordion State (similar to SelectiveClearModal)
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [selections, setSelections] = useState<Record<string, Set<string>>>({}); // Key -> Set of Item IDs (selected items)
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['docs', 'dicts']));
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [updateModes, setUpdateModes] = useState<Record<string, UpdateMode>>({});
    const [deleteMissingMap, setDeleteMissingMap] = useState<Record<string, boolean>>({});

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Dynamic "Other" group for unknown keys
    const [dynamicGroups, setDynamicGroups] = useState(DATA_GROUPS);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                console.log("🚀 Начало анализа файла импорта...");
                const allKeys = Object.keys(bundle.data);
                const computedRows: ImportRow[] = [];
                const knownSet = new Set(Object.values(DB_KEYS) as string[]);

                // ОПТИМИЗАЦИЯ: Параллельная загрузка данных вместо последовательной
                console.log(`📂 Параллельная загрузка данных для ${allKeys.length} ключей...`);

                // Пропускаем тяжёлые ключи при загрузке (аудит, логи)
                const heavyKeys = new Set(['__import_audit_log__', 'businessAudit', '__import_audit_index__']);

                const loadPromises = allKeys.map(async (k) => {
                    // Пропускаем тяжёлые ключи
                    if (heavyKeys.has(k) || k.includes('audit') || k.includes('Log')) {
                        return [];
                    }
                    try {
                        const data = await getDataForKey(k);
                        return data;
                    } catch (e) {
                        console.warn(`Failed to read key ${k} during import analysis`, e);
                        return null;
                    }
                });

                // Ждём все параллельно с таймаутом 10 секунд
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout loading data')), 10000)
                );

                let results: PromiseSettledResult<any>[];
                try {
                    results = await Promise.race([
                        Promise.allSettled(loadPromises),
                        timeoutPromise.then(() => { throw new Error('Timeout'); })
                    ]) as PromiseSettledResult<any>[];
                } catch (e) {
                    console.warn('⚠️ Timeout при загрузке данных, продолжаем с пустыми значениями');
                    results = allKeys.map(() => ({ status: 'fulfilled' as const, value: [] }));
                }

                const currentDataValues = results.map(r =>
                    r.status === 'fulfilled' ? r.value : null
                );

                console.log(`✅ Загрузка завершена для ${currentDataValues.length} ключей`);

                // Build Groups map
                const keyToGroupId: Record<string, string> = {};
                const otherKeys: string[] = [];

                DATA_GROUPS.forEach(g => {
                    g.keys.forEach(k => keyToGroupId[k] = g.id);
                });

                // Find keys that don't belong to any predefined group
                allKeys.forEach(k => {
                    if (!keyToGroupId[k]) {
                        otherKeys.push(k);
                        keyToGroupId[k] = 'other'; // Assign to dynamic 'other'
                    }
                });

                if (otherKeys.length > 0) {
                    // Ensure 'other' group exists or update it
                    const otherGroupIndex = DATA_GROUPS.findIndex(g => g.id === 'other');
                    if (otherGroupIndex === -1) {
                        setDynamicGroups([...DATA_GROUPS, { id: 'other', label: 'Прочее / Системные', icon: <CogIcon className="w-5 h-5" />, keys: otherKeys }]);
                    } else {
                        // Clone to avoid mutation of constant if we were reusing it
                        const newGroups = [...DATA_GROUPS];
                        newGroups[otherGroupIndex] = { ...newGroups[otherGroupIndex], keys: Array.from(new Set([...newGroups[otherGroupIndex].keys, ...otherKeys])) };
                        setDynamicGroups(newGroups);
                    }
                } else {
                    setDynamicGroups(DATA_GROUPS);
                }

                // Init State
                const initialSelections: Record<string, Set<string>> = {};
                const initialModes: Record<string, UpdateMode> = {};
                const initialDeleteMissing: Record<string, boolean> = {};

                for (let i = 0; i < allKeys.length; i++) {
                    const k = allKeys[i];
                    const known = knownSet.has(k);
                    const cat = inferCategoryByKeyName(k);
                    const inc = bundle.data[k];
                    const current = currentDataValues[i];

                    // ЗАЩИТА: analyzeCounts может упасть на мусоре
                    let stats = { existingCount: 0, incomingCount: 0, newCount: 0, updateCount: 0 };
                    try {
                        stats = analyzeCounts(current, inc);
                    } catch (e) { console.error(`Error calculating stats for ${k}`, e); }

                    // Default Mode
                    let mode: UpdateMode = 'skip';
                    if (policy.allowedModes.has('merge')) mode = 'merge';
                    else if (policy.allowedModes.has('overwrite')) mode = 'overwrite';

                    initialModes[k] = mode;
                    initialDeleteMissing[k] = false;

                    // Build SubItems
                    let subItems: ImportSubItem[] | undefined;
                    const keySelectedIds = new Set<string>();

                    if (isEntityArray(inc)) {
                        const incArr = inc as any[];
                        const baseArr = Array.isArray(current) ? current as any[] : [];
                        const idField = entityIdField(incArr) || 'id';
                        const baseMap = new Map(baseArr.map(e => [e[idField], e]));

                        subItems = incArr.map(item => {
                            const id = item[idField];
                            const exists = baseMap.has(id);
                            let status: 'new' | 'update' | 'same' = exists ? 'update' : 'new';

                            // Безопасное сравнение
                            try {
                                if (exists && JSON.stringify(item) === JSON.stringify(baseMap.get(id))) {
                                    status = 'same';
                                }
                            } catch (e) { }

                            if (status !== 'same') {
                                keySelectedIds.add(String(id));
                            }

                            // --- ВОТ ГДЕ ОБЫЧНО ПАДАЕТ ---
                            let label = '—';
                            try {
                                label = makeLabel(item);
                                if (!label) {
                                    if (item.docNumber) label = `№${item.docNumber}`;
                                    else if (item.series && item.number) label = `${item.series} ${item.number}`;
                                }
                            } catch (err) {
                                // Если упало - просто показываем ID, не роняя приложение
                                label = `Item ${id}`;
                            }
                            // -----------------------------

                            if (k === DB_KEYS.BUSINESS_AUDIT) {
                                try {
                                    const type = item.type || 'Событие';
                                    const at = item.at ? new Date(item.at).toLocaleString('ru-RU') : '';
                                    label = `${type} (${at})`;
                                } catch (e) { label = 'Событие аудита'; }
                            }

                            return { id, label: label || String(id), status, selected: false, data: item };
                        });
                    } else {
                        // Single object or primitive (always select "single" item if new/update)
                        // Logic: if not equal, mark as update.
                        // Safe compare
                        let isSame = false;
                        try {
                            isSame = JSON.stringify(inc) === JSON.stringify(current);
                        } catch (e) { }

                        if (!isSame) {
                            keySelectedIds.add('single');
                        }
                        subItems = [{ id: 'single', label: 'Объект/Значение', status: isSame ? 'same' : (current ? 'update' : 'new'), selected: false, data: inc }];
                    }

                    initialSelections[k] = keySelectedIds;

                    const row: ImportRow = {
                        key: k, category: cat, known, incoming: inc,
                        action: { enabled: true, insertNew: true, updateMode: mode, deleteMissing: false },
                        stats, subItems, isExpanded: false
                    };
                    if (!isRowAllowedByPolicy(row, policy)) row.action.enabled = false;
                    computedRows.push(row);
                }

                if (alive) {
                    console.log("✅ Анализ завершен успешно");
                    setRows(computedRows);
                    setSelections(initialSelections);
                    setUpdateModes(initialModes);
                    setDeleteMissingMap(initialDeleteMissing);
                    setLoading(false);
                }
            } catch (e: any) {
                console.error("🔥 КРИТИЧЕСКАЯ ОШИБКА АНАЛИЗА:", e);
                if (alive) {
                    setError(e.message || "Ошибка при анализе файла импорта.");
                    setLoading(false);
                }
            }
        })();
        return () => { alive = false; };
    }, [bundle, policy]);

    // Handlers
    const toggleExpandGroup = (groupId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
            return next;
        });
    };

    const toggleExpandKey = (key: string) => {
        setExpandedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleGroupSelection = (keys: string[], checked: boolean) => {
        const nextSelections = { ...selections };
        keys.forEach(k => {
            const row = rows.find(r => r.key === k);
            if (!row) return;
            if (checked) {
                // Select all items in key
                const allIds = row.subItems?.map(si => String(si.id)) || [];
                nextSelections[k] = new Set(allIds);
            } else {
                nextSelections[k] = new Set();
            }
        });
        setSelections(nextSelections);
    };

    const toggleKeySelection = (key: string, checked: boolean) => {
        const row = rows.find(r => r.key === key);
        if (!row) return;

        const nextSelections = { ...selections };
        if (checked) {
            const allIds = row.subItems?.map(si => String(si.id)) || [];
            nextSelections[key] = new Set(allIds);
        } else {
            nextSelections[key] = new Set();
        }
        setSelections(nextSelections);
    };

    const toggleItemSelection = (key: string, id: string, checked: boolean) => {
        const nextSelections = { ...selections };
        const set = new Set(nextSelections[key] || []);
        if (checked) set.add(id); else set.delete(id);
        nextSelections[key] = set;
        setSelections(nextSelections);
    };

    const handleApply = () => {
        // Construct final rows with subItems properly set based on selections
        const finalRows = rows.map(r => {
            const selectedSet = selections[r.key];
            const updatedSubItems = r.subItems?.map(si => ({
                ...si,
                selected: selectedSet?.has(String(si.id)) || false
            }));

            // Also need to pass UpdateMode and DeleteMissing
            const action = {
                ...r.action,
                updateMode: updateModes[r.key],
                deleteMissing: deleteMissingMap[r.key],
                enabled: (selectedSet && selectedSet.size > 0) || false
            };

            return { ...r, subItems: updatedSubItems, action };
        });

        onApply(finalRows);
    };

    // UI Helpers for counts
    const getKeyStats = (key: string) => {
        const row = rows.find(r => r.key === key);
        if (!row) return { total: 0, selected: 0 };
        const total = row.subItems?.length || 0;
        const selected = selections[key]?.size || 0;
        return { total, selected };
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Предпросмотр импорта</h3>
                    </div>
                    <button onClick={onClose}><XIcon className="h-5 w-5 text-gray-500" /></button>
                </div>

                <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-gray-900/50">
                    {loading ? <div className="text-center p-8 text-gray-500">Анализ данных...</div> : error ? (
                        <div className="p-8 text-center text-red-600 flex flex-col items-center gap-2">
                            <ExclamationCircleIcon className="h-10 w-10" />
                            <p>{error}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {dynamicGroups.map(group => {
                                // Filter keys that are present in the import bundle
                                const groupKeys = group.keys.filter(k => rows.some(r => r.key === k));
                                if (groupKeys.length === 0) return null; // Skip empty groups

                                const isGroupExpanded = expandedGroups.has(group.id);

                                // Calc Group Stats
                                let groupTotalItems = 0;
                                let groupSelectedItems = 0;
                                groupKeys.forEach(k => {
                                    const s = getKeyStats(k);
                                    groupTotalItems += s.total;
                                    groupSelectedItems += s.selected;
                                });

                                const isGroupAllSelected = groupTotalItems > 0 && groupSelectedItems === groupTotalItems;
                                const isGroupIndeterminate = groupSelectedItems > 0 && !isGroupAllSelected;

                                return (
                                    <div key={group.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between p-3 bg-gray-100/50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => toggleExpandGroup(group.id)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500">
                                                    {isGroupExpanded ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                                                </button>
                                                <input
                                                    type="checkbox"
                                                    checked={isGroupAllSelected}
                                                    ref={input => { if (input) input.indeterminate = isGroupIndeterminate; }}
                                                    onChange={(e) => toggleGroupSelection(groupKeys, e.target.checked)}
                                                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200">
                                                    {group.icon}
                                                    {group.label}
                                                </div>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                                                {groupSelectedItems > 0 ? <span className="text-blue-600">{groupSelectedItems} / {groupTotalItems}</span> : groupTotalItems}
                                            </span>
                                        </div>

                                        {isGroupExpanded && (
                                            <div className="divide-y dark:divide-gray-700 border-t dark:border-gray-700">
                                                {groupKeys.map(key => {
                                                    const row = rows.find(r => r.key === key)!;
                                                    const isKeyExpanded = expandedKeys.has(key);
                                                    const { total, selected } = getKeyStats(key);
                                                    const isKeyAllSelected = total > 0 && selected === total;
                                                    const isKeyIndeterminate = selected > 0 && !isKeyAllSelected;
                                                    const subItems = row.subItems || [];

                                                    // Update Modes
                                                    const currentMode = updateModes[key];
                                                    const canDeleteMissing = policy.allowDeleteMissing;

                                                    return (
                                                        <div key={key} className="bg-white dark:bg-gray-800">
                                                            <div className="flex items-center justify-between p-3 pl-8 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors border-l-4 border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                                                                <div className="flex items-center gap-3 flex-1">
                                                                    <button onClick={() => toggleExpandKey(key)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500">
                                                                        {isKeyExpanded ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                                                                    </button>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isKeyAllSelected}
                                                                        ref={input => { if (input) input.indeterminate = isKeyIndeterminate; }}
                                                                        onChange={(e) => toggleKeySelection(key, e.target.checked)}
                                                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                    />
                                                                    <div className="flex flex-col">
                                                                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{prettifyKey(key)}</span>
                                                                        <div className="flex gap-2 text-[10px] uppercase font-bold tracking-wider">
                                                                            {row.stats && (
                                                                                <>
                                                                                    {row.stats.newCount > 0 && <span className="text-green-600">+{row.stats.newCount} Нов</span>}
                                                                                    {row.stats.updateCount > 0 && <span className="text-blue-600">~{row.stats.updateCount} Обн</span>}
                                                                                    {(row.stats.newCount === 0 && row.stats.updateCount === 0) && <span className="text-gray-400">Без изменений</span>}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-4">
                                                                    <div className="flex flex-col items-end">
                                                                        <select
                                                                            value={currentMode}
                                                                            onChange={(e) => setUpdateModes(prev => ({ ...prev, [key]: e.target.value as UpdateMode }))}
                                                                            className="p-1 text-xs border rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 w-48"
                                                                            onClick={e => e.stopPropagation()}
                                                                        >
                                                                            <option value="merge">Объединить (безопасно)</option>
                                                                            <option value="overwrite">Перезаписать (полностью)</option>
                                                                            <option value="skip">Только новые (пропустить)</option>
                                                                        </select>
                                                                        {canDeleteMissing && (
                                                                            <label className="flex items-center gap-1 mt-1 cursor-pointer" onClick={e => e.stopPropagation()}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={deleteMissingMap[key]}
                                                                                    onChange={e => setDeleteMissingMap(prev => ({ ...prev, [key]: e.target.checked }))}
                                                                                    className="h-3 w-3 rounded text-red-600 focus:ring-red-500"
                                                                                />
                                                                                <span className="text-[10px] text-red-600 dark:text-red-400">Удалять отсутствующие</span>
                                                                            </label>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded w-16 text-center">
                                                                        {selected} / {total}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {isKeyExpanded && (
                                                                <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 pl-14 pr-4 py-2 text-xs max-h-60 overflow-y-auto">
                                                                    <table className="w-full">
                                                                        <thead>
                                                                            <tr className="text-gray-500 dark:text-gray-400 text-left">
                                                                                <th className="p-2 w-8"></th>
                                                                                <th className="p-2">Наименование</th>
                                                                                <th className="p-2">ID</th>
                                                                                <th className="p-2">Статус</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {subItems.map(item => (
                                                                                <tr key={item.id} className="hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                                                                                    <td className="p-2">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={selections[key]?.has(String(item.id))}
                                                                                            onChange={(e) => toggleItemSelection(key, String(item.id), e.target.checked)}
                                                                                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                                                        />
                                                                                    </td>
                                                                                    <td className="p-2 font-medium text-gray-800 dark:text-gray-200">{item.label}</td>
                                                                                    <td className="p-2 font-mono text-gray-500">{item.id}</td>
                                                                                    <td className="p-2">
                                                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${item.status === 'new' ? 'bg-green-100 text-green-700' : item.status === 'update' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                                                                            {item.status === 'new' ? 'Новый' : item.status === 'update' ? 'Обновл.' : 'Без изм.'}
                                                                                        </span>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Отмена</button>
                    <button
                        onClick={handleApply}
                        disabled={loading || !!error}
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50"
                    >
                        Импортировать выбранное
                    </button>
                </div>
            </div>
        </div>
    );
};