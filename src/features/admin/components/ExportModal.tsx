import React, { useState, useEffect } from 'react';
import { DownloadIcon, XIcon, ArrowUpIcon, ArrowDownIcon, UserGroupIcon } from '../../../../components/Icons';
import { getEmployees } from '../../../../services/mockApi';
import { DB_KEYS } from '../../../../services/dbKeys';
import { Employee } from '../../../../types';
import { getDataForKey, inspectKeyCount } from '../utils/storageHelpers';
import { DATA_GROUPS, prettifyKey, KEY_BLOCKLIST } from '../utils/importLogic';

interface ExportModalProps {
    onClose: () => void;
    onConfirm: (selectedKeys: string[], preloadedData?: Record<string, unknown>) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose, onConfirm }) => {
    const [exportMode, setExportMode] = useState<'general' | 'employee'>('general');
    const [counts, setCounts] = useState<Record<string, number>>({});
    
    // General Mode State
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(DATA_GROUPS.map(g => g.id))); // All groups by default
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    
    // Employee Mode State
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [employeeDataStats, setEmployeeDataStats] = useState<Record<string, number>>({});
    
    const [loading, setLoading] = useState(true);
    const [analyzingEmployee, setAnalyzingEmployee] = useState(false);

    // Initial Load (Counts + Employees)
    useEffect(() => {
        const loadInit = async () => {
            setLoading(true);
            const emps = await getEmployees();
            setEmployees(emps.filter(e => e.employeeType === 'driver'));
            
            // Count all keys for General mode
            const newCounts: Record<string, number> = {};
            const allKeys = DATA_GROUPS.flatMap(g => g.keys);
            for(const k of allKeys) {
                newCounts[k] = await inspectKeyCount(k);
            }
            setCounts(newCounts);
            
            // Auto-select all keys that have data
            const validKeys = allKeys.filter(k => newCounts[k] > 0 && !KEY_BLOCKLIST.has(k));
            setSelectedKeys(new Set(validKeys));

            setLoading(false);
        };
        loadInit();
    }, []);

    // Analyze Employee Data when selected
    useEffect(() => {
        if (!selectedEmployeeId || exportMode !== 'employee') {
            setEmployeeDataStats({});
            return;
        }

        const analyze = async () => {
            setAnalyzingEmployee(true);
            const stats: Record<string, number> = {};
            
            // 1. Waybills
            const wbs = await getDataForKey(DB_KEYS.WAYBILLS);
            stats['waybills'] = Array.isArray(wbs) ? wbs.filter((w: any) => w.driverId === selectedEmployeeId).length : 0;
            
            // 2. Vehicles (Assigned)
            const vehs = await getDataForKey(DB_KEYS.VEHICLES);
            stats['vehicles'] = Array.isArray(vehs) ? vehs.filter((v: any) => v.assignedDriverId === selectedEmployeeId).length : 0;
            
            // 3. Transactions (Fuel/Stock)
            const txs = await getDataForKey(DB_KEYS.STOCK_TRANSACTIONS);
            stats['transactions'] = Array.isArray(txs) ? txs.filter((t: any) => t.driverId === selectedEmployeeId).length : 0;
            
            // 4. Blanks
            const blks = await getDataForKey(DB_KEYS.WAYBILL_BLANKS);
            stats['blanks'] = Array.isArray(blks) ? blks.filter((b: any) => b.ownerEmployeeId === selectedEmployeeId).length : 0;
            
            // 5. Fuel Schedules
            const schs = await getDataForKey(DB_KEYS.FUEL_CARD_SCHEDULES);
            stats['schedules'] = Array.isArray(schs) ? schs.filter((s: any) => s.driverId === selectedEmployeeId).length : 0;

            setEmployeeDataStats(stats);
            setAnalyzingEmployee(false);
        };
        analyze();
    }, [selectedEmployeeId, exportMode]);


    // Handlers for General Mode
    const toggleGroup = (groupId: string, groupKeys: string[], checked: boolean) => {
        const nextKeys = new Set(selectedKeys);
        groupKeys.forEach(k => {
            if (checked && counts[k] > 0) nextKeys.add(k);
            else nextKeys.delete(k);
        });
        setSelectedKeys(nextKeys);
    };

    const toggleKey = (key: string, checked: boolean) => {
        const nextKeys = new Set(selectedKeys);
        if (checked) nextKeys.add(key);
        else nextKeys.delete(key);
        setSelectedKeys(nextKeys);
    };

    const toggleExpandGroup = (groupId: string) => {
        const next = new Set(expandedGroups);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        setExpandedGroups(next);
    };

    const handleConfirm = async () => {
        if (exportMode === 'general') {
            onConfirm(Array.from(selectedKeys));
        } else {
            // Build Employee Data Bundle
            setLoading(true);
            const bundleData: Record<string, any> = {};
            
            // 1. Employee Self
            const allEmps = await getDataForKey(DB_KEYS.EMPLOYEES);
            bundleData[DB_KEYS.EMPLOYEES] = Array.isArray(allEmps) ? allEmps.filter((e: any) => e.id === selectedEmployeeId) : [];
            
            // 2. Filtered Lists
            const wbs = await getDataForKey(DB_KEYS.WAYBILLS);
            if (Array.isArray(wbs)) bundleData[DB_KEYS.WAYBILLS] = wbs.filter((w: any) => w.driverId === selectedEmployeeId);
            
            const vehs = await getDataForKey(DB_KEYS.VEHICLES);
            if (Array.isArray(vehs)) bundleData[DB_KEYS.VEHICLES] = vehs.filter((v: any) => v.assignedDriverId === selectedEmployeeId);
            
            const txs = await getDataForKey(DB_KEYS.STOCK_TRANSACTIONS);
            if (Array.isArray(txs)) bundleData[DB_KEYS.STOCK_TRANSACTIONS] = txs.filter((t: any) => t.driverId === selectedEmployeeId);
            
            const blks = await getDataForKey(DB_KEYS.WAYBILL_BLANKS);
            if (Array.isArray(blks)) bundleData[DB_KEYS.WAYBILL_BLANKS] = blks.filter((b: any) => b.ownerEmployeeId === selectedEmployeeId);
            
            const schs = await getDataForKey(DB_KEYS.FUEL_CARD_SCHEDULES);
            if (Array.isArray(schs)) bundleData[DB_KEYS.FUEL_CARD_SCHEDULES] = schs.filter((s: any) => s.driverId === selectedEmployeeId);
            
            // 3. Context Data (Dictionaries - FULL for integrity)
            // We include Organizations, FuelTypes, SavedRoutes to ensure valid references
            bundleData[DB_KEYS.ORGANIZATIONS] = await getDataForKey(DB_KEYS.ORGANIZATIONS);
            bundleData[DB_KEYS.FUEL_TYPES] = await getDataForKey(DB_KEYS.FUEL_TYPES);
            bundleData[DB_KEYS.SAVED_ROUTES] = await getDataForKey(DB_KEYS.SAVED_ROUTES);

            onConfirm(Object.keys(bundleData), bundleData);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <DownloadIcon className="h-5 w-5" /> Экспорт данных
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"><XIcon className="h-5 w-5" /></button>
            </div>
            
            {/* TABS */}
            <div className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                <button 
                    onClick={() => setExportMode('general')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${exportMode === 'general' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    По категориям (Общий)
                </button>
                <button 
                    onClick={() => setExportMode('employee')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${exportMode === 'employee' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    По сотруднику (Выборочный)
                </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-gray-900/50">
            {loading ? <div className="text-center text-gray-500 p-8">Анализ хранилища...</div> : (
                <>
                {exportMode === 'general' && (
                    <div className="space-y-3">
                        {DATA_GROUPS.map(group => {
                            const groupKeys = group.keys;
                            const groupTotalKeys = groupKeys.length;
                            const groupSelectedKeys = groupKeys.filter(k => selectedKeys.has(k)).length;
                            const hasDataCount = groupKeys.reduce((sum, k) => sum + (counts[k] || 0), 0);
                            
                            const isAllSelected = groupTotalKeys > 0 && groupSelectedKeys === groupTotalKeys;
                            const isIndeterminate = groupSelectedKeys > 0 && !isAllSelected;
                            const isExpanded = expandedGroups.has(group.id);

                            return (
                                <div key={group.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                     <div className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => toggleExpandGroup(group.id)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500">
                                                {isExpanded ? <ArrowUpIcon className="h-4 w-4"/> : <ArrowDownIcon className="h-4 w-4"/>}
                                            </button>
                                            <input 
                                                type="checkbox" 
                                                checked={isAllSelected}
                                                ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                                                onChange={(e) => toggleGroup(group.id, groupKeys, e.target.checked)}
                                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                disabled={hasDataCount === 0}
                                            />
                                            <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200">
                                                {group.icon}
                                                {group.label}
                                            </div>
                                        </div>
                                        <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                            {hasDataCount} записей
                                        </span>
                                    </div>
                                    
                                    {isExpanded && (
                                        <div className="border-t dark:border-gray-700 pl-10 pr-4 py-2 space-y-1 bg-gray-50/50 dark:bg-gray-900/20">
                                            {groupKeys.map(key => (
                                                <label key={key} className="flex items-center justify-between p-2 rounded hover:bg-white dark:hover:bg-gray-700 cursor-pointer transition-colors">
                                                    <div className="flex items-center gap-2">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedKeys.has(key)}
                                                            onChange={e => toggleKey(key, e.target.checked)}
                                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                            disabled={counts[key] === 0}
                                                        />
                                                        <span className="text-sm text-gray-700 dark:text-gray-300">{prettifyKey(key)}</span>
                                                    </div>
                                                    <span className="text-xs text-gray-400">{counts[key] || 0}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {exportMode === 'employee' && (
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Выберите сотрудника (водителя)</label>
                            <div className="relative">
                                <select 
                                    className="w-full p-2 pl-9 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white appearance-none"
                                    value={selectedEmployeeId}
                                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                >
                                    <option value="">-- Не выбран --</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.shortName}</option>)}
                                </select>
                                <UserGroupIcon className="absolute left-2.5 top-2.5 h-5 w-5 text-gray-400" />
                            </div>
                        </div>

                        {selectedEmployeeId && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-3 uppercase tracking-wide">Найдено данных</h4>
                                {analyzingEmployee ? (
                                    <div className="text-sm text-blue-600 animate-pulse">Анализ связей...</div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="flex justify-between p-2 bg-white dark:bg-gray-800 rounded border border-blue-100 dark:border-blue-800">
                                            <span>Путевые листы:</span>
                                            <span className="font-bold">{employeeDataStats.waybills || 0}</span>
                                        </div>
                                        <div className="flex justify-between p-2 bg-white dark:bg-gray-800 rounded border border-blue-100 dark:border-blue-800">
                                            <span>Транспорт:</span>
                                            <span className="font-bold">{employeeDataStats.vehicles || 0}</span>
                                        </div>
                                        <div className="flex justify-between p-2 bg-white dark:bg-gray-800 rounded border border-blue-100 dark:border-blue-800">
                                            <span>Операции склада:</span>
                                            <span className="font-bold">{employeeDataStats.transactions || 0}</span>
                                        </div>
                                        <div className="flex justify-between p-2 bg-white dark:bg-gray-800 rounded border border-blue-100 dark:border-blue-800">
                                            <span>Бланки:</span>
                                            <span className="font-bold">{employeeDataStats.blanks || 0}</span>
                                        </div>
                                        <div className="col-span-2 text-xs text-gray-500 mt-2">
                                            * Справочники (Организации, Топливо, Маршруты) будут добавлены автоматически для целостности данных.
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                </>
            )}
            </div>

            <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800 shrink-0">
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600 font-medium transition-colors">Отмена</button>
                <button 
                    onClick={handleConfirm} 
                    className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed font-medium shadow-sm transition-colors flex items-center gap-2" 
                    disabled={exportMode === 'general' ? selectedKeys.size === 0 : !selectedEmployeeId}
                >
                    <DownloadIcon className="h-4 w-4" />
                    Экспортировать
                </button>
            </div>
        </div>
        </div>
    );
};