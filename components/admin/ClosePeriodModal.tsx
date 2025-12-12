
import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useClosePeriod } from '../../hooks/useIntegrity';
import { useAuth } from '../../services/auth';
import { useToast } from '../../hooks/useToast';

interface ClosePeriodModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ClosePeriodModal: React.FC<ClosePeriodModalProps> = ({ isOpen, onClose }) => {
    const [period, setPeriod] = useState(''); // YYYY-MM
    const [notes, setNotes] = useState('');
    const { currentUser } = useAuth();
    const { mutateAsync: closePeriod, isPending } = useClosePeriod();
    const { showToast } = useToast();

    const handleSubmit = async () => {
        if (!period) {
            showToast('Выберите месяц и год.', 'error');
            return;
        }
        if (!currentUser) {
            showToast('Ошибка авторизации.', 'error');
            return;
        }

        try {
            await closePeriod({ period, userId: currentUser.id, notes });
            showToast(`Период ${period} успешно закрыт.`, 'success');
            onClose();
        } catch (e: any) {
            showToast(e.message || 'Ошибка закрытия периода.', 'error');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Закрыть период"
            footer={
                <>
                    <button 
                        onClick={onClose} 
                        className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        disabled={isPending}
                    >
                        Отмена
                    </button>
                    <button 
                        onClick={handleSubmit} 
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                        disabled={isPending}
                    >
                        {isPending ? 'Вычисление хэша...' : 'Закрыть период'}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg text-sm text-indigo-800 dark:text-indigo-200">
                    <p className="font-semibold mb-1">Что произойдет?</p>
                    <p>
                        Система вычислит криптографический хэш (SHA-256) всех проведенных документов за выбранный месяц.
                        После этого любые изменения в документах этого периода будут заблокированы.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Период (Месяц и Год)
                    </label>
                    <input 
                        type="month" 
                        value={period} 
                        onChange={(e) => setPeriod(e.target.value)} 
                        className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Комментарий (необязательно)
                    </label>
                    <textarea 
                        value={notes} 
                        onChange={(e) => setNotes(e.target.value)} 
                        className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        placeholder="Например: Отчетность сдана, изменений не планируется."
                        rows={3}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default ClosePeriodModal;
