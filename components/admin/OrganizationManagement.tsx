import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Organization, OrganizationStatus } from '../../types';
import { getOrganizations, addOrganization, updateOrganization, deleteOrganization } from '../../services/mockApi';
import { validation } from '../../services/faker';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, ArchiveBoxIcon, ArrowUpTrayIcon, HomeIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import { ORGANIZATION_STATUS_COLORS, ORGANIZATION_STATUS_TRANSLATIONS } from '../../constants';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import CollapsibleSection from '../shared/CollapsibleSection';
import { DataTable, Column } from '../shared/DataTable';

const organizationSchema = z.object({
    id: z.string().optional(),
    shortName: z.string().min(1, "Краткое наименование обязательно"),
    fullName: z.string().optional(),
    status: z.nativeEnum(OrganizationStatus),
    inn: z.string().refine((val) => !val || !validation.inn(val), { message: "Некорректный ИНН" }).optional().nullable(),
    kpp: z.string().refine((val) => !val || !validation.kpp(val), { message: "Некорректный КПП" }).optional().nullable(),
    ogrn: z.string().refine((val) => !val || !validation.ogrn(val), { message: "Некорректный ОГРН" }).optional().nullable(),
    address: z.string().optional().nullable(),
    postalAddress: z.string().optional().nullable(),
    contactPerson: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email("Некорректный email").optional().nullable().or(z.literal('')),
    bankAccount: z.string().refine((val) => !val || !validation.bankAccount(val), { message: "Некорректный Р/С" }).optional().nullable(),
    correspondentAccount: z.string().refine((val) => !val || !validation.correspondentAccount(val), { message: "Некорректный К/С" }).optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankBik: z.string().refine((val) => !val || !validation.bankBik(val), { message: "Некорректный БИК" }).optional().nullable(),
    group: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    medicalLicenseNumber: z.string().optional().nullable(),
    medicalLicenseIssueDate: z.string().optional().nullable(),
    parentOrganizationId: z.string().optional().nullable(),
    isOwn: z.boolean().optional(),
    oktmo: z.string().optional().nullable(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

const FormField: React.FC<{ label: string; children: React.ReactNode; error?: string }> = ({ label, children, error }) => (
    <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
        {children}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500" />
);
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />;
const FormTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} rows={3} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />;

const OrganizationManagement: React.FC = () => {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentOrg, setCurrentOrg] = useState<Partial<Organization> | null>(null);
    const [actionModal, setActionModal] = useState<{ isOpen: boolean; type?: 'delete' | 'archive' | 'unarchive'; item?: Organization }>({ isOpen: false });
    const [showArchived, setShowArchived] = useState(false);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    // Collapsible sections state
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
        basic: false,
        contacts: true,
        bank: true,
        license: false,
    });
    const toggleSection = (section: string) => {
        setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors, isDirty }
    } = useForm<OrganizationFormData>({
        resolver: zodResolver(organizationSchema),
        defaultValues: { status: OrganizationStatus.ACTIVE }
    });

    const watchedGroup = watch('group');
    const isOwnOrg = watch('isOwn');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getOrganizations();
            setOrganizations(data);
        } catch (e) {
            showToast('Не удалось загрузить список организаций', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAddNew = () => {
        reset({
            shortName: '',
            status: OrganizationStatus.ACTIVE,
            isOwn: false,
        });
        setCurrentOrg({});
        setIsModalOpen(true);
    };

    const handleEdit = (org: Organization) => {
        reset(org);
        setCurrentOrg(org);
        setIsModalOpen(true);
    };

    const handleCancel = () => {
        setIsModalOpen(false);
        setCurrentOrg(null);
    };

    const onSubmit = async (data: OrganizationFormData) => {
        try {
            if (data.id) {
                await updateOrganization(data as Organization);
            } else {
                await addOrganization(data as Omit<Organization, 'id'>);
            }
            showToast('Организация сохранена', 'success');
            setIsModalOpen(false);
            fetchData();
        } catch (e) {
            showToast('Ошибка при сохранении', 'error');
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
            showToast((error as Error).message, 'error');
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

    const enrichedData = useMemo(() => {
        return organizations.filter(o => showArchived || o.status !== OrganizationStatus.ARCHIVED);
    }, [organizations, showArchived]);

    const columns: Column<Organization>[] = [
        {
            key: 'shortName', label: 'Наименование', sortable: true, render: (o) => (
                <div className="flex items-center gap-2">
                    {o.isOwn && <HomeIcon className="h-4 w-4 text-blue-500" title="Своя организация" />}
                    <span className="font-medium text-gray-900 dark:text-white">{o.shortName}</span>
                </div>
            )
        },
        { key: 'inn', label: 'ИНН', sortable: true },
        { key: 'address', label: 'Адрес', sortable: true, render: (o) => <span className="truncate max-w-[200px]" title={o.address || ''}>{o.address}</span> },
        {
            key: 'status', label: 'Статус', sortable: true, render: (o) => (
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${ORGANIZATION_STATUS_COLORS[o.status]}`}>
                    {ORGANIZATION_STATUS_TRANSLATIONS[o.status]}
                </span>
            )
        }
    ];

    const { rows, sortColumn, sortDirection, handleSort, filters, handleFilterChange } = useTable(enrichedData, columns);

    return (
        <div className="space-y-4">
            <ConfirmationModal isOpen={actionModal.isOpen} onClose={closeActionModal} onConfirm={handleConfirmAction} {...modalConfig} />

            <Modal isOpen={isModalOpen} onClose={handleCancel} title={currentOrg?.id ? 'Редактирование' : 'Новая организация'} isDirty={isDirty}
                footer={
                    <>
                        <button onClick={handleCancel} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Отмена</button>
                        <button onClick={handleSubmit(onSubmit)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Сохранить</button>
                    </>
                }
            >
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <CollapsibleSection title="Основные данные" isCollapsed={collapsedSections.basic} onToggle={() => toggleSection('basic')}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Краткое наименование" error={errors.shortName?.message}><FormInput {...register("shortName")} /></FormField>
                            <FormField label="Полное наименование" error={errors.fullName?.message}><FormInput {...register("fullName")} /></FormField>
                            <FormField label="Статус">
                                <FormSelect {...register("status")}>
                                    {Object.values(OrganizationStatus).map(s => <option key={s} value={s}>{ORGANIZATION_STATUS_TRANSLATIONS[s]}</option>)}
                                </FormSelect>
                            </FormField>
                            <FormField label="Группа">
                                <FormSelect {...register("group")}>
                                    <option value="">Без группы</option>
                                    <option value="Мед. учреждение">Мед. учреждение</option>
                                    <option value="Филиал">Филиал</option>
                                </FormSelect>
                            </FormField>

                            <div className="flex items-center gap-2 mt-6">
                                <input type="checkbox" {...register('isOwn')} className="h-4 w-4 text-blue-600 rounded" />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Своя организация</span>
                            </div>

                            <FormField label="Головная организация">
                                <FormSelect {...register("parentOrganizationId")} disabled={isOwnOrg}>
                                    <option value="">Нет</option>
                                    {organizations.filter(o => o.id !== currentOrg?.id).map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}
                                </FormSelect>
                            </FormField>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Реквизиты и контакты" isCollapsed={collapsedSections.contacts} onToggle={() => toggleSection('contacts')}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField label="ИНН" error={errors.inn?.message}><FormInput {...register("inn")} /></FormField>
                            <FormField label="КПП" error={errors.kpp?.message}><FormInput {...register("kpp")} /></FormField>
                            <FormField label="ОГРН" error={errors.ogrn?.message}><FormInput {...register("ogrn")} /></FormField>
                            <FormField label="ОКТМО" error={errors.oktmo?.message}><FormInput {...register("oktmo")} /></FormField>

                            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="Юр. адрес" error={errors.address?.message}><FormInput {...register("address")} /></FormField>
                                <FormField label="Почтовый адрес"><FormInput {...register("postalAddress")} /></FormField>
                            </div>

                            <FormField label="Телефон"><FormInput {...register("phone")} /></FormField>
                            <FormField label="Email" error={errors.email?.message}><FormInput {...register("email")} /></FormField>
                            <FormField label="Контактное лицо"><FormInput {...register("contactPerson")} /></FormField>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Банковские реквизиты" isCollapsed={collapsedSections.bank} onToggle={() => toggleSection('bank')}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Банк"><FormInput {...register("bankName")} /></FormField>
                            <FormField label="БИК" error={errors.bankBik?.message}><FormInput {...register("bankBik")} /></FormField>
                            <FormField label="Расчетный счет" error={errors.bankAccount?.message}><FormInput {...register("bankAccount")} /></FormField>
                            <FormField label="Корр. счет" error={errors.correspondentAccount?.message}><FormInput {...register("correspondentAccount")} /></FormField>
                        </div>
                    </CollapsibleSection>

                    {watchedGroup === 'Мед. учреждение' && (
                        <CollapsibleSection title="Лицензия (для мед. учреждений)" isCollapsed={collapsedSections.license} onToggle={() => toggleSection('license')}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="Номер лицензии"><FormInput {...register("medicalLicenseNumber")} /></FormField>
                                <FormField label="Дата выдачи"><FormInput type="date" {...register("medicalLicenseIssueDate")} /></FormField>
                            </div>
                        </CollapsibleSection>
                    )}

                    <FormField label="Примечание"><FormTextarea {...register("notes")} /></FormField>
                </form>
            </Modal>

            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Организации</h3>
                <div className="flex items-center gap-4">
                    <label className="flex items-center text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                        <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-blue-600 focus:ring-blue-500" />
                        <span className="ml-2">Показать архивные</span>
                    </label>
                    <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition-all active:scale-95">
                        <PlusIcon className="h-5 w-5" /> Добавить
                    </button>
                </div>
            </div>

            <DataTable
                data={rows}
                columns={columns}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                filters={filters}
                onFilterChange={handleFilterChange}
                isLoading={loading}
                tableId="organizations-list"
                actions={[
                    {
                        icon: <PencilIcon className="h-4 w-4" />,
                        onClick: (o) => handleEdit(o),
                        title: "Редактировать",
                        className: "text-blue-500"
                    },
                    {
                        icon: <ArchiveBoxIcon className="h-4 w-4" />,
                        onClick: (o) => openActionModal('archive', o),
                        title: "Архивировать",
                        show: (o) => o.status === OrganizationStatus.ACTIVE,
                        className: "text-purple-500"
                    },
                    {
                        icon: <ArrowUpTrayIcon className="h-4 w-4" />,
                        onClick: (o) => openActionModal('unarchive', o),
                        title: "Восстановить",
                        show: (o) => o.status !== OrganizationStatus.ACTIVE,
                        className: "text-green-500"
                    },
                    {
                        icon: <TrashIcon className="h-4 w-4" />,
                        onClick: (o) => openActionModal('delete', o),
                        title: "Удалить",
                        className: "text-red-500"
                    }
                ]}
            />
        </div>
    );
};

export default OrganizationManagement;