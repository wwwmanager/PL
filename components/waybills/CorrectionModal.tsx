
import React, { useState, useEffect } from 'react';
import { XIcon, PaperAirplaneIcon } from '../Icons';

interface CorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
}

const CorrectionModal: React.FC<CorrectionModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (isOpen) {
      setComment('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (comment.trim()) {
      onSubmit(comment.trim());
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
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Вернуть на доработку</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <XIcon className="h-6 w-6" />
          </button>
        </header>
        <main className="p-6 space-y-4">
          <label htmlFor="correction-comment" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Укажите причину возврата:
          </label>
          <textarea
            id="correction-comment"
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={4}
            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-orange-500 focus:border-orange-500 text-gray-700 dark:text-gray-200"
            placeholder="Например: 'Неверно указан конечный пробег, сверьтесь с данными Глонасс...'"
          />
        </main>
        <footer className="flex justify-end gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!comment.trim()}
            className="flex items-center gap-2 bg-orange-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-orange-600 disabled:bg-orange-300"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
            Отправить комментарий
          </button>
        </footer>
      </div>
    </div>
  );
};

export default CorrectionModal;
