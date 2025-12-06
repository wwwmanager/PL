
import React, { useState, useMemo, useCallback } from 'react';
import { Role, Capability } from '../../types';
import { useAuth } from '../../services/auth';
// FIX: Added missing import for saveRolePolicies
import { saveRolePolicies } from '../../services/mockApi';
import { PencilIcon } from '../Icons';
import Modal from '../shared/Modal';
import { useToast } from '../../hooks/useToast';
import { ROLE_TRANSLATIONS, CAPABILITY_TRANSLATIONS } from '../../constants';

const RoleManagement: React.FC = () => {
    const { rolePolicies, allCaps } = useAuth();
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [currentCaps, setCurrentCaps] = useState<Set<Capability>>(new Set());
    const { showToast } = useToast();

    // Safe access to rolePolicies with explicit null check
    const roles = useMemo(() => {
        if (!rolePolicies) return [];
        return (Object.keys(rolePolicies).sort() as Role[]);
    }, [rolePolicies]);

    const handleEdit = (role: Role) => {
        if (role === 'admin') {
            showToast('Роль администратора нельзя редактировать.', 'info');
            return;
        }
        setEditingRole(role);
        // Safe access
        setCurrentCaps(new Set(rolePolicies?.[role] || []));
    };

    const handleToggleCapability = (cap: Capability) => {
        setCurrentCaps(prev => {
            const next = new Set(prev);
            if (next.has(cap)) {
                next.delete(cap);
            } else {
                next.add(cap);
            }
            return next;
        });
    };

    const handleSave = async () => {
        if (!editingRole) return;
        const updatedPolicies = {
            ...rolePolicies,
            [editingRole]: Array.from(currentCaps),
        };
        try {
            await saveRolePolicies(updatedPolicies);
            showToast(`Права для роли "${ROLE_TRANSLATIONS[editingRole]}" сохранены.`, 'success');
            setEditingRole(null);
        } catch (error) {
            showToast('Не удалось сохранить изменения.', 'error');
        }
    };

    const handleCancel = () => {
        setEditingRole(null);
    };

    const sortedCaps = useMemo(() => {
        return [...allCaps].sort((a, b) => {
            const translationA = CAPABILITY_TRANSLATIONS[a] || a;
            const translationB = CAPABILITY_TRANSLATIONS[b] || b;
            return translationA.localeCompare(translationB);
        });
    }, [allCaps]);

    const handleToggleAll = (checked: boolean) => {
        if (checked) {
            setCurrentCaps(new Set(allCaps));
        } else {
            setCurrentCaps(new Set());
        }
    };

    const isAllSelected = useMemo(() => {
      if (allCaps.length === 0) return false;
      return allCaps.every(cap => currentCaps.has(cap));
    }, [allCaps, currentCaps]);


    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {roles.map(role => (
                    <div key={role} className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{ROLE_TRANSLATIONS[role] ?? role}</h3>
                            <button
                                onClick={() => handleEdit(role)}
                                disabled={role === 'admin'}
                                className="p-2 text-blue-500 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                title={role === 'admin' ? "Роль администратора защищена от изменений" : "Редактировать права"}
                            >
                                <PencilIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex-grow">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Возможности ({rolePolicies?.[role]?.length || 0}):</p>
                            <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1 max-h-32 overflow-y-auto pr-2">
                                {(rolePolicies?.[role] || []).map(cap => (
                                    <div key={cap}>{CAPABILITY_TRANSLATIONS[cap] ?? cap}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <Modal
                isOpen={!!editingRole}
                onClose={handleCancel}
                title={`Редактировать права: ${ROLE_TRANSLATIONS[editingRole!] ?? editingRole}`}
                isDirty={editingRole ? JSON.stringify(rolePolicies?.[editingRole]?.sort()) !== JSON.stringify(Array.from(currentCaps).sort()) : false}
                footer={
                    <>
                        <button onClick={handleCancel} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg">Отмена</button>
                        <button onClick={handleSave} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg">Сохранить</button>
                    </>
                }
            >
                <div className="max-h-[60vh] overflow-y-auto border dark:border-gray-600 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700 z-10">
                            <tr className="text-left">
                                <th className="p-2 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        checked={isAllSelected} 
                                        onChange={(e) => handleToggleAll(e.target.checked)} 
                                        title="Выбрать все"
                                    />
                                </th>
                                <th className="p-2 text-gray-600 dark:text-gray-300 font-semibold">Привилегия</th>
                                <th className="p-2 text-gray-600 dark:text-gray-300 font-semibold">Описание</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedCaps.map(cap => (
                                <tr key={cap} className="border-t dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="p-2 text-center">
                                        <input
                                            type="checkbox"
                                            checked={currentCaps.has(cap)}
                                            onChange={() => handleToggleCapability(cap)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </td>
                                    <td className="p-2 font-mono text-xs text-gray-500 dark:text-gray-400">{cap}</td>
                                    <td className="p-2 text-gray-800 dark:text-gray-200">{CAPABILITY_TRANSLATIONS[cap] ?? cap}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Modal>
        </div>
    );
};

export default RoleManagement;
