import React, { useState, useEffect } from 'react';
import { XIcon, PencilIcon } from '../Icons';

interface CorrectionReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

const CorrectionReasonModal: React.FC<CorrectionReasonModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (reason.trim()) {
      onSubmit(reason.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Причина корректировки</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <XIcon className="h-6 w-6" />
          </button>
        </header>
        <main className="p-6 space-y-4">
          <label htmlFor="correction-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Укажите причину для возврата путевого листа в статус "Черновик":
          </label>
          <textarea
            id="correction-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-yellow-500 focus:border-yellow-500 text-gray-700 dark:text-gray-200"
            placeholder="Например: 'Обнаружена ошибка в показаниях одометра...'"
          />
        </main>
        <footer className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim()}
            className="flex items-center gap-2 bg-yellow-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-yellow-600 disabled:bg-yellow-300"
          >
            <PencilIcon className="h-5 w-5" />
            Провести корректировку
          </button>
        </footer>
      </div>
    </div>
  );
};

export default CorrectionReasonModal;