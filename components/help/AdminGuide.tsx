
import React from 'react';
import { View } from '../../types';
import { 
    CogIcon, 
    UserGroupIcon, 
    ArchiveBoxIcon, 
    DownloadIcon, 
    ShieldCheckIcon, 
    BeakerIcon,
    CalendarDaysIcon,
    TrashIcon
} from '../Icons';
import { ALL_CAPS, CAPABILITY_TRANSLATIONS } from '../../constants';

const AdminGuide: React.FC = () => {
  const NavLink: React.FC<{ view: View; children: React.ReactNode }> = ({ view, children }) => (
    <span 
      className="text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center gap-1 cursor-default"
      title={`Раздел: ${view}`}
    >
      {children}
    </span>
  );

  const Section: React.FC<{ id: string; title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ id, title, icon, children }) => (
    <section id={id} className="mb-10 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md scroll-mt-24">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 border-b pb-3 dark:border-gray-700 flex items-center gap-3">
        {icon && <span className="text-blue-500">{icon}</span>}
        {title}
      </h2>
      <div className="prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4">
        {children}
      </div>
    </section>
  );

  const AnchorLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
    <a href={`#${to}`} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2">
      <span className="text-gray-400">•</span> {children}
    </a>
  );

  const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${color}`}>
          {children}
      </span>
  );

  const sortedCaps = [...ALL_CAPS].sort((a, b) => {
      const translationA = CAPABILITY_TRANSLATIONS[a] || a;
      const translationB = CAPABILITY_TRANSLATIONS[b] || b;
      return translationA.localeCompare(translationB);
  });

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header */}
      <header className="text-center mb-12 pt-6">
        <div className="inline-flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-6">
            <CogIcon className="h-12 w-12 text-gray-600 dark:text-gray-300" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          Руководство администратора
        </h1>
        <p className="mt-4 text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Управление настройками, пользователями, правами доступа и целостностью данных системы.
        </p>
      </header>

      {/* Table of Contents */}
      <nav className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 mb-12">
        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Оглавление</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <AnchorLink to="general">Общие настройки</AnchorLink>
            <AnchorLink to="users">Управление пользователями и ролями</AnchorLink>
            <AnchorLink to="blanks">Управление бланками (БСО)</AnchorLink>
            <AnchorLink to="calendar">Производственный календарь</AnchorLink>
            <AnchorLink to="integrity">Целостность данных (Закрытие периода)</AnchorLink>
            <AnchorLink to="archiving">Архивация и Оптимизация</AnchorLink>
            <AnchorLink to="data">Импорт и Экспорт данных</AnchorLink>
            <AnchorLink to="audit">Журналы аудита и безопасности</AnchorLink>
            <AnchorLink to="diagnostics">Диагностика и обслуживание</AnchorLink>
            <AnchorLink to="capabilities">Справочник прав (Capabilities)</AnchorLink>
        </div>
      </nav>

      {/* Content */}
      
      <Section id="general" title="1. Общие настройки" icon={<CogIcon className="h-6 w-6" />}>
        <p>
          В разделе <NavLink view="ADMIN">Настройки</NavLink> → <strong>Общие настройки</strong> вы управляете глобальным поведением системы.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                <h4 className="font-bold text-gray-900 dark:text-white mb-2">Парсер маршрутов</h4>
                <p className="text-sm">
                    Включает кнопку "Импорт из файла" в форме путевого листа. Позволяет загружать HTML-отчеты систем мониторинга для автоматического заполнения маршрутов.
                </p>
            </div>
            <div className="p-4 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                <h4 className="font-bold text-gray-900 dark:text-white mb-2">Настройки бланков</h4>
                <p className="text-sm">
                    <strong>Водитель может добавлять пачки:</strong> Если включено, водители могут сами регистрировать купленные пачки бланков. Если выключено — бланки выдает только диспетчер.
                </p>
            </div>
        </div>

        <h4 className="font-bold text-lg mt-6 mb-3">Режимы работы приложения</h4>
        <p className="mb-4 text-sm">Режим определяет жизненный цикл путевого листа.</p>
        
        <div className="grid grid-cols-1 gap-4">
             <div className="flex items-start gap-4 p-4 border border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800 rounded-lg">
                <div className="text-2xl">🚗</div>
                <div>
                    <h5 className="font-bold text-green-800 dark:text-green-300">Driver Mode (Упрощенный)</h5>
                    <p className="text-sm mt-1">Для ИП и малых парков. Водитель сам создает и проводит документ. Статус "Отправлен на проверку" пропускается.</p>
                </div>
            </div>
            <div className="flex items-start gap-4 p-4 border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 rounded-lg">
                <div className="text-2xl">🏢</div>
                <div>
                    <h5 className="font-bold text-blue-800 dark:text-blue-300">Central Mode (С проверкой)</h5>
                    <p className="text-sm mt-1">Для компаний с диспетчером. Водитель создает черновик и отправляет его. Диспетчер проверяет и проводит (или возвращает на доработку).</p>
                </div>
            </div>
        </div>
      </Section>

      <Section id="users" title="2. Пользователи и Роли" icon={<UserGroupIcon className="h-6 w-6" />}>
        <p>Система использует ролевую модель доступа (RBAC).</p>
        
        <div className="space-y-6">
            <div>
                <h4 className="font-bold text-lg mb-2">Управление пользователями</h4>
                <p>Здесь создаются учетные записи для входа. Каждому пользователю назначается одна <strong>Роль</strong>. При необходимости можно добавить <strong>Индивидуальные права</strong> (Capabilities), которые расширяют возможности роли.</p>
                <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-sm border-l-4 border-yellow-400 rounded-r">
                    При удалении пользователя его документы (путевые листы) <strong>не удаляются</strong>, но в истории изменений будет указан только его ID.
                </div>
            </div>

            <div>
                <h4 className="font-bold text-lg mb-2">Управление ролями</h4>
                <p>В этом разделе вы можете тонко настроить, что разрешено каждой роли.</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                    <li><strong>Admin:</strong> Имеет все права. Редактирование запрещено.</li>
                    <li><strong>Driver:</strong> Может создавать ПЛ, видеть свои бланки.</li>
                    <li><strong>Reviewer (Диспетчер):</strong> Может проверять ПЛ, возвращать на доработку.</li>
                    <li><strong>Accountant (Бухгалтер):</strong> Может проводить ПЛ, видеть склад.</li>
                </ul>
                <p className="mt-2 text-sm">
                    <em>Пример:</em> Вы можете разрешить бухгалтеру редактировать справочник ТС, добавив право <code>dictionaries.edit</code> в настройках роли.
                </p>
            </div>
        </div>
      </Section>

      <Section id="blanks" title="3. Управление бланками" icon={<ArchiveBoxIcon className="h-6 w-6" />}>
        <p>Централизованный учет бланков строгой отчетности (БСО).</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div>
                <h4 className="font-bold mb-2">Пачки бланков</h4>
                <p className="text-sm mb-2">Создание диапазонов номеров (например, АА 000100 — 000200).</p>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li><strong>Материализация:</strong> Превращает диапазон в реальные записи в базе данных. Обязательный шаг перед выдачей.</li>
                    <li><strong>Выдача:</strong> Передача диапазона конкретному водителю.</li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold mb-2">Все бланки</h4>
                <p className="text-sm mb-2">Полный реестр каждого отдельного бланка.</p>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>Поиск по серии, номеру или владельцу.</li>
                    <li>Просмотр статуса (На складе, Выдан, Использован, Испорчен).</li>
                    <li>Ручное списание (пометка как испорченный).</li>
                </ul>
            </div>
        </div>
      </Section>

      <Section id="calendar" title="4. Производственный календарь" icon={<CalendarDaysIcon className="h-6 w-6" />}>
        <p>Настройка рабочих, выходных и праздничных дней. Эти данные используются при <strong>Пакетной генерации путевых листов</strong> для определения рабочих дней водителя.</p>
        
        <div className="space-y-4">
            <div className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-700/30">
                <h5 className="font-bold text-sm">Авто-загрузка</h5>
                <p className="text-xs mt-1">Кнопка "Авто-загрузка" пытается получить данные с xmlcalendar.ru для текущего года.</p>
            </div>
            <div className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-700/30">
                <h5 className="font-bold text-sm">Ручное редактирование</h5>
                <p className="text-xs mt-1">Вы можете кликать по дням календаря, чтобы менять их статус: <strong>Рабочий</strong> ↔ <strong>Выходной</strong>.</p>
            </div>
        </div>
      </Section>

      <Section id="integrity" title="5. Целостность данных" icon={<ShieldCheckIcon className="h-6 w-6" />}>
        <p>
            Механизм защиты исторических данных от изменений. Критически важен для бухгалтерского учета.
        </p>
        <ul className="list-disc list-inside mt-2 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
                <strong>Закрытие периода:</strong> Позволяет "заморозить" данные за прошлый месяц. Система вычисляет хэш-сумму всех проведенных документов и блокирует их от редактирования и удаления.
            </li>
            <li>
                <strong>Проверка (Верификация):</strong> В любой момент можно нажать кнопку проверки, чтобы убедиться, что данные в закрытом периоде не были изменены в обход системы. Если хэш не совпадет, система выдаст предупреждение.
            </li>
            <li>
                <strong>Снятие блокировки:</strong> При необходимости блокировку можно снять, но это действие будет зафиксировано в журнале аудита.
            </li>
        </ul>
      </Section>

      <Section id="archiving" title="6. Архивация и Оптимизация" icon={<ArchiveBoxIcon className="h-6 w-6" />}>
        <p>
            Функции для управления размером базы данных и скоростью работы приложения.
        </p>
        <div className="space-y-4 mt-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg">
                <h5 className="font-bold text-gray-900 dark:text-white">Архивация по годам</h5>
                <p className="text-sm mt-1">
                    Вы можете выгрузить все проведенные путевые листы за прошлый год в отдельный JSON-файл ("холодный архив"), после чего они будут <strong>удалены</strong> из оперативной базы данных. Это значительно ускорит работу программы.
                </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg">
                <h5 className="font-bold text-gray-900 dark:text-white">Очистка журналов</h5>
                <p className="text-sm mt-1">
                    Журнал импорта может занимать много места. Используйте функцию очистки, чтобы удалить старые записи журнала (оставляя только последние 100 событий).
                </p>
            </div>
        </div>
      </Section>

      <Section id="data" title="7. Импорт и Экспорт" icon={<DownloadIcon className="h-6 w-6" />}>
        <p>Инструменты для резервного копирования и переноса данных между устройствами.</p>

        <h4 className="font-bold text-lg mt-6 mb-3">Экспорт</h4>
        <div className="grid gap-3">
            <div className="flex items-center gap-3">
                <Badge color="bg-teal-100 text-teal-800">Общий</Badge>
                <span className="text-sm">Полный дамп всей базы данных в JSON. Используйте для бэкапов.</span>
            </div>
            <div className="flex items-center gap-3">
                <Badge color="bg-blue-100 text-blue-800">Выборочный</Badge>
                <span className="text-sm">Позволяет выбрать конкретные таблицы (например, только ТС и Сотрудники).</span>
            </div>
            <div className="flex items-center gap-3">
                <Badge color="bg-indigo-100 text-indigo-800">Пакет контекста</Badge>
                <span className="text-sm">Оптимизированный файл для отладчика.</span>
            </div>
        </div>

        <h4 className="font-bold text-lg mt-8 mb-3">Импорт</h4>
        <p className="mb-4 text-sm">При импорте файла открывается окно предпросмотра. Вы можете выбрать стратегию для каждой таблицы:</p>
        
        <div className="space-y-4">
            <div className="p-3 border-l-4 border-green-500 bg-gray-50 dark:bg-gray-700/30">
                <h5 className="font-bold text-sm">Добавлять новые (Skip)</h5>
                <p className="text-xs mt-1">Безопасный режим. Если запись с таким ID уже есть — она пропускается. Добавляются только новые.</p>
            </div>
            <div className="p-3 border-l-4 border-blue-500 bg-gray-50 dark:bg-gray-700/30">
                <h5 className="font-bold text-sm">Обновлять (Merge)</h5>
                <p className="text-xs mt-1">Умное слияние. Если запись есть — обновляются только поля, присутствующие в файле. Новые записи добавляются.</p>
            </div>
            <div className="p-3 border-l-4 border-orange-500 bg-gray-50 dark:bg-gray-700/30">
                <h5 className="font-bold text-sm">Перезапись (Overwrite)</h5>
                <p className="text-xs mt-1">Жесткая замена. Существующая запись полностью заменяется версией из файла.</p>
            </div>
            <div className="p-3 border-l-4 border-red-500 bg-gray-50 dark:bg-gray-700/30">
                <h5 className="font-bold text-sm">Удалять отсутствующие (Sync)</h5>
                <p className="text-xs mt-1">Опасно! Приводит базу в точное соответствие с файлом. Записи, которых нет в файле, будут удалены из базы.</p>
            </div>
        </div>
      </Section>

      <Section id="audit" title="8. Журналы аудита" icon={<ShieldCheckIcon className="h-6 w-6" />}>
        <div className="space-y-6">
            <div>
                <h4 className="font-bold text-lg mb-2">Журнал импорта</h4>
                <p>Хранит историю всех операций загрузки данных.</p>
                <ul className="list-disc list-inside mt-2 text-sm">
                    <li><strong>Rollback (Откат):</strong> Уникальная функция. Позволяет отменить результаты импорта (вернуть старые значения записей), если что-то пошло не так.</li>
                    <li><strong>Diff (Сравнение):</strong> Показывает конкретные поля, которые изменились ("Было" → "Стало").</li>
                </ul>
            </div>
            
            <div>
                <h4 className="font-bold text-lg mb-2">Бизнес-аудит</h4>
                <p>Логирует действия пользователей в системе.</p>
                <ul className="list-disc list-inside mt-2 text-sm">
                    <li>Создание, проведение, отмена и корректировка путевых листов.</li>
                    <li>Материализация и выдача бланков.</li>
                    <li>Обнуление топливных карт.</li>
                </ul>
                <p className="mt-2 text-sm text-gray-500">Позволяет разобраться в спорных ситуациях ("Кто удалил путевой лист?").</p>
            </div>
        </div>
      </Section>

      <Section id="diagnostics" title="9. Диагностика" icon={<BeakerIcon className="h-6 w-6" />}>
        <p>Технический раздел для проверки здоровья базы данных.</p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <li className="bg-gray-50 dark:bg-gray-900/30 p-3 rounded border dark:border-gray-700">
                <strong>Хранилище и квота:</strong><br/>
                Показывает, сколько места занято и сколько доступно в браузере.
            </li>
            <li className="bg-gray-50 dark:bg-gray-900/30 p-3 rounded border dark:border-gray-700">
                <strong>Валидация БД:</strong><br/>
                Проверяет все записи на соответствие структуре (схеме). Находит "битые" данные.
            </li>
            <li className="bg-gray-50 dark:bg-gray-900/30 p-3 rounded border dark:border-gray-700">
                <strong>Полный пересчет:</strong><br/>
                Запускает пересчет всех остатков на складе, балансов карт и пробегов с нуля на основе истории транзакций и документов. Используйте при расхождениях.
            </li>
            <li className="bg-gray-50 dark:bg-gray-900/30 p-3 rounded border dark:border-gray-700">
                <strong>Снимки балансов:</strong><br/>
                Генерирует промежуточные точки сохранения балансов на конец каждого месяца. Это значительно ускоряет работу программы при большом количестве документов.
            </li>
        </ul>
      </Section>

      <Section id="capabilities" title="10. Справочник прав (Capabilities)" icon={<ShieldCheckIcon className="h-6 w-6" />}>
        <p>Полный список всех возможных прав доступа в системе и их описание.</p>
        <div className="overflow-x-auto mt-4 border dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                    <tr>
                        <th scope="col" className="px-6 py-3 w-1/3 border-b dark:border-gray-700">Право (Capability)</th>
                        <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">Описание</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedCaps.map(cap => (
                        <tr key={cap} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <th scope="row" className="px-6 py-4 font-mono text-gray-900 dark:text-white">
                                {cap}
                            </th>
                            <td className="px-6 py-4">
                                {CAPABILITY_TRANSLATIONS[cap] ?? 'Нет описания'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </Section>
    </div>
  );
};

export default AdminGuide;
