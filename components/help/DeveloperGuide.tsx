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

      <Section id="architecture" title="1. Обзор архитектуры">
        <p>Приложение представляет собой <strong>Single Page Application (SPA)</strong>, построенное на React. Оно спроектировано для полной автономной работы в браузере без необходимости в серверной части.</p>
        <ul>
            <li><strong>Frontend:</strong> React с TypeScript, Tailwind CSS.</li>
            <li><strong>Хранилище данных:</strong> Все данные хранятся локально в браузере с использованием <strong>IndexedDB</strong> через библиотеку-обертку <code>localforage</code>.</li>
            <li><strong>Симуляция API:</strong> Вся бизнес-логика и доступ к данным инкапсулированы в <code>services/mockApi.ts</code>, который выступает в роли in-memory базы данных и симулирует асинхронное API.</li>
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
│   ├── auditBusiness.ts
│   ├── auditLog.ts
│   ├── auth.tsx
│   ├── bus.ts
│   ├── dbKeys.ts
│   ├── faker.ts
│   ├── geminiService.ts
│   ├── mockApi.ts
│   ├── routeParserService.ts
│   ├── rbac.ts
│   ├── schemas.ts
│   └── storage.ts
├── types.ts
└── constants.ts
`}
        </CodeBlock>
      </Section>

       <Section id="storage" title="3. Хранение данных">
        <p>Данные сохраняются между сессиями с помощью <code>localforage</code>, который предоставляет унифицированный API для работы с IndexedDB, WebSQL и localStorage (выбирая лучший доступный драйвер).</p>
        <p>Взаимодействие с хранилищем происходит через обертку <code>services/storage.ts</code>, которая предоставляет функции <code>loadJSON</code>, <code>saveJSON</code> и <code>removeKey</code>.</p>
        <p>Ключи, по которым хранятся "таблицы", определены в объекте <code>DB_KEYS</code> в файле <code>services/dbKeys.ts</code>.</p>
        <p><strong>Для отладки:</strong> Откройте DevTools в браузере, перейдите на вкладку <strong>Application → Storage → IndexedDB → localforage</strong>. Здесь вы можете просмотреть все сохраненные ключи и их значения.</p>
      </Section>

      <Section id="mock-api" title="4. Mock API (services/mockApi.ts)">
        <p>Этот файл является сердцем приложения. Он эмулирует бэкенд.</p>
        <ul>
            <li><strong>Начальные данные:</strong> Массивы <code>initialOrganizations</code>, <code>initialVehicles</code> и т.д. используются для первоначального заполнения базы данных при первом запуске.</li>
            <li><strong>Рабочие данные:</strong> В памяти хранятся переменные <code>let organizations = clone(initialOrganizations)</code>, с которыми и работают все функции.</li>
            <li><strong>CRUD-функции:</strong> Функции вида <code>addVehicle</code>, <code>updateVehicle</code>, <code>deleteVehicle</code> напрямую изменяют эти массивы в памяти.</li>
            <li><strong>Функции получения данных:</strong> Функции <code>fetch...</code> и <code>get...</code> симулируют асинхронные запросы к API (с помощью <code>simulateNetwork</code>) и поддерживают фильтрацию, сортировку и пагинацию.</li>
        </ul>
      </Section>

      <Section id="data-models" title="5. Модели данных (types.ts)">
        <p>Все основные сущности системы описаны в <code>types.ts</code>. Ключевые интерфейсы:</p>
        <ul>
            <li><code>Waybill</code>: Путевой лист. Содержит ссылки (ID) на другие сущности и массив маршрутов <code>Route[]</code>.</li>
            <li><code>Vehicle</code>: Транспортное средство. Содержит нормы расхода топлива, данные о документах и т.д.</li>
            <li><code>Employee</code>: Сотрудник. Может быть водителем, диспетчером и т.д. (определяется полем <code>employeeType</code>).</li>
            <li><code>Organization</code>: Организация. Может быть как собственной компанией, так и контрагентом или мед. учреждением.</li>
            <li><code>GarageStockItem</code> и <code>StockTransaction</code>: Сущности для складского учета.</li>
            <li><code>WaybillBlank</code> и <code>WaybillBlankBatch</code>: Сущности для учета бланков строгой отчетности.</li>
        </ul>
      </Section>

       <Section id="import-export" title="6. Импорт и Экспорт">
        <p>Механизм реализован в <code>components/admin/Admin.tsx</code>. Он работает напрямую с <code>localforage</code>.</p>
        <ul>
            <li><strong>Формат файла:</strong> Экспорт создает JSON-файл со структурой <code>ExportBundle ({'{'}meta, data{'}'})</code>. Секция <code>data</code> содержит пары "ключ из DB_KEYS: массив данных".</li>
            <li><strong>Процесс импорта:</strong>
                <ol>
                    <li>Чтение и парсинг JSON файла.</li>
                    <li>Создание полного бэкапа текущих данных в ключ <code>__backup_before_import__</code>.</li>
                    <li>Отображение окна предпросмотра, где пользователь выбирает стратегии слияния для каждого ключа.</li>
                    <li>Применение изменений: для каждого ключа считываются текущие данные, объединяются с импортируемыми согласно стратегии (<code>mergeEntitiesArray</code>) и записываются обратно.</li>
                    <li>Создание записи в журнале аудита.</li>
                    <li>Принудительная перезагрузка страницы для применения изменений.</li>
                </ol>
            </li>
        </ul>
      </Section>

      <Section id="audit-log" title="7. Журнал аудита">
        <p>Логика находится в <code>services/auditLog.ts</code>. Журнал хранит детальную информацию о каждом импорте, позволяя откатывать изменения.</p>
        <ul>
            <li><strong>Хранение:</strong> Чтобы обойти ограничения на размер одной записи в IndexedDB, журнал хранится в чанках. Индекс всех событий лежит в <code>AUDIT_INDEX_KEY</code>, а сами данные (массивы <code>ImportAuditItem</code>) — в ключах с префиксом <code>AUDIT_CHUNK_PREFIX</code>.</li>
            <li><strong>Компрессия:</strong> Перед записью большие объемы данных сжимаются с помощью GZip (через браузерный <code>CompressionStream</code> или библиотеку `pako`, если доступна).</li>
            <li><strong>Ключевые функции:</strong> <code>appendAuditEventChunked</code> (добавить событие), <code>loadEventItems</code> (загрузить детали), <code>rollbackAuditItems</code> (откатить изменения), <code>purgeAuditItems</code> (удалить импортированные записи).</li>
        </ul>
      </Section>

      <Section id="auth" title="8. Система доступа">
        <p>Реализована упрощенная локальная система контроля доступа на основе ролей (RBAC) в <code>services/auth.tsx</code>.</p>
        <ul>
            <li><strong>Роли (<code>Role</code>):</strong> <code>admin</code>, <code>user</code>, <code>auditor</code>, <code>driver</code>, <code>mechanic</code>, <code>reviewer</code>, <code>accountant</code>, <code>viewer</code>.</li>
            <li><strong>Права (<code>Capability</code>):</strong> Гранулярные разрешения, например, <code>'admin.panel'</code> или <code>'audit.rollback'</code>.</li>
            <li><strong>Политики:</strong> <code>DEFAULT_ROLE_POLICIES</code> в `constants.ts` определяет, какой набор прав есть у каждой роли.</li>
            <li><strong>Хук <code>useAuth()</code>:</strong> Предоставляет объект с <code>currentUser</code>, и функциями <code>can()</code> и <code>hasRole()</code> для проверки прав в компонентах.</li>
            <li><strong>Отладка:</strong> В левом нижнем углу доступен <code>DevRoleSwitcher</code> для быстрого переключения между ролями без перезагрузки.</li>
        </ul>
      </Section>

      <Section id="debugging" title="9. Отладка">
        <ul>
            <li><strong>Просмотр данных:</strong> Используйте DevTools (Application → IndexedDB) для просмотра и удаления данных <code>localforage</code>.</li>
            <li><strong>Трассировка:</strong> Добавляйте <code>console.log</code> в функции <code>services/mockApi.ts</code>, чтобы отслеживать, какие данные запрашиваются и изменяются.</li>
            <li><strong>Сброс данных:</strong> Самый простой способ сбросить базу к начальному состоянию — очистить все данные сайта через DevTools (Application → Storage → Clear site data) и перезагрузить страницу.</li>
            <li><strong>Проверка прав:</strong> Используйте <code>DevRoleSwitcher</code> для тестирования интерфейса и логики под разными ролями.</li>
        </ul>
      </Section>
    </div>
  );
};

export default DeveloperGuide;
