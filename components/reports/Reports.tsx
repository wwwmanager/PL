
import React, { useState, useEffect, useMemo } from 'react';
import { getWaybills, getVehicles } from '../../services/mockApi';
import { Waybill, Vehicle, WaybillStatus } from '../../types';
import { useToast } from '../../hooks/useToast';
import { DownloadIcon, ChartBarIcon, ClipboardCheckIcon } from '../Icons';
import { getMedicalExamsCount } from '../../services/api/waybills';
import MedicalReportModal from './MedicalReportModal';

interface ReportRow {
    period: string;
    refueled: number;
    fuelActual: number;
    mileageStart: number;
    mileageEnd: number;
    mileageTotal: number;
    fuelStart: number;
    fuelEnd: number;
    medicalExams: number;
}

const Reports: React.FC = () => {
    const [waybills, setWaybills] = useState<Waybill[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMedicalModalOpen, setIsMedicalModalOpen] = useState(false);
    const { showToast } = useToast();

    // Filters
    const [filters, setFilters] = useState({
        vehicleId: '',
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // 1st of current month
        dateTo: new Date().toISOString().split('T')[0], // Today
    });

    useEffect(() => {
        Promise.all([getWaybills(), getVehicles()])
            .then(([w, v]) => {
                setWaybills(w);
                setVehicles(v);
                setIsLoading(false);
            })
            .catch(() => {
                showToast('Ошибка загрузки данных', 'error');
                setIsLoading(false);
            });
    }, [showToast]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const formatInt = (n: number) => Math.round(n).toString();
    const formatNumber = (n: number) => n.toFixed(2);

    const reportData = useMemo(() => {
        if (!filters.vehicleId) return [];

        const filtered = waybills.filter(w => 
            w.vehicleId === filters.vehicleId &&
            w.status === WaybillStatus.POSTED &&
            w.date >= filters.dateFrom &&
            w.date <= filters.dateTo
        ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (filtered.length === 0) return [];

        const rows: ReportRow[] = filtered.map(w => ({
            period: new Date(w.date).toLocaleDateString('ru-RU'),
            refueled: w.fuelFilled || 0,
            fuelActual: (w.fuelAtStart || 0) + (w.fuelFilled || 0) - (w.fuelAtEnd || 0),
            mileageStart: w.odometerStart || 0,
            mileageEnd: w.odometerEnd || 0,
            mileageTotal: (w.odometerEnd || 0) - (w.odometerStart || 0),
            fuelStart: w.fuelAtStart || 0,
            fuelEnd: w.fuelAtEnd || 0,
            medicalExams: getMedicalExamsCount ? getMedicalExamsCount(w) : 1, // Fallback
        }));

        return rows;
    }, [waybills, filters]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, row) => ({
            refueled: acc.refueled + row.refueled,
            fuelActual: acc.fuelActual + row.fuelActual,
            mileageTotal: acc.mileageTotal + row.mileageTotal,
            medicalExams: acc.medicalExams + row.medicalExams
        }), { refueled: 0, fuelActual: 0, mileageTotal: 0, medicalExams: 0 });
    }, [reportData]);

    const tableHeaders = [
        'Дата', 'Заправлено', 'Расход (факт)', 'Пробег (нач)', 'Пробег (кон)', 'Пробег (общ)', 'Топливо (нач)', 'Топливо (кон)', 'Медосмотров'
    ];

    const handleExport = () => {
        if (reportData.length === 0) {
            showToast('Нет данных для экспорта.', 'error');
            return;
        }

        const escape = (val: any) => {
            const str = String(val ?? '');
            if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvContent = [
            tableHeaders.join(';'),
            ...reportData.map(row => [
                escape(row.period),
                escape(formatInt(row.refueled)),
                escape(formatNumber(row.fuelActual)),
                escape(formatInt(row.mileageStart)),
                escape(formatInt(row.mileageEnd)),
                escape(formatInt(row.mileageTotal)),
                escape(formatNumber(row.fuelStart)),
                escape(formatNumber(row.fuelEnd)),
                escape(formatInt(row.medicalExams)),
            ].join(';')),
            // Total Row
            [
                'ИТОГО:',
                escape(formatInt(totals.refueled)),
                escape(formatNumber(totals.fuelActual)),
                '-',
                '-',
                escape(formatInt(totals.mileageTotal)),
                '-',
                '-',
                escape(formatInt(totals.medicalExams))
            ].join(';')
        ].join('\n');

        const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const vehicleName = vehicles.find(v => v.id === filters.vehicleId)?.plateNumber || 'report';
        link.setAttribute("download", `report_${vehicleName}_${filters.dateFrom}_${filters.dateTo}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Файл экспортирован.', 'success');
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <MedicalReportModal isOpen={isMedicalModalOpen} onClose={() => setIsMedicalModalOpen(false)} />
            
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <ChartBarIcon className="h-8 w-8 text-blue-500" />
                    Отчеты
                </h2>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsMedicalModalOpen(true)}
                        className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700 transition-colors"
                    >
                        <ClipboardCheckIcon className="h-5 w-5" />
                        Журнал медосмотров
                    </button>
                    <button 
                        onClick={handleExport}
                        disabled={reportData.length === 0}
                        className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon className="h-5 w-5" />
                        Экспорт в Excel (CSV)
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Транспортное средство</label>
                    <select 
                        name="vehicleId" 
                        value={filters.vehicleId} 
                        onChange={handleFilterChange}
                        className="w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                    >
                        <option value="">Выберите ТС</option>
                        {vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand})</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">С даты</label>
                    <input 
                        type="date" 
                        name="dateFrom" 
                        value={filters.dateFrom} 
                        onChange={handleFilterChange}
                        className="w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">По дату</label>
                    <input 
                        type="date" 
                        name="dateTo" 
                        value={filters.dateTo} 
                        onChange={handleFilterChange}
                        className="w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" 
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            {tableHeaders.map(h => <th key={h} className="px-4 py-3">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={9} className="text-center p-4">Загрузка...</td></tr>
                        ) : reportData.length === 0 ? (
                            <tr><td colSpan={9} className="text-center p-4">Нет данных для отображения. Выберите ТС и период.</td></tr>
                        ) : (
                            <>
                                {reportData.map((row, idx) => (
                                    <tr key={idx} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-4 py-3">{row.period}</td>
                                        <td className="px-4 py-3">{formatInt(row.refueled)}</td>
                                        <td className="px-4 py-3">{formatNumber(row.fuelActual)}</td>
                                        <td className="px-4 py-3">{formatInt(row.mileageStart)}</td>
                                        <td className="px-4 py-3">{formatInt(row.mileageEnd)}</td>
                                        <td className="px-4 py-3 font-bold">{formatInt(row.mileageTotal)}</td>
                                        <td className="px-4 py-3">{formatNumber(row.fuelStart)}</td>
                                        <td className="px-4 py-3">{formatNumber(row.fuelEnd)}</td>
                                        <td className="px-4 py-3">{formatInt(row.medicalExams)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-blue-50 dark:bg-blue-900/20 font-bold border-t-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                                    <td className="px-4 py-3 text-right">ИТОГО:</td>
                                    <td className="px-4 py-3">{formatInt(totals.refueled)}</td>
                                    <td className="px-4 py-3">{formatNumber(totals.fuelActual)}</td>
                                    <td className="px-4 py-3">-</td>
                                    <td className="px-4 py-3">-</td>
                                    <td className="px-4 py-3">{formatInt(totals.mileageTotal)}</td>
                                    <td className="px-4 py-3">-</td>
                                    <td className="px-4 py-3">-</td>
                                    <td className="px-4 py-3">{formatInt(totals.medicalExams)}</td>
                                </tr>
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Reports;
