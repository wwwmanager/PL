
import { useState, lazy, Suspense, useEffect, type FC, type ReactElement } from 'react';
import { DashboardIcon, DocumentTextIcon, ChartBarIcon, CogIcon, TruckIcon, MenuIcon, XIcon, BookOpenIcon, InformationCircleIcon, QuestionMarkCircleIcon, ArrowDownIcon, ArrowUpIcon, ArchiveBoxIcon, CodeBracketIcon, BeakerIcon, ShieldCheckIcon } from './components/Icons';
import { View, DictionaryType, AppSettings } from './types';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './services/auth';
import { DevRoleSwitcher } from './services/auth';
import { getAppSettings } from './services/mockApi';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { subscribe } from './services/bus';

const Dashboard = lazy(() => import('./components/dashboard/Dashboard'));
const WaybillList = lazy(() => import('./components/waybills/WaybillList'));
const Reports = lazy(() => import('./components/reports/Reports'));
const Admin = lazy(() => import('./components/admin/Admin'));
const Dictionaries = lazy(() => import('./components/dictionaries/Dictionaries'));
const GarageManagement = lazy(() => import('./components/dictionaries/GarageManagement'));
const About = lazy(() => import('./components/about/About'));
const UserGuide = lazy(() => import('./components/help/UserGuide'));
const AdminGuide = lazy(() => import('./components/help/AdminGuide'));
const DeveloperGuide = lazy(() => import('./components/help/DeveloperGuide'));
const TestingGuide = lazy(() => import('./components/help/TestingGuide'));
const BusinessLogicGuide = lazy(() => import('./components/help/BusinessLogicGuide'));
const CapabilitiesGuide = lazy(() => import('./components/help/CapabilitiesGuide'));
const BlankManagement = lazy(() => import('./components/admin/BlankManagement'));

const viewTitles: { [key in View]: string } = {
  DASHBOARD: 'Панель управления',
  WAYBILLS: 'Путевые листы',
  DICTIONARIES: 'Справочники',
  WAREHOUSE: 'Номенклатура и Склад',
  REPORTS: 'Отчеты',
  ADMIN: 'Настройки',
  ABOUT: 'О программе',
  USER_GUIDE: 'Руководство пользователя',
  ADMIN_GUIDE: 'Руководство администратора',
  DEVELOPER_GUIDE: 'Документация для разработчика',
  BLANKS: 'Бланки ПЛ',
  TESTING_GUIDE: 'Руководство для тестировщика',
  BUSINESS_LOGIC_GUIDE: 'Бизнес-логика приложения',
  CAPABILITIES_GUIDE: 'Справочник прав (Capabilities)',
};

// --- React Query Setup ---
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute default stale time
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

// Component to listen to bus events and invalidate queries
const QueryBusListener = () => {
  const qc = useQueryClient();
  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      // Invalidate queries based on topic name matching query keys
      // Topics: waybills, employees, vehicles, organizations, settings, etc.
      // These map directly to our query keys in hooks/queries.ts
      if (msg.topic) {
        console.debug('[React Query] Invalidating via bus:', msg.topic);
        qc.invalidateQueries({ queryKey: [msg.topic] });
        
        // Specific cascading invalidations
        if (msg.topic === 'waybills') {
           // Waybill changes might affect vehicle stats
           qc.invalidateQueries({ queryKey: ['vehicles'] });
        }
      }
    });
    return unsubscribe;
  }, [qc]);
  return null;
};

const LoadingSpinner = () => (
    <div className="flex justify-center items-center h-full w-full">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
    </div>
);

const SplashScreen = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 z-50 transition-opacity duration-500">
    <div className="relative mb-8">
        <div className="absolute inset-0 bg-blue-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
        <TruckIcon className="h-32 w-32 text-blue-600 dark:text-blue-500 relative z-10 drop-shadow-xl" />
    </div>
    <div className="text-center">
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">
            Путевые <span className="text-blue-600 dark:text-blue-500">Листы</span>
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-widest">
            Система управления автопарком
        </p>
    </div>
    <div className="mt-12 flex space-x-2">
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"></div>
    </div>
  </div>
);

