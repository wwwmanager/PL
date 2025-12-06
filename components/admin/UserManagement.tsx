
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { User, Role, Capability } from '../../types';
import { getUsers, addUser, updateUser, deleteUser } from '../../services/mockApi';
import { useAuth } from '../../services/auth';
import { PencilIcon, TrashIcon, PlusIcon } from '../Icons';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import { ROLE_TRANSLATIONS, CAPABILITY_TRANSLATIONS } from '../../constants';

const userSchema = z.object({
    id: z.string().optional(),
    displayName: z.string().min(1, 'Имя пользователя обязательно'),
    // FIX: Expanded role enum to match all possible Role types from types.ts.
    role: z.enum(['admin', 'user', 'auditor', 'driver', 'mechanic', 'reviewer', 'accountant', 'viewer']),
    extraCaps: z.array(z.string()).optional(),
});
type UserFormData = z.infer<typeof userSchema>;

const FormField: React.FC<{ label: string; children: React.ReactNode; error?: string }> = ({ label, children, error }) => (
    <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
        {children}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
);
const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />;
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />;

const UserManagement: React.FC = () => {
    const { can, allCaps, rolePolicies, currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [currentItem, setCurrentItem] = useState<Partial<User> | null>(null);
    const [deleteModal, setDeleteModal] = useState<User | null>(null);
    const { showToast } = useToast();

    const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm<UserFormData>({ resolver: zodResolver(userSchema) });
    const watchedRole = watch('role');

    const fetchData = useCallback(async () => {
        const data = await getUsers();
        setUsers(data);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleEdit = (item: User) => { reset(item); setCurrentItem(item); };
    const handleAddNew = () => { reset({ displayName: '', role: 'user', extraCaps: [] }); setCurrentItem({}); };
    const handleCancel = () => setCurrentItem(null);

    const onSubmit = async (data: UserFormData) => {
        try {
            if (data.id) {
                await updateUser(data as User);
            } else {
                await addUser(data as Omit<User, 'id'>);
            }
            showToast('Пользователь сохранен');
            handleCancel();
            fetchData();
        } catch (e) {
            showToast('Не удалось сохранить', 'error');
        }
    };

    const handleDelete = async () => {
        if (!deleteModal) return;
        if (deleteModal.id === currentUser?.id) {
            showToast('Нельзя удалить текущего пользователя.', 'error');
            setDeleteModal(null);
            return;
        }
        try {
            await deleteUser(deleteModal.id);
            showToast('Пользователь удален');
            setDeleteModal(null);
            fetchData();
        } catch (e) { showToast('Не удалось удалить', 'error'); }
    };

    const roleCaps = useMemo(() => watchedRole && rolePolicies ? rolePolicies[watchedRole] : [], [watchedRole, rolePolicies]);
    
    // Safe access to role keys for the select dropdown
    const availableRoles = useMemo(() => rolePolicies ? Object.keys(rolePolicies) as Role[] : [], [rolePolicies]);

    if (!can('admin.panel')) {
        return <div className="p-4 text-gray-500">Доступ к управлению пользователями есть только у администратора.</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Управление пользователями</h3>
                <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"><PlusIcon className="h-5 w-5" /> Добавить</button>
            </div>

            <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-600 dark:text-gray-300"><th className="p-2">Имя</th><th className="p-2">Роль</th><th className="p-2">Доп. права</th><th className="p-2">Действия</th></tr></thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id} className="border-t dark:border-gray-700">
                            <td className="p-2 font-medium text-gray-800 dark:text-gray-100">{user.displayName}</td>
                            <td className="p-2">{ROLE_TRANSLATIONS[user.role] ?? user.role}</td>
                            <td className="p-2 text-xs text-gray-500">{(user.extraCaps || []).map(c => CAPABILITY_TRANSLATIONS[c as Capability] ?? c).join(', ')}</td>
                            <td className="p-2">
                                <button onClick={() => handleEdit(user)} className="p-1"><PencilIcon className="h-5 w-5 text-blue-500"/></button>
                                <button onClick={() => setDeleteModal(user)} className="p-1"><TrashIcon className="h-5 w-5 text-red-500"/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <Modal isOpen={!!currentItem} onClose={handleCancel} isDirty={isDirty} title={currentItem?.id ? "Редактировать" : "Новый пользователь"} footer={<><button onClick={handleCancel}>Отмена</button><button onClick={handleSubmit(onSubmit)}>Сохранить</button></>}>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <FormField label="Отображаемое имя" error={errors.displayName?.message}><FormInput {...register("displayName")} /></FormField>
                    <FormField label="Роль" error={errors.role?.message}>
                        <FormSelect {...register("role")}>
                            {availableRoles.map(r => <option key={r} value={r}>{ROLE_TRANSLATIONS[r] ?? r}</option>)}
                        </FormSelect>
                    </FormField>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Дополнительные привилегии</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 border rounded-md dark:border-gray-600 max-h-48 overflow-y-auto">
                            {allCaps.map(cap => (
                                <label key={cap} className="flex items-center gap-2">
                                    <input type="checkbox"
                                        {...register('extraCaps')}
                                        value={cap}
                                        disabled={roleCaps.includes(cap)}
                                        defaultChecked={currentItem?.extraCaps?.includes(cap) || roleCaps.includes(cap)}
                                    />
                                    <span className={`text-sm ${roleCaps.includes(cap) ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>{CAPABILITY_TRANSLATIONS[cap] ?? cap}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </form>
            </Modal>
            <ConfirmationModal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} onConfirm={handleDelete} title="Удалить пользователя?" message={`Вы уверены, что хотите удалить "${deleteModal?.displayName}"?`} confirmText="Удалить" />
        </div>
    );
};

export default UserManagement;
