import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FuelType } from '../../types';
import { getFuelTypes, addFuelType, updateFuelType, deleteFuelType } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';
import { DataTable } from '../shared/DataTable';

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
  </div>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200"
  />
);

const FuelTypeManagement = () => {
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [currentItem, setCurrentItem] = useState<Partial<FuelType> | null>(null);
  const [initialItem, setInitialItem] = useState<Partial<FuelType> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [fuelTypeToDelete, setFuelTypeToDelete] = useState<FuelType | null>(null);
  const { showToast } = useToast();

  const isDirty = useMemo(() => {
    if (!currentItem || !initialItem) return false;
    return JSON.stringify(currentItem) !== JSON.stringify(initialItem);
  }, [currentItem, initialItem]);

  const columns: { key: keyof FuelType; label: string }[] = [
    { key: 'name', label: 'Название' },
    { key: 'code', label: 'Код' },
    { key: 'density', label: 'Плотность' },
  ];

  const { rows, sortColumn, sortDirection, handleSort, filters, handleFilterChange } = useTable(fuelTypes, columns);

  const fetchFuelTypes = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getFuelTypes();
      setFuelTypes(data);
      setError('');
    } catch {
      setError('Не удалось загрузить справочник.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFuelTypes();
  }, [fetchFuelTypes]);

  const handleEdit = (fuelType: FuelType) => {
    const copy = { ...fuelType };
    setCurrentItem(copy);
    setInitialItem(JSON.parse(JSON.stringify(copy)));
  };

  const handleAddNew = () => {
    const newItem: Partial<FuelType> = { name: '', code: '', density: undefined };
    setCurrentItem(newItem);
    setInitialItem(JSON.parse(JSON.stringify(newItem)));
  };

  const handleCancel = useCallback(() => {
    setCurrentItem(null);
    setInitialItem(null);
  }, []);

  const handleRequestDelete = (item: FuelType) => {
    setFuelTypeToDelete(item);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (fuelTypeToDelete === null) return;
    try {
      await deleteFuelType(fuelTypeToDelete.id);
      showToast(`Тип топлива "${fuelTypeToDelete.name}" удален.`, 'info');
      fetchFuelTypes();
    } catch {
      showToast('Не удалось удалить элемент.', 'error');
    } finally {
      setIsDeleteModalOpen(false);
      setFuelTypeToDelete(null);
    }
  };

  const handleSave = async () => {
    if (!currentItem) return;

    const name = currentItem.name?.trim() ?? '';
    const code = currentItem.code?.trim() ?? '';

    if (!name || !code) {
      showToast('Пожалуйста, заполните все поля.', 'error');
      return;
    }

    if (
      currentItem.density === undefined ||
      Number.isNaN(currentItem.density) ||
      (typeof currentItem.density === 'number' && currentItem.density <= 0)
    ) {
      showToast('Плотность должна быть числом больше 0.', 'error');
      return;
    }

    const codeLower = code.toLowerCase();
    const duplicate = fuelTypes.some(ft => ft.code.toLowerCase() === codeLower && ft.id !== (currentItem as any).id);
    if (duplicate) {
      showToast('Код должен быть уникальным.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if ('id' in currentItem && currentItem.id) {
        await updateFuelType({ ...currentItem, name, code } as FuelType);
      } else {
        await addFuelType({ name, code, density: currentItem.density! });
      }
      showToast('Изменения сохранены', 'success');
      handleCancel();
      fetchFuelTypes();
    } catch {
      showToast('Не удалось сохранить изменения.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;

    if (type === 'number') {
      setCurrentItem(prev =>
        prev ? { ...prev, [name]: value === '' ? undefined : parseFloat(value) } : null
      );
      return;
    }

    setCurrentItem(prev => (prev ? { ...prev, [name]: value } : null));
  }, []);

  return (
    <div className="space-y-4">
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Подтвердить удаление"
        message={`Вы уверены, что хотите удалить тип топлива "${fuelTypeToDelete?.name}"?`}
        confirmText="Удалить"
        confirmButtonClass="bg-red-600 hover:bg-red-700 focus:ring-red-500"
      />

      <Modal
        isOpen={!!currentItem}
        onClose={handleCancel}
        isDirty={isDirty}
        title={currentItem?.id ? `Редактирование: ${initialItem?.name}` : 'Добавить новый тип топлива'}
        footer={
          <>
            <button
              onClick={handleCancel}
              className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </>
        }
      >
        {currentItem && (
          <div className="space-y-4">
            <FormField label="Название">
              <FormInput name="name" value={currentItem.name ?? ''} onChange={handleFormChange} />
            </FormField>
            <FormField label="Код">
              <FormInput name="code" value={currentItem.code ?? ''} onChange={handleFormChange} />
            </FormField>
            <FormField label="Плотность">
              <FormInput
                name="density"
                type="number"
                step="0.001"
                min="0"
                value={currentItem.density ?? ''}
                onChange={handleFormChange}
              />
            </FormField>
          </div>
        )}
      </Modal>

      {/* Header Section */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Типы топлива</h3>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition-all active:scale-95"
        >
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
        filters={filters}
        onFilterChange={handleFilterChange}
        tableId="fuel-types-list"
        isLoading={isLoading}
        actions={[
            {
                icon: <PencilIcon className="h-4 w-4" />,
                onClick: (ft) => handleEdit(ft),
                title: "Редактировать",
                className: "text-gray-500 hover:text-blue-600"
            },
            {
                icon: <TrashIcon className="h-4 w-4" />,
                onClick: (ft) => handleRequestDelete(ft),
                title: "Удалить",
                className: "text-gray-500 hover:text-red-600"
            }
        ]}
      />
    </div>
  );
};

export default FuelTypeManagement;