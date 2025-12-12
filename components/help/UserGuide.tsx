
import React from 'react';
import { View } from '../../types';
import { 
    BookOpenIcon, 
    TruckIcon, 
    ArchiveBoxIcon, 
    DocumentTextIcon, 
    ChartBarIcon, 
    CogIcon,
    QuestionMarkCircleIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    ArrowUpTrayIcon,
    ArrowDownIcon
} from '../Icons';

interface UserGuideProps {
  onNavigate: (view: View, subView?: string) => void;
}

const UserGuide: React.FC<UserGuideProps> = ({ onNavigate }) => {

  const NavLink: React.FC<{ view: View; subView?: string; children: React.ReactNode }> = ({ view, subView, children }) => (
    <button
      onClick={() => onNavigate(view, subView)}
      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer text-left align-baseline"
      type="button"
    >
      {children}
    </button>
  );

  const Section: React.FC<{ id: string; title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ id, title, icon, children }) => (
    <section id={id} className="mb-12 scroll-mt-24 bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
      <h3 className="text-2xl font-extrabold text-gray-800 dark:text-white mb-6 border-b pb-4 dark:border-gray-700 flex items-center gap-3">
        {icon && <span className="text-blue-500 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg">{icon}</span>}
        {title}
      </h3>
      <div className="space-y-8 text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </section>
  );

  const StatusBadge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
    <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${color} mr-2 shadow-sm`}>
        {children}
    </span>
  );

  const InfoBlock: React.FC<{ title: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
      <div className="bg-gray-50 dark:bg-gray-700/20 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors h-full">
          <h4 className="font-bold text-lg mb-3 text-blue-700 dark:text-blue-400 flex items-center gap-2">{title}</h4>
          {children}
      </div>
  );

  const MandatoryFields: React.FC<{ fields: string[]; note?: string }> = ({ fields, note }) => (
      <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-900/30 h-full">
          <h5 className="font-bold text-sm mb-3 text-red-800 dark:text-red-300 flex items-center gap-2 uppercase tracking-wide">
              <ExclamationCircleIcon className="h-4 w-4"/> Обязательные поля
          </h5>
          <ul className="space-y-2 text-sm font-medium text-gray-800 dark:text-gray-200">
              {fields.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-100 rounded-full text-xs font-bold">{i + 1}</span>
                      <span className="mt-0.5">{f}</span>
                  </li>
              ))}
          </ul>
          {note && (
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 italic border-t border-red-200 dark:border-red-800/30 pt-2">
                  <strong>Важно:</strong> {note}
              </p>
          )}
      </div>
  );

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <header className="text-center mb-12 pt-8">
        <div className="inline-flex p-5 bg-blue-100 dark:bg-blue-900/30 rounded-3xl mb-6 shadow-sm">
            <BookOpenIcon className="h-16 w-16 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">
            Руководство пользователя
        </h1>
        <p className="text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            Полный гид по системе: от настройки справочников до формирования отчетности.
        </p>
      </header>

      {/* --- ВВЕДЕНИЕ: РЕЖИМЫ --- */}
      <Section id="intro" title="Введение и Режимы работы" icon={<CogIcon className="h-6 w-6"/>}>
        <p>Система поддерживает гибкую настройку под любую организацию. Выбор режима выполняется в разделе <NavLink view="ADMIN">Настройки</NavLink>.</p>
        <div className="grid md:grid-cols-2 gap-6">
            <div className="p-5 border-l-4 border-green-500 bg-white dark:bg-gray-800 rounded-r-xl shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🚗</span>
                    <h4 className="font-bold text-lg text-green-800 dark:text-green-400">Driver Mode (Упрощенный)</h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2"><strong>Кому подходит:</strong> Малые организации, ИП, 1–5 автомобилей.</p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                    <li>Водитель самостоятельно проводит документы.</li>
                    <li>Цепочка: <strong>Черновик → Проведён</strong>.</li>
                    <li>Минимум контроля.</li>
                </ul>
            </div>
            <div className="p-5 border-l-4 border-blue-500 bg-white dark:bg-gray-800 rounded-r-xl shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🏢</span>
                    <h4 className="font-bold text-lg text-blue-800 dark:text-blue-400">Central Mode (С проверкой)</h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2"><strong>Кому подходит:</strong> Автопарки с диспетчером.</p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                    <li>Водитель создает, диспетчер проверяет.</li>
                    <li>Цепочка: <strong>Черновик → Отправлен → Проведён</strong>.</li>
                    <li>Строгий контроль бланков и топлива.</li>
                </ul>
            </div>
        </div>
      </Section>

      {/* --- ЭТАП 1: СПРАВОЧНИКИ --- */}
      <Section id="dictionaries" title="Этап 1: Заполнение справочников" icon={<BookOpenIcon className="h-6 w-6"/>}>
        <p className="text-lg">Справочники — фундамент системы. Заполняйте их в следующем порядке:</p>
        
        {/* 1.1 Организации */}
        <InfoBlock title={<span>1.1. <NavLink view="DICTIONARIES" subView="organizations">Организации</NavLink></span>}>
            <p className="mb-4 text-sm">
                Единый реестр контрагентов. Сюда заносятся ваша компания, заказчики, филиалы и мед. учреждения.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h5 className="font-bold text-sm mb-2 uppercase tracking-wide text-gray-500">Ключевые настройки</h5>
                    <ul className="list-disc list-inside text-sm space-y-2">
                        <li><strong>Галочка "Своя организация":</strong> Отметьте для вашей основной компании.</li>
                        <li><strong>Головная организация:</strong> Используется для филиалов. Автоматически заполняет реквизиты от родителя.</li>
                        <li><strong>Группа "Мед. учреждение":</strong> Открывает поля для ввода лицензии (нужна для печати ПЛ).</li>
                    </ul>
                </div>
                <MandatoryFields 
                    fields={['Краткое наименование', 'ИНН', 'ОГРН']} 
                    note="Для корректной работы печати и отчетов эти поля обязательны." 
                />
            </div>
        </InfoBlock>

        {/* 1.2 Сотрудники */}
        <InfoBlock title={<span>1.2. <NavLink view="DICTIONARIES" subView="employees">Сотрудники</NavLink></span>}>
            <p className="mb-4 text-sm">
                Водители, диспетчеры, механики.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h5 className="font-bold text-sm mb-2 uppercase tracking-wide text-gray-500">Настройка</h5>
                    <ul className="list-disc list-inside text-sm space-y-2">
                        <li><strong>Тип "Водитель":</strong> Открывает вкладки ВУ, медсправки и топливных карт.</li>
                        <li><strong>Закрепление:</strong> В карточке можно указать "своего" диспетчера и механика для автоподстановки в ПЛ.</li>
                    </ul>
                </div>
                <MandatoryFields fields={['ФИО', 'Тип сотрудника']} />
            </div>
        </InfoBlock>

        {/* 1.3 Транспорт */}
        <InfoBlock title={<span>1.3. <NavLink view="DICTIONARIES" subView="vehicles">Транспортные средства</NavLink></span>}>
            <p className="mb-4 text-sm">
                Карточки автомобилей с нормами расхода.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h5 className="font-bold text-sm mb-2 uppercase tracking-wide text-gray-500">Расход топлива</h5>
                    <ul className="list-disc list-inside text-sm space-y-2">
                        <li><strong>Нормы (Лето/Зима):</strong> Базовый расход л/100км. Переключение сезонов автоматическое.</li>
                        <li><strong>Коэффициенты:</strong> "Город" и "Прогрев" позволяют увеличивать норму для сложных условий.</li>
                    </ul>
                </div>
                <MandatoryFields fields={['Гос. номер', 'Марка', 'Тип топлива']} />
            </div>
        </InfoBlock>
      </Section>

      {/* --- ЭТАП 2: БЛАНКИ --- */}
      <Section id="blanks" title="Этап 2: Управление бланками" icon={<ArchiveBoxIcon className="h-6 w-6"/>}>
        <p className="mb-4">Если вы используете бумажные бланки строгой отчетности, настройте их учет в разделе <NavLink view="ADMIN">Настройки</NavLink> → <strong>Бланки ПЛ</strong>.</p>
        
        <div className="grid md:grid-cols-3 gap-4 text-center">
             <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-700 mb-1">1</div>
                <div className="font-bold mb-1">Создать пачку</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Укажите серию и диапазон (напр. 100-200).</div>
             </div>
             <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg">
                <div className="text-2xl font-bold text-indigo-700 mb-1">2</div>
                <div className="font-bold mb-1">Материализовать</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Система создаст записи для каждого номера. Статус: <StatusBadge color="bg-blue-100 text-blue-800">На складе</StatusBadge></div>
             </div>
             <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-700 mb-1">3</div>
                <div className="font-bold mb-1">Выдать</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Закрепите бланки за водителем. Статус: <StatusBadge color="bg-yellow-100 text-yellow-800">Выдан</StatusBadge></div>
             </div>
        </div>
      </Section>

      {/* --- ЭТАП 3: СКЛАД --- */}
      <Section id="warehouse" title="Этап 3: Склад, Шины и Топливо" icon={<TruckIcon className="h-6 w-6"/>}>
        <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
                <h4 className="font-bold text-lg">⛽ Топливные карты</h4>
                <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg text-sm">
                    <p className="mb-2"><strong>Пополнение топливной карты:</strong> Это специальный тип документа "Расход" на складе.</p>
                    <ul className="list-disc list-inside text-sm space-y-1 text-gray-600 dark:text-gray-400">
                        <li>Списывает топливо со склада (виртуального или реального).</li>
                        <li>Зачисляет литры на баланс водителя.</li>
                    </ul>
                    <div className="mt-3 pt-3 border-t dark:border-gray-600">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">Автопополнение:</span> Настройте правила (например, "100л ежемесячно"), и система сама создаст документы 1-го числа.
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="font-bold text-lg">🍩 Учет шин</h4>
                <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg text-sm border border-blue-100 dark:border-blue-800">
                    <p className="mb-2">Пробег начисляется на шины автоматически при проведении ПЛ.</p>
                    <span className="font-bold text-blue-700 dark:text-blue-300">Методы начисления (в настройках):</span>
                    <ul className="mt-2 space-y-2">
                        <li>
                            <strong>По факту установки:</strong> Пробег идет на все установленные шины, независимо от сезона.
                        </li>
                        <li>
                            <strong>Строго по сезону:</strong> Летом пробег идет только на летние/всесезонные, зимой — на зимние/всесезонные.
                        </li>
                    </ul>
                </div>
            </div>
        </div>
      </Section>

      {/* --- ЭТАП 4: ПУТЕВЫЕ ЛИСТЫ --- */}
      <Section id="waybills" title="Этап 4: Работа с путевыми листами" icon={<DocumentTextIcon className="h-6 w-6"/>}>
        
        {/* Жизненный цикл */}
        <div className="mb-8">
            <h4 className="font-bold text-xl mb-4">1. Жизненный цикл и Функции</h4>
            <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-700">
                    <div className="font-bold mb-1">Создание</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Система подставляет пробег и топливо из предыдущего ПЛ. Номер бланка резервируется.</div>
                </div>
                <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800">
                    <div className="font-bold mb-1 text-yellow-800 dark:text-yellow-200">Проверка</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Используйте кнопку <CheckCircleIcon className="inline h-3 w-3"/> для поиска разрывов в пробеге и отрицательных остатков.</div>
                </div>
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
                    <div className="font-bold mb-1 text-green-800 dark:text-green-200">Проведение</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Списание топлива с карты, списание бланка, обновление пробега ТС и шин.</div>
                </div>
            </div>
            
            <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-500 rounded-r-lg">
                <h5 className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                    <ArrowPathIcon className="h-5 w-5"/> Пересчет цепочки (Chain Recalc)
                </h5>
                <p className="text-sm mt-1 text-gray-700 dark:text-gray-300">
                    Если вы удалили или изменили старый ПЛ, нажмите эту кнопку. Система найдет последний проведенный документ и 
                    автоматически пересчитает начальные и конечные показания (одометр, топливо) во всех последующих черновиках.
                </p>
            </div>
        </div>

        {/* Методика расчета */}
        <h4 className="font-bold text-xl mb-4 pt-4 border-t dark:border-gray-700">2. Методика расчета ГСМ</h4>
        <p className="mb-4 text-sm">Выбор метода выполняется внутри формы путевого листа.</p>
        
        <div className="grid md:grid-cols-3 gap-6">
            <InfoBlock title="1. По отрезкам (Точный)">
                <p className="text-xs mb-2 text-gray-500">Важна математическая точность каждой поездки.</p>
                <div className="text-xs bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600 font-mono mb-2">
                    Σ (Пробег_отрезка × Норма × Коэф)
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300">
                    Программа считает расход для каждой строки маршрута отдельно (учитывая город/прогрев для этой строки), округляет и суммирует.
                </p>
            </InfoBlock>

            <InfoBlock title="2. По общему (Смешанный)">
                <p className="text-xs mb-2 text-gray-500">Подгонка под общий пробег по одометру.</p>
                <div className="text-xs bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600 font-mono mb-2">
                    (Общий_Пробег × Средняя_Норма)
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300">
                    Сначала вычисляется средний расход на 100км на основе поездок. Затем этот средний расход применяется к общему пробегу за день.
                </p>
            </InfoBlock>

            <InfoBlock title="3. Котловой (Базовый)">
                <p className="text-xs mb-2 text-gray-500">Самый простой метод.</p>
                <div className="text-xs bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600 font-mono mb-2">
                    (Общий_Пробег × Базовая_Норма)
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300">
                    Игнорирует условия поездок (город/прогрев). Берет общий пробег и умножает на базовую летнюю или зимнюю норму ТС.
                </p>
            </InfoBlock>
        </div>
      </Section>
      
      {/* --- ЭТАП 5: ОТЧЕТНОСТЬ --- */}
      <Section id="reports" title="Этап 5: Отчетность и Экспорт" icon={<ChartBarIcon className="h-6 w-6"/>}>
          <div className="grid md:grid-cols-2 gap-8">
              <div>
                  <h4 className="font-bold text-lg mb-2">Аналитика</h4>
                  <ul className="space-y-2 text-sm">
                      <li><strong>Сводный отчет по ТС:</strong> Таблица с пробегом, заправками и расходом по каждому дню.</li>
                      <li><strong>Журнал медосмотров:</strong> Специальный отчет для медика. Группирует осмотры по водителям и датам.</li>
                  </ul>
              </div>
              <div>
                  <h4 className="font-bold text-lg mb-2">Импорт и Экспорт</h4>
                  <ul className="space-y-2 text-sm">
                      <li><strong>Экспорт (JSON):</strong> Полная резервная копия базы данных. Рекомендуется делать регулярно.</li>
                      <li><strong>Импорт:</strong> Восстановление данных. Поддерживает режимы "Добавить новые", "Обновить" и "Перезаписать".</li>
                      <li><strong>Пакет контекста:</strong> Облегченный файл для отправки разработчику (только справочники и последние 10 ПЛ).</li>
                  </ul>
              </div>
          </div>
      </Section>

      {/* --- СПРАВОЧНИК СТАТУСОВ --- */}
      <Section id="statuses" title="Справочник статусов" icon={<QuestionMarkCircleIcon className="h-6 w-6"/>}>
        <div className="grid sm:grid-cols-2 gap-8">
            <div>
                <h5 className="font-bold mb-3 border-b pb-2">Путевые листы</h5>
                <ul className="space-y-3">
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-gray-100 text-gray-800">Черновик</StatusBadge>
                        <span className="text-sm text-gray-500">В работе, можно править.</span>
                    </li>
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-yellow-100 text-yellow-800">Отправлен</StatusBadge>
                        <span className="text-sm text-gray-500">Ждет проверки диспетчером.</span>
                    </li>
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-green-100 text-green-800">Проведён</StatusBadge>
                        <span className="text-sm text-gray-500">Учтен, списан, закрыт.</span>
                    </li>
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-red-100 text-red-800">Отменён</StatusBadge>
                        <span className="text-sm text-gray-500">Аннулирован.</span>
                    </li>
                </ul>
            </div>
            <div>
                <h5 className="font-bold mb-3 border-b pb-2">Бланки БСО</h5>
                <ul className="space-y-3">
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-blue-100 text-blue-800">На складе</StatusBadge>
                        <span className="text-sm text-gray-500">Доступен для выдачи.</span>
                    </li>
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-yellow-100 text-yellow-800">Выдан</StatusBadge>
                        <span className="text-sm text-gray-500">На руках у водителя.</span>
                    </li>
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-indigo-100 text-indigo-800">Зарезервирован</StatusBadge>
                        <span className="text-sm text-gray-500">Выбран в черновике ПЛ.</span>
                    </li>
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-green-100 text-green-800">Использован</StatusBadge>
                        <span className="text-sm text-gray-500">ПЛ проведен.</span>
                    </li>
                    <li className="flex items-center justify-between">
                        <StatusBadge color="bg-red-100 text-red-800">Испорчен</StatusBadge>
                        <span className="text-sm text-gray-500">Списан актом.</span>
                    </li>
                </ul>
            </div>
        </div>
      </Section>
    </div>
  );
};

// Local Icon Helper
const ArrowPathIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
);

export default UserGuide;
