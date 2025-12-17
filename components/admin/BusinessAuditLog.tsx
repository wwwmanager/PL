
import React, { useState, useEffect, useMemo } from 'react';
import { getEvents, BusinessEvent } from '../../services/auditBusiness';
import { useAuth } from '../../services/auth';
import { getWaybills, getEmployees, getBlanks, getBlankBatches, getUsers } from '../../services/mockApi';
import { Waybill, Employee, WaybillBlank, WaybillBlankBatch, User } from '../../types';
import { BUSINESS_EVENT_CONFIG } from '../../constants';
import { VirtualDataTable, Column } from '../shared/VirtualDataTable';
import { DocumentTextIcon, UserGroupIcon, ArchiveBoxIcon, CheckCircleIcon, AlertIcon } from '../Icons';

type EnrichedBusinessEvent = BusinessEvent & {
    id: string;
    typeLabel: string;
    typeColor: string;
    typeIcon: 'doc' | 'blank' | 'user' | 'alert' | 'default';
    userDisplayName: string;
    formattedDate: string;
    rawType: string; // for filtering
};

const BusinessAuditLog: React.FC = () => {
    const [events, setEvents] = useState<BusinessEvent[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Dictionaries for lookup
    const [waybills, setWaybills] = useState<Map<string, Waybill>>(new Map());
    const [employees, setEmployees] = useState<Map<string, Employee>>(new Map());
    const [blanks, setBlanks] = useState<Map<string, WaybillBlank>>(new Map());
    const [batches, setBatches] = useState<Map<string, WaybillBlankBatch>>(new Map());
    const [users, setUsers] = useState<Map<string, User>>(new Map());

    const { can } = useAuth();

    useEffect(() => {
        const loadData = async () => {
            if (can('audit.business.read')) {
                const [eventData, waybillData, employeeData, blankData, batchData, userData] = await Promise.all([
                    getEvents(),
                    getWaybills(),
                    getEmployees(),
                    getBlanks(),
                    getBlankBatches(),
                    getUsers()
                ]);
                
                setEvents(eventData);
                setWaybills(new Map(waybillData.map(w => [w.id, w])));
                setEmployees(new Map(employeeData.map(e => [e.id, e])));
                setBlanks(new Map(blankData.map(b => [b.id, b])));
                setBatches(new Map(batchData.map(b => [b.id, b])));
                setUsers(new Map(userData.map(u => [u.id, u])));
            }
            setLoading(false);
        };
        loadData();
    }, [can]);

    const enrichedEvents = useMemo<EnrichedBusinessEvent[]>(() => {
        return events.map(event => {
            const config = BUSINESS_EVENT_CONFIG[event.type] || { label: event.type, color: 'bg-gray-100 text-gray-800', icon: 'default' };
            
            // Resolve user name (actor)
            let userDisplayName = 'Система';
            if (event.userId) {
                // Fallback to simple check
                userDisplayName = event.userId;
                // Try to find in System Users
                const user = users.get(event.userId);
                if (user) {
                    userDisplayName = user.displayName;
                } else {
                    // Try to find in Employees (drivers/dispatchers)
                    const emp = employees.get(event.userId);
                    if (emp) userDisplayName = emp.shortName;
                }
            }

            return {
                ...event,
                typeLabel: config.label,
                typeColor: config.color,
                typeIcon: config.icon as any,
                userDisplayName,
                formattedDate: new Date(event.at).toLocaleString('ru-RU'),
                rawType: event.type,
            };
        });
    }, [events, employees, users]);

    // Render Helpers
    const getIcon = (type: string) => {
        switch (type) {
            case 'doc': return <DocumentTextIcon className="h-5 w-5" />;
            case 'blank': return <ArchiveBoxIcon className="h-5 w-5" />;
            case 'user': return <UserGroupIcon className="h-5 w-5" />;
            case 'alert': return <AlertIcon className="h-5 w-5" />;
            default: return <CheckCircleIcon className="h-5 w-5" />;
        }
    };

    const renderDetails = (event: EnrichedBusinessEvent) => {
        const p = event.payload as any;
        if (!p) return <span className="text-gray-400">Нет данных</span>;

        switch (event.rawType) {
            case 'waybill.created':
            case 'waybill.submitted':
            case 'waybill.posted':
            case 'waybill.cancelled':
                const wb = waybills.get(p.waybillId);
                return (
                    <span>
                        {wb ? (
                            <>ПЛ <span className="font-semibold text-blue-600 dark:text-blue-400">№{wb.number}</span> от {new Date(wb.date).toLocaleDateString()}</>
                        ) : (
                            <span className="text-gray-500 italic">ПЛ удален (ID: {p.waybillId})</span>
                        )}
                    </span>
                );
            case 'waybill.corrected':
                const wbCorr = waybills.get(p.waybillId);
                return (
                    <div className="flex flex-col">
                        <span>
                            {wbCorr ? (
                                <>ПЛ <span className="font-semibold text-blue-600 dark:text-blue-400">№{wbCorr.number}</span> возвращен в черновик.</>
                            ) : (
                                <span className="text-gray-500 italic">ПЛ (удален) ID: {p.waybillId}</span>
                            )}
                        </span>
                        {p.reason && <span className="text-xs text-orange-600 dark:text-orange-400 mt-1">Причина: {p.reason}</span>}
                    </div>
                );
            case 'blanks.batchCreated':
                return <span>Создана новая пачка (ID: {p.batchId})</span>;
            case 'blanks.materialized':
                const batch = batches.get(p.batchId);
                return (
                    <span>
                        Материализовано <span className="font-bold">{p.created}</span> бланков 
                        {batch ? ` (Серия ${batch.series})` : ''}
                    </span>
                );
            case 'blanks.issued':
                const emp = employees.get(p.params?.ownerEmployeeId);
                const ranges = p.params?.ranges || [];
                const rangeStr = ranges.map((r: any) => `${r.from}-${r.to}`).join(', ');
                return (
                    <div className="flex flex-col">
                        <span>
                            Выдано водителю: <span className="font-semibold">{emp ? emp.shortName : 'Неизвестный'}</span>
                        </span>
                        <span className="text-xs text-gray-500">Диапазоны: {rangeStr}</span>
                    </div>
                );
            case 'blank.spoiled':
                const b = blanks.get(p.params?.blankId);
                const reason = p.params?.reasonCode || 'other';
                return (
                    <div>
                        Бланк {b ? <span className="font-mono font-bold">{b.series} {b.number}</span> : `ID: ${p.params?.blankId}`} списан.
                        {p.params?.note && <div className="text-xs text-red-500">Причина: {p.params.note}</div>}
                    </div>
                );
            case 'employee.fuelReset':
                const empReset = employees.get(p.employeeId);
                return (
                    <span>
                        Сброс баланса для <span className="font-semibold">{empReset ? empReset.shortName : p.employeeId}</span>.
                        <span className="text-xs text-gray-500 ml-2">(Было: {p.oldBalance} л)</span>
                    </span>
                );
            default:
                return <span className="font-mono text-xs text-gray-500">{JSON.stringify(p)}</span>;
        }
    };

    const columns: Column<EnrichedBusinessEvent>[] = [
        { 
            key: 'at', 
            label: 'Дата/Время', 
            sortable: true, 
            width: '160px',
            render: (e) => <span className="text-gray-600 dark:text-gray-300 text-xs">{e.formattedDate}</span>
        },
        { 
            key: 'typeLabel', 
            label: 'Событие', 
            sortable: true, 
            width: '220px',
            render: (e) => (
                <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium border border-transparent ${e.typeColor}`}>
                    {getIcon(e.typeIcon)}
                    {e.typeLabel}
                </div>
            )
        },
        { 
            key: 'userDisplayName', 
            label: 'Пользователь', 
            sortable: true, 
            width: '150px' 
        },
        { 
            key: 'payload', 
            label: 'Детали', 
            render: (e) => renderDetails(e)
        }
    ];

    if (!can('audit.business.read')) {
        return <div className="p-4 text-gray-500">Нет доступа к журналу бизнес-событий.</div>;
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Загрузка журнала событий...</div>;
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-[600px] flex flex-col">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Бизнес-аудит</h3>
                <span className="text-sm text-gray-500">Всего событий: {enrichedEvents.length}</span>
            </div>
            
            <div className="flex-1 min-h-0">
                <VirtualDataTable
                    data={enrichedEvents}
                    columns={columns}
                    rowKey="id"
                    estimatedRowHeight={60}
                    height="100%"
                />
            </div>
        </div>
    );
};

export default BusinessAuditLog;
