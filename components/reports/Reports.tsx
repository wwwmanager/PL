



import React, { useState, useEffect } from 'react';
// FIX: Replaced non-existent/un-exported function imports with correct ones.
import { fetchVehicles, fetchWaybills, getMedicalExamsCount } from '../../services/mockApi';
import { Vehicle, Waybill, WaybillStatus } from '../../types';
import { useToast } from '../../hooks/useToast';

interface ReportRow {
    type: 'month' | 'quarter' | 'year';
    period: string;
    refueled: number;
    fuelActual: number;
    mileageStart: number;
    mileageEnd: number;
    mileageTotal: number;
    fuelStart: number;
    fuelEnd: number;
    medicalExams: number;
    _month?: number;
    _year?: number;
}


const VehicleSummaryReport = () => {
    const [filters, setFilters] = useState({ vehicleId: '', dateFrom: '', dateTo: '' });
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [reportData, setReportData] = useState<ReportRow[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf'>('xlsx');

    useEffect(() => {
        const loadVehicles = async () => {
            // FIX: Use fetchVehicles and extract data from response.
            const vehiclesData = await fetchVehicles({pageSize: 1000});
            setVehicles(vehiclesData.data as Vehicle[]);
            if (vehiclesData.data.length === 1) {
                setFilters(prev => ({ ...prev, vehicleId: vehiclesData.data[0].id }));
            }
        };
        loadVehicles();
    }, []);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleGenerateReport = async () => {
        if (!filters.vehicleId || !filters.dateFrom || !filters.dateTo) {
            setError('Пожалуйста, выберите ТС и укажите полный период даты.');
            setReportData(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        setReportData(null);

        // FIX: Use fetchWaybills and extract data from response.
        const allWaybills = (await fetchWaybills({pageSize: 10000})).data as Waybill[];
        
        const filteredWaybills = allWaybills
            .filter(w => 
                w.vehicleId === filters.vehicleId &&
                w.date >= filters.dateFrom &&
                w.date <= filters.dateTo &&
                w.status === WaybillStatus.COMPLETED
            )
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (filteredWaybills.length === 0) {
            setError('По данному периоду не найдено путевых листов.');
            setIsLoading(false);
            return;
        }

        const monthlyData = new Map<string, Waybill[]>();
        filteredWaybills.forEach(w => {
            const monthKey = w.date.substring(0, 7);
            if (!monthlyData.has(monthKey)) {
                monthlyData.set(monthKey, []);
            }
            monthlyData.get(monthKey)!.push(w);
        });

        const processedMonths: ReportRow[] = [];
        for (const [monthKey, monthWaybills] of monthlyData.entries()) {
            const firstWaybill = monthWaybills[0];
            const lastWaybill = monthWaybills[monthWaybills.length - 1];

            const refueled = monthWaybills.reduce((sum, w) => sum + (w.fuelFilled || 0), 0);
            const fuelActual = monthWaybills.reduce((sum, w) => sum + ((w.fuelAtStart || 0) + (w.fuelFilled || 0) - (w.fuelAtEnd || 0)), 0);
            const medicalExams = monthWaybills.reduce((sum, w) => sum + getMedicalExamsCount(w), 0);
            
            const mileageStart = firstWaybill.odometerStart;
            const mileageEnd = lastWaybill.odometerEnd || 0;
            const mileageTotal = mileageEnd - mileageStart;

            const fuelStart = firstWaybill.fuelAtStart || 0;
            const fuelEnd = lastWaybill.fuelAtEnd || 0;

            const [year, month] = monthKey.split('-');
            const periodName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('ru-RU', { month: 'long' });

            processedMonths.push({
                type: 'month', period: periodName.charAt(0).toUpperCase() + periodName.slice(1),
                refueled, fuelActual, mileageStart, mileageEnd, mileageTotal, fuelStart, fuelEnd, medicalExams,
                _month: parseInt(month), _year: parseInt(year),
            });
        }
        
        processedMonths.sort((a, b) => a._year! - b._year! || a._month! - b._month!);

        const finalReportData: ReportRow[] = [];
        let currentQuarter = -1;
        let quarterData: ReportRow | null = null;
        let yearData: ReportRow | null = null;

        for (const monthRow of processedMonths) {
            const month = monthRow._month!;
            const quarter = Math.floor((month - 1) / 3) + 1;

            if (!yearData) {
                yearData = { ...monthRow, type: 'year', period: 'Год' };
            } else {
                yearData.refueled += monthRow.refueled;
                yearData.fuelActual += monthRow.fuelActual;
                yearData.mileageTotal += monthRow.mileageTotal;
                yearData.mileageEnd = monthRow.mileageEnd;
                yearData.fuelEnd = monthRow.fuelEnd;
                yearData.medicalExams += monthRow.medicalExams;
            }

            if (quarter !== currentQuarter) {
                if (quarterData) finalReportData.push(quarterData);
                currentQuarter = quarter;
                quarterData = { ...monthRow, type: 'quarter', period: `${quarter} квартал` };
            } else if (quarterData) {
                quarterData.refueled += monthRow.refueled;
                quarterData.fuelActual += monthRow.fuelActual;
                quarterData.mileageTotal += monthRow.mileageTotal;
                quarterData.mileageEnd = monthRow.mileageEnd;
                quarterData.fuelEnd = monthRow.fuelEnd;
                quarterData.medicalExams += monthRow.medicalExams;
            }
            finalReportData.push(monthRow);
        }

        if (quarterData) finalReportData.push(quarterData);
        if (yearData) finalReportData.push(yearData);
        
        setReportData(finalReportData);
        setIsLoading(false);
    };
    
    const formatNumber = (num?: number) => typeof num === 'number' ? new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) : '0,00';
    const formatInt = (num?: number) => typeof num === 'number' ? new Intl.NumberFormat('ru-RU').format(num) : '0';


    const tableHeaders = [
        "Период", "Заправлено, л", "Расход (факт), л", "Начальный пробег, км",
        "Конечный пробег, км", "Суммарный пробег, км", "Остаток на начало, л", "Остаток на конец, л", "Мед. осмотров"
    ];
    
    const handleExport = () => {
        if (!reportData) {
            showToast('Сначала сформируйте отчёт.', 'error');
            return;
        }
        if (exportFormat === 'pdf') {
            showToast('Экспорт в PDF пока не поддерживается.', 'info');
            return;
        }

        // Simple CSV-like export for XLSX
        const csvContent = [
            tableHeaders.join('\t'),
            ...reportData.map(row => [
                row.period,
                formatInt(row.refueled),
                formatNumber(row.fuelActual),
                formatInt(row.mileageStart),
                formatInt(row.mileageEnd),
                formatInt(row.mileageTotal),
                formatNumber(row.fuelStart),
                formatNumber(row.fuelEnd),
                formatInt(row.medicalExams),
            ].join('\t'))
        ].join('\n');

        const blob = new Blob(["\ufeff", csvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const vehicleName = vehicles.find(v => v.id === filters.vehicleId)?.plateNumber || 'report';
        link.setAttribute("download", `report_${vehicleName}_${filters.dateFrom}_${filters.dateTo}.xlsx`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Файл экспортирован.', 'success');
    };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <select name="vehicleId" value={filters.vehicleId} onChange={handleFilterChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" disabled={vehicles.length === 1}>
                    <option value="">Выберите ТС</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} - {v.brand}</option>)}
                </select>
                <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                <button onClick={handleGenerateReport} disabled={isLoading} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-blue-400">
                    {isLoading ? 'Загрузка...' : 'Сформировать'}
                </button>
            </div>
            
            {error && <p className="text-center p-4 text-red-500">{error}</p>}
            
            {reportData && (
                <>
                <div className="overflow-x-auto shadow-md rounded-lg">
                     <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                                {tableHeaders.map(header => (
                                    <th key={header} scope="col" className="px-6 py-3 whitespace-nowrap">
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {reportData.map((row, index) => {
                                const isSummary = row.type === 'quarter' || row.type === 'year';
                                const rowClass = isSummary
                                    ? 'bg-gray-100 dark:bg-gray-700 font-semibold text-gray-900 dark:text-white'
                                    : 'bg-white dark:bg-gray-800 border-b dark:border-gray-700';

                                return (
                                    <tr key={index} className={rowClass}>
                                        <td className="px-6 py-4">{row.period}</td>
                                        <td className="px-6 py-4 text-right">{formatInt(row.refueled)}</td>
                                        <td className="px-6 py-4 text-right">{formatNumber(row.fuelActual)}</td>
                                        <td className="px-6 py-4 text-right">{formatInt(row.mileageStart)}</td>
                                        <td className="px-6 py-4 text-right">{formatInt(row.mileageEnd)}</td>
                                        <td className="px-6 py-4 text-right">{formatInt(row.mileageTotal)}</td>
                                        <td className="px-6 py-4 text-right">{formatNumber(row.fuelStart)}</td>
                                        <td className="px-6 py-4 text-right">{formatNumber(row.fuelEnd)}</td>
                                        <td className="px-6 py-4 text-right">{formatInt(row.medicalExams)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end items-center gap-4 mt-6">
                    <select value={exportFormat} onChange={e => setExportFormat(e.target.value as 'xlsx' | 'pdf')} className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2">
                        <option value="xlsx">Excel (.xlsx)</option>
                        <option value="pdf">PDF (.pdf)</option>
                    </select>
                    <button onClick={handleExport} className="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-700 transition-colors">Экспорт</button>
                </div>
                </>
            )}
        </div>
    );
};


const Reports: React.FC = () => {
    const ReportHeader = () => (
         <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Отчёты</h2>
            <div className="flex items-center gap-4">
                <span className="text-lg font-semibold text-gray-800 dark:text-white">Сводный отчёт по ТС</span>
            </div>
        </div>
    );

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <ReportHeader />
            <div className="mt-4">
               <VehicleSummaryReport />
            </div>
        </div>
    );
};

export default Reports;