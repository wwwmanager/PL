
import React from 'react';
import { Waybill, Organization, Vehicle, Employee, WaybillStatus } from '../../../types';

interface WaybillGeneralInfoProps {
  formData: Omit<Waybill, 'id'> | Waybill;
  vehicles: Vehicle[];
  drivers: Employee[];
  dispatchers: Employee[];
  controllers: Employee[];
  organizations: Organization[];
  canEdit: boolean;
  isPrefill: boolean;
  autoFillMessage?: string;
  fuelCardBalance: number | null;
  dayMode: 'single' | 'multi';
  minDate: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onVehicleChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onDayModeChange: (mode: 'single' | 'multi') => void;
}

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
  </div>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className={`w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200 read-only:bg-gray-200 dark:read-only:bg-gray-800 dark:[color-scheme:dark] disabled:opacity-50 disabled:cursor-not-allowed ${props.className || ''}`} />
);
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed" />
);

export const WaybillGeneralInfo: React.FC<WaybillGeneralInfoProps> = ({
  formData,
  vehicles,
  drivers,
  dispatchers,
  controllers,
  organizations,
  canEdit,
  autoFillMessage,
  fuelCardBalance,
  dayMode,
  minDate,
  onChange,
  onVehicleChange,
  onDayModeChange
}) => {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FormField label="Организация">
            <FormSelect name="organizationId" value={formData.organizationId} onChange={onChange} disabled={!canEdit}>
              <option value="">Выберите</option>
              {organizations.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Номер ПЛ">
            <FormInput type="text" name="number" value={formData.number} placeholder="Автоматически" readOnly />
          </FormField>
          
          <div className="flex items-end pb-2">
             <div className="flex items-center gap-3 bg-white dark:bg-gray-700 px-4 py-2 rounded-lg border dark:border-gray-600 shadow-sm w-full justify-between">
                <span className={`text-sm font-medium transition-colors ${dayMode === 'single' ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                    Однодневный
                </span>
                <label htmlFor="dayModeToggle" className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        id="dayModeToggle"
                        className="sr-only peer"
                        checked={dayMode === 'multi'}
                        onChange={(e) => onDayModeChange(e.target.checked ? 'multi' : 'single')}
                        disabled={!canEdit}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
                </label>
                <span className={`text-sm font-medium transition-colors ${dayMode === 'multi' ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                    Многодневный
                </span>
            </div>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
           <FormField label="Дата ПЛ"><FormInput type="date" name="date" value={formData.date} readOnly className="!bg-gray-200 dark:!bg-gray-800" /></FormField>
            <FormField label="Действителен с">
              <FormInput
                type="datetime-local"
                name="validFrom"
                value={formData.validFrom}
                min={minDate ? `${minDate}T00:00` : undefined}
                onChange={onChange}
                disabled={!canEdit}
              />
          </FormField>
           <FormField label="Действителен по">
              <FormInput
                type={dayMode === 'single' ? 'time' : 'datetime-local'}
                name="validTo"
                value={dayMode === 'single' ? formData.validTo.split('T')[1] : formData.validTo}
                onChange={(e) => {
                  if (dayMode === 'single') {
                    // Manual handling for time input in single day mode is tricky here, 
                    // better handled by parent or specialized handler passed down.
                    // But for now we simulate event-like object for parent handler
                    const datePart = formData.validFrom.split('T')[0];
                    onChange({ target: { name: 'validTo', value: `${datePart}T${e.target.value}` } } as any);
                  } else {
                    onChange(e);
                  }
                }}
                min={dayMode === 'multi' ? formData.validFrom : undefined}
                disabled={!canEdit}
              />
          </FormField>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField label="Транспортное средство">
              <FormSelect name="vehicleId" value={formData.vehicleId} onChange={onVehicleChange} disabled={!canEdit}>
                  <option value="">Выберите ТС</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand})</option>)}
              </FormSelect>
               {autoFillMessage && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{autoFillMessage}</p>}
          </FormField>
          <FormField label="Водитель">
              <FormSelect name="driverId" value={formData.driverId} onChange={onChange} disabled={!canEdit}>
                  <option value="">Выберите водителя</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
              </FormSelect>
              {fuelCardBalance != null && (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Доступно на карте (на {new Date(formData.date).toLocaleDateString()}): <b>{fuelCardBalance.toFixed(2)} л</b>
                  </div>
              )}
          </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <FormField label="Выезд разрешил (Диспетчер)">
              <FormSelect name="dispatcherId" value={formData.dispatcherId} onChange={onChange} disabled={!canEdit}>
                  <option value="">Выберите</option>
                  {dispatchers.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </FormSelect>
          </FormField>
           <FormField label="Расчет произвел (Контролер/Бухгалтер)">
              <FormSelect name="controllerId" value={formData.controllerId || ''} onChange={onChange} disabled={!canEdit}>
                  <option value="">Выберите</option>
                  {controllers.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </FormSelect>
          </FormField>
      </div>
    </>
  );
};
