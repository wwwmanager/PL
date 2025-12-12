
import React, { useState, useEffect } from 'react';
import { getArchiveStats, archiveYear, pruneAuditLog, ArchiveStats } from '../../services/archiveService';
import { useToast } from '../../hooks/useToast';
import { ArchiveBoxIcon, TrashIcon, DownloadIcon, InformationCircleIcon } from '../Icons';
import ConfirmationModal from '../shared/ConfirmationModal';

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const Archiving: React.FC = () => {
    const [stats, setStats] = useState<ArchiveStats | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();
    
    // Modal state
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; year: string; count: number } | null>(null);

    const loadStats = async () => {
        setIsLoading(true);
        try {
            const data = await getArchiveStats();
            setStats(data);
        } catch (e) {
            showToast('Ошибка загрузки статистики', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, []);

    const handleArchiveYear = async () => {
        if (!confirmModal) return;
        setIsLoading(true);
        try {
            const { year } = confirmModal;
            const { count, blob } = await archiveYear(year);
            
            if (count > 0 && blob) {
                // Trigger download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `archive_waybills_${year}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showToast(`Архивировано и удалено ${count} документов за ${year} год.`, 'success');
                await loadStats();
            } else {
                showToast('Нет данных для архивации.', 'info');
            }
        } catch (e) {
            showToast('Ошибка архивации.', 'error');
        } finally {
            setIsLoading(false);
            setConfirmModal(null);
        }
    };

    const handlePruneAudit = async () => {
        setIsLoading(true);
        try {
            const removed = await pruneAuditLog(100); // Keep last 100 events
            showToast(`Очищено ${removed} старых записей журнала.`, 'success');
            await loadStats();
        } catch (e) {
            showToast('Ошибка очистки журнала.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && !stats) return <div className="p-8 text-center text-gray-500">Анализ данных...</div>;

    const years = stats ? Object.keys(stats.waybillsByYear).sort((a, b) => b.localeCompare(a)) : [];

    return (
        <div className="space-y-8">
            <ConfirmationModal
                isOpen={!!confirmModal}
                onClose={() => setConfirmModal(null)}
                onConfirm={handleArchiveYear}
                title={`Архивировать ${confirmModal?.year} год?`}
                message={`Это действие выгрузит ${confirmModal?.count} проведенных путевых листов в файл и УДАЛИТ их из базы данных приложения. Вы уверены?`}
                confirmText="Архивировать и удалить"
                confirmButtonClass="bg-red-600 hover:bg-red-700"
            />

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
                <InformationCircleIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-semibold mb-1">Как работает архивация?</p>
                    <p>
                        Для ускорения работы приложения вы можете перенести старые данные в "холодный" архив. 
                        Данные будут сохранены в JSON-файл на вашем устройстве, а затем удалены из программы. 
                        Архивируются только <b>проведенные</b> документы. Черновики останутся в системе.
                    </p>
                </div>
            </div>

            <section>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <ArchiveBoxIcon className="h-5 w-5" />
                    Путевые листы по годам
                </h3>
                
                <div className="overflow-x-auto border rounded-lg dark:border-gray-700">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Год</th>
                                <th className="px-6 py-3">Всего ПЛ</th>
                                <th className="px-6 py-3">Готовы к архивации</th>
                                <th className="px-6 py-3">Примерный размер</th>
                                <th className="px-6 py-3 text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                            {years.map(year => {
                                const data = stats!.waybillsByYear[year];
                                return (
                                    <tr key={year} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                        <td className="px-6 py-4 font-medium">{year}</td>
                                        <td className="px-6 py-4">{data.total}</td>
                                        <td className="px-6 py-4 text-green-600 dark:text-green-400 font-semibold">{data.posted}</td>
                                        <td className="px-6 py-4 text-gray-500">{formatBytes(data.size)}</td>
                                        <td className="px-6 py-4 text-right">
                                            {data.posted > 0 ? (
                                                <button 
                                                    onClick={() => setConfirmModal({ isOpen: true, year, count: data.posted })}
                                                    disabled={isLoading}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                                >
                                                    <DownloadIcon className="h-4 w-4" />
                                                    Архивировать
                                                </button>
                                            ) : (
                                                <span className="text-gray-400 italic text-xs">Нет данных</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {years.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Нет данных о путевых листах.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="border-t pt-6 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <TrashIcon className="h-5 w-5" />
                    Оптимизация журналов
                </h3>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                    <div>
                        <div className="font-medium text-gray-900 dark:text-white">Журнал импорта</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Текущее количество событий: <b>{stats?.auditEvents || 0}</b>. 
                            Рекомендуется оставлять не более 100 последних записей для экономии места.
                        </div>
                    </div>
                    <button 
                        onClick={handlePruneAudit}
                        disabled={isLoading || (stats?.auditEvents || 0) <= 100}
                        className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Очистить старые
                    </button>
                </div>
            </section>
        </div>
    );
};

export default Archiving;
