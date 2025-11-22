import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Employee, Organization, EmployeeType, EMPLOYEE_TYPE_TRANSLATIONS, WaybillBlankBatch } from '../../types';
import { getEmployees, addEmployee, updateEmployee, deleteEmployee, getOrganizations, generateId } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon, XIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import CollapsibleSection from '../shared/CollapsibleSection';

const ALL_LICENSE_CATEGORIES = ['A', 'A1', 'B', 'B1', 'BE', 'C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E', 'M', 'Tm', 'Tb'];

interface LicenseCategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCategories: string[];
    onSave: (newCategories: string[]) => void;
}

const LicenseCategoryModal: React.FC<LicenseCategoryModalProps> = ({ isOpen, onClose, selectedCategories, onSave }) => {
    const [currentSelection, setCurrentSelection] = useState<string[]>(selectedCategories);

    useEffect(() => {
        if (isOpen) {
            setCurrentSelection(selectedCategories);
        }
    }, [selectedCategories, isOpen]);

    if (!isOpen) return null;

    const handleToggle = (category: string) => {
        setCurrentSelection(prev => 
            prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
        );
    };

    const handleSave = () => {
        onSave(currentSelection);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Выберите категории ВУ</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><XIcon className="h-6 w-6" /></button>
                </div>
                <div className="p-4 grid grid-cols-4 gap-4">
                    {ALL_LICENSE_CATEGORIES.map(cat => (
                        <label key={cat} className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={currentSelection.includes(cat)}
                                onChange={() => handleToggle(cat)}
                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700 dark:text-gray-200">{cat}</span>
                        </label>
                    ))}
                </div>
                <div className="flex justify-end p-4 bg-gray-50 dark:bg-gray-700/50 border-t dark:border-gray-700">
                    <button onClick={handleSave} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Сохранить</button>
                </div>
            </div>
        </div>
    );
};

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

const FormTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" rows={3} />
);

const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200" />
);

const generateShortNameClient = (fullName: string): string => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return '';
    const lastName = parts[0];
    const firstNameInitial = parts.length > 1 && parts[1] ? `${parts[1][0]}.` : '';
    const middleNameInitial = parts.length > 2 && parts[2] ? `${parts[2][0]}.` : '';
    return `${lastName} ${firstNameInitial}${middleNameInitial}`.trim();
};

