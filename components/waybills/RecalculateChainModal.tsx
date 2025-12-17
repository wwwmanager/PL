
import React, { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import { getVehicles, recalculateDraftsChain, RecalculationLogEntry } from '../../services/mockApi';
import { Vehicle } from '../../types';
import { useToast } from '../../hooks/useToast';
import { CheckCircleIcon, AlertIcon } from '../Icons';

interface RecalculateChainModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const RecalculateChainModal: React.FC<RecalculateChainModalProps> = ({ onClose, onSuccess }) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<{ count: number; logs: RecalculationLogEntry[] } | null>(null);
    
    const { showToast } = useToast();

    useEffect(() => {
        getVehicles().then(data => {
            setVehicles(data.filter(v => v.status === 'Active'));
        });
        
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const iso = startOfMonth.toLocaleDateString('sv-SE'); // YYYY-MM-DD
        setStartDate(iso);
    }, []);

    const handleRecalculate = async () => {
        if (!selectedVehicleId || !startDate) {
            showToast('Выберите автомобиль и дату начала.', 'error');
            return;
        }

        setIsProcessing(true);
        try {
            const result = await recalculateDraftsChain(selectedVehicleId, startDate);
            setResults(result);
            if (result.count === 0) {
                showToast('Цепочка проверена. Изменений не требуется.', 'info');
            } else {
                showToast(`Пересчитано документов: ${result.count}.`, 'success');
            }
            // onSuccess(); // We trigger this on close now to refresh list
        } catch (e) {
            console.error(e);
            showToast('Ошибка при пересчете: ' + (e as Error).message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClose = () => {
        if (results) onSuccess(); // Refresh list if changes were made
        onClose();
    };

    const renderForm = () => (
        <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                Эта функция находит последний <b>проведенный</b> путевой лист до указанной даты и пересчитывает все последующие <b>черновики</b>, устраняя разрывы в показаниях одометра и остатках топлива.
            </p>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Автомобиль</label>
                <select 
                    value={selectedVehicleId} 
                    onChange={e => setSelectedVehicleId(e.target.value)} 
                    className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    <option value="">Выберите ТС</option>
                    {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand})</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">С какой даты пересчитать?</label>
                <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                    className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
            </div>
        </div>
    );

    const renderResults = () => {
        if (!results) return null;
        
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                    <div>
                        <p className="font-medium text-green-900 dark:text-green-100">Пересчет завершен</p>
                        <p className="text-sm text-green-800 dark:text-green-200">
                            Обработано документов: <b>{results.count}</b>
                        </p>
                    </div>
                </div>

                {results.logs.length > 0 ? (
                    <div className="max-h-[400px] overflow-y-auto border rounded-lg dark:border-gray-700">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 sticky top-0">
                                <tr>
                                    <th className="p-2">Документ</th>
                                    <th className="p-2">Изменения</th>
                                    <th className="p-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {results.logs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                        <td className="p-2 align-top">
                                            <div className="font-medium dark:text-gray-200">№{log.number}</div>
                                            <div className="text-xs text-gray-500">{new Date(log.date).toLocaleDateString()}</div>
                                        </td>
                                        <td className="p-2 align-top">
                                            {log.changes.length > 0 ? (
                                                <ul className="space-y-1 text-xs">
                                                    {log.changes.map((c, idx) => (
                                                        <li key={idx} className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-medium text-gray-700 dark:text-gray-300">{c.field}:</span>
                                                            <span className="text-green-600 font-mono font-semibold">{c.oldVal}</span>
                                                            <span className="text-gray-400 text-[10px]">&rarr;</span>
                                                            <span className="text-red-600 font-mono font-bold">{c.newVal}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : <span className="text-gray-400 text-xs">Нет изменений</span>}
                                            
                                            {log.warnings.length > 0 && (
                                                <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-red-600 dark:text-red-400 font-medium">
                                                    {log.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                                                </ul>
                                            )}
                                        </td>
                                        <td className="p-2 align-top">
                                            {log.warnings.length > 0 && (
                                                <div title="Есть предупреждения">
                                                    <AlertIcon className="h-5 w-5 text-red-500" />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-gray-500 py-4">Изменений в значениях не обнаружено.</p>
                )}
            </div>
        );
    };

    return (
        <Modal
            isOpen={true}
            onClose={handleClose}
            title={results ? "Результат пересчета" : "Восстановление цепочки черновиков"}
            footer={
                !results ? (
                    <>
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-800 dark:text-white">Отмена</button>
                        <button 
                            onClick={handleRecalculate} 
                            disabled={isProcessing || !selectedVehicleId} 
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isProcessing ? 'Пересчет...' : 'Пересчитать'}
                        </button>
                    </>
                ) : (
                    <button 
                        onClick={handleClose} 
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors"
                    >
                        Закрыть
                    </button>
                )
            }
        >
            {!results ? renderForm() : renderResults()}
        </Modal>
    );
};

export default RecalculateChainModal;
