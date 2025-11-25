
import React from 'react';
import { TruckIcon } from '../Icons';
import { View, DictionaryType } from '../../types';

interface UserGuideProps {
  onNavigate: (view: View, subView?: DictionaryType) => void;
}

const UserGuide: React.FC<UserGuideProps> = ({ onNavigate }) => {
  const NavLink: React.FC<{ view: View; subView?: DictionaryType; children: React.ReactNode }> = ({ view, subView, children }) => (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onNavigate(view, subView);
      }}
      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
    >
      {children}
    </a>
  );

  const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
    <section id={id} className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 border-b pb-2 dark:border-gray-600">{title}</h2>
      <div className="prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4">
        {children}
      </div>
    </section>
  );
  
  const AnchorLink: React.FC<{ to: string, children: React.ReactNode}> = ({ to, children }) => (
    <a href={`#${to}`} className="text-blue-600 dark:text-blue-400 hover:underline">{children}</a>
  )

  return (
    <div className="max-w-4xl mx-auto">
      <header className="text-center mb-10">
        <TruckIcon className="h-16 w-16 text-blue-500 mx-auto mb-4" />
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">Интерактивное руководство пользователя</h1>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Нажмите на ссылки, чтобы перейти в нужный раздел.</p>
      </header>
      
      <nav className="p-6 bg-white dark:bg-gray-800 rounded-xl mb-8">
        <h3 className="text-xl font-bold mb-3 dark:text-white">Оглавление</h3>
        <ul className="list-disc list-inside space-y-2">
            <li><AnchorLink to="intro">Введение</AnchorLink></li>
            <li><AnchorLink to="start">Начало работы и интерфейс</AnchorLink></li>
            <li><AnchorLink to="dictionaries">Управление справочниками</AnchorLink></li>
            <li><AnchorLink to="warehouse">Номенклатура и Склад</AnchorLink></li>
            <li><AnchorLink to="waybills">Работа с путевыми листами</AnchorLink></li>
            <li><AnchorLink to="reports">Формирование отчета</AnchorLink></li>
            <li><AnchorLink to="admin">Настройки и администрирование</AnchorLink></li>
            <li><NavLink view="ADMIN_GUIDE">Руководство администратора</NavLink> (продвинутые функции)</li>
        </ul>
      </nav>

      <Section id="intro" title="1. Введение">
        <p>Система предназначена для комплексной автоматизации учета и управления путевыми листами. Она работает полностью в вашем браузере, не требует подключения к интернету и хранит все данные локально.</p>
      </Section>

      <Section id="start" title="2. Начало работы и интерфейс">
        <p>Приложение не требует логина и пароля. Для навигации используйте боковое меню:</p>
        <ul>
            <li><NavLink view="DASHBOARD">Панель управления</NavLink> — главный экран с графиками.</li>
            <li><NavLink view="WAYBILLS">Путевые листы</NavLink> — основной раздел для создания и просмотра ПЛ.</li>
            <li><NavLink view="BLANKS">Бланки ПЛ</NavLink> — учет и выдача бланков строгой отчетности (для режима водителя).</li>
            <li><NavLink view="DICTIONARIES">Справочники</NavLink> — управление всеми базовыми данными.</li>
            <li><NavLink view="WAREHOUSE">Номенклатура и Склад</NavLink> — управление складскими остатками и движением ТМЦ.</li>
            <li><NavLink view="REPORTS">Отчеты</NavLink> — формирование сводного отчета.</li>
            <li><NavLink view="ADMIN">Настройки</NavLink> — администрирование, импорт и экспорт.</li>
        </ul>
      </Section>
      
      <Section id="dictionaries" title="3. Управление справочниками">
        <p>Раздел <NavLink view="DICTIONARIES">Справочники</NavLink> позволяет управлять всеми базовыми сущностями системы:</p>
        <ul>
            <li><NavLink view="DICTIONARIES" subView="vehicles">Транспортные средства</NavLink>: ведите учет ТС, их документы, нормы расхода и историю ТО.</li>
            <li><NavLink view="DICTIONARIES" subView="employees">Сотрудники</NavLink>: управляйте списком водителей, диспетчеров и контролеров, их ВУ и картами.</li>
            <li><NavLink view="DICTIONARIES" subView="organizations">Организации</NavLink>: справочник ваших компаний, контрагентов и медицинских учреждений.</li>
            <li><NavLink view="DICTIONARIES" subView="fuelTypes">Типы топлива</NavLink>: укажите типы топлива и их плотность.</li>
            <li><NavLink view="DICTIONARIES" subView="routes">Сохраненные маршруты</NavLink>: храните часто используемые сегменты маршрутов.</li>
            <li><NavLink view="DICTIONARIES" subView="storageLocations">Места хранения</NavLink>: управляйте складами и другими местами хранения.</li>
        </ul>
      </Section>

      <Section id="warehouse" title="4. Номенклатура и Склад">
        <p>Раздел <NavLink view="WAREHOUSE">Номенклатура и Склад</NavLink> предназначен для учета товарно-материальных ценностей (ТМЦ), в первую очередь ГСМ и запчастей.</p>
        <ul>
            <li><strong>Номенклатура:</strong> Создавайте и редактируйте карточки товаров (топливо, запчасти). Здесь же можно видеть актуальные остатки.</li>
            <li><strong>Движение по складу:</strong> Оформляйте документы прихода и расхода ТМЦ. Система автоматически обновляет остатки. Также здесь можно оформить пополнение топливной карты водителя.</li>
        </ul>
      </Section>

      <Section id="waybills" title="5. Работа с путевыми листами">
        <p>Перейдите в раздел <NavLink view="WAYBILLS">Путевые листы</NavLink> и нажмите "+ Создать новый". Заполните основную информацию, а затем добавьте маршруты одним из способов:</p>
        <ol>
            <li><b>Ручное добавление:</b> Нажмите "+ Добавить маршрут" и введите пункты.</li>
            <li><b>Генерация (AI):</b> Введите текстовое описание (например, "База - Склад - Клиент - База") и нажмите "Сгенерировать (AI)".</li>
            <li><b>Импорт из файла:</b> Нажмите "Импорт из файла", выберите HTML или PDF файл. Система распознает остановки и добавит их в ПЛ.</li>
        </ol>
        <p>После сохранения путевой лист можно распечатать, нажав на кнопку "Печать".</p>
      </Section>
      
      <Section id="reports" title="6. Формирование отчета">
        <p>Система позволяет формировать <NavLink view="REPORTS">Сводный отчет по ТС</NavLink>.</p>
        <p>Выберите транспортное средство, укажите период и нажмите "Сформировать". Отчет можно экспортировать в формат Excel.</p>
      </Section>
      
      <Section id="admin" title="7. Настройки и администрирование">
        <p>В разделе <NavLink view="ADMIN">Настройки</NavLink> доступны следующие функции:</p>
        <ul>
            <li><b>Экспорт/Импорт данных:</b> Создавайте резервные копии всех данных системы в JSON-файл и восстанавливайте их.</li>
            <li><b>Журнал импорта:</b> Просматривайте историю всех операций импорта, откатывайте изменения или удаляйте события.</li>
            <li><b>Диагностика:</b> Инструменты для проверки состояния хранилища и валидации данных.</li>
        </ul>
      </Section>
    </div>
  );
};

export default UserGuide;
