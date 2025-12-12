import { useState, useEffect } from 'react';

export const CookieBanner = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 1500); // Чуть увеличил задержку, чтобы не пугать сразу
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg md:flex md:items-center md:justify-between animate-slide-up text-gray-800">
      {/* Я сделал фон светлым (white/95), это выглядит менее "хакерски", чем черный */}
      
      <div className="mb-4 md:mb-0 md:mr-6 text-sm leading-relaxed">
        <p>
          🍪 <strong>Мы используем cookie.</strong> Мы собираем обезличенные технические данные, 
          чтобы анализировать работу сервиса и делать его удобнее для вас. 
        </p>
      </div>
      <div className="flex gap-3 shrink-0">
        <button
          onClick={handleAccept}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all shadow-sm active:scale-95"
        >
          Хорошо, понятно
        </button>
      </div>
    </div>
  );
};