
import React from 'react';
import { CodeBracketIcon } from '../Icons';

const DeveloperGuide: React.FC = () => {

  const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
    <section id={id} className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 border-b pb-2 dark:border-gray-600">{title}</h2>
      <div className="prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4">
        {children}
      </div>
    </section>
  );
  
  const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-sm">
      <code>
        {children}
      </code>
    </pre>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <header className="text-center mb-10">
        <CodeBracketIcon className="h-16 w-16 text-blue-500 mx-auto mb-4" />
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">Техническая документация</h1>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Руководство для разработчика и отладчика.</p>
      </header>

      <Section id="architecture" title="1. Обзор архитектуры и Repo Pattern">
        <p>Приложение представляет собой <strong>Single Page Application (SPA)</strong> на React. Для работы с данными используется паттерн <strong>Repository</strong>.</p>
        <ul>
            <li><strong>Repo Pattern (`services/repo.ts`):</strong> Вся работа с данными унифицирована через функцию <code>createRepo</code>. Она создает объект с методами <code>list</code>, <code>getById</code>, <code>create</code>, <code>update</code>, <code>remove</code>.</li>
            <li><strong>Кэширование:</strong> <code>repo.ts</code> реализует in-memory кэш для ускорения чтения. Данные загружаются из <code>localforage</code> один раз при первом запросе, а затем обслуживаются из памяти. Запись происходит синхронно в память и асинхронно в хранилище.</li>
            <li><strong>Mock API:</strong> <code>services/mockApi.ts</code> теперь использует эти репозитории вместо прямых манипуляций с массивами.</li>
        </ul>
      </Section>

      <Section id="structure" title="2. Структура проекта">
        <p>Проект имеет модульную структуру для удобства навигации и поддержки.</p>
        <CodeBlock>
{`
.
├── components/
│   ├── admin/
│   ├── dictionaries/
│   ├── employees/
│   ├── help/
│   ├── reports/
│   ├── shared/
│   ├── vehicles/
│   └── waybills/
├── contexts/
├── hooks/
├── services/
│   ├── api/ (Modules for mockApi split by domain)
│   ├── auditBusiness.ts
│   ├── auditLog.ts
│   ├── auth.tsx
│   ├── batchWaybillService.ts (New: Batch logic)
│   ├── bus.ts
│   ├── dbKeys.ts
│   ├── repo.ts (New: Generic repository)
│   ├── routeParserService.ts
│   └── storage.ts
├── types.ts
└── constants.ts
`}
        </CodeBlock>
      </Section>

       <Section id="components" title="3. Ключевые компоненты">
        <ul>
            <li><strong>VirtualDataTable (`components/shared/VirtualDataTable.tsx`):</strong> Высокопроизводительная таблица с виртуализацией (через <code>@tanstack/react-virtual</code>). Используется для отображения больших списков (ПЛ, транзакции) без лагов.</li>
            <li><strong>WaybillDetail (`components/waybills/WaybillDetail.tsx`):</strong> Основная форма редактирования ПЛ. Использует сложный хук <code>useWaybillForm</code> для управления состоянием.</li>
            <li><strong>Admin (`components/admin/Admin.tsx`):</strong> Панель администратора с логикой импорта/экспорта и диагностики.</li>
        </ul>
      </Section>

       <Section id="storage" title="4. Хранение данных">
        <p>Данные сохраняются между сессиями с помощью <code>localforage</code> (IndexedDB).</p>
        <p>Взаимодействие с хранилищем происходит через обертку <code>services/storage.ts</code>.</p>
        <p>Ключи, по которым хранятся "таблицы", определены в объекте <code>DB_KEYS</code> в файле <code>services/dbKeys.ts</code>.</p>
      </Section>

      <Section id="import-export" title="5. Импорт и Экспорт">
        <p>Механизм реализован в <code>components/admin/Admin.tsx</code>.</p>
        <ul>
            <li><strong>Процесс импорта:</strong> Включает создание бэкапа, предпросмотр изменений и слияние данных с поддержкой стратегий (Merge/Overwrite).</li>
            <li><strong>Журнал аудита (`services/auditLog.ts`):</strong> Хранит историю импортов в сжатом виде (gzip) с использованием чанков (chunking) для обхода лимитов IndexedDB на размер одной записи.</li>
        </ul>
      </Section>

      <Section id="auth" title="6. Система доступа">
        <p>Реализована упрощенная локальная система контроля доступа на основе ролей (RBAC) в <code>services/auth.tsx</code>.</p>
        <ul>
            <li><strong>Роли (<code>Role</code>):</strong> Определены в <code>types.ts</code>.</li>
            <li><strong>Права (<code>Capability</code>):</strong> Гранулярные разрешения.</li>
            <li><strong>Настройка:</strong> Права ролей можно настраивать в админ-панели (хранятся в <code>ROLE_POLICIES</code>).</li>
        </ul>
      </Section>
    </div>
  );
};

export default DeveloperGuide;
