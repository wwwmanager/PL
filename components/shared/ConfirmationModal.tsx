import React from 'react';
import Modal from './Modal';

interface ActionButtonProps {
    text: string;
    className: string;
    onClick: () => void;
}

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  children?: React.ReactNode;
  confirmText?: string;
  confirmButtonClass?: string;
  secondaryAction?: ActionButtonProps;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  children,
  confirmText = 'Подтвердить',
  confirmButtonClass = 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  secondaryAction,
}) => {
  const footer = (
    <>
      <button
        onClick={onClose}
        className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:focus:ring-offset-gray-800"
      >
        Отмена
      </button>
      {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className={`${secondaryAction.className} text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
          >
            {secondaryAction.text}
          </button>
      )}
      <button
        onClick={onConfirm}
        className={`${confirmButtonClass} text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
      >
        {confirmText}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
      {children || (message && <p className="text-gray-600 dark:text-gray-300">{message}</p>)}
    </Modal>
  );
};

export default ConfirmationModal;
