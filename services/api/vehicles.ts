
import { Vehicle, Employee } from '../../types';
import { createRepo, ListQuery } from '../repo';
import { DB_KEYS } from '../dbKeys';

const vehicleRepo = createRepo<Vehicle>(DB_KEYS.VEHICLES);
const employeeRepo = createRepo<Employee>(DB_KEYS.EMPLOYEES);

export const getVehicles = async () => (await vehicleRepo.list({ pageSize: 1000 })).data;
export const fetchVehicles = async (q: ListQuery) => vehicleRepo.list(q);
export const addVehicle = (item: Omit<Vehicle, 'id'>) => vehicleRepo.create(item);
export const updateVehicle = (item: Vehicle) => vehicleRepo.update(item.id, item);
export const deleteVehicle = (id: string) => vehicleRepo.remove(id);

export const getIssues = async (params: { vehicleId?: string }) => {
    const vehicles = (await vehicleRepo.list({ pageSize: 1000 })).data;
    const employees = (await employeeRepo.list({ pageSize: 1000 })).data;

    const targets = params.vehicleId ? vehicles.filter(v => v.id === params.vehicleId) : vehicles;
    
    const expiringDocs: Array<{ type: string; name: string; date: string }> = [];
    const now = new Date();
    const warningThreshold = new Date();
    warningThreshold.setDate(now.getDate() + 30); // Предупреждать за 30 дней

    // 1. Проверка ТС
    for (const v of targets) {
        if (v.status !== 'Active') continue;

        // Check OSAGO
        if (v.osagoEndDate) {
            const date = new Date(v.osagoEndDate);
            if (date <= warningThreshold) {
                expiringDocs.push({
                    type: 'ОСАГО',
                    name: `${v.plateNumber} (${v.brand})`,
                    date: v.osagoEndDate
                });
            }
        }

        // Check Diagnostic Card
        if (v.diagnosticCardExpiryDate) {
            const date = new Date(v.diagnosticCardExpiryDate);
            if (date <= warningThreshold) {
                expiringDocs.push({
                    type: 'Диагностическая карта',
                    name: `${v.plateNumber} (${v.brand})`,
                    date: v.diagnosticCardExpiryDate
                });
            }
        }

        // Check Maintenance
        if (v.maintenanceIntervalKm && v.lastMaintenanceMileage !== undefined && v.lastMaintenanceMileage !== null) {
            const nextService = v.lastMaintenanceMileage + v.maintenanceIntervalKm;
            const remaining = nextService - v.mileage;
            if (remaining <= 1000) {
                expiringDocs.push({
                    type: 'Тех. обслуживание',
                    name: `${v.plateNumber} (${v.brand}): ${remaining < 0 ? `Просрочено на ${Math.abs(remaining)} км` : `Осталось ${remaining} км`}`,
                    date: new Date().toISOString()
                });
            }
        }
    }

    // 2. Проверка водителей (ВУ и Медсправки)
    let targetDrivers = employees.filter(e => e.status === 'Active' && e.employeeType === 'driver');

    // Если выбран конкретный автомобиль, проверяем только закрепленного водителя
    if (params.vehicleId) {
        const vehicle = vehicles.find(v => v.id === params.vehicleId);
        if (vehicle && vehicle.assignedDriverId) {
            targetDrivers = targetDrivers.filter(d => d.id === vehicle.assignedDriverId);
        } else {
            // Если у машины нет закрепленного водителя, водителей не проверяем
            targetDrivers = []; 
        }
    }

    for (const d of targetDrivers) {
        // Водительское удостоверение
        if (d.documentExpiry) {
            const date = new Date(d.documentExpiry);
            if (date <= warningThreshold) {
                expiringDocs.push({
                    type: 'Водительское удостоверение',
                    name: d.shortName,
                    date: d.documentExpiry
                });
            }
        }

        // Медицинская справка
        if (d.medicalCertificateExpiryDate) {
            const date = new Date(d.medicalCertificateExpiryDate);
            if (date <= warningThreshold) {
                expiringDocs.push({
                    type: 'Медицинская справка',
                    name: d.shortName,
                    date: d.medicalCertificateExpiryDate
                });
            }
        }
    }

    return { expiringDocs };
};
