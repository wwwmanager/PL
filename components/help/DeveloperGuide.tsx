
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
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Руководство для разработчика, архитектура и отладка.</p>
      </header>

      <Section id="architecture" title="1. Обзор архитектуры">
        <p>Приложение — <strong>Offline-first SPA</strong> (Single Page Application). Оно спроектировано для работы без бэкенда, используя браузер как полноценную среду выполнения и хранения данных.</p>
        <ul>
            <li><strong>Стек:</strong> React 18, TypeScript, Tailwind CSS, Vite.</li>
            <li><strong>State Management:</strong> Локальный стейт (useState/useReducer) + React Context (Auth, Toast). Для глобальной синхронизации данных используется событийная модель (см. раздел Bus).</li>
            <li><strong>Storage:</strong> Данные хранятся в <strong>IndexedDB</strong> через библиотеку <code>localforage</code>. Это позволяет хранить большие объемы данных (сотни мегабайт), недоступные для localStorage.</li>
            <li><strong>API Layer:</strong> Полная эмуляция бэкенда в <code>services/mockApi.ts</code>. Все вызовы асинхронны, чтобы в будущем можно было заменить их на реальный сетевой API.</li>
        </ul>
      </Section>

      <Section id="structure" title="2. Структура проекта">
        <p>Проект организован по функциональным модулям:</p>
        <CodeBlock>
{`
src/
├── components/
│   ├── admin/          # Админка, настройки, диагностика, импорт/экспорт
│   ├── dictionaries/   # Справочники (ТС, сотрудники и т.д.)
│   ├── waybills/       # Основной модуль путевых листов
│   ├── warehouse/      # (В планах рефакторинга) Логика склада
│   └── ...
├── services/
│   ├── mockApi.ts      # "Бэкенд": CRUD операции, бизнес-логика
│   ├── storage.ts      # Обертка над localforage
│   ├── bus.ts          # Шина событий (BroadcastChannel) для синхронизации вкладок
│   ├── auditLog.ts     # Технический журнал импорта (chunked storage)
│   ├── auditBusiness.ts# Журнал бизнес-событий
│   ├── routeParserService.ts # Парсинг HTML отчетов (DOM/Cheerio)
│   ├── schemas.ts      # Zod-схемы для валидации данных
│   └── ...
├── types.ts            # Глобальные типы TypeScript
└── constants.ts        # Константы, переводы, настройки ролей
`}
        </CodeBlock>
      </Section>

       <Section id="data-flow" title="3. Поток данных и Синхронизация">
        <p>Приложение поддерживает работу в нескольких вкладках одновременно. Для этого реализован механизм синхронизации:</p>
        <ol>
            <li><strong>Write:</strong> Компонент вызывает метод в <code>mockApi.ts</code> (например, <code>updateWaybill</code>).</li>
            <li><strong>Persist:</strong> <code>mockApi</code> обновляет данные в памяти и асинхронно сохраняет их в <code>IndexedDB</code> (через <code>services/storage.ts</code>).</li>
            <li><strong>Broadcast:</strong> После успешного сохранения вызывается <code>broadcast('topic')</code> из <code>services/bus.ts</code>.</li>
            <li><strong>Update:</strong> <code>bus.ts</code> отправляет сообщение через <code>BroadcastChannel</code>. Другие вкладки (и текущая) ловят сообщение и вызывают <code>fetchData()</code> для обновления UI.</li>
        </ol>
      </Section>

      <Section id="data-models" title="4. Ключевые сущности (types.ts)">
        <ul>
            <li><code>Waybill</code>: Путевой лист. Центральная сущность. Имеет сложный жизненный цикл (Draft → Submitted → Posted → Cancelled).</li>
            <li><code>GarageStockItem</code> & <code>StockTransaction</code>: Складской учет. Транзакции изменяют поле <code>balance</code> в товарах.</li>
            <li><code>WaybillBlank</code>: Бланки строгой отчетности. Имеют статусы (Available → Issued → Used/Spoiled). Связаны с пачками (Batches).</li>
            <li><code>Role</code> & <code>Capability</code>: Система прав доступа.</li>
        </ul>
      </Section>

       <Section id="validation" title="5. Валидация и Схемы (services/schemas.ts)">
        <p>В проекте используется библиотека <strong>Zod</strong> для валидации данных.</p>
        <ul>
            <li><strong>Формы:</strong> React Hook Form использует Zod-схемы для валидации ввода пользователя.</li>
            <li><strong>Импорт:</strong> При импорте JSON-файла структура проверяется валидатором <code>databaseSchema</code> (в "мягком" режиме), чтобы не допустить повреждения БД.</li>
            <li><strong>Диагностика:</strong> Встроенная утилита диагностики проверяет целостность всей БД по схемам.</li>
        </ul>
      </Section>

      <Section id="audit" title="6. Система аудита">
        <p>В приложении реализовано два независимых журнала:</p>
        <ol>
            <li><strong>Технический журнал импорта (Audit Log):</strong>
                <ul>
                    <li>Цель: Возможность отката (Rollback) массовых изменений после импорта.</li>
                    <li>Реализация: <code>services/auditLog.ts</code>. Хранит "снимки" данных до и после изменения. Из-за большого размера сохраняется в IndexedDB в виде сжатых (Gzip) чанков.</li>
                </ul>
            </li>
            <li><strong>Бизнес-журнал (Business Audit):</strong>
                <ul>
                    <li>Цель: История действий пользователей (кто создал ПЛ, кто списал бланк).</li>
                    <li>Реализация: <code>services/auditBusiness.ts</code>. Линейный список событий.</li>
                </ul>
            </li>
        </ol>
      </Section>

      <Section id="debugging" title="7. Инструменты отладки">
        <p>В приложении есть мощные встроенные инструменты для разработчика:</p>
        <ul>
            <li><strong>Панель "Диагностика" (в Настройках):</strong>
                <ul>
                    <li>Показывает размер занимаемого места в IndexedDB.</li>
                    <li>Позволяет запустить полную валидацию данных через Zod.</li>
                    <li>Позволяет очистить "повисшие" ключи или полностью сбросить БД.</li>
                    <li>Экспорт технического отчета в JSON.</li>
                </ul>
            </li>
            <li><strong>DevRoleSwitcher:</strong> Виджет в левом нижнем углу меню. Позволяет мгновенно переключить роль текущего пользователя (Admin, Driver, Auditor) для тестирования UI прав доступа.</li>
            <li><strong>Экспорт пакета контекста:</strong> В настройках можно выгрузить "облегченный" дамп базы (справочники + последние 10 ПЛ) для передачи контекста в AI (например, в ChatGPT/Gemini) при разработке новых фич.</li>
        </ul>
      </Section>

      <Section id="tips" title="8. Полезные советы">
        <ul>
            <li><strong>Очистка данных:</strong> Если приложение сломалось из-за некорректных данных, используйте кнопку "Очистить все данные" в разделе Настройки → Диагностика (Опасная зона) или <code>Application → Storage → Clear site data</code> в DevTools.</li>
            <li><strong>Тестирование парсера:</strong> Для отладки парсера маршрутов (`routeParserService.ts`) используйте реальные HTML файлы отчетов. В модальном окне импорта есть предпросмотр, который показывает, как парсер "видит" данные.</li>
        </ul>
      </Section>
    </div>
  );
};

export default DeveloperGuide;
