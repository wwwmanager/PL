
import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { XIcon } from '../components/Icons';

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, []);

  const removeToast = (id: number) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  };
  
  const getToastClasses = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return 'bg-green-500 border-green-600';
      case 'error':
        return 'bg-red-500 border-red-600';
      case 'info':
      default:
        return 'bg-blue-500 border-blue-600';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center justify-between max-w-sm w-full p-4 text-white rounded-lg shadow-lg border-l-4 ${getToastClasses(toast.type)} animate-fade-in-right`}
          >
            <span>{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="ml-4 p-1 rounded-full hover:bg-white/20">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
       <style>{`
        @keyframes fade-in-right {
            from {
                opacity: 0;
                transform: translateX(100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        .animate-fade-in-right {
            animation: fade-in-right 0.3s ease-out forwards;
        }
       `}</style>
    </ToastContext.Provider>
  );
};
