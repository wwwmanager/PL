
import React, { createContext, useState, useCallback, type ReactNode } from 'react';
import { XIcon } from '../components/Icons';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: ToastAction;
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info', action?: ToastAction) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', action?: ToastAction) => {
    const id = Date.now();
    setToasts(prevToasts => [...prevToasts, { id, message, type, action }]);
    
    // Если есть кнопка действия, даем 10 сек, иначе стандартные 3 сек (по запросу)
    const duration = action ? 10000 : 3000;
    
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, []);

  const removeToast = (id: number) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  };
  
  const getToastClasses = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return 'bg-green-600 border-green-700'; // Darker for better contrast with button
      case 'error':
        return 'bg-red-600 border-red-700';
      case 'info':
      default:
        return 'bg-blue-600 border-blue-700';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-3">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between max-w-md w-full p-4 text-white rounded-lg shadow-xl border-l-4 ${getToastClasses(toast.type)} animate-fade-in-right gap-3`}
          >
            <span className="flex-1">{toast.message}</span>
            <div className="flex items-center gap-3 self-end sm:self-auto">
                {toast.action && (
                    <button
                        onClick={() => {
                            toast.action!.onClick();
                            removeToast(toast.id);
                        }}
                        className="px-3 py-1 bg-white text-gray-800 text-xs font-bold rounded hover:bg-gray-100 transition-colors shadow-sm whitespace-nowrap"
                    >
                        {toast.action.label}
                    </button>
                )}
                <button onClick={() => removeToast(toast.id)} className="p-1 rounded-full hover:bg-white/20">
                  <XIcon className="w-4 h-4" />
                </button>
            </div>
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
