
import React, { useEffect, useState, useMemo } from 'react';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, LabelList } from 'recharts';
import { getDashboardData, getIssues, getVehicles, getAppSettings, getWaybills } from '../../services/mockApi';
import { TruckIcon, UserGroupIcon, CogIcon, XIcon, BanknotesIcon, PencilIcon, PaperAirplaneIcon, CheckCircleIcon, SparklesIcon } from '../Icons';
import { KpiData, Vehicle, AppSettings, WaybillStatus } from '../../types';

interface DashboardProps {
  onNavigateToWaybill: (waybillId: string) => void;
}

// =============================================================================
// Modal Component
// =============================================================================
interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300"
      aria-labelledby="modal-title" role="dialog" aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all duration-300"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 id="modal-title" className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Закрыть">
            <XIcon className="h-6 w-6" />
          </button>
        </header>
        <main className="p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

// =============================================================================
// Modal Content Components
// =============================================================================
const IssuesContent: React.FC<{ vehicleId: string }> = ({ vehicleId }) => {
    const [issues, setIssues] = useState<Awaited<ReturnType<typeof getIssues>> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadIssues = async () => {
            setLoading(true);
            const issuesData = await getIssues({ vehicleId });
            setIssues(issuesData);
            setLoading(false);
        };
        loadIssues();
    }, [vehicleId]);

    if (loading) return <div className="text-center text-gray-600 dark:text-gray-300">Анализ данных...</div>;
    
    const { expiringDocs } = issues || {};

    if (!expiringDocs || expiringDocs.length === 0) {
        return <div className="text-center text-gray-600 dark:text-gray-300">Проблем не обнаружено.</div>;
    }

    // Split issues into maintenance and documents for better display
    const maintenanceIssues = expiringDocs.filter(d => d.type === 'Тех. обслуживание');
    const docIssues = expiringDocs.filter(d => d.type !== 'Тех. обслуживание');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredDocs = docIssues.filter(d => new Date(d.date) < today);
    const warningDocs = docIssues.filter(d => new Date(d.date) >= today);

    return (
        <div className="space-y-6">
            {maintenanceIssues.length > 0 && (
                <div>
                    <h4 className="font-semibold text-red-600 dark:text-red-500 mb-2 flex items-center gap-2">
                        <CogIcon className="h-5 w-5" />
                        Техническое обслуживание
                    </h4>
                    <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                        {maintenanceIssues.map((doc, index) => (
                            <li key={index}>
                                <span className="font-semibold">{doc.name}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {expiredDocs.length > 0 && (
                <div>
                    <h4 className="font-semibold text-red-600 dark:text-red-500 mb-2 flex items-center gap-2">
                        <XIcon className="h-5 w-5" />
                        Просроченные документы
                    </h4>
                    <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                        {expiredDocs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((doc, index) => (
                            <li key={index}>
                                <span className="font-semibold">{doc.type}</span> ({doc.name}): 
                                <span className="text-red-600 font-bold ml-1">истек {new Date(doc.date).toLocaleDateString()}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {warningDocs.length > 0 && (
                <div>
                    <h4 className="font-semibold text-yellow-600 dark:text-yellow-500 mb-2">Истекающие документы (в теч. 30 дней)</h4>
                    <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                        {warningDocs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((doc, index) => (
                            <li key={index}>
                            <span className="font-semibold">{doc.type}</span> ({doc.name}): истекает {new Date(doc.date).toLocaleDateString()}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

const KpiCard = ({ title, value, icon, color, unit = '', onClick }: { title: string, value: string | number, icon: React.ReactElement, color: string, unit?: string, onClick?: () => void }) => (
    <div
        onClick={onClick}
        className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg flex items-center transition-transform transform hover:scale-105 ${onClick ? 'cursor-pointer' : ''}`}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : -1}
        onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick() }}
        aria-label={`Показать детали для: ${title}`}
    >
        <div className={`p-4 rounded-full ${color}`}>
            {icon}
        </div>
        <div className="ml-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{value}<span className="text-sm font-normal ml-1">{unit}</span></p>
        </div>
    </div>
);

const StatusCard = ({ title, value, icon, bgClass, onClick }: { title: string, value: number, icon: React.ReactElement, bgClass: string, onClick?: () => void }) => (
    <div
        onClick={onClick}
        className={`${bgClass} p-4 rounded-xl flex items-center justify-between transition-transform transform hover:scale-105 ${onClick ? 'cursor-pointer' : ''}`}
    >
        <div>
            <p className="text-xs font-semibold uppercase opacity-70 mb-1">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="opacity-80">
            {icon}
        </div>
    </div>
);

interface ChartCardProps {
    title: string;
    children: React.ReactNode;
    fullWidth?: boolean;
    height?: number | string;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children, fullWidth, height = 350 }) => (
    <div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg ${fullWidth ? 'md:col-span-2' : ''}`}>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">{title}</h3>
        <div style={{ width: '100%', height, minWidth: 0 }}>
            {children}
        </div>
    </div>
);

const ListCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 border-b pb-2 dark:border-gray-700">{title}</h3>
        {children}
    </div>
);

const DASHBOARD_FILTERS_KEY = 'dashboard_filters_v1';

// Helper to get current quarter dates
const getQuarterDates = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
    
    // Start of quarter (1st day of the starting month)
    const start = new Date(currentYear, quarterStartMonth, 1);
    
    // End of quarter (last day of the 3rd month in quarter)
    const end = new Date(currentYear, quarterStartMonth + 3, 0);
    
    // Format to YYYY-MM-DD
    const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        start: formatDate(start),
        end: formatDate(end)
    };
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigateToWaybill }) => {
    const [kpi, setKpi] = useState<KpiData | null>(null);
    const [statuses, setStatuses] = useState<any>(null);
    const [topOverruns, setTopOverruns] = useState<any[]>([]);
    const [upcomingMaintenance, setUpcomingMaintenance] = useState<any[]>([]);
    const [birthdays, setBirthdays] = useState<any[]>([]);
    
    const [fuelConsumptionByMonth, setFuelConsumptionByMonth] = useState<any[]>([]);
    const [medicalExamsByMonth, setMedicalExamsByMonth] = useState<any[]>([]);
    const [fuelByVehicle, setFuelByVehicle] = useState<any[]>([]);
    const [examsByDriver, setExamsByDriver] = useState<any[]>([]);
    
    const [loading, setLoading] = useState(true);
    const [modalContent, setModalContent] = useState<{ title: string; content: React.ReactNode } | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);

    // Initialize filters from localStorage or defaults
    const [filters, setFilters] = useState(() => {
        try {
            const saved = localStorage.getItem(DASHBOARD_FILTERS_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load dashboard filters', e);
        }
        
        // Default to current quarter
        const { start, end } = getQuarterDates();
        
        return { 
            vehicleId: '', 
            dateFrom: start, 
            dateTo: end 
        };
    });

    const fetchData = async (currentFilters: typeof filters) => {
        try {
            setLoading(true);
            const data = await getDashboardData(currentFilters);
            setKpi(data?.kpi ?? null);
            setStatuses(data?.statuses ?? null);
            setTopOverruns(data?.topOverruns ?? []);
            setUpcomingMaintenance(data?.upcomingMaintenance ?? []);
            setBirthdays(data?.birthdays ?? []);
            setFuelConsumptionByMonth(data?.fuelConsumptionByMonth ?? []);
            setMedicalExamsByMonth(data?.medicalExamsByMonth ?? []);
            setFuelByVehicle(data?.fuelByVehicle ?? []);
            setExamsByDriver(data?.examsByDriver ?? []);
        } catch (error) {
            console.error("Failed to fetch dashboard data:", error);
            setKpi(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const initData = async () => {
            const [v, s, allWaybills] = await Promise.all([getVehicles(), getAppSettings(), getWaybills()]);
            setVehicles(v);
            setSettings(s);

            // Auto-selection Logic:
            // If filters.vehicleId is empty AND there is exactly ONE vehicle with POSTED waybills in the entire database, select it.
            if (!filters.vehicleId) {
                const postedWaybills = allWaybills.filter(w => w.status === WaybillStatus.POSTED);
                const uniqueVehicleIds = Array.from(new Set(postedWaybills.map(w => w.vehicleId)));
                
                if (uniqueVehicleIds.length === 1) {
                    const singleVehicleId = uniqueVehicleIds[0];
                    setFilters(prev => {
                        const next = { ...prev, vehicleId: singleVehicleId };
                        // Trigger fetch with new filter immediately
                        fetchData(next);
                        return next;
                    });
                    // Skip the initial fetchData call below because we just called it
                    return; 
                }
            }
            
            // Standard fetch if no auto-selection happened
            fetchData(filters);
        };

        initData();
    }, []);

    // Save filters to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem(DASHBOARD_FILTERS_KEY, JSON.stringify(filters));
    }, [filters]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    // Special handler for vehicle select to trigger auto-fetch
    const handleVehicleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        const newFilters = { ...filters, vehicleId: value };
        setFilters(newFilters);
        fetchData(newFilters);
    };

    const handleGenerate = () => {
        fetchData(filters);
    };

    const normalizedFuel = useMemo(
      () => fuelConsumptionByMonth.map(m => ({
        ...m,
        fact: m.fact ?? m['Факт'],
      })),
      [fuelConsumptionByMonth]
    );
    
    const normalizedExamsMonth = useMemo(
        () => medicalExamsByMonth.map(m => ({
          ...m,
          value: m.exams,
        })),
        [medicalExamsByMonth]
    );
    
    const handleModalClose = () => {
      setModalContent(null);
    };

    // Helper for formatting date range
    const formatPeriodDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('ru-RU');
    };

    const periodLabel = `за выбранный период ${formatPeriodDate(filters.dateFrom)} - ${formatPeriodDate(filters.dateTo)}`;

    // Helper for formatting X-Axis months (YYYY-MM -> Month Name)
    const formatMonthAxis = (tick: string) => {
        if (!tick) return '';
        try {
            const [year, month] = tick.split('-').map(Number);
            const date = new Date(year, month - 1);
            const name = date.toLocaleString('ru-RU', { month: 'long' });
            return name.charAt(0).toUpperCase() + name.slice(1);
        } catch {
            return tick;
        }
    };

    if (loading && !kpi) {
        return <div className="text-center p-10 text-gray-600 dark:text-gray-300">Загрузка панели управления...</div>;
    }

    const widgets = settings?.dashboardWidgets || {
        showStatuses: true,
        showFleetStats: true,
        showCharts: true,
        showOverruns: true,
        showMaintenance: true,
        showBirthdays: true
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <select name="vehicleId" value={filters.vehicleId} onChange={handleVehicleChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2">
                    <option value="">Все ТС</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} - {v.brand}</option>)}
                </select>
                <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                <button 
                    onClick={handleGenerate} 
                    disabled={loading} 
                    className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 active:scale-95 transform transition-all disabled:bg-blue-400"
                >
                    {loading ? 'Загрузка...' : 'Сформировать'}
                </button>
            </div>

            {widgets.showStatuses && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatusCard 
                        title="Черновики" 
                        value={statuses?.drafts ?? 0} 
                        icon={<PencilIcon className="h-8 w-8 text-gray-700 dark:text-gray-300" />} 
                        bgClass="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white"
                    />
                    <StatusCard 
                        title="На проверке" 
                        value={statuses?.submitted ?? 0} 
                        icon={<PaperAirplaneIcon className="h-8 w-8 text-blue-700 dark:text-blue-300" />} 
                        bgClass="bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-100"
                    />
                    <StatusCard 
                        title="Проведены" 
                        value={statuses?.posted ?? 0} 
                        icon={<CheckCircleIcon className="h-8 w-8 text-green-700 dark:text-green-300" />} 
                        bgClass="bg-green-200 dark:bg-green-900 text-green-900 dark:text-green-100"
                    />
                    <StatusCard 
                        title="Проблемы" 
                        value={statuses?.issues ?? 0} 
                        icon={<CogIcon className="h-8 w-8 text-red-700 dark:text-red-300" />} 
                        bgClass="bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-100"
                        onClick={() => setModalContent({ title: 'Зарегистрированные проблемы', content: <IssuesContent vehicleId={filters.vehicleId} /> })}
                    />
                </div>
            )}

            {widgets.showFleetStats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                    <KpiCard 
                        title="Показания одометра" 
                        value={filters.vehicleId ? (kpi?.totalMileage ?? 0).toLocaleString('ru-RU') : '--- ---'} 
                        icon={<TruckIcon className="h-6 w-6 text-white" />} 
                        color="bg-green-500" 
                        unit={filters.vehicleId ? "км" : ""} 
                    />
                    <KpiCard title="Остаток топлива в баке" value={kpi?.totalFuel.toFixed(2) ?? '0.00'} icon={<BanknotesIcon className="h-6 w-6 text-white" />} color="bg-blue-500" unit="л" />
                    <KpiCard 
                        title={filters.vehicleId ? "Остаток на ТК" : "Суммарный остаток на ТК"} 
                        value={kpi?.totalFuelCardBalance.toFixed(2) ?? '0.00'} 
                        icon={<BanknotesIcon className="h-6 w-6 text-white" />} 
                        color="bg-orange-500" 
                        unit="л" 
                    />
                    <KpiCard title="Расход (Год)" value={(kpi?.fuelYear ?? 0).toLocaleString('ru-RU')} icon={<UserGroupIcon className="h-6 w-6 text-white" />} color="bg-indigo-500" unit="л" />
                </div>
            )}

            {widgets.showCharts && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ChartCard title={`Динамика расхода топлива ${periodLabel}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={normalizedFuel} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                    <XAxis 
                                        dataKey="month" 
                                        stroke="rgb(156 163 175)" 
                                        angle={-45} 
                                        textAnchor="end" 
                                        height={60} 
                                        interval={0} 
                                        tickFormatter={formatMonthAxis}
                                        tick={{ fontSize: 11 }}
                                    />
                                    <YAxis stroke="rgb(156 163 175)" />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', border: 'none', borderRadius: '0.5rem' }} 
                                        labelFormatter={formatMonthAxis}
                                    />
                                    <Legend verticalAlign="top" height={36}/>
                                    <Bar dataKey="fact" fill="#82ca9d" name="Факт (л)">
                                        <LabelList 
                                            dataKey="fact" 
                                            position="top" 
                                            fontWeight="bold" 
                                            fill="rgb(156 163 175)" 
                                            fontSize={12} 
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                        
                        <ChartCard title={`Динамика мед. осмотров ${periodLabel}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={normalizedExamsMonth} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                    <XAxis 
                                        dataKey="month" 
                                        stroke="rgb(156 163 175)" 
                                        angle={-45} 
                                        textAnchor="end" 
                                        height={60} 
                                        interval={0} 
                                        tickFormatter={formatMonthAxis}
                                        tick={{ fontSize: 11 }}
                                    />
                                    <YAxis stroke="rgb(156 163 175)" />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', border: 'none', borderRadius: '0.5rem' }} 
                                        labelFormatter={formatMonthAxis}
                                    />
                                    <Legend verticalAlign="top" height={36}/>
                                    <Bar dataKey="value" fill="#8884d8" name="Осмотров">
                                        <LabelList 
                                            dataKey="value" 
                                            position="top" 
                                            fontWeight="bold" 
                                            fill="rgb(156 163 175)" 
                                            fontSize={12} 
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ChartCard title={`Сравнение расхода по ТС (топ) ${periodLabel}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={fuelByVehicle.slice(0, 10)} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                    <XAxis 
                                        dataKey="name" 
                                        stroke="rgb(156 163 175)" 
                                        angle={-45} 
                                        textAnchor="end" 
                                        height={80} 
                                        interval={0} 
                                        tick={{ fontSize: 11 }}
                                    />
                                    <YAxis stroke="rgb(156 163 175)" />
                                    <Tooltip contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', border: 'none', borderRadius: '0.5rem' }} />
                                    <Legend verticalAlign="top" height={36}/>
                                    <Bar dataKey="value" fill="#3b82f6" name="Расход (л)">
                                        <LabelList dataKey="value" position="top" fill="rgb(156 163 175)" fontSize={11} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>

                        <ChartCard title={`Количество осмотров по водителям ${periodLabel}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={examsByDriver.slice(0, 10)} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                    <XAxis 
                                        dataKey="name" 
                                        stroke="rgb(156 163 175)" 
                                        angle={-45} 
                                        textAnchor="end" 
                                        height={80} 
                                        interval={0} 
                                        tick={{ fontSize: 11 }}
                                    />
                                    <YAxis stroke="rgb(156 163 175)" />
                                    <Tooltip contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', border: 'none', borderRadius: '0.5rem' }} />
                                    <Legend verticalAlign="top" height={36}/>
                                    <Bar dataKey="value" fill="#00C49F" name="Осмотров">
                                        <LabelList dataKey="value" position="top" fill="rgb(156 163 175)" fontSize={11} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>
                </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {widgets.showOverruns && (
                    <ListCard title="Топ перерасходов">
                        {topOverruns.length === 0 ? (
                            <p className="text-gray-500 text-sm">Нет данных о перерасходах за период.</p>
                        ) : (
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                {topOverruns.map(item => (
                                    <li key={item.id} className="py-2 flex justify-between items-center">
                                        <span className="text-gray-800 dark:text-gray-200 text-sm font-medium">{item.name}</span>
                                        <span className="text-red-600 font-bold text-sm">{item.value} л</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ListCard>
                )}

                {widgets.showMaintenance && (
                    <ListCard title="Ближайшие ТО (< 2000 км)">
                        {upcomingMaintenance.length === 0 ? (
                            <p className="text-gray-500 text-sm">Все машины обслужены.</p>
                        ) : (
                            <div className="space-y-4">
                                {upcomingMaintenance.map(item => (
                                    <div key={item.id}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-medium text-gray-800 dark:text-gray-200">{item.plate}</span>
                                            <span className={`${item.remaining < 500 ? 'text-red-600' : 'text-yellow-600'} font-bold`}>{item.remaining} км</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                            <div 
                                                className={`h-2.5 rounded-full ${item.remaining < 500 ? 'bg-red-600' : 'bg-yellow-500'}`} 
                                                style={{ width: `${Math.min(100, item.progress)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ListCard>
                )}

                {widgets.showBirthdays && (
                    <ListCard title={`Именинники (${new Date().toLocaleString('ru', { month: 'long' })})`}>
                        {birthdays.length === 0 ? (
                            <p className="text-gray-500 text-sm">В этом месяце именинников нет.</p>
                        ) : (
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                {birthdays.map(item => (
                                    <li key={item.id} className={`py-2 flex justify-between items-center ${item.isToday ? 'bg-yellow-50 dark:bg-yellow-900/20 -mx-2 px-2 rounded' : ''}`}>
                                        <div className="flex items-center gap-2">
                                            {item.isToday && <SparklesIcon className="h-4 w-4 text-yellow-500" />}
                                            <span className="text-gray-800 dark:text-gray-200 text-sm font-medium">{item.name}</span>
                                        </div>
                                        <span className={`text-sm ${item.isToday ? 'text-yellow-600 font-bold' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {item.date}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ListCard>
                )}
            </div>
            
            {modalContent && (
                <Modal title={modalContent.title} onClose={handleModalClose}>
                  {modalContent.content}
                </Modal>
            )}
        </div>
    );
};

export default Dashboard;
