
import React, { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import { getEmployees, getWaybills } from '../../services/mockApi';
import { Employee, Waybill, WaybillStatus } from '../../types';
import { useToast } from '../../hooks/useToast';
import * as XLSX from 'xlsx';

interface MedicalReportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ReportRow {
    date: string;
    dateObj: Date;
    driverName: string;
    examTime1: string;
    examTime2: string;
    waybillNumber: string;
}

interface ReportGroup {
    title: string;
    rows: ReportRow[];
}

const MedicalReportModal: React.FC<MedicalReportModalProps> = ({ isOpen, onClose }) => {
    const { showToast } = useToast();
    
    // State
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [examsCount, setExamsCount] = useState<1 | 2>(1);
    const [preTripOffset, setPreTripOffset] = useState(40);
    const [postTripOffset, setPostTripOffset] = useState(30);
    const [isLoading, setIsLoading] = useState(false);
    const [reportData, setReportData] = useState<ReportGroup[]>([]);

    useEffect(() => {
        if (isOpen) {
            getEmployees().then(data => {
                setEmployees(data.filter(e => e.employeeType === 'driver'));
            });
            // Set defaults: current month
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setDateFrom(start.toISOString().split('T')[0]);
            setDateTo(end.toISOString().split('T')[0]);
            setSelectedDriverId('');
            setReportData([]);
        }
    }, [isOpen]);

    const handleGenerate = async () => {
        if (!selectedDriverId || !dateFrom || !dateTo) {
            showToast('Выберите водителя и период.', 'error');
            return;
        }

        setIsLoading(true);
        try {
            const allWaybills = await getWaybills();
            const driverWaybills = allWaybills.filter(w => 
                w.driverId === selectedDriverId && 
                w.status === WaybillStatus.POSTED &&
                w.date >= dateFrom &&
                w.date <= dateTo
            );

            const flatRows: ReportRow[] = [];
            const driver = employees.find(e => e.id === selectedDriverId);

            driverWaybills.forEach(w => {
                // Determine active dates for this waybill
                const dates = new Set<string>();
                if (w.routes && w.routes.length > 0) {
                    w.routes.forEach(r => {
                        const d = r.date ? r.date.split('T')[0] : w.date.split('T')[0];
                        if (d >= dateFrom && d <= dateTo) dates.add(d);
                    });
                } else {
                    const d = w.date.split('T')[0];
                    if (d >= dateFrom && d <= dateTo) dates.add(d);
                }

                // Determine Title (Blank or Number)
                const wbTitle = w.blankSeries && w.blankNumber 
                    ? `${w.blankSeries} ${String(w.blankNumber).padStart(6, '0')}`
                    : w.number;

                // Sort dates for this waybill
                const sortedDates = Array.from(dates).sort();

                sortedDates.forEach(dateStr => {
                    // Try to find precise times from routes for this date
                    let earliestDeparture: Date | null = null;
                    let latestArrival: Date | null = null;

                    // Search in routes
                    if (w.routes) {
                        w.routes.forEach(r => {
                            const rDate = r.date ? r.date.split('T')[0] : w.date.split('T')[0];
                            if (rDate === dateStr) {
                                if (r.departureTime) {
                                    const dt = new Date(`${rDate}T${r.departureTime}`);
                                    if (!earliestDeparture || dt < earliestDeparture) earliestDeparture = dt;
                                }
                                if (r.arrivalTime) {
                                    const at = new Date(`${rDate}T${r.arrivalTime}`);
                                    if (!latestArrival || at > latestArrival) latestArrival = at;
                                }
                            }
                        });
                    }

                    // Fallback to waybill validity if routes have no time or no routes for this day (unlikely but safe)
                    if (!earliestDeparture) earliestDeparture = new Date(w.validFrom);
                    if (!latestArrival) latestArrival = new Date(w.validTo);

                    // Apply offsets
                    const t1 = new Date(earliestDeparture);
                    t1.setMinutes(t1.getMinutes() - preTripOffset);
                    const examTime1 = t1.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

                    let examTime2 = '';
                    if (examsCount === 2) {
                        const t2 = new Date(latestArrival);
                        t2.setMinutes(t2.getMinutes() + postTripOffset);
                        examTime2 = t2.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    }

                    flatRows.push({
                        date: new Date(dateStr).toLocaleDateString('ru-RU'),
                        dateObj: new Date(dateStr),
                        driverName: driver?.shortName || '',
                        examTime1,
                        examTime2,
                        waybillNumber: wbTitle
                    });
                });
            });

            // Group by WaybillNumber
            const groupsMap = new Map<string, ReportRow[]>();
            flatRows.forEach(r => {
                if (!groupsMap.has(r.waybillNumber)) groupsMap.set(r.waybillNumber, []);
                groupsMap.get(r.waybillNumber)!.push(r);
            });

            // Convert to array and sort groups by date of the first item
            const groups: ReportGroup[] = Array.from(groupsMap.entries()).map(([title, rows]) => ({
                title,
                rows: rows.sort((a,b) => a.dateObj.getTime() - b.dateObj.getTime())
            })).sort((a,b) => {
                const dateA = a.rows[0]?.dateObj.getTime() || 0;
                const dateB = b.rows[0]?.dateObj.getTime() || 0;
                return dateA - dateB;
            });

            setReportData(groups);

            if (groups.length === 0) {
                showToast('Нет данных за выбранный период', 'info');
            }

        } catch (e) {
            console.error(e);
            showToast('Ошибка формирования отчета', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = () => {
        if (reportData.length === 0) return;

        const driverName = employees.find(e => e.id === selectedDriverId)?.shortName || 'driver';
        const monthName = new Date(dateFrom).toLocaleString('ru-RU', { month: 'long' }).toUpperCase();

        const wb = XLSX.utils.book_new();
        const wsData: any[][] = [];

        // Header
        wsData.push(["Осмотры медика", "", monthName]);
        wsData.push([
            "№ п/п", 
            "Дата поездки", 
            "Время осмотра (Пред)", 
            examsCount === 2 ? "Время осмотра (После)" : ""
        ]);

        let globalIndex = 1;

        reportData.forEach((group) => {
            // Group Header Row (Green in UI, just text here)
            wsData.push([group.title, "", "", ""]); 
            
            group.rows.forEach(row => {
                wsData.push([
                    globalIndex,
                    row.date,
                    row.examTime1,
                    examsCount === 2 ? row.examTime2 : ""
                ]);
                globalIndex++;
            });
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // Basic column width
        ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 20 }];

        XLSX.utils.book_append_sheet(wb, ws, "Журнал осмотров");
        XLSX.writeFile(wb, `medical_report_${driverName}_${dateFrom}.xlsx`);
    };

    const totalRows = reportData.reduce((sum, g) => sum + g.rows.length, 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Журнал медосмотров">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Водитель</label>
                        <select 
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                            value={selectedDriverId}
                            onChange={e => setSelectedDriverId(e.target.value)}
                        >
                            <option value="">Выберите водителя</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.shortName}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">С даты</label>
                            <input type="date" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">По дату</label>
                            <input type="date" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded border dark:border-gray-600 space-y-3">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-medium dark:text-gray-200">Количество осмотров:</span>
                        <label className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" name="examsCount" checked={examsCount === 1} onChange={() => setExamsCount(1)} className="text-blue-600" />
                            <span className="text-sm dark:text-gray-300">1 (Предрейсовый)</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" name="examsCount" checked={examsCount === 2} onChange={() => setExamsCount(2)} className="text-blue-600" />
                            <span className="text-sm dark:text-gray-300">2 (Пред + После)</span>
                        </label>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">За сколько до выезда (мин):</label>
                            <input type="number" value={preTripOffset} onChange={e => setPreTripOffset(Number(e.target.value))} className="w-full p-1 border rounded text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                        </div>
                        {examsCount === 2 && (
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Через сколько после (мин):</label>
                                <input type="number" value={postTripOffset} onChange={e => setPostTripOffset(Number(e.target.value))} className="w-full p-1 border rounded text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button 
                        onClick={handleGenerate} 
                        disabled={isLoading || !selectedDriverId || !dateFrom || !dateTo} 
                        className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Расчет...' : 'Сформировать'}
                    </button>
                </div>

                {/* Preview Table */}
                {reportData.length > 0 && (
                    <div className="mt-4 border dark:border-gray-700 rounded overflow-hidden">
                        <div className="bg-gray-100 dark:bg-gray-800 p-2 flex justify-between items-center border-b dark:border-gray-700">
                            <h4 className="font-bold text-gray-700 dark:text-gray-200">Предпросмотр ({totalRows} записей)</h4>
                            <button onClick={handleExportExcel} className="text-sm bg-green-600 text-white py-1 px-3 rounded hover:bg-green-700">Скачать Excel</button>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 sticky top-0">
                                    <tr>
                                        <th className="p-2 border-b dark:border-gray-600">Дата</th>
                                        <th className="p-2 border-b dark:border-gray-600 text-right">Предрейсовый</th>
                                        {examsCount === 2 && <th className="p-2 border-b dark:border-gray-600 text-right">Послерейсовый</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {reportData.map((group, gIdx) => (
                                        <React.Fragment key={gIdx}>
                                            <tr className="bg-green-100 dark:bg-green-900/40">
                                                <td colSpan={examsCount === 2 ? 3 : 2} className="p-2 font-bold text-center text-green-900 dark:text-green-100">
                                                    {group.title}
                                                </td>
                                            </tr>
                                            {group.rows.map((row, rIdx) => (
                                                <tr key={`${gIdx}-${rIdx}`} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                                    <td className="p-2 dark:text-gray-300">{row.date}</td>
                                                    <td className="p-2 text-right font-mono dark:text-gray-300">{row.examTime1}</td>
                                                    {examsCount === 2 && <td className="p-2 text-right font-mono dark:text-gray-300">{row.examTime2}</td>}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default MedicalReportModal;
