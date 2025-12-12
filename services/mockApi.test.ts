
// services/mockApi.test.ts
// FIX: Add imports for vitest globals
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
    addEmployee,
    addVehicle,
    createBlankBatch,
    materializeBatch,
    issueBlanksToDriver,
    addWaybill,
    changeWaybillStatus,
    fetchWaybillById,
    getBlanks,
    resetMockApiState,
    isWinterDate,
    getDashboardData
} from './mockApi';
// FIX: Added missing import for OrganizationStatus.
import { Employee, Vehicle, WaybillStatus, BlankStatus, Capability, VehicleStatus, SeasonSettings, Waybill, OrganizationStatus } from '../types';

// Мокируем зависимости, чтобы изолировать mockApi от хранилища и шины событий
vi.mock('./storage', () => ({
  loadJSON: vi.fn((key, fallback) => Promise.resolve(fallback)), // Возвращаем fallback
  saveJSON: vi.fn().mockResolvedValue(undefined),
  removeKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./bus', () => ({
  broadcast: vi.fn(),
}));

vi.mock('./auditBusiness', () => ({
    appendEvent: vi.fn().mockResolvedValue(undefined),
    auditBusiness: vi.fn().mockResolvedValue('mock-audit-id'),
}));


describe('mockApi Business Logic', () => {

  beforeEach(() => {
    // Сбрасываем состояние in-memory базы перед каждым тестом
    resetMockApiState();
    vi.clearAllMocks();
  });

  // --- Тесты для сложной логики статусов путевого листа ---
  describe('Waybill Status Transitions', () => {
    
    it('should transition from Draft to Posted and update blank status', async () => {
        // 1. Setup: Создаем все необходимые сущности
        const driver = await addEmployee({ fullName: 'Тест Водитель', shortName: 'Тест В.', employeeType: 'driver', organizationId: 'org-test', status: 'Active' });
        const batch = await createBlankBatch({ organizationId: 'org-test', series: 'AA', startNumber: 1, endNumber: 1 });
        await materializeBatch(batch.id); 
        const blanksBefore = await getBlanks();
        const blankToIssue = blanksBefore.find(b => b.series === 'AA' && b.number === 1);
        
        await issueBlanksToDriver({ batchId: batch.id, ownerEmployeeId: driver.id, ranges: [{ from: 1, to: 1 }] }, { actorId: 'admin', deviceId: 'test' });
        
        const waybill = await addWaybill({
            number: 'AA000001', blankId: blankToIssue!.id, blankSeries: 'AA', blankNumber: 1,
            date: '2024-01-01', vehicleId: 'veh-1', driverId: driver.id, status: WaybillStatus.DRAFT,
            odometerStart: 100, organizationId: 'org-test', dispatcherId: 'disp-1',
            validFrom: '2024-01-01T09:00', validTo: '2024-01-01T18:00', routes: [], fuelAtStart: 50
        });

        // 2. Action: Меняем статус на "Проведено"
        const result = await changeWaybillStatus(waybill.id, WaybillStatus.POSTED, { appMode: 'driver' });

        // 3. Assertions: Проверяем результат
        expect(result.data.status).toBe(WaybillStatus.POSTED);
        
        const blanksAfter = await getBlanks();
        const usedBlank = blanksAfter.find(b => b.id === blankToIssue!.id);
        expect(usedBlank?.status).toBe('used');
        expect(usedBlank?.usedInWaybillId).toBe(waybill.id);
    });

    it('should allow correcting a POSTED waybill back to DRAFT', async () => {
        const driver = await addEmployee({ fullName: 'Тест Водитель', shortName: 'Тест В.', employeeType: 'driver', organizationId: 'org-test', status: 'Active' });
        const batch = await createBlankBatch({ organizationId: 'org-test', series: 'AA', startNumber: 1, endNumber: 1 });
        await materializeBatch(batch.id);
        const blank = (await getBlanks())[0];
        
        await issueBlanksToDriver({ batchId: batch.id, ownerEmployeeId: driver.id, ranges: [{ from: 1, to: 1 }] }, { actorId: 'admin', deviceId: 'test' });
        
        const waybill = await addWaybill({
            number: 'AA000001', blankId: blank.id, date: '2024-01-01', vehicleId: 'veh-1', driverId: driver.id, status: WaybillStatus.DRAFT,
            odometerStart: 100, organizationId: 'org-test', dispatcherId: 'disp-1',
            validFrom: '2024-01-01T09:00', validTo: '2024-01-01T18:00', routes: [], fuelAtStart: 50
        });
        await changeWaybillStatus(waybill.id, WaybillStatus.POSTED, { appMode: 'driver' });

        // Action: Корректировка
        const correctionReason = 'Ошибка в показаниях одометра';
        const result = await changeWaybillStatus(waybill.id, WaybillStatus.DRAFT, { reason: correctionReason });

        // Assertions
        expect(result.data.status).toBe(WaybillStatus.DRAFT);
        expect(result.data.notes).toContain(correctionReason);
        
        const blanks = await getBlanks();
        const correctedBlank = blanks.find(b => b.id === blank.id);
        expect(correctedBlank?.status).toBe('issued'); // Бланк должен вернуться в статус "Выдан"
    });

    it('should throw an error for invalid status transition', async () => {
        const waybill = await addWaybill({
            number: 'AA000001', blankId: 'blank-1', date: '2024-01-01', vehicleId: 'veh-1', driverId: 'driver-1', status: WaybillStatus.DRAFT,
            odometerStart: 100, organizationId: 'org-test', dispatcherId: 'disp-1',
            validFrom: '2024-01-01T09:00', validTo: '2024-01-01T18:00', routes: [], fuelAtStart: 50
        });
        await changeWaybillStatus(waybill.id, WaybillStatus.SUBMITTED, { appMode: 'central' });
        
        // Попытка перехода SUBMITTED -> CANCELLED в режиме driver, что запрещено
        await expect(changeWaybillStatus(waybill.id, WaybillStatus.CANCELLED, { appMode: 'driver' }))
            .rejects.toThrow('Недопустимый переход статуса: Submitted → Cancelled (режим driver)');
    });
  });

  // --- Тесты для учета бланков ---
  describe('Blank Management', () => {
    it('should materialize a batch of blanks', async () => {
        const batch = await createBlankBatch({ organizationId: 'org-test', series: 'BB', startNumber: 10, endNumber: 15 });
        const result = await materializeBatch(batch.id);

        expect(result.created).toBe(6);
        const blanks = await getBlanks();
        expect(blanks.length).toBe(6);
        expect(blanks[0].status).toBe('available');
        expect(blanks[0].series).toBe('BB');
        expect(blanks[5].number).toBe(15);
    });

    it('should issue blanks to a driver', async () => {
        const driver = await addEmployee({ fullName: 'Тест Водитель 2', shortName: 'Тест В.2', employeeType: 'driver', organizationId: 'org-test', status: 'Active' });
        const batch = await createBlankBatch({ organizationId: 'org-test', series: 'CC', startNumber: 1, endNumber: 10 });
        await materializeBatch(batch.id);

        const result = await issueBlanksToDriver({ 
            batchId: batch.id, 
            ownerEmployeeId: driver.id, 
            ranges: [{ from: 3, to: 5 }] 
        }, { actorId: 'admin', deviceId: 'test' });
        
        expect(result.issued.length).toBe(3);
        expect(result.skipped.length).toBe(0);

        const blanks = await getBlanks();
        const issuedBlanks = blanks.filter(b => b.ownerEmployeeId === driver.id);
        expect(issuedBlanks.length).toBe(3);
        expect(issuedBlanks.every(b => b.status === 'issued')).toBe(true);
    });
  });

  // --- Тесты для расчетов ---
  describe('Calculations', () => {
    const recurringSettings: SeasonSettings = { type: 'recurring', summerDay: 1, summerMonth: 4, winterDay: 1, winterMonth: 11 };
    
    it('isWinterDate should correctly identify winter dates', () => {
      expect(isWinterDate('2024-01-15', recurringSettings)).toBe(true);
      expect(isWinterDate('2024-11-01', recurringSettings)).toBe(true);
      expect(isWinterDate('2024-03-31', recurringSettings)).toBe(true);
    });

    it('isWinterDate should correctly identify summer dates', () => {
      expect(isWinterDate('2024-04-01', recurringSettings)).toBe(false);
      expect(isWinterDate('2024-07-20', recurringSettings)).toBe(false);
      expect(isWinterDate('2024-10-31', recurringSettings)).toBe(false);
    });

    it('getDashboardData should calculate KPIs correctly', async () => {
        // FIX: Corrected test setup to dynamically use the created vehicle's ID.
        // The `addVehicle` function does not accept an `id` parameter.
        const vehicle = await addVehicle({ mileage: 100, currentFuel: 50, brand: 'Test', plateNumber: 'T1', fuelTypeId: 'f1', organizationId: 'o1', assignedDriverId: null, status: VehicleStatus.ACTIVE, fuelConsumptionRates: { summerRate: 1, winterRate: 1 }, vin: 'test' });
        const waybills: Partial<Waybill>[] = [
            { id: 'w1', date: '2024-06-10', vehicleId: vehicle.id, status: WaybillStatus.POSTED, odometerStart: 100, odometerEnd: 200, fuelAtStart: 50, fuelFilled: 0, fuelAtEnd: 40 }, // mileage 100, consumed 10
            { id: 'w2', date: '2024-06-15', vehicleId: vehicle.id, status: WaybillStatus.POSTED, odometerStart: 200, odometerEnd: 350, fuelAtStart: 40, fuelFilled: 30, fuelAtEnd: 55 }, // mileage 150, consumed 15
            { id: 'w3', date: '2024-05-10', vehicleId: vehicle.id, status: WaybillStatus.POSTED, odometerStart: 50, odometerEnd: 100, fuelAtStart: 10, fuelFilled: 0, fuelAtEnd: 5 },   // mileage 50, consumed 5 (out of date range)
            { id: 'w4', date: '2024-06-20', vehicleId: vehicle.id, status: WaybillStatus.DRAFT, odometerStart: 350, odometerEnd: 400, fuelAtStart: 55, fuelFilled: 0, fuelAtEnd: 50 },    // Draft, should be ignored
        ];
        for (const wb of waybills) { await addWaybill(wb as any); }
        
        // Action
        const result = await getDashboardData({ vehicleId: vehicle.id, dateFrom: '2024-06-01', dateTo: '2024-06-30' });

        // Assert
        expect(result.kpi.totalMileage).toBe(250); // 100 + 150
        expect(result.kpi.totalFuel).toBe(55); // fuelAtEnd of the last waybill in range
        expect(result.kpi.fuelQuarter).toBe(25); // 10 + 15 (total consumed for period)
        expect(result.kpi.fuelYear).toBe(10); // (25 / 250) * 100 (avg rate for period)
    });
  });

  // --- Интеграционный тест: полный сценарий ---
  describe('Full Scenario: Waybill Lifecycle', () => {
    it('should correctly handle a waybill from creation to posting with all related entities', async () => {
        // 1. Создание базовых сущностей
        const org = { id: 'org-main', shortName: 'Главная', status: OrganizationStatus.ACTIVE }; // Упрощенно, без addOrganization
        const driver: Employee = { id: 'driver-main', fullName: 'Иванов И.И.', shortName: 'Иванов И.И.', employeeType: 'driver', organizationId: 'org-main', status: 'Active' };
        await addEmployee(driver);
        const vehicle: Vehicle = { 
            id: 'veh-main', 
            plateNumber: 'A111AA777', 
            brand: 'Lada', 
            vin: 'TESTVIN1234567890', 
            mileage: 50000, 
            fuelTypeId: 'petrol-95', 
            assignedDriverId: 'driver-main', 
            organizationId: 'org-main', 
            status: VehicleStatus.ACTIVE, 
            fuelConsumptionRates: { summerRate: 8, winterRate: 10 },
            currentFuel: 25 
        };
        await addVehicle(vehicle);

        // 2. Создание и выдача бланков
        const batch = await createBlankBatch({ organizationId: 'org-main', series: 'XX', startNumber: 101, endNumber: 101 });
        await materializeBatch(batch.id);
        await issueBlanksToDriver({ batchId: batch.id, ownerEmployeeId: 'driver-main', ranges: [{ from: 101, to: 101 }] }, { actorId: 'admin', deviceId: 'test' });
        const blankToUse = (await getBlanks())[0];

        // 3. Создание нового ПЛ
        const waybillData = {
            number: 'XX000101', blankId: blankToUse.id,
            date: '2024-05-20',
            vehicleId: 'veh-main',
            driverId: 'driver-main',
            status: WaybillStatus.DRAFT,
            odometerStart: 50000,
            fuelAtStart: 25,
            routes: [{ id: 'r1', from: 'Гараж', to: 'Склад', distanceKm: 50, isCityDriving: false, isWarming: false }],
            organizationId: 'org-main',
            dispatcherId: 'disp-main',
            validFrom: '2024-05-20T09:00',
            validTo: '2024-05-20T18:00'
        };
        const newWaybill = await addWaybill(waybillData);
        expect(newWaybill.id).toBeDefined();
        expect(newWaybill.status).toBe(WaybillStatus.DRAFT);
        
        let blanks = await getBlanks();
        let blank = blanks.find(b => b.number === 101);
        expect(blank?.status).toBe('reserved'); // Должен быть зарезервирован при создании ПЛ

        // 4. Проведение ПЛ
        await changeWaybillStatus(newWaybill.id, WaybillStatus.POSTED, { appMode: 'driver' });
        
        // 5. Проверка финального состояния
        const postedWaybill = await fetchWaybillById(newWaybill.id);
        expect(postedWaybill?.status).toBe(WaybillStatus.POSTED);
        
        blanks = await getBlanks();
        blank = blanks.find(b => b.number === 101);
        expect(blank?.status).toBe('used');
        expect(blank?.usedInWaybillId).toBe(newWaybill.id);
    });
  });

});