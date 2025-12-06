
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '../Icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  isDirty?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, isDirty = false }) => {
  const isDirtyRef = useRef(isDirty);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const handleRequestClose = useCallback(() => {
    if (isDirtyRef.current) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  }, [onClose]);

  const handleConfirmClose = () => {
    setShowConfirmClose(false);
    onClose();
  };

  const handleCancelClose = () => {
    setShowConfirmClose(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // If confirmation is already open, ESC cancels the confirmation (stays in modal)
        if (showConfirmClose) {
            setShowConfirmClose(false);
        } else {
            handleRequestClose();
        }
      }
    };
    
    document.addEventListener('keydown', handleEsc);

    return () => {
        document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, handleRequestClose, showConfirmClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-end md:items-center p-0 md:p-4 transition-opacity duration-300"
      onClick={handleRequestClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        tabIndex={-1}
        className="bg-white dark:bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl w-full h-full md:w-full md:h-auto md:max-w-4xl md:max-h-[90vh] flex flex-col transform transition-all duration-300 animate-slide-up md:animate-none"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 id="modal-title" className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={handleRequestClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Закрыть">
            <XIcon className="h-6 w-6" />
          </button>
        </header>
        <main className="p-6 overflow-y-auto flex-grow">
          {children}
        </main>
        {footer && (
          <footer className="flex justify-end gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            {footer}
          </footer>
        )}
      </div>

      {showConfirmClose && (
        <div 
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-2xl max-w-sm w-full border border-gray-200 dark:border-gray-700 transform scale-100 transition-transform">
                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Несохраненные изменения</h4>
                <p className="text-gray-600 dark:text-gray-300 mb-6">У вас есть несохраненные изменения. Вы уверены, что хотите закрыть окно? Все изменения будут потеряны.</p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={handleCancelClose}
                        className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        Отмена
                    </button>
                    <button 
                        onClick={handleConfirmClose}
                        className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                        Выйти без сохранения
                    </button>
                </div>
            </div>
        </div>
      )}

       <style>{`
        @keyframes slide-up {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out forwards; }
        @media (min-width: 768px) {
          .md\\:animate-none { animation: none; }
        }
       `}</style>
    </div>,
    document.body
  );
};

export default Modal;
