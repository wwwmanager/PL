import React from 'react';
import { ALL_CAPS, CAPABILITY_TRANSLATIONS } from '../../constants';
import { ShieldCheckIcon } from '../Icons';

const CapabilitiesGuide: React.FC = () => {
    // Sort capabilities alphabetically by their translation
    const sortedCaps = [...ALL_CAPS].sort((a, b) => {
        const translationA = CAPABILITY_TRANSLATIONS[a] || a;
        const translationB = CAPABILITY_TRANSLATIONS[b] || b;
        return translationA.localeCompare(translationB);
    });

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8 max-w-4xl mx-auto">
            <header className="text-center mb-10">
                <ShieldCheckIcon className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">Справочник прав доступа (Capabilities)</h1>
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Полный список всех возможных прав в системе и их описание.</p>
            </header>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            <th scope="col" className="px-6 py-3 w-1/3">
                                Право (Capability)
                            </th>
                            <th scope="col" className="px-6 py-3">
                                Описание
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedCaps.map(cap => (
                            <tr key={cap} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                <th scope="row" className="px-6 py-4 font-mono text-gray-900 dark:text-white">
                                    {cap}
                                </th>
                                <td className="px-6 py-4">
                                    {CAPABILITY_TRANSLATIONS[cap] ?? 'Нет описания'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CapabilitiesGuide;