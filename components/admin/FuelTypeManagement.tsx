import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FuelType } from '../../types';
import { getFuelTypes, addFuelType, updateFuelType, deleteFuelType } from '../../services/mockApi';
import { PencilIcon, TrashIcon, PlusIcon, ArrowUpIcon, ArrowDownIcon } from '../Icons';
import useTable from '../../hooks/useTable';
import Modal from '../shared/Modal';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useToast } from '../../hooks/useToast';

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

  const hasId = (item: Partial<FuelType>): item is FuelType => typeof (item as any).id === 'string';

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

    // Уникальность кода
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
    <>
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Подтвердить удаление"
        message={`Вы уверены, что хотите удалить тип топлива "${fuelTypeToDelete?.name}"? Это действие нельзя будет отменить.`}
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

      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Справочник: Типы топлива</h3>
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Добавить
          </button>
        </div>

        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              {columns.map(col => (
                <th key={String(col.key)} scope="col" className="px-6 py-3">
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 cursor-pointer"
                    aria-label={`Сортировать по: ${col.label}`}
                  >
                    {col.label}
                    {sortColumn === col.key &&
                      (sortDirection === 'asc' ? (
                        <ArrowUpIcon className="h-4 w-4" />
                      ) : (
                        <ArrowDownIcon className="h-4 w-4" />
                      ))}
                  </button>
                </th>
              ))}
              <th scope="col" className="px-6 py-3 text-center">
                Действия
              </th>
            </tr>
            <tr>
              {columns.map(col => (
                <th key={`${String(col.key)}-filter`} className="px-2 py-1">
                  <input
                    type="text"
                    value={filters[col.key as string] || ''}
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
              <tr>
                <td colSpan={columns.length + 1} className="text-center p-4">
                  Загрузка...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length + 1} className="text-center p-4 text-red-500">
                  {error}
                </td>
              </tr>
            ) : (
              rows.map(ft => (
                <tr key={ft.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{ft.name}</td>
                  <td className="px-6 py-4">{ft.code}</td>
                  <td className="px-6 py-4">{typeof ft.density === 'number' ? ft.density.toFixed(3) : ''}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleEdit(ft)}
                      className="p-2 text-blue-500 transition-all duration-200 transform hover:scale-110 hover:shadow-lg hover:shadow-blue-500/40"
                      aria-label={`Редактировать ${ft.name}`}
                    >
                      <PencilIcon className="h-5 w-5 pointer-events-none" />
                    </button>
                    <button
                      onClick={() => handleRequestDelete(ft)}
                      className="p-2 text-red-500 transition-all duration-200 transform hover:scale-110 hover:shadow-lg hover:shadow-red-500/40"
                      aria-label={`Удалить ${ft.name}`}
                    >
                      <TrashIcon className="h-5 w-5 pointer-events-none" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default FuelTypeManagement;