import React, { useEffect, useRef, useCallback } from 'react';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const isDirtyRef = useRef(isDirty);

  // Keep the ref synchronized with the prop.
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // This callback now has a stable reference because it doesn't depend on the `isDirty` prop directly.
  const handleRequestClose = useCallback(() => {
    if (isDirtyRef.current) {
      if (window.confirm("У вас есть несохраненные изменения. Вы уверены, что хотите закрыть окно? Все изменения будут потеряны.")) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleRequestClose();
      }
    };
    
    document.addEventListener('keydown', handleEsc);

    // This effect now only runs when the modal opens/closes or when `onClose` changes,
    // preventing the focus from being stolen on every keystroke.
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const firstFormField = modalRef.current.querySelector<HTMLElement>(
          'input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])'
        );
        
        if (firstFormField) {
          firstFormField.focus();
        } else {
          const firstFooterButton = modalRef.current.querySelector<HTMLElement>('footer button');
          if (firstFooterButton) {
            firstFooterButton.focus();
          } else {
            modalRef.current.focus();
          }
        }
      }
    }, 100);

    return () => {
        document.removeEventListener('keydown', handleEsc);
        clearTimeout(timer);
    };
  }, [isOpen, handleRequestClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-end md:items-center p-0 md:p-4 transition-opacity duration-300"
      onClick={handleRequestClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
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
    </div>
  );
};

export default Modal;