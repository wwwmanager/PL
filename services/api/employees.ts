
import { Employee } from '../../types';
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { auditBusiness } from '../auditBusiness';

const employeeRepo = createRepo<Employee>(DB_KEYS.EMPLOYEES);

export const getEmployees = async () => (await employeeRepo.list({ pageSize: 1000 })).data;
export const addEmployee = (item: Omit<Employee, 'id'>) => employeeRepo.create(item);
export const updateEmployee = (item: Employee) => employeeRepo.update(item.id, item);
export const deleteEmployee = (id: string) => employeeRepo.remove(id);

export const adjustFuelCardBalance = async (employeeId: string, amountDelta: number) => {
    const emp = await employeeRepo.getById(employeeId);
    if (emp) {
        emp.fuelCardBalance = (emp.fuelCardBalance || 0) + amountDelta;
        await employeeRepo.update(emp.id, emp);
    }
};

export const resetFuelCardBalance = async (employeeId: string, context: any) => {
    const emp = await employeeRepo.getById(employeeId);
    if (emp) {
        const oldBalance = emp.fuelCardBalance || 0;
        if (oldBalance === 0) return; // Ничего не делаем, если уже 0

        emp.fuelCardBalance = 0;
        await employeeRepo.update(emp.id, emp);
        
        await auditBusiness('employee.fuelReset', { 
            employeeId, 
            oldBalance, 
            actorId: context?.userId 
        });
    }
};