const EmployeeList: React.FC = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [currentItem, setCurrentItem] = useState<Partial<Employee> | null>(null);
    const [initialItem, setInitialItem] = useState<Partial<Employee> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
    const { showToast } = useToast();
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    
    const isDirty = useMemo(() => {
        if (!currentItem || !initialItem) return false;
        return JSON.stringify(currentItem) !== JSON.stringify(initialItem);
    }, [currentItem, initialItem]);

    const medicalInstitutions = useMemo(
      // FIX: Remove mojibake condition
      () => organizations.filter(o =>
        o.group === 'Мед. учреждение'
      ),
      [organizations]
    );

    const COLLAPSED_SECTIONS_KEY = 'employeeList_collapsedSections';
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });

    useEffect(() => {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSections));
    }, [collapsedSections]);

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [employeesData, orgsData] = await Promise.all([getEmployees(), getOrganizations()]);
            setEmployees(employeesData);
            setOrganizations(orgsData);
            setErrors({});
        } catch (e) {
            setErrors({'fetch': 'Не удалось загрузить данные.'});
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const enrichedData = useMemo(() => {
        return employees.map(e => ({
            ...e,
            organizationName: organizations.find(o => o.id === e.organizationId)?.shortName || 'N/A',
            employeeTypeName: EMPLOYEE_TYPE_TRANSLATIONS[e.employeeType],
        }));
    }, [employees, organizations]);
    
    type EnrichedEmployee = (typeof enrichedData)[0];
    type EnrichedEmployeeKey = Extract<keyof EnrichedEmployee, string>;

    const columns: { key: EnrichedEmployeeKey; label: string }[] = [
        { key: 'shortName', label: 'ФИО (сокращ.)' },
        { key: 'personnelNumber', label: 'Таб. номер' },
        { key: 'position', label: 'Должность' },
        { key: 'fuelCardBalance', label: 'Баланс ТК, л'},
        { key: 'organizationName', label: 'Организация' },
        { key: 'status', label: 'Статус' },
    ];
    
    const {
        rows,
        sortColumn,
        sortDirection,
        handleSort,
        filters,
        handleFilterChange,
    } = useTable(enrichedData, columns);

    const handleEdit = (employee: Employee) => {
        const copy = { ...employee };
        setCurrentItem(copy);
        setInitialItem(JSON.parse(JSON.stringify(copy)));
        setErrors({});
    };

    const handleAddNew = () => {
        const newItem: Partial<Employee> = { 
            fullName: '', 
            shortName: '', 
            employeeType: 'driver', 
            position: '',
            status: 'Active', 
            organizationId: null,
            address: '',
            dateOfBirth: '',
            notes: '',
            snils: '',
            personnelNumber: '',
            licenseCategory: '',
            documentNumber: '',
            documentExpiry: '',
            fuelCardNumber: '',
            fuelCardBalance: 0,
            medicalCertificateSeries: '',
            medicalCertificateNumber: '',
            medicalCertificateIssueDate: '',
            medicalCertificateExpiryDate: '',
            medicalInstitutionId: undefined,
            blankBatches: [],
        };
        setCurrentItem(newItem);
        setInitialItem(JSON.parse(JSON.stringify(newItem)));
        setErrors({});
    };

    const handleCancel = useCallback(() => {
        setCurrentItem(null);
        setInitialItem(null);
        setErrors({});
    }, []);

    const handleRequestDelete = (item: Employee) => {
        setEmployeeToDelete(item);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (employeeToDelete === null) return;
        try {
            await deleteEmployee(employeeToDelete.id);
            showToast(`Сотрудник "${employeeToDelete.shortName}" удален.`, 'info');
            fetchData();
        } catch (error) {
            showToast('Не удалось удалить сотрудника.', 'error');
        } finally {
            setIsDeleteModalOpen(false);
            setEmployeeToDelete(null);
        }
    };
    
    const validateForm = (): boolean => {
        if (!currentItem) return false;
        const newErrors: Record<string, string> = {};

        if (!currentItem.fullName?.trim()) {
            newErrors.fullName = 'ФИО обязательно для заполнения';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };


    const handleSave = async () => {
        if (!validateForm()) {
            showToast('Пожалуйста, исправьте ошибки в форме.', 'error');
            return;
        }

        try {
            if ('id' in currentItem! && currentItem.id) {
                await updateEmployee(currentItem as Employee);
            } else {
                await addEmployee(currentItem as Omit<Employee, 'id'>);
            }
            showToast("Изменения сохранены");
            setCurrentItem(null);
            setInitialItem(null);
            fetchData();
        } catch (error) {
            showToast("Не удалось сохранить изменения.", "error");
        }
    };
    
    const handleCategoriesSave = (categories: string[]) => {
        const sortedCategories = categories.sort((a, b) => ALL_LICENSE_CATEGORIES.indexOf(a) - ALL_LICENSE_CATEGORIES.indexOf(b));
        setCurrentItem(prev => prev ? { ...prev, licenseCategory: sortedCategories.join(', ') } : null);
        setIsCategoryModalOpen(false);
    };
    
    const formatSnils = (value: string): string => {
        const digits = value.replace(/\D/g, '').slice(0, 11);
        if (digits.length > 9) {
          return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)} ${digits.slice(9,11)}`;
        } else if (digits.length > 6) {
          return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}`;
        } else if (digits.length > 3) {
          return `${digits.slice(0,3)}-${digits.slice(3,6)}`;
        }
        return digits;
    };

    const formatFuelCard = (value: string): string => {
        const digits = value.replace(/\D/g, '').slice(0, 16);
        return digits.replace(/(\d{4})/g, '$1 ').trim();
    };

    const handleFormChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        setCurrentItem(prev => {
            if (!prev) return null;

            let parsedValue: any = value;
            if (type === 'number') {
                parsedValue = value === '' ? undefined : Number(value);
            }

            let updated = { ...prev, [name]: parsedValue };

            if (name === 'organizationId' && value === '') {
                updated.organizationId = null;
            }
            
            if (name === 'fullName') {
                updated.shortName = generateShortNameClient(value);
            }
            
            if (name === 'snils') {
                updated.snils = formatSnils(value);
            }
            
            if (name === 'fuelCardNumber') {
                updated.fuelCardNumber = formatFuelCard(value);
            }

            return updated;
        });
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    }, [errors]);
    
    const sortedCategoriesText = useMemo(() => {
        if (!currentItem?.licenseCategory) return 'Выбрать категории...';
        return currentItem.licenseCategory
            .split(',')
            .map(c => c.trim())
            .filter(Boolean)
            .sort((a, b) => ALL_LICENSE_CATEGORIES.indexOf(a) - ALL_LICENSE_CATEGORIES.indexOf(b))
            .join(', ');
    }, [currentItem?.licenseCategory]);

    return (
        <>
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Подтвердить удаление"
                message={`Вы уверены, что хотите удалить сотрудника "${employeeToDelete?.shortName}"?`}
                confirmText="Удалить"
                confirmButtonClass="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            />
            <LicenseCategoryModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                selectedCategories={currentItem?.licenseCategory?.split(',').map(c => c.trim()).filter(Boolean) || []}
                onSave={handleCategoriesSave}
            />
            <Modal
                isOpen={!!currentItem}
                onClose={handleCancel}
                isDirty={isDirty}
                title={currentItem?.id ? `Редактирование: ${currentItem.fullName}` : 'Добавить нового сотрудника'}
                footer={
                     <>
                        <button onClick={handleCancel} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-6 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Отмена</button>
                        <button onClick={handleSave} className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700">Сохранить</button>
                    </>
                }
            >
                {currentItem && (
                    <div className="space-y-6">
                        <CollapsibleSection title="Основная информация" isCollapsed={collapsedSections.basic || false} onToggle={() => toggleSection('basic')}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <FormField label="ФИО" error={errors.fullName}><FormInput name="fullName" value={currentItem.fullName || ''} onChange={handleFormChange} /></FormField>
                                <FormField label="Сокращенное ФИО"><FormInput name="shortName" value={currentItem.shortName || ''} readOnly className="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md p-2 text-gray-500 dark:text-gray-400" /></FormField>
                                <FormField label="Табельный номер"><FormInput name="personnelNumber" value={currentItem.personnelNumber || ''} onChange={handleFormChange} /></FormField>
                                <FormField label="Дата рождения"><FormInput name="dateOfBirth" type="date" value={currentItem.dateOfBirth || ''} onChange={handleFormChange} /></FormField>
                                <FormField label="Тип сотрудника">
                                    <FormSelect name="employeeType" value={currentItem.employeeType || 'driver'} onChange={handleFormChange}>
                                        {(Object.keys(EMPLOYEE_TYPE_TRANSLATIONS) as EmployeeType[]).map(type => 
                                            <option key={type} value={type}>{EMPLOYEE_TYPE_TRANSLATIONS[type]}</option>
                                        )}
                                    </FormSelect>
                                </FormField>
                                <FormField label="Должность"><FormInput name="position" value={currentItem.position || ''} onChange={handleFormChange} /></FormField>
                                <FormField label="Организация">
                                    <FormSelect name="organizationId" value={currentItem.organizationId || ''} onChange={handleFormChange}>
                                        <option value="">Выберите организацию</option>
                                        {organizations.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}
                                    </FormSelect>
                                </FormField>
                                <FormField label="Статус">
                                    <FormSelect name="status" value={currentItem.status || 'Active'} onChange={handleFormChange}>
                                        <option value="Active">Активен</option>
                                        <option value="Inactive">Неактивен</option>
                                    </FormSelect>
                                </FormField>
                                <FormField label="Телефон"><FormInput name="phone" value={currentItem.phone || ''} onChange={handleFormChange} /></FormField>
                                <FormField label="СНИЛС"><FormInput name="snils" value={currentItem.snils || ''} onChange={handleFormChange} placeholder="XXX-XXX-XXX XX" /></FormField>
                                <div className="md:col-span-3">
                                    <FormField label="Адрес места жительства"><FormInput name="address" value={currentItem.address || ''} onChange={handleFormChange} /></FormField>
                                </div>
                            </div>
                        </CollapsibleSection>

                        {currentItem.employeeType === 'driver' && (
                            <>
                                <CollapsibleSection title="Ответственные лица и Мед. учреждение" isCollapsed={collapsedSections.staff || false} onToggle={() => toggleSection('staff')}>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <FormField label="Закрепленный диспетчер">
                                            <FormSelect name="dispatcherId" value={currentItem.dispatcherId || ''} onChange={handleFormChange}>
                                                <option value="">Не назначен</option>
                                                {employees.map(d => <option key={d.id} value={d.id}>{d.shortName}</option>)}
                                            </FormSelect>
                                        </FormField>
                                        <FormField label="Закрепленный контролер">
                                             <FormSelect name="controllerId" value={currentItem.controllerId || ''} onChange={handleFormChange}>
                                                <option value="">Не назначен</option>
                                                {employees.map(c => <option key={c.id} value={c.id}>{c.shortName}</option>)}
                                            </FormSelect>
                                        </FormField>
                                        <FormField label="Закрепленное мед. учреждение">
                                            <FormSelect name="medicalInstitutionId" value={currentItem.medicalInstitutionId || ''} onChange={handleFormChange}>
                                                <option value="">Не назначено</option>
                                                {medicalInstitutions.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}
                                            </FormSelect>
                                        </FormField>
                                    </div>
                                </CollapsibleSection>
                                <CollapsibleSection title="Данные водителя" isCollapsed={collapsedSections.driver || false} onToggle={() => toggleSection('driver')}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <FormField label="Категория ВУ">
                                            <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="w-full text-left bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 truncate">
                                                {sortedCategoriesText}
                                            </button>
                                        </FormField>
                                        <FormField label="Номер ВУ"><FormInput name="documentNumber" value={currentItem.documentNumber || ''} onChange={handleFormChange} placeholder="XX XX XXXXXX" /></FormField>
                                        <FormField label="ВУ до"><FormInput name="documentExpiry" type="date" value={currentItem.documentExpiry || ''} onChange={handleFormChange} /></FormField>
                                        <FormField label="Топливная карта"><FormInput name="fuelCardNumber" value={currentItem.fuelCardNumber || ''} onChange={handleFormChange} placeholder="XXXX XXXX XXXX XXXX" /></FormField>
                                        <FormField label="Баланс ТК, л"><FormInput name="fuelCardBalance" type="number" step="0.01" value={currentItem.fuelCardBalance || ''} onChange={handleFormChange} /></FormField>
                                    </div>
                                </CollapsibleSection>
                                <CollapsibleSection title="Медицинская справка" isCollapsed={collapsedSections.medical || false} onToggle={() => toggleSection('medical')}>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        <FormField label="Серия"><FormInput name="medicalCertificateSeries" value={currentItem.medicalCertificateSeries || ''} onChange={handleFormChange} /></FormField>
                                        <FormField label="Номер"><FormInput name="medicalCertificateNumber" value={currentItem.medicalCertificateNumber || ''} onChange={handleFormChange} /></FormField>
                                        <FormField label="Дата выдачи"><FormInput name="medicalCertificateIssueDate" type="date" value={currentItem.medicalCertificateIssueDate || ''} onChange={handleFormChange} /></FormField>
                                        <FormField label="Срок действия"><FormInput name="medicalCertificateExpiryDate" type="date" value={currentItem.medicalCertificateExpiryDate || ''} onChange={handleFormChange} /></FormField>
                                    </div>
                                </CollapsibleSection>
                            </>
                        )}
                        <CollapsibleSection title="Примечание" isCollapsed={collapsedSections.notes || false} onToggle={() => toggleSection('notes')}>
                            <FormField label="Примечание/комментарии">
                                <FormTextarea name="notes" value={currentItem.notes || ''} onChange={handleFormChange} placeholder="Особые отметки, квалификации..." />
                            </FormField>
                        </CollapsibleSection>
                    </div>
                )}
            </Modal>
            
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Справочник: Сотрудники</h3>
                    <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                        <PlusIcon className="h-5 w-5" />
                        Добавить сотрудника
                    </button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                                {columns.map(col => (
                                    <th key={col.key} scope="col" className="px-6 py-3 cursor-pointer" onClick={() => handleSort(col.key)}>
                                        <div className="flex items-center gap-1">
                                            {col.label}
                                            {sortColumn === col.key && (sortDirection === 'asc' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />)}
                                        </div>
                                    </th>
                                ))}
                                <th scope="col" className="px-6 py-3 text-center">Действия</th>
                            </tr>
                            <tr>
                                {columns.map(col => (
                                    <th key={`${col.key}-filter`} className="px-2 py-1">
                                        <input
                                            type="text"
                                            value={filters[col.key] || ''}
                                            onChange={e => handleFilterChange(col.key, e.target.value)}
                                            placeholder={`Поиск...`}
                                            className="w-full text-xs p-1 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded"
                                        />
                                    </th>
                                ))}
                                 <th className="px-2 py-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={columns.length + 1} className="text-center p-4">Загрузка...</td></tr>
                            ) : errors.fetch ? (
                                <tr><td colSpan={columns.length + 1} className="text-center p-4 text-red-500">{errors.fetch}</td></tr>
                            ) : rows.map(e => (
                                <tr key={e.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white" title={e.fullName}>{e.shortName}</td>
                                    <td className="px-6 py-4">{e.personnelNumber || '—'}</td>
                                    <td className="px-6 py-4">{e.position || '—'}</td>
                                    <td className="px-6 py-4 font-mono">{e.fuelCardBalance?.toFixed(2) ?? '0.00'}</td>
                                    <td className="px-6 py-4">{e.organizationName}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${e.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                                            {e.status === 'Active' ? 'Активен' : 'Неактивен'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button onClick={() => handleEdit(e)} className="p-2 text-blue-500 transition-all duration-200 transform hover:scale-110 hover:shadow-lg hover:shadow-blue-500/40">
                                            <PencilIcon className="h-5 w-5 pointer-events-none" />
                                        </button>
                                        <button onClick={() => handleRequestDelete(e)} className="p-2 text-red-500 transition-all duration-200 transform hover:scale-110 hover:shadow-lg hover:shadow-red-500/40">
                                            <TrashIcon className="h-5 w-5 pointer-events-none" />
                                        </button>
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

export default EmployeeList;