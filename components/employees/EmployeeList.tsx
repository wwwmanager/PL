import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Employee, Organization, EmployeeType, EMPLOYEE_TYPE_TRANSLATIONS, WaybillBlank } from '../../types';
import { getEmployees, addEmployee, updateEmployee, deleteEmployee, getOrganizations, getBlanks, resetFuelCardBalance } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon, XIcon, ArrowUturnLeftIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../services/auth';
import CollapsibleSection from '../shared/CollapsibleSection';
import { SPOIL_REASON_TRANSLATIONS } from '../../constants';
import { DataTable, Column } from '../shared/DataTable';

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
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[70] flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md relative">
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
    <input {...props} className={`w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200 ${props.className || ''}`} />
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

interface BlankRange {
    key: string;
    series: string;
    start: number;
    end: number;
    count: number;
}

const groupBlanks = (blanks: WaybillBlank[]): BlankRange[] => {
    if (blanks.length === 0) return [];
    
    // Сортировка: Серия -> Номер
    const sorted = [...blanks].sort((a, b) => {
        if (a.series !== b.series) return a.series.localeCompare(b.series);
        return a.number - b.number;
    });

    const ranges: BlankRange[] = [];
    let current: BlankRange | null = null;

    for (const b of sorted) {
        if (!current) {
            current = { key: b.id, series: b.series, start: b.number, end: b.number, count: 1 };
        } else {
            if (b.series === current.series && b.number === current.end + 1) {
                current.end = b.number;
                current.count++;
            } else {
                ranges.push(current);
                current = { key: b.id, series: b.series, start: b.number, end: b.number, count: 1 };
            }
        }
    }
    if (current) ranges.push(current);
    return ranges;
};

