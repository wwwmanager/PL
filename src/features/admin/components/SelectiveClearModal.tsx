import React, { useState, useEffect } from 'react';
import { TrashIcon, XIcon, ArrowUpIcon, ArrowDownIcon } from '../../../../components/Icons';
import { getDataForKey } from '../utils/storageHelpers';
import { DATA_GROUPS, prettifyKey, getItemLabel } from '../utils/importLogic';

interface SelectiveClearModalProps {
  onClose: () => void;
  onConfirm: (selections: Record<string, Set<string>>) => void;
}

export const SelectiveClearModal: React.FC<SelectiveClearModalProps> = ({ onClose, onConfirm }) => {
    const [dataMap, setDataMap] = useState<Record<string, any[]>>({});
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [selections, setSelections] = useState<Record<string, Set<string>>>({});
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['docs']));
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadAll = async () => {
            const newCounts: Record<string, number> = {};
            const newDataMap: Record<string, any[]> = {};
            
            const allKeys = DATA_GROUPS.flatMap(g => g.keys);
            
            for (const key of allKeys) {
                try {
                    const val = await getDataForKey(key);
                    if (Array.isArray(val)) {
                        newCounts[key] = val.length;
                        newDataMap[key] = val;
                    } else if (val && typeof val === 'object') {
                        newCounts[key] = 1;
                        newDataMap[key] = [val];
                    } else {
                        newCounts[key] = 0;
                        newDataMap[key] = [];
                    }
                } catch {
                    newCounts[key] = 0;
                    newDataMap[key] = [];
                }
            }
            setCounts(newCounts);
            setDataMap(newDataMap);
            setLoading(false);
        };
        loadAll();
    }, []);

    const toggleGroup = (groupId: string, keys: string[], checked: boolean) => {
        const newSelections = { ...selections };
        keys.forEach(key => {
            if (checked) {
                const allIds = dataMap[key]?.map((item: any) => item.id || 'single') || [];
                newSelections[key] = new Set(allIds);
            } else {
                delete newSelections[key];
            }
        });
        setSelections(newSelections);
    };

    const toggleKey = (key: string, checked: boolean) => {
        const newSelections = { ...selections };
        if (checked) {
            const allIds = dataMap[key]?.map((item: any) => item.id || 'single') || [];
            newSelections[key] = new Set(allIds);
        } else {
            delete newSelections[key];
        }
        setSelections(newSelections);
    };

    const toggleItem = (key: string, id: string, checked: boolean) => {
        const newSelections = { ...selections };
        if (!newSelections[key]) newSelections[key] = new Set();
        
        if (checked) newSelections[key].add(id);
        else newSelections[key].delete(id);
        
        if (newSelections[key].size === 0) delete newSelections[key];
        setSelections(newSelections);
    };

    const toggleExpandGroup = (groupId: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupId)) newExpanded.delete(groupId);
        else newExpanded.add(groupId);
        setExpandedGroups(newExpanded);
    };

    const toggleExpandKey = (key: string) => {
        const newExpanded = new Set(expandedKeys);
        if (newExpanded.has(key)) newExpanded.delete(key);
        else newExpanded.add(key);
        setExpandedKeys(newExpanded);
    };

    const totalSelectedCount = Object.values(selections).reduce((sum: number, set) => sum + (set as Set<string>).size, 0);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 shrink-0">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-500">
                        <TrashIcon className="h-6 w-6" />
                        <h3 className="text-lg font-bold">Выборочное удаление данных</h3>
                    </div>
                    <button onClick={onClose}><XIcon className="h-5 w-5 text-gray-500" /></button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-gray-900/50">
                    {loading ? (
                        <div className="text-center p-8 text-gray-500">Анализ данных...</div>
                    ) : (
                        <div className="space-y-4">
                            {DATA_GROUPS.map(group => {
                                const groupKeys = group.keys;
                                const groupTotal = groupKeys.reduce((sum, k) => sum + (counts[k] || 0), 0);
                                
                                let totalSelectedInGroup = 0;
                                let isAllGroupSelected = true;
                                groupKeys.forEach(k => {
                                    const selectedCount = selections[k]?.size || 0;
                                    const totalCount = counts[k] || 0;
                                    totalSelectedInGroup += selectedCount;
                                    if (selectedCount !== totalCount || totalCount === 0) isAllGroupSelected = false;
                                });
                                
                                if (groupTotal === 0) isAllGroupSelected = false;

                                const isGroupIndeterminate = totalSelectedInGroup > 0 && !isAllGroupSelected;
                                const isGroupExpanded = expandedGroups.has(group.id);

                                return (
                                    <div key={group.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between p-3 bg-gray-100/50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => toggleExpandGroup(group.id)}
                                                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                                                >
                                                    {isGroupExpanded ? <ArrowUpIcon className="h-4 w-4"/> : <ArrowDownIcon className="h-4 w-4"/>}
                                                </button>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isAllGroupSelected}
                                                    ref={input => { if (input) input.indeterminate = isGroupIndeterminate; }}
                                                    onChange={(e) => toggleGroup(group.id, groupKeys, e.target.checked)}
                                                    disabled={groupTotal === 0}
                                                    className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-50"
                                                />
                                                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200">
                                                    {group.icon}
                                                    {group.label}
                                                </div>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                                                {totalSelectedInGroup > 0 ? <span className="text-red-600">{totalSelectedInGroup} / {groupTotal}</span> : groupTotal}
                                            </span>
                                        </div>
                                        
                                        {isGroupExpanded && (
                                            <div className="divide-y dark:divide-gray-700 border-t dark:border-gray-700 pl-4">
                                                {groupKeys.map(key => {
                                                    const keyTotal = counts[key] || 0;
                                                    const keySelected = selections[key]?.size || 0;
                                                    const isKeyAllSelected = keyTotal > 0 && keySelected === keyTotal;
                                                    const isKeyIndeterminate = keySelected > 0 && !isKeyAllSelected;
                                                    const isKeyExpanded = expandedKeys.has(key);
                                                    const items = dataMap[key] || [];
                                                    const isArray = items.length > 0 && (items.length > 1 || (items[0] && items[0].id));

                                                    return (
                                                        <div key={key}>
                                                            <div className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    {isArray ? (
                                                                        <button 
                                                                            onClick={() => toggleExpandKey(key)}
                                                                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                                                                        >
                                                                            {isKeyExpanded ? <ArrowUpIcon className="h-4 w-4"/> : <ArrowDownIcon className="h-4 w-4"/>}
                                                                        </button>
                                                                    ) : <div className="w-6"></div>}
                                                                    
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={isKeyAllSelected}
                                                                        ref={input => { if (input) input.indeterminate = isKeyIndeterminate; }}
                                                                        onChange={(e) => toggleKey(key, e.target.checked)}
                                                                        disabled={keyTotal === 0}
                                                                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-50"
                                                                    />
                                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                                        {prettifyKey(key)}
                                                                    </span>
                                                                </div>
                                                                <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                                                                    {keySelected > 0 ? `${keySelected} / ${keyTotal}` : keyTotal}
                                                                </span>
                                                            </div>

                                                            {isKeyExpanded && isArray && (
                                                                <div className="pl-12 pr-4 pb-2 text-xs max-h-60 overflow-y-auto border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20">
                                                                    {items.map((item: any, idx) => (
                                                                        <label key={item.id || idx} className="flex items-center gap-2 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 cursor-pointer rounded px-2">
                                                                            <input 
                                                                                type="checkbox"
                                                                                checked={selections[key]?.has(item.id || 'single')}
                                                                                onChange={(e) => toggleItem(key, item.id || 'single', e.target.checked)}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                                                            />
                                                                            <span className="text-gray-600 dark:text-gray-400 truncate">
                                                                                {getItemLabel(item, key)}
                                                                            </span>
                                                                        </label>
                                                                    ))}
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

                <div className="p-4 border-t dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 shrink-0">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        Выбрано записей: <b>{totalSelectedCount}</b>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Отмена</button>
                        <button 
                            onClick={() => onConfirm(selections)} 
                            disabled={totalSelectedCount === 0}
                            className="px-6 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <TrashIcon className="h-5 w-5" />
                            Удалить выбранное
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};