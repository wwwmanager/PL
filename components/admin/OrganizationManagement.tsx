
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Organization, OrganizationStatus } from '../../types';
import { getOrganizations, addOrganization, updateOrganization, deleteOrganization } from '../../services/mockApi';
import { validation } from '../../services/faker'; // Валидация все еще нужна для схемы
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, ArchiveBoxIcon, ArrowUpTrayIcon, HomeIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import { ORGANIZATION_STATUS_COLORS, ORGANIZATION_STATUS_TRANSLATIONS } from '../../constants';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import CollapsibleSection from '../shared/CollapsibleSection';

// --- Компоненты FormField (без изменений) ---
const FormField: React.FC<{ label: string; children: React.ReactNode; error?: string }> = ({ label, children, error }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className={`w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed ${props.className || ''}`} />
);
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />;
const FormTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} rows={3} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />;

// --- 2. Определяем схему валидации Zod ---
const organizationSchema = z.object({
    id: z.string().optional(),
    fullName: z.string().nullish(),
    shortName: z.string().min(1, "Краткое наименование обязательно"),
    address: z.string().nullish(),
    postalAddress: z.string().nullish(), // НОВОЕ
    inn: z.string().nullish().superRefine((val, ctx) => {
        const error = validation.inn(val || '');
        if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    kpp: z.string().nullish().superRefine((val, ctx) => {
        const error = validation.kpp(val || '');
        if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    oktmo: z.string().nullish(), // НОВОЕ
    ogrn: z.string().nullish().superRefine((val, ctx) => {
        const error = validation.ogrn(val || '');
        if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    registrationDate: z.string().nullish(),
    contactPerson: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().email("Неверный формат email").nullish().or(z.literal('')),
    
    bankAccount: z.string().nullish().superRefine((val, ctx) => {
        const error = validation.bankAccount(val || '');
        if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    correspondentAccount: z.string().nullish().superRefine((val, ctx) => {
        const error = validation.correspondentAccount(val || '');
        if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    bankName: z.string().nullish(),
    bankBik: z.string().nullish().superRefine((val, ctx) => {
        const error = validation.bankBik(val || '');
        if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    accountCurrency: z.string().nullish(),
    paymentPurpose: z.string().nullish(),
    
    status: z.nativeEnum(OrganizationStatus),
    group: z.string().nullish(),
    notes: z.string().nullish(),

    medicalLicenseNumber: z.string().nullish(),
    medicalLicenseIssueDate: z.string().nullish(),
    
    // Новое поле для иерархии
    parentOrganizationId: z.string().nullish(),
    isOwn: z.boolean().default(false),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

const defaultValues: OrganizationFormData = {
    fullName: '', shortName: '', address: '', postalAddress: '', inn: '', kpp: '', oktmo: '', ogrn: '',
    status: OrganizationStatus.ACTIVE,
    registrationDate: '', contactPerson: '', phone: '', email: '',
    bankAccount: '', correspondentAccount: '', bankName: '', bankBik: '',
    accountCurrency: '', paymentPurpose: '', group: '', notes: '',
    medicalLicenseIssueDate: '', medicalLicenseNumber: '',
    parentOrganizationId: '',
    isOwn: false,
};


const OrganizationManagement = () => {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const [actionModal, setActionModal] = useState<{ isOpen: boolean; type?: 'delete' | 'archive' | 'unarchive'; item?: Organization }>({ isOpen: false });
    const { showToast } = useToast();

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { 
            errors,
            isDirty
        }
    } = useForm<OrganizationFormData>({
        resolver: zodResolver(organizationSchema),
        defaultValues: defaultValues
    });

    const watchedGroup = watch("group");
    const currentId = watch("id");
    const currentShortName = watch("shortName");
    const watchedParentId = watch("parentOrganizationId");
    
    // Определяем, выбрана ли головная организация
    const parentOrg = useMemo(() => {
        return organizations.find(o => o.id === watchedParentId);
    }, [watchedParentId, organizations]);

    // Эффект для автоматического наследования реквизитов
    useEffect(() => {
        if (parentOrg) {
            // Если выбрана головная организация - подтягиваем её реквизиты (кроме Названия и Почтового адреса)
            setValue('inn', parentOrg.inn);
            setValue('ogrn', parentOrg.ogrn);
            setValue('address', parentOrg.address); // Юр. адрес наследуется
            // fullName НЕ наследуем, так как у подразделения свое наименование
            
            // Банковские реквизиты
            setValue('bankAccount', parentOrg.bankAccount);
            setValue('correspondentAccount', parentOrg.correspondentAccount);
            setValue('bankName', parentOrg.bankName);
            setValue('bankBik', parentOrg.bankBik);
            
            // Сбрасываем флаг "Собственная", если он был
            setValue('isOwn', false);
        } else {
            // Если родитель сброшен - поля остаются как есть (пользователь может править)
        }
    }, [parentOrg, setValue]);

    const COLLAPSED_SECTIONS_KEY = 'orgManagement_collapsedSections';
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
      try {
          const saved = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
          return saved ? JSON.parse(saved) : {};
      } catch {
          return {};
      }
    });

    useEffect(() => {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSections));
    }, [collapsedSections]);

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const filteredOrganizations = useMemo(() => {
        return organizations.filter(o => showArchived || o.status !== OrganizationStatus.ARCHIVED);
    }, [organizations, showArchived]);

    const enrichedData = useMemo(() => {
        return filteredOrganizations.map(o => ({
            ...o,
            parentName: o.parentOrganizationId ? organizations.find(p => p.id === o.parentOrganizationId)?.shortName : '-'
        }));
    }, [filteredOrganizations, organizations]);

    type EnrichedOrganization = typeof enrichedData[0];
    type EnrichedOrganizationKey = Extract<keyof EnrichedOrganization, string>;
    
    const columns: { key: EnrichedOrganizationKey; label: string }[] = [
        { key: 'shortName', label: 'Краткое наименование' },
        { key: 'parentName', label: 'Головная орг.' },
        { key: 'inn', label: 'ИНН' },
        { key: 'address', label: 'Адрес' },
        { key: 'status', label: 'Статус' },
    ];

    const { rows, sortColumn, sortDirection, handleSort, filters, handleFilterChange } = useTable(enrichedData, columns);

    const fetchData = async () => {
        setIsLoading(true);
        const data = await getOrganizations();
        setOrganizations(data);
        setIsLoading(false);
    };

    useEffect(() => { fetchData(); }, []);
    
    const handleAddNew = () => {
        reset(defaultValues);
        setIsModalOpen(true);
    };
    
    const handleEdit = (item: Organization) => {
        reset({ ...item, isOwn: item.isOwn ?? false });
        setIsModalOpen(true);
    };

    const handleCancel = useCallback(() => {
        setIsModalOpen(false);
    }, []);

    const onSubmit = async (data: OrganizationFormData) => {
        try {
            if (data.id) {
                await updateOrganization(data as Organization);
            } else {
                await addOrganization(data as Omit<Organization, 'id'>);
            }
            showToast("Изменения сохранены");
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            showToast("Не удалось сохранить изменения.", 'error');
        }
    };
    
    const openActionModal = (type: 'delete' | 'archive' | 'unarchive', item: Organization) => {
        setActionModal({ isOpen: true, type, item });
    };

    const closeActionModal = () => setActionModal({ isOpen: false });

    const handleConfirmAction = async () => {
        const { type, item } = actionModal;
        if (!item) return;

        try {
            if (type === 'delete') {
                await deleteOrganization(item.id);
                showToast(`Организация "${item.shortName}" удалена.`, 'info');
            } else if (type === 'archive') {
                await updateOrganization({ ...item, status: OrganizationStatus.ARCHIVED });
                showToast(`Организация "${item.shortName}" архивировано.`, 'info');
            } else if (type === 'unarchive') {
                await updateOrganization({ ...item, status: OrganizationStatus.ACTIVE });
                showToast(`Организация "${item.shortName}" восстановлена.`, 'info');
            }
            fetchData();
        } catch (error) {
            showToast(`Не удалось выполнить действие.`, 'error');
        } finally {
            closeActionModal();
        }
    };
    
    const modalConfig = useMemo(() => {
        const { type, item } = actionModal;
        if (!type || !item) return { title: '', message: '', confirmText: '', confirmButtonClass: '' };
        
        switch (type) {
            case 'delete': return { title: 'Подтвердить удаление', message: `Удалить организацию "${item.shortName}"?`, confirmText: 'Удалить', confirmButtonClass: 'bg-red-600 hover:bg-red-700' };
            case 'archive': return { title: 'Подтвердить архивацию', message: `Архивировать "${item.shortName}"?`, confirmText: 'Архивировать', confirmButtonClass: 'bg-purple-600 hover:bg-purple-700' };
            case 'unarchive': return { title: 'Подтвердить восстановление', message: `Восстановить "${item.shortName}" из архива?`, confirmText: 'Восстановить', confirmButtonClass: 'bg-green-600 hover:bg-green-700' };
            default: return { title: '', message: '', confirmText: '', confirmButtonClass: '' };
        }
    }, [actionModal]);

    // Исключаем текущую организацию из списка возможных родителей, чтобы избежать циклов (простой вариант)
    const availableParents = useMemo(() => {
        return organizations.filter(o => o.id !== currentId);
    }, [organizations, currentId]);

    return (
      <>
        <ConfirmationModal isOpen={actionModal.isOpen} onClose={closeActionModal} onConfirm={handleConfirmAction} {...modalConfig} />
        <Modal 
            isOpen={isModalOpen} 
            onClose={handleCancel}
            isDirty={isDirty}
            title={currentId ? `Редактирование: ${currentShortName}`: 'Добавить организацию'}
            footer={
                <>
                    <button onClick={handleCancel} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Отмена</button>
                    <button onClick={handleSubmit(onSubmit)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Сохранить</button>
                </>
            }
        >
             <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <CollapsibleSection title="Основная информация" isCollapsed={collapsedSections.basic || false} onToggle={() => toggleSection('basic')}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {!parentOrg && (
                            <div className="md:col-span-2 flex items-center mb-2">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" {...register('isOwn')} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">Это собственная организация <HomeIcon className="h-4 w-4 text-blue-500"/></span>
                                </label>
                            </div>
                        )}
                        <FormField label="Краткое наименование" error={errors.shortName?.message}><FormInput {...register("shortName")} /></FormField>
                        <FormField label="Полное наименование"><FormInput {...register("fullName")} /></FormField>
                        <FormField label="Группа"><FormSelect {...register("group")}><option value="">Без группы</option><option value="Перевозчик">Перевозчик</option><option value="Заказчик">Заказчик</option><option value="Филиал">Филиал</option><option value="Мед. учреждение">Мед. учреждение</option></FormSelect></FormField>
                        <FormField label="Головная организация">
                            <FormSelect {...register("parentOrganizationId")}>
                                <option value="">- Не выбрана (самостоятельная) -</option>
                                {availableParents.map(p => <option key={p.id} value={p.id}>{p.shortName}</option>)}
                            </FormSelect>
                        </FormField>
                        <FormField label="Статус"><FormSelect {...register("status")}>{Object.values(OrganizationStatus).map(s => <option key={s} value={s}>{ORGANIZATION_STATUS_TRANSLATIONS[s]}</option>)}</FormSelect></FormField>
                        <div className="md:col-span-2"><FormField label="Юридический адрес"><FormInput {...register("address")} disabled={!!parentOrg} /></FormField></div>
                        <div className="md:col-span-2"><FormField label="Почтовый адрес"><FormInput {...register("postalAddress")} placeholder="Если отличается от юридического" /></FormField></div>
                    </div>
                </CollapsibleSection>
                {watchedGroup === 'Мед. учреждение' && (
                    <CollapsibleSection title="Данные мед. учреждения" isCollapsed={collapsedSections.medical || false} onToggle={() => toggleSection('medical')}>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Номер лицензии"><FormInput {...register("medicalLicenseNumber")} /></FormField>
                            <FormField label="Дата выдачи лицензии"><FormInput type="date" {...register("medicalLicenseIssueDate")} /></FormField>
                        </div>
                    </CollapsibleSection>
                )}
                <CollapsibleSection title="Реквизиты" isCollapsed={collapsedSections.requisites || false} onToggle={() => toggleSection('requisites')}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField label="ИНН" error={errors.inn?.message}><FormInput {...register("inn")} disabled={!!parentOrg} /></FormField>
                        <FormField label="КПП" error={errors.kpp?.message}><FormInput {...register("kpp")} /></FormField>
                        <FormField label="ОКТМО"><FormInput {...register("oktmo")} placeholder="Код ОКТМО" /></FormField>
                        <FormField label="ОГРН" error={errors.ogrn?.message}><FormInput {...register("ogrn")} disabled={!!parentOrg} /></FormField>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection title="Банковские реквизиты" isCollapsed={collapsedSections.bank || false} onToggle={() => toggleSection('bank')}>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Расчетный счет" error={errors.bankAccount?.message}><FormInput {...register("bankAccount")} disabled={!!parentOrg} /></FormField>
                        <FormField label="Корреспондентский счет" error={errors.correspondentAccount?.message}><FormInput {...register("correspondentAccount")} disabled={!!parentOrg} /></FormField>
                        <FormField label="Наименование банка"><FormInput {...register("bankName")} disabled={!!parentOrg} /></FormField>
                        <FormField label="БИК" error={errors.bankBik?.message}><FormInput {...register("bankBik")} disabled={!!parentOrg} /></FormField>
                    </div>
                </CollapsibleSection>
             </form>
        </Modal>

        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Справочник: Организации</h3>
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
                        : rows.map(o => (
                            <tr key={o.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    {o.isOwn && <span title="Наша организация" className="flex-shrink-0"><HomeIcon className="h-4 w-4 text-blue-500" /></span>}
                                    {o.shortName}
                                </td>
                                <td className="px-6 py-4">{o.parentName}</td>
                                <td className="px-6 py-4">{o.inn}</td>
                                <td className="px-6 py-4">{o.address}</td>
                                <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${ORGANIZATION_STATUS_COLORS[o.status]}`}>{ORGANIZATION_STATUS_TRANSLATIONS[o.status]}</span></td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => handleEdit(o)} className="p-2 text-blue-500" title="Редактировать"><PencilIcon className="h-5 w-5" /></button>
                                    {o.status === OrganizationStatus.ACTIVE ? <button onClick={() => openActionModal('archive', o)} className="p-2 text-purple-500" title="Архивировать"><ArchiveBoxIcon className="h-5 w-5" /></button> : <button onClick={() => openActionModal('unarchive', o)} className="p-2 text-green-500" title="Восстановить"><ArrowUpTrayIcon className="h-5 w-5" /></button>}
                                    <button onClick={() => openActionModal('delete', o)} className="p-2 text-red-500" title="Удалить"><TrashIcon className="h-5 w-5" /></button>
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

export default OrganizationManagement;