const EmployeeList: React.FC = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [blanks, setBlanks] = useState<WaybillBlank[]>([]);
    const [currentItem, setCurrentItem] = useState<Partial<Employee> | null>(null);
    const [initialItem, setInitialItem] = useState<Partial<Employee> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
    
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [employeeToReset, setEmployeeToReset] = useState<Employee | null>(null);

    const { showToast } = useToast();
    const { currentUser } = useAuth();
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    
    const isDirty = useMemo(() => {
        if (!currentItem || !initialItem) return false;
        return JSON.stringify(currentItem) !== JSON.stringify(initialItem);
    }, [currentItem, initialItem]);

    const medicalInstitutions = useMemo(
      () => organizations.filter(o => o.group === 'Мед. учреждение'),
      [organizations]
    );

    const COLLAPSED_SECTIONS_KEY = 'employeeList_collapsedSections';
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
            return saved ? JSON.parse(saved) : { blanks: false }; // Default open state for blanks if not saved
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
            const [employeesData, orgsData, blanksData] = await Promise.all([getEmployees(), getOrganizations(), getBlanks()]);
            setEmployees(employeesData);
            setOrganizations(orgsData);
            setBlanks(blanksData);
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

    // Подготовка данных по бланкам для текущего водителя
    const driverBlanks = useMemo(() => {
        if (!currentItem || !currentItem.id) return { issued: [], spoiled: [] };
        
        const myBlanks = blanks.filter(b => b.ownerEmployeeId === currentItem.id);
        
        const issued = myBlanks.filter(b => b.status === 'issued');
        const spoiled = myBlanks.filter(b => b.status === 'spoiled');

        return {
            issued: groupBlanks(issued),
            spoiled: spoiled.sort((a,b) => new Date(b.spoiledAt || '').getTime() - new Date(a.spoiledAt || '').getTime()),
        };
    }, [currentItem, blanks]);


    const enrichedData = useMemo(() => {
        return employees.map(e => ({
            ...e,
            organizationName: organizations.find(o => o.id === e.organizationId)?.shortName || 'N/A',
            employeeTypeName: EMPLOYEE_TYPE_TRANSLATIONS[e.employeeType],
        }));
    }, [employees, organizations]);
    
    type EnrichedEmployee = (typeof enrichedData)[0];

    const columns: Column<EnrichedEmployee>[] = [
        { key: 'shortName', label: 'ФИО (сокращ.)', sortable: true },
        { key: 'personnelNumber', label: 'Таб. номер', sortable: true, render: (e) => e.personnelNumber || '—' },
        { key: 'position', label: 'Должность', sortable: true, render: (e) => e.position || '—' },
        { key: 'fuelCardBalance', label: 'Баланс ТК, л', sortable: true, render: (e) => <span className="font-mono">{e.fuelCardBalance?.toFixed(2) ?? '0.00'}</span> },
        { key: 'organizationName', label: 'Организация', sortable: true },
        { 
            key: 'status', 
            label: 'Статус', 
            sortable: true,
            render: (e) => (
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${e.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                    {e.status === 'Active' ? 'Активен' : 'Неактивен'}
                </span>
            )
        },
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
        const ownOrg = organizations.find(o => o.isOwn);
        const newItem: Partial<Employee> = { 
            fullName: '', 
            shortName: '', 
            employeeType: 'driver', 
            position: '',
            status: 'Active', 
            organizationId: ownOrg ? ownOrg.id : null,
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

    const handleRequestReset = (item: Employee) => {
        setEmployeeToReset(item);
        setIsResetModalOpen(true);
    };

    const handleConfirmReset = async () => {
        if (!employeeToReset) return;
        try {
            await resetFuelCardBalance(employeeToReset.id, { userId: currentUser?.id });
            showToast(`Баланс топливной карты сотрудника "${employeeToReset.shortName}" обнулен.`, 'success');
            
            if (currentItem && currentItem.id === employeeToReset.id) {
                setCurrentItem(prev => prev ? ({ ...prev, fuelCardBalance: 0 }) : null);
            }

            fetchData();
        } catch (error) {
            showToast('Не удалось обнулить баланс.', 'error');
        } finally {
            setIsResetModalOpen(false);
            setEmployeeToReset(null);
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
        <div className="space-y-4">
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Подтвердить удаление"
                message={`Вы уверены, что хотите удалить сотрудника "${employeeToDelete?.shortName}"?`}
                confirmText="Удалить"
                confirmButtonClass="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            />
            <ConfirmationModal
                isOpen={isResetModalOpen}
                onClose={() => setIsResetModalOpen(false)}
                onConfirm={handleConfirmReset}
                title="Обнулить топливную карту?"
                message={`Вы уверены, что хотите принудительно обнулить баланс карты для сотрудника "${employeeToReset?.shortName}"? Текущий баланс: ${employeeToReset?.fuelCardBalance} л. Это действие создаст запись в журнале аудита.`}
                confirmText="Обнулить"
                confirmButtonClass="bg-orange-600 hover:bg-orange-700 focus:ring-orange-500"
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
                                        <FormField label="Баланс ТК, л">
                                            <div className="flex items-center gap-2">
                                                <FormInput name="fuelCardBalance" type="number" step="0.01" value={currentItem.fuelCardBalance || ''} onChange={handleFormChange} className="flex-grow" />
                                                <div className="flex flex-col">
                                                    {currentItem.id && (currentItem.fuelCardBalance || 0) !== 0 && (
                                                        <button 
                                                            type="button" 
                                                            onClick={() => handleRequestReset(currentItem as Employee)} 
                                                            className="p-2 text-orange-500 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-orange-100 dark:hover:bg-gray-600 transition-colors border border-gray-300 dark:border-gray-500"
                                                            title="Обнулить карту"
                                                        >
                                                            <ArrowUturnLeftIcon className="h-5 w-5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </FormField>
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
                                <CollapsibleSection title="Бланки строгой отчетности" isCollapsed={collapsedSections.blanks || false} onToggle={() => toggleSection('blanks')}>
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Активные (на руках)</h4>
                                            {driverBlanks.issued.length === 0 ? (
                                                <p className="text-sm text-gray-500 italic">Нет выданных бланков</p>
                                            ) : (
                                                <table className="w-full text-sm text-left text-gray-600 dark:text-gray-400 border dark:border-gray-700 rounded-md overflow-hidden">
                                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-300">
                                                        <tr>
                                                            <th className="px-4 py-2">Серия</th>
                                                            <th className="px-4 py-2">Диапазон номеров</th>
                                                            <th className="px-4 py-2 text-right">Кол-во</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {driverBlanks.issued.map((range) => (
                                                            <tr key={range.key} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                                                                <td className="px-4 py-2 font-medium">{range.series}</td>
                                                                <td className="px-4 py-2">{String(range.start).padStart(6, '0')} — {String(range.end).padStart(6, '0')}</td>
                                                                <td className="px-4 py-2 text-right font-bold">{range.count}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                        
                                        {driverBlanks.spoiled.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Списанные / Испорченные</h4>
                                                <div className="max-h-40 overflow-y-auto border dark:border-gray-700 rounded-md">
                                                    <table className="w-full text-sm text-left text-gray-600 dark:text-gray-400">
                                                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-300 sticky top-0">
                                                            <tr>
                                                                <th className="px-4 py-2">Бланк</th>
                                                                <th className="px-4 py-2">Причина</th>
                                                                <th className="px-4 py-2">Дата</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {driverBlanks.spoiled.map((b) => (
                                                                <tr key={b.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                                                                    <td className="px-4 py-2 font-medium">{b.series} {String(b.number).padStart(6, '0')}</td>
                                                                    <td className="px-4 py-2">{b.spoilReasonCode ? SPOIL_REASON_TRANSLATIONS[b.spoilReasonCode] : '—'} {b.spoilReasonNote && `(${b.spoilReasonNote})`}</td>
                                                                    <td className="px-4 py-2">{b.spoiledAt ? new Date(b.spoiledAt).toLocaleDateString() : '-'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
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
            
            {/* Header Section */}
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Сотрудники</h3>
                <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition-all active:scale-95">
                    <PlusIcon className="h-5 w-5" />
                    Добавить
                </button>
            </div>
            
            <DataTable
                data={rows}
                columns={columns}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                tableId="employees-list"
                filters={filters}
                onFilterChange={handleFilterChange}
                isLoading={isLoading}
                actions={[
                    {
                        icon: <PencilIcon className="h-4 w-4" />,
                        onClick: (e) => handleEdit(e),
                        title: "Редактировать",
                        className: "text-blue-500"
                    },
                    {
                        icon: <ArrowUturnLeftIcon className="h-4 w-4" />,
                        onClick: (e) => handleRequestReset(e),
                        title: "Обнулить карту",
                        show: (e) => e.employeeType === 'driver' && (e.fuelCardBalance || 0) !== 0,
                        className: "text-orange-500"
                    },
                    {
                        icon: <TrashIcon className="h-4 w-4" />,
                        onClick: (e) => handleRequestDelete(e),
                        title: "Удалить",
                        className: "text-red-500"
                    }
                ]}
            />
        </div>
    );
};

export default EmployeeList;