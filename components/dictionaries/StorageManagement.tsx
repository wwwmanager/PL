import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Organization, Employee, StorageType } from '../../types';
// FIX: Added addStorage, updateStorage, and deleteStorage to the import from mockApi
import { MockStorage as StorageLocation, getOrganizations, getEmployees, fetchStorages, addStorage, updateStorage, deleteStorage } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, ArchiveBoxIcon, ArrowUpTrayIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import { STORAGE_TYPE_TRANSLATIONS, STORAGE_STATUS_TRANSLATIONS, STORAGE_STATUS_COLORS } from '../../constants';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';

const FormField: React.FC<{ label: string; children: React.ReactNode; error?: string }> = ({ label, children, error }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
);
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />;
const FormTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} rows={3} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />;


const storageSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Наименование обязательно"),
    type: z.enum(['centralWarehouse', 'remoteWarehouse', 'vehicleTank', 'contractorWarehouse']),
    organizationId: z.string().min(1, "Организация обязательна"),
    address: z.string().optional().nullable(),
    responsiblePerson: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    status: z.enum(['active', 'archived']),
});

type StorageFormData = z.infer<typeof storageSchema>;

const StorageManagement = () => {
    const [storages, setStorages] = useState<StorageLocation[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const [actionModal, setActionModal] = useState<{ isOpen: boolean; type?: 'delete' | 'archive' | 'unarchive'; item?: StorageLocation }>({ isOpen: false });
    const { showToast } = useToast();

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isDirty }
    } = useForm<StorageFormData>({
        resolver: zodResolver(storageSchema)
    });

    const currentId = watch("id");
    const currentName = watch("name");

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [storagesData, orgsData, employeesData] = await Promise.all([
                fetchStorages({ pageSize: 9999 }),
                getOrganizations(),
                getEmployees()
            ]);
            setStorages(storagesData.data);
            setOrganizations(orgsData);
            setEmployees(employeesData);
        } catch (error) {
            showToast('Не удалось загрузить данные.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const enrichedData = useMemo(() => {
        return storages
            .filter(s => showArchived || s.status !== 'archived')
            .map(s => ({
                ...s,
                organizationName: organizations.find(o => o.id === s.organizationId)?.shortName || 'N/A',
                typeName: s.type ? STORAGE_TYPE_TRANSLATIONS[s.type] : '',
            }));
    }, [storages, organizations, showArchived]);

    type EnrichedStorage = typeof enrichedData[0];
    type EnrichedStorageKey = Extract<keyof EnrichedStorage, string>;
    
    const columns: { key: EnrichedStorageKey; label: string }[] = [
        { key: 'name', label: 'Наименование' },
        { key: 'typeName', label: 'Тип' },
        { key: 'organizationName', label: 'Организация' },
        { key: 'address', label: 'Адрес' },
        { key: 'status', label: 'Статус' },
    ];
    
    const { rows, sortColumn, sortDirection, handleSort, filters, handleFilterChange } = useTable(enrichedData, columns);

    const handleAddNew = () => {
        reset({
            name: '',
            type: 'centralWarehouse',
            organizationId: organizations[0]?.id || '',
            address: '',
            responsiblePerson: '',
            description: '',
            status: 'active',
        });
        setIsModalOpen(true);
    };

    const handleEdit = (item: StorageLocation) => {
        reset(item);
        setIsModalOpen(true);
    };

    const handleCancel = useCallback(() => setIsModalOpen(false), []);

    const onSubmit = async (data: StorageFormData) => {
        try {
            if (data.id) {
                await updateStorage(data as StorageLocation);
            } else {
                await addStorage(data as Omit<StorageLocation, 'id'>);
            }
            showToast("Изменения сохранены");
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            showToast("Не удалось сохранить изменения.", 'error');
        }
    };

    const openActionModal = (type: 'delete' | 'archive' | 'unarchive', item: StorageLocation) => {
        setActionModal({ isOpen: true, type, item });
    };

    const closeActionModal = () => setActionModal({ isOpen: false });

    const handleConfirmAction = async () => {
        const { type, item } = actionModal;
        if (!item) return;

        try {
            if (type === 'delete') {
                await deleteStorage(item.id);
                showToast(`Место хранения "${item.name}" удалено.`, 'info');
            } else if (type === 'archive') {
                await updateStorage({ ...item, status: 'archived' });
                showToast(`Место хранения "${item.name}" архивировано.`, 'info');
            } else if (type === 'unarchive') {
                await updateStorage({ ...item, status: 'active' });
                showToast(`Место хранения "${item.name}" восстановлено.`, 'info');
            }
            fetchData();
        } catch (error) {
            showToast((error as Error).message, 'error');
        } finally {
            closeActionModal();
        }
    };
    
    const modalConfig = useMemo(() => {
        const { type, item } = actionModal;
        if (!type || !item) return { title: '', message: '', confirmText: '', confirmButtonClass: '' };
        
        switch (type) {
            case 'delete': return { title: 'Подтвердить удаление', message: `Удалить место хранения "${item.name}"?`, confirmText: 'Удалить', confirmButtonClass: 'bg-red-600 hover:bg-red-700' };
            case 'archive': return { title: 'Подтвердить архивацию', message: `Архивировать "${item.name}"?`, confirmText: 'Архивировать', confirmButtonClass: 'bg-purple-600 hover:bg-purple-700' };
            case 'unarchive': return { title: 'Подтвердить восстановление', message: `Восстановить "${item.name}" из архива?`, confirmText: 'Восстановить', confirmButtonClass: 'bg-green-600 hover:bg-green-700' };
            default: return { title: '', message: '', confirmText: '', confirmButtonClass: '' };
        }
    }, [actionModal]);
    
    return (
      <>
        <ConfirmationModal isOpen={actionModal.isOpen} onClose={closeActionModal} onConfirm={handleConfirmAction} {...modalConfig} />
        <Modal 
            isOpen={isModalOpen} 
            onClose={handleCancel}
            isDirty={isDirty}
            title={currentId ? `Редактирование: ${currentName}`: 'Добавить место хранения'}
            footer={
                <>
                    <button onClick={handleCancel} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Отмена</button>
                    <button onClick={handleSubmit(onSubmit)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Сохранить</button>
                </>
            }
        >
             <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Наименование" error={errors.name?.message}><FormInput {...register("name")} /></FormField>
                    <FormField label="Тип" error={errors.type?.message}>
                        <FormSelect {...register("type")}>
                            {Object.entries(STORAGE_TYPE_TRANSLATIONS).map(([key, label]) => 
                                <option key={key} value={key}>{label}</option>
                            )}
                        </FormSelect>
                    </FormField>
                    <FormField label="Организация" error={errors.organizationId?.message}>
                        <FormSelect {...register("organizationId")}>
                            <option value="">Выберите</option>
                            {organizations.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}
                        </FormSelect>
                    </FormField>
                    <FormField label="Ответственное лицо" error={errors.responsiblePerson?.message}>
                        <FormSelect {...register("responsiblePerson")}>
                            <option value="">Выберите</option>
                            {employees.map(e => <option key={e.id} value={e.fullName}>{e.fullName}</option>)}
                        </FormSelect>
                    </FormField>
                    <div className="md:col-span-2"><FormField label="Адрес" error={errors.address?.message}><FormInput {...register("address")} /></FormField></div>
                    <div className="md:col-span-2"><FormField label="Описание/примечания" error={errors.description?.message}><FormTextarea {...register("description")} /></FormField></div>
                </div>
             </form>
        </Modal>

        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Справочник: Места хранения</h3>
                <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                    <PlusIcon className="h-5 w-5" /> Добавить
                </button>
            </div>
             <label className="flex items-center text-sm text-gray-600 dark:text-gray-300 cursor-pointer my-4">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500" />
                <span className="ml-2">Показать архивные</span>
            </label>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            {columns.map(col => (<th key={col.key} scope="col" className="px-6 py-3 cursor-pointer" onClick={() => handleSort(col.key)}><div className="flex items-center gap-1">{col.label}{sortColumn === col.key && (sortDirection === 'asc' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />)}</div></th>))}
                            <th scope="col" className="px-6 py-3 text-center">Действия</th>
                        </tr>
                         <tr>
                            {columns.map(col => (<th key={`${col.key}-filter`} className="px-2 py-1"><input type="text" value={filters[col.key] || ''} onChange={e => handleFilterChange(col.key, e.target.value)} placeholder={`Поиск...`} className="w-full text-xs p-1 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded" /></th>))}
                            <th className="px-2 py-1"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (<tr><td colSpan={columns.length + 1} className="text-center p-4">Загрузка...</td></tr>) 
                        : rows.map(s => (
                            <tr key={s.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{s.name}</td>
                                <td className="px-6 py-4">{s.typeName}</td>
                                <td className="px-6 py-4">{s.organizationName}</td>
                                <td className="px-6 py-4">{s.address}</td>
                                <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${s.status ? STORAGE_STATUS_COLORS[s.status] : ''}`}>{s.status ? STORAGE_STATUS_TRANSLATIONS[s.status] : ''}</span></td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => handleEdit(s)} className="p-2 text-blue-500" title="Редактировать"><PencilIcon className="h-5 w-5" /></button>
                                    {s.status === 'active' ? <button onClick={() => openActionModal('archive', s)} className="p-2 text-purple-500" title="Архивировать"><ArchiveBoxIcon className="h-5 w-5" /></button> : <button onClick={() => openActionModal('unarchive', s)} className="p-2 text-green-500" title="Восстановить"><ArrowUpTrayIcon className="h-5 w-5" /></button>}
                                    <button onClick={() => openActionModal('delete', s)} className="p-2 text-red-500" title="Удалить"><TrashIcon className="h-5 w-5" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
        </div>
      </>
    );
};

export default StorageManagement;