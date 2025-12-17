
import React from 'react';
import { TruckIcon } from '../Icons';
import { useAppSettings } from '../../hooks/queries';

const About: React.FC = () => {
  const { data: settings } = useAppSettings();
  const logoSrc = settings?.customLogo || './logo.svg';

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      {/* HERO */}
      <section className="text-center">
        <div className="mx-auto inline-flex items-center gap-3 rounded-full border border-gray-200/70 bg-white px-3 py-1.5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Версия 1.0.0
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          <img 
            src={logoSrc}
            alt="Logo" 
            className="h-16 w-auto object-contain"
            onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }} 
          />
          <TruckIcon className="hidden h-12 w-12 text-blue-500" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
            Приложение для управления
            <span className="ml-2 bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              путевыми листами
            </span>
          </h1>
        </div>

        <p className="mx-auto mt-3 max-w-3xl text-gray-600 dark:text-gray-300">
          Комплексное веб‑решение для оформления, хранения и анализа путевых листов.
          Управляйте транспортными средствами, водителями и отчетами в одном месте — без рутины и ошибок.
        </p>
      </section>


    </div>
  );
};

export default About;
