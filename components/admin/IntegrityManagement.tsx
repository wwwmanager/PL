
import React, { useState, useMemo } from 'react';
import { usePeriodLocks, useVerifyPeriod, useDeletePeriodLock } from '../../hooks/useIntegrity';
import { useEmployees, useVehicles } from '../../hooks/queries'; // Re-use existing hooks for user data if needed, or get users
import { getUsers } from '../../services/mockApi'; // Direct call for users mapping
import { ShieldCheckIcon, QuestionMarkCircleIcon, ExclamationCircleIcon, TrashIcon, ArrowPathIcon, PlusIcon } from '../Icons';
import ClosePeriodModal from './ClosePeriodModal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import { User } from '../../types';

// Types for local state
type VerificationResult = {
    isValid: boolean;
    currentHash: string;
    details?: string;
    checkedAt: number;
};

const IntegrityManagement: React.FC = () => {
    const { data: locks, isLoading } = usePeriodLocks();
    const { mutate: verify, isPending: isVerifying } = useVerifyPeriod();
    const { mutate: deleteLock } = useDeletePeriodLock();
    const { showToast } = useToast();

    const [users, setUsers] = useState<Map<string, string>>(new Map());
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    
    // Store verification results locally in memory
    const [verificationResults, setVerificationResults] = useState<Record<string, VerificationResult>>({});
    const [verifyingId, setVerifyingId] = useState<string | null>(null);

    // Load users for mapping IDs to names
    React.useEffect(() => {
        getUsers().then((data) => {
            const map = new Map<string, string>();
            data.forEach(u => map.set(u.id, u.displayName));
            setUsers(map);
        });
    }, []);

    const handleVerify = (lockId: string) => {
        setVerifyingId(lockId);
        verify(lockId, {
            onSuccess: (result) => {
                setVerificationResults(prev => ({
                    ...prev,
                    [lockId]: {
                        isValid: result.isValid,
                        currentHash: result.currentHash,
                        details: result.details,
                        checkedAt: Date.now()
                    }
                }));
                if (!result.isValid) {
                    showToast('Внимание! Нарушение целостности данных.', 'error');
                } else {
                    showToast('Данные корректны.', 'success');
                }
            },
            onError: (err) => {
                showToast(`Ошибка проверки: ${(err as Error).message}`, 'error');
            },
            onSettled: () => {
                setVerifyingId(null);
            }
        });
    };

    const handleDelete = () => {
        if (deleteId) {
            deleteLock(deleteId);
            setDeleteId(null);
            showToast('Блокировка периода снята. Данные доступны для редактирования.', 'info');
        }
    };

    const formatHash = (hash: string) => hash.substring(0, 10) + '...';

    if (isLoading) return <div className="p-8 text-center text-gray-500">Загрузка данных...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <ShieldCheckIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                        Целостность данных
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Управление закрытыми периодами и контроль неизменности исторических данных.
                    </p>
                </div>
                <button 
                    onClick={() => setIsCloseModalOpen(true)} 
                    className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700 transition-colors"
                >
                    <PlusIcon className="h-5 w-5" />
                    Закрыть период
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">
                        <tr>
                            <th className="px-6 py-3">Период</th>
                            <th className="px-6 py-3">Дата закрытия</th>
                            <th className="px-6 py-3">Автор</th>
                            <th className="px-6 py-3">Контрольная сумма (Hash)</th>
                            <th className="px-6 py-3 text-center">Статус</th>
                            <th className="px-6 py-3 text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {locks?.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                    Нет закрытых периодов.
                                </td>
                            </tr>
                        ) : (
                            locks?.map(lock => {
                                const result = verificationResults[lock.id];
                                const isBusy = verifyingId === lock.id;
                                
                                return (
                                    <tr key={lock.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                            {lock.period}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                                            {new Date(lock.lockedAt).toLocaleDateString()}
                                            <div className="text-xs opacity-70">{new Date(lock.lockedAt).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {users.get(lock.lockedByUserId) || lock.lockedByUserId}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs" title={lock.dataHash}>
                                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                                {formatHash(lock.dataHash)}
                                            </span>
                                            <div className="text-gray-400 mt-1">Записей: {lock.recordCount}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {isBusy ? (
                                                <div className="inline-flex items-center gap-2 text-indigo-600">
                                                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                                    <span className="text-xs font-medium">Проверка...</span>
                                                </div>
                                            ) : result ? (
                                                result.isValid ? (
                                                    <div className="inline-flex items-center gap-1 text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full text-xs font-bold border border-green-200 dark:border-green-900">
                                                        <ShieldCheckIcon className="h-4 w-4" /> Valid
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center">
                                                        <div className="inline-flex items-center gap-1 text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full text-xs font-bold border border-red-200 dark:border-red-900 mb-1">
                                                            <ExclamationCircleIcon className="h-4 w-4" /> Compromised
                                                        </div>
                                                        {result.details && (
                                                            <span className="text-[10px] text-red-500 max-w-[150px] leading-tight">
                                                                {result.details}
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            ) : (
                                                <div className="inline-flex items-center gap-1 text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full text-xs font-medium">
                                                    <QuestionMarkCircleIcon className="h-4 w-4" /> Unknown
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => handleVerify(lock.id)}
                                                    disabled={isBusy}
                                                    className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded disabled:opacity-50"
                                                    title="Проверить целостность"
                                                >
                                                    <ShieldCheckIcon className="h-5 w-5" />
                                                </button>
                                                <button 
                                                    onClick={() => setDeleteId(lock.id)}
                                                    className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                                    title="Удалить блокировку (открыть период)"
                                                >
                                                    <TrashIcon className="h-5 w-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <ClosePeriodModal isOpen={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)} />
            
            <ConfirmationModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleDelete}
                title="Снять блокировку?"
                message="Вы собираетесь удалить защиту целостности периода. Это позволит редактировать документы в этом периоде, но существующий хэш будет удален. Это действие будет записано в аудит."
                confirmText="Снять блокировку"
                confirmButtonClass="bg-red-600 hover:bg-red-700"
            />
        </div>
    );
};

export default IntegrityManagement;
