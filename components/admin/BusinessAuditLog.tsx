// components/admin/BusinessAuditLog.tsx
import React, { useState, useEffect } from 'react';
import { getEvents, BusinessEvent } from '../../services/auditBusiness';
import { useAuth } from '../../services/auth';

const BusinessAuditLog: React.FC = () => {
    const [events, setEvents] = useState<BusinessEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const { can } = useAuth();

    useEffect(() => {
        const loadEvents = async () => {
            if (can('audit.business.read')) {
                const data = await getEvents();
                setEvents(data);
            }
            setLoading(false);
        };
        loadEvents();
    }, [can]);

    if (!can('audit.business.read')) {
        return <div className="p-4 text-gray-500">Нет доступа к журналу бизнес-событий.</div>;
    }

    if (loading) {
        return <div>Загрузка журнала...</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                    <tr>
                        <th scope="col" className="px-6 py-3">Дата и время</th>
                        <th scope="col" className="px-6 py-3">Событие</th>
                        <th scope="col" className="px-6 py-3">Пользователь</th>
                        <th scope="col" className="px-6 py-3">Детали</th>
                    </tr>
                </thead>
                <tbody>
                    {events.map(event => (
                        <tr key={event.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                            <td className="px-6 py-4">{new Date(event.at).toLocaleString()}</td>
                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{event.type}</td>
                            <td className="px-6 py-4">{event.userId || 'Система'}</td>
                            <td className="px-6 py-4 text-xs font-mono">{JSON.stringify(event.payload)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default BusinessAuditLog;
