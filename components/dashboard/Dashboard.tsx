
import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, LabelList } from 'recharts';
import { getDashboardData, getIssues, getVehicles } from '../../services/mockApi';
import { TruckIcon, UserGroupIcon, CogIcon, XIcon, BanknotesIcon } from '../Icons';
import { KpiData, Vehicle } from '../../types';

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

    return (
        <div className="space-y-4">
            <div>
                <h4 className="font-semibold text-yellow-600 dark:text-yellow-500 mb-2">Истекающие документы (в теч. 30 дней)</h4>
                <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                    {expiringDocs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((doc, index) => (
                        <li key={index}>
                           <span className="font-semibold">{doc.type}</span> ({doc.name}): истекает {new Date(doc.date).toLocaleDateString()}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const KpiCard = ({ title, value, icon, color, unit = '', onClick }: { title: string, value: string | number | React.ReactNode, icon: React.ReactElement, color: string, unit?: string, onClick?: () => void }) => (
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
            <div className="text-xl font-bold text-gray-800 dark:text-white">{value}{unit && <span className="text-sm font-normal ml-1">{unit}</span>}</div>
        </div>
    </div>
);

interface ChartCardProps {
    title: string;
    children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">{title}</h3>
        <div style={{ width: '100%', height: 300 }}>
            {children}
        </div>
    </div>
);

const Dashboard: React.FC<DashboardProps> = ({ onNavigateToWaybill }) => {
    const [kpi, setKpi] = useState<KpiData | null>(null);
    const [fuelConsumptionByMonth, setFuelConsumptionByMonth] = useState<any[]>([]);
    const [medicalExamsByMonth, setMedicalExamsByMonth] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalContent, setModalContent] = useState<{ title: string; content: React.ReactNode } | null>(null);
    
    const [filters, setFilters] = useState({ vehicleId: '', dateFrom: '', dateTo: '' });
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);

    // Load vehicles and set defaults
    useEffect(() => {
        const init = async () => {
            const vehiclesData = await getVehicles();
            setVehicles(vehiclesData);

            // --- 1. Default Period (Current Quarter) ---
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            const currentQuarter = Math.floor(currentMonth / 3);
            const startQ = new Date(currentYear, currentQuarter * 3, 1);
            const endQ = new Date(currentYear, (currentQuarter * 3) + 3, 0); // last day of quarter

            // Adjust for timezone offset to ensure YYYY-MM-DD format matches local date
            const offset = startQ.getTimezoneOffset();
            const startDateStr = new Date(startQ.getTime() - (offset*60*1000)).toISOString().split('T')[0];
            const endDateStr = new Date(endQ.getTime() - (offset*60*1000)).toISOString().split('T')[0];

            // --- 2. Default Vehicle ---
            let targetVehicleId = '';
            const storedVehicleId = localStorage.getItem('dashboard_last_vehicle');

            if (vehiclesData.length === 1) {
                targetVehicleId = vehiclesData[0].id;
            } else if (storedVehicleId && vehiclesData.find(v => v.id === storedVehicleId)) {
                targetVehicleId = storedVehicleId;
            } else if (vehiclesData.length > 0) {
                targetVehicleId = vehiclesData[0].id;
            }

            const initialFilters = { 
                vehicleId: targetVehicleId, 
                dateFrom: startDateStr, 
                dateTo: endDateStr 
            };
            
            setFilters(initialFilters);
            fetchData(initialFilters);
        };
        
        init();
    }, []);

    const fetchData = async (currentFilters: typeof filters) => {
        try {
            setLoading(true);
            // Save vehicle selection
            if (currentFilters.vehicleId) {
                localStorage.setItem('dashboard_last_vehicle', currentFilters.vehicleId);
            }

            const data = await getDashboardData(currentFilters);
            setKpi(data?.kpi ?? null);
            setFuelConsumptionByMonth(data?.fuelConsumptionByMonth ?? []);
            setMedicalExamsByMonth(data?.medicalExamsByMonth ?? []);
        } catch (error) {
            console.error("Failed to fetch dashboard data:", error);
            setKpi(null);
            setFuelConsumptionByMonth([]);
            setMedicalExamsByMonth([]);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleGenerate = () => {
        fetchData(filters);
    };
    
    const handleModalClose = () => {
      setModalContent(null);
    };

    // Helper to format triple stats
    const formatTriple = (m: number | undefined, q: number | undefined, y: number | undefined) => {
        if (m === undefined) return '...';
        return (
            <span>
                <span className="text-gray-500 text-sm">мес: </span>{m}
                <span className="mx-2 text-gray-300">|</span>
                <span className="text-gray-500 text-sm">кв: </span>{q}
                <span className="mx-2 text-gray-300">|</span>
                <span className="text-gray-500 text-sm">год: </span>{y}
            </span>
        );
    };

    if (loading && !kpi) {
        return <div className="text-center p-10 text-gray-600 dark:text-gray-300">Загрузка панели управления...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <select name="vehicleId" value={filters.vehicleId} onChange={handleFilterChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2">
                    <option value="">Все ТС</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} - {v.brand}</option>)}
                </select>
                <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                <button onClick={handleGenerate} disabled={loading} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-blue-400">
                    {loading ? 'Загрузка...' : 'Сформировать'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                <KpiCard 
                    title="Пробег (км)" 
                    value={formatTriple(kpi?.mileageMonth, kpi?.mileageQuarter, kpi?.mileageYear)} 
                    icon={<TruckIcon className="h-6 w-6 text-white" />} 
                    color="bg-green-500" 
                />
                <KpiCard 
                    title="Расход топлива (л)" 
                    value={formatTriple(kpi?.fuelMonth, kpi?.fuelQuarter, kpi?.fuelYear)} 
                    icon={<UserGroupIcon className="h-6 w-6 text-white" />} 
                    color="bg-purple-500" 
                />
                <KpiCard 
                    title="Остаток топлива" 
                    value={kpi?.totalFuelBalance.toFixed(1) ?? '0.0'} 
                    icon={<BanknotesIcon className="h-6 w-6 text-white" />} 
                    color="bg-blue-500" 
                    unit="л" 
                />
                <KpiCard 
                    title="Проблемы" 
                    value={kpi?.issues ?? 0} 
                    icon={<CogIcon className="h-6 w-6 text-white" />} 
                    color="bg-red-500" 
                    onClick={() => setModalContent({ title: 'Зарегистрированные проблемы', content: <IssuesContent vehicleId={filters.vehicleId} /> })}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Расход топлива (12 мес.)">
                    <ResponsiveContainer>
                        <BarChart data={fuelConsumptionByMonth} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                            <XAxis dataKey="month" stroke="rgb(156 163 175)" />
                            <YAxis stroke="rgb(156 163 175)" />
                            <Tooltip contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', border: 'none', borderRadius: '0.5rem' }} />
                            <Legend />
                            <Bar dataKey="Факт" fill="#82ca9d" name="Факт (л)">
                                <LabelList 
                                    dataKey="Факт" 
                                    position="top" 
                                    fontWeight="bold" 
                                    fill="rgb(156 163 175)" 
                                    fontSize={12} 
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Предрейсовые осмотры (12 мес.)">
                    <ResponsiveContainer>
                        <BarChart data={medicalExamsByMonth} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                            <XAxis dataKey="month" stroke="rgb(156 163 175)" />
                            <YAxis stroke="rgb(156 163 175)" />
                            <Tooltip contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.8)', border: 'none', borderRadius: '0.5rem' }} />
                            <Legend />
                            <Bar dataKey="Осмотры" fill="#ffc658" name="Кол-во осмотров">
                                <LabelList 
                                    dataKey="Осмотры" 
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
            {modalContent && (
                <Modal title={modalContent.title} onClose={handleModalClose}>
                  {modalContent.content}
                </Modal>
            )}
        </div>
    );
};

export default Dashboard;