const AppContent: FC = () => {
  const [currentView, setCurrentView] = useState<View>('DASHBOARD');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [waybillToOpen, setWaybillToOpen] = useState<string | null>(null);
  const [dictionarySubView, setDictionarySubView] = useState<DictionaryType | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const { hasRole } = useAuth();

  useEffect(() => {
    const minLoadTime = new Promise(resolve => setTimeout(resolve, 800)); // Minimum 800ms splash screen
    const dataLoad = getAppSettings().then(setAppSettings);

    Promise.all([dataLoad, minLoadTime]).then(() => {
        setIsAppLoading(false);
    });
  }, []);

  const handleNavigate = (view: View, subView?: string) => {
    if (view === 'DICTIONARIES' && subView) {
      setDictionarySubView(subView as DictionaryType);
    } else {
      setDictionarySubView(null);
    }
    setCurrentView(view);
  };

  const handleNavigateToWaybill = (waybillId: string) => {
    setWaybillToOpen(waybillId);
    setCurrentView('WAYBILLS');
  };
  
  const onWaybillOpened = () => {
    setWaybillToOpen(null);
  };

  const renderView = () => {
    switch (currentView) {
      case 'DASHBOARD':
        return <Dashboard onNavigateToWaybill={handleNavigateToWaybill} />;
      case 'WAYBILLS':
        return <WaybillList waybillToOpen={waybillToOpen} onWaybillOpened={onWaybillOpened} />;
      case 'DICTIONARIES':
        const subViewToOpen = dictionarySubView;
        // Reset subview after passing it to prevent re-triggering
        if (dictionarySubView) setDictionarySubView(null); 
        return <Dictionaries subViewToOpen={subViewToOpen} />;
      case 'WAREHOUSE':
        return <GarageManagement />;
      case 'REPORTS':
        return <Reports />;
      case 'ADMIN':
        return <Admin />;
      case 'BLANKS':
        return <BlankManagement />;
      case 'ABOUT':
        return <About />;
      case 'USER_GUIDE':
        return <UserGuide onNavigate={handleNavigate} />;
      case 'ADMIN_GUIDE':
        return <AdminGuide />;
      case 'DEVELOPER_GUIDE':
        return <DeveloperGuide />;
      case 'TESTING_GUIDE':
        return <TestingGuide />;
      case 'BUSINESS_LOGIC_GUIDE':
        return <BusinessLogicGuide />;
      case 'CAPABILITIES_GUIDE':
        return <CapabilitiesGuide />;
      default:
        return <Dashboard onNavigateToWaybill={handleNavigateToWaybill} />;
    }
  };

  const NavItem = ({ view, icon, label }: { view: View; icon: ReactElement; label: string }) => (
    <li
      onClick={() => handleNavigate(view)}
      className={`flex items-center p-3 my-1 rounded-lg cursor-pointer transition-colors ${
        currentView === view
          ? 'bg-blue-600 text-white shadow-lg'
          : 'text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-gray-700'
      }`}
    >
      <span className="w-6 h-6">{icon}</span>
      <span className="ml-4 font-medium">{label}</span>
    </li>
  );
  
  const HelpMenu = () => (
    <li>
      <div
        onClick={() => setIsHelpOpen(!isHelpOpen)}
        className="flex items-center justify-between p-3 my-1 rounded-lg cursor-pointer text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-gray-700"
      >
        <div className="flex items-center">
          <span className="w-6 h-6"><QuestionMarkCircleIcon /></span>
          <span className="ml-4 font-medium">Справка</span>
        </div>
        {isHelpOpen ? <ArrowUpIcon className="w-5 h-5" /> : <ArrowDownIcon className="w-5 h-5" />}
      </div>
      {isHelpOpen && (
        <ul className="pl-8 transition-all duration-300 ease-in-out">
          <NavItem view="USER_GUIDE" icon={<BookOpenIcon />} label="Руководство" />
          <NavItem view="ADMIN_GUIDE" icon={<CogIcon />} label="Администратору" />
          <NavItem view="DEVELOPER_GUIDE" icon={<CodeBracketIcon />} label="Разработчику" />
          <NavItem view="TESTING_GUIDE" icon={<BeakerIcon />} label="Тестировщику" />
          <NavItem view="BUSINESS_LOGIC_GUIDE" icon={<BeakerIcon />} label="Бизнес-логика" />
          <NavItem view="CAPABILITIES_GUIDE" icon={<ShieldCheckIcon />} label="Справочник прав" />
          <NavItem view="ABOUT" icon={<InformationCircleIcon />} label="О программе" />
        </ul>
      )}
    </li>
  );

  const isDriverMode = appSettings?.appMode === 'driver' || !appSettings?.appMode;

  if (isAppLoading) {
      return <SplashScreen />;
  }

  return (
      <div className="flex h-screen bg-gray-100 dark:bg-gray-900 font-sans">
        <aside
          className={`bg-white dark:bg-gray-800 text-gray-800 dark:text-white flex flex-col transition-all duration-300 ease-in-out shadow-xl z-20 ${
            isSidebarOpen ? 'w-64' : 'w-0'
          } overflow-hidden`}
        >
          <div className="flex items-center justify-center h-20 border-b dark:border-gray-700">
            <TruckIcon className="h-8 w-8 text-blue-500" />
            <h1 className="text-2xl font-bold ml-2 text-gray-800 dark:text-white">Путевые листы</h1>
          </div>
          <nav className="flex-1 px-4 py-4">
            <ul>
              <NavItem view="DASHBOARD" icon={<DashboardIcon />} label="Панель управления" />
              <NavItem view="WAYBILLS" icon={<DocumentTextIcon />} label="Путевые листы" />
              {isDriverMode && hasRole('driver') && (
                <NavItem view="BLANKS" icon={<ArchiveBoxIcon />} label="Бланки ПЛ" />
              )}
              <NavItem view="DICTIONARIES" icon={<BookOpenIcon />} label="Справочники" />
              <NavItem view="WAREHOUSE" icon={<ArchiveBoxIcon />} label="Номенклатура и Склад" />
              <NavItem view="REPORTS" icon={<ChartBarIcon />} label="Отчеты" />
              <NavItem view="ADMIN" icon={<CogIcon />} label="Настройки" />
              <HelpMenu />
            </ul>
          </nav>
           <div className="p-4 border-t dark:border-gray-700">
             <DevRoleSwitcher />
           </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b dark:border-gray-700 shadow-md">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-600 dark:text-gray-300 focus:outline-none">
                {isSidebarOpen ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
              </button>
              <h1 className="text-xl font-semibold text-gray-800 dark:text-white">{viewTitles[currentView]}</h1>
              <div className="w-16"></div>
          </header>
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
            <Suspense fallback={<LoadingSpinner />}>
              {renderView()}
            </Suspense>
          </main>
        </div>
      </div>
  );
};

const App: FC = () => {
    return (
        <ToastProvider>
            <QueryClientProvider client={queryClient}>
                <QueryBusListener />
                <AuthProvider defaultRole="admin">
                    <Suspense fallback={<LoadingSpinner />}>
                        <AppContent />
                    </Suspense>
                </AuthProvider>
            </QueryClientProvider>
        </ToastProvider>
    );
};

export default App;
