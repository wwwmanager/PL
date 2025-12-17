
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col min-h-[600px]">
            <MedicalReportModal isOpen={isMedicalModalOpen} onClose={() => setIsMedicalModalOpen(false)} />
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Отчеты
                </h2>
                <div className="flex gap-3 mt-4 md:mt-0">
                    <button 
                        onClick={() => setIsMedicalModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-sm font-medium shadow-sm"
                    >
                        <ClipboardCheckIcon className="h-5 w-5" />
                        Журнал медосмотров
                    </button>
                    <button 
                        onClick={handleExport}
                        disabled={reportData.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                    >
                        <DownloadIcon className="h-5 w-5" />
                        Экспорт в Excel (CSV)
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 border-b border-gray-200 dark:border-gray-700">
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Транспортное средство</label>
                    <select 
                        name="vehicleId" 
                        value={filters.vehicleId} 
                        onChange={handleFilterChange}
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white transition-shadow"
                    >
                        <option value="">Выберите ТС</option>
                        {vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand})</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">С даты</label>
                    <input 
                        type="date" 
                        name="dateFrom" 
                        value={filters.dateFrom} 
                        onChange={handleFilterChange}
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white transition-shadow" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">По дату</label>
                    <input 
                        type="date" 
                        name="dateTo" 
                        value={filters.dateTo} 
                        onChange={handleFilterChange}
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white transition-shadow" 
                    />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-x-auto p-0">
                <table className="w-full text-sm text-left text-gray-700 dark:text-gray-300">
                    <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            {tableHeaders.map(h => <th key={h} className="px-6 py-3 font-medium whitespace-nowrap">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {isLoading ? (
                            <tr><td colSpan={9} className="text-center p-8 text-gray-500">
                                <div className="flex justify-center items-center gap-2">
                                   <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                                   Загрузка данных...
                                </div>
                            </td></tr>
                        ) : reportData.length === 0 ? (
                            <tr><td colSpan={9} className="text-center p-8 text-gray-500 italic">Нет данных для отображения. Выберите ТС и период.</td></tr>
                        ) : (
                            <>
                                {reportData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white font-medium">{row.period}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{formatInt(row.refueled)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{formatNumber(row.fuelActual)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap font-mono">{formatInt(row.mileageStart)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap font-mono">{formatInt(row.mileageEnd)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-white">{formatInt(row.mileageTotal)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap font-mono">{formatNumber(row.fuelStart)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap font-mono">{formatNumber(row.fuelEnd)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{formatInt(row.medicalExams)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50 dark:bg-gray-700/50 border-t-2 border-gray-300 dark:border-gray-600 font-bold text-gray-900 dark:text-white">
                                    <td className="px-6 py-4 text-right">ИТОГО:</td>
                                    <td className="px-6 py-4">{formatInt(totals.refueled)}</td>
                                    <td className="px-6 py-4">{formatNumber(totals.fuelActual)}</td>
                                    <td className="px-6 py-4">-</td>
                                    <td className="px-6 py-4">-</td>
                                    <td className="px-6 py-4">{formatInt(totals.mileageTotal)}</td>
                                    <td className="px-6 py-4">-</td>
                                    <td className="px-6 py-4">-</td>
                                    <td className="px-6 py-4">{formatInt(totals.medicalExams)}</td>
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
