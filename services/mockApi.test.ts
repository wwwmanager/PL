import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    getDashboardData,
    // New imports for stock tests
    addFuelType,
    addGarageStockItem,
    addStockTransaction,
    getGarageStockItems,
    deleteStockTransaction,
    getFuelCardBalance,
    addToFuelCardBalance,
    getStockTransactions,
    getEmployees
} from './mockApi';
// FIX: Added missing import for OrganizationStatus.
import { Employee, Vehicle, WaybillStatus, BlankStatus, Capability, VehicleStatus, SeasonSettings, Waybill, OrganizationStatus } from '../types';
import { canTransition } from './waybillStatusMachine';

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
    vi.useRealTimers();
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
            validFrom: '2024-01-01T09:00', validTo: '2024-01-01T18:00', routes: []
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
            validFrom: '2024-01-01T09:00', validTo: '2024-01-01T18:00', routes: []
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
            validFrom: '2024-01-01T09:00', validTo: '2024-01-01T18:00', routes: []
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
	  const now = new Date();
	  const currentYear = now.getFullYear();
	  const currentMonth = now.getMonth(); // 0..11
	  const currentQuarter = Math.floor(currentMonth / 3);
	  const quarterStartMonth = currentQuarter * 3;

	  const pad2 = (n: number) => String(n).padStart(2, '0');

	  // Даты для ПЛ:
	  // w1, w2 — в текущем месяце
	  const dateW1 = `${currentYear}-${pad2(currentMonth + 1)}-10`;
	  const dateW2 = `${currentYear}-${pad2(currentMonth + 1)}-15`;

	  // w3 — в том же квартале, но в другом месяце (для квартального KPI)
	  let monthForW3 = quarterStartMonth;
	  if (monthForW3 === currentMonth) {
		// если попали в тот же месяц, сдвигаем на следующий в квартале (или назад, если декабрь)
		monthForW3 = currentMonth + 1 <= 11 ? currentMonth + 1 : currentMonth - 1;
	  }
	  const dateW3 = `${currentYear}-${pad2(monthForW3 + 1)}-10`;

	  const orgId = 'o1';

	  // Водитель с достаточным балансом карты, чтобы покрыть заправку 30л
	  const driver = await addEmployee({
		fullName: 'Водитель KPI',
		shortName: 'KPI D.',
		employeeType: 'driver',
		organizationId: orgId,
		status: 'Active',
		fuelCardBalance: 100,
	  });

	  const vehicle = await addVehicle({
		mileage: 100,
		currentFuel: 50,
		brand: 'Test',
		plateNumber: 'T1',
		fuelTypeId: 'f1',
		organizationId: orgId,
		assignedDriverId: driver.id,
		status: VehicleStatus.ACTIVE,
		fuelConsumptionRates: { summerRate: 1, winterRate: 1 },
		vin: 'test',
	  });

	  // Пачка бланков для трёх ПЛ
	  const batch = await createBlankBatch({
		organizationId: orgId,
		series: 'KD',
		startNumber: 1,
		endNumber: 3,
	  });
	  await materializeBatch(batch.id);
	  await issueBlanksToDriver(
		{
		  batchId: batch.id,
		  ownerEmployeeId: driver.id,
		  ranges: [{ from: 1, to: 3 }],
		},
		{ actorId: 'admin', deviceId: 'test' },
	  );
	  const blanks = await getBlanks();
	  const blank1 = blanks.find(b => b.series === 'KD' && b.number === 1)!;
	  const blank2 = blanks.find(b => b.series === 'KD' && b.number === 2)!;
	  const blank3 = blanks.find(b => b.series === 'KD' && b.number === 3)!;

	  type WBDef = {
		id: string;
		date: string;
		odometerStart: number;
		odometerEnd: number;
		fuelAtStart: number;
		fuelFilled: number;
		fuelAtEnd: number;
		status: WaybillStatus;
		blank: typeof blank1;
	  };

	  const waybills: WBDef[] = [
		// mileage 100, consumed 10
		{
		  id: 'w1',
		  date: dateW1,
		  odometerStart: 100,
		  odometerEnd: 200,
		  fuelAtStart: 50,
		  fuelFilled: 0,
		  fuelAtEnd: 40,
		  status: WaybillStatus.POSTED,
		  blank: blank1,
		},
		// mileage 150, consumed 15
		{
		  id: 'w2',
		  date: dateW2,
		  odometerStart: 200,
		  odometerEnd: 350,
		  fuelAtStart: 40,
		  fuelFilled: 30,
		  fuelAtEnd: 55,
		  status: WaybillStatus.POSTED,
		  blank: blank2,
		},
		// mileage 50, consumed 5 — другая дата, но тот же квартал
		{
		  id: 'w3',
		  date: dateW3,
		  odometerStart: 50,
		  odometerEnd: 100,
		  fuelAtStart: 10,
		  fuelFilled: 0,
		  fuelAtEnd: 5,
		  status: WaybillStatus.POSTED,
		  blank: blank3,
		},
	  ];

	  // Создаём и проводим ПЛ
	  for (const wb of waybills) {
		const created = await addWaybill({
		  id: wb.id,
		  number: `KD${String(wb.blank.number).padStart(6, '0')}`,
		  blankId: wb.blank.id,
		  date: wb.date,
		  vehicleId: vehicle.id,
		  driverId: driver.id,
		  status: WaybillStatus.DRAFT,
		  odometerStart: wb.odometerStart,
		  odometerEnd: wb.odometerEnd,
		  fuelAtStart: wb.fuelAtStart,
		  fuelFilled: wb.fuelFilled,
		  fuelAtEnd: wb.fuelAtEnd,
		  organizationId: orgId,
		  dispatcherId: 'disp-kpi',
		  validFrom: wb.date,
		  validTo: wb.date,
		  routes: [],
		} as any);

		if (wb.status === WaybillStatus.POSTED) {
		  await changeWaybillStatus(created.id, WaybillStatus.POSTED, { appMode: 'driver' });
		}
	  }

	  // Черновик, который должен игнорироваться
	  await addWaybill({
		id: 'w4',
		number: 'KD000004',
		date: dateW2,
		vehicleId: vehicle.id,
		driverId: driver.id,
		status: WaybillStatus.DRAFT,
		odometerStart: 350,
		odometerEnd: 400,
		fuelAtStart: 55,
		fuelFilled: 0,
		fuelAtEnd: 50,
		organizationId: orgId,
		dispatcherId: 'disp-kpi',
		validFrom: dateW2,
		validTo: dateW2,
		routes: [],
	  } as any);

	  const result = await getDashboardData({
		vehicleId: vehicle.id,
		dateFrom: `${currentYear}-01-01`,
		dateTo: `${currentYear}-12-31`,
	  });

	  // Месяц: w1 (100км) + w2 (150км) = 250
	  expect(result.kpi.mileageMonth).toBe(250);

	  // Баланс топлива = vehicle.currentFuel (50)
	  expect(result.kpi.totalFuelBalance).toBe(50);

	  // Квартал: w1 (10) + w2 (15) + w3 (5) = 30
	  expect(result.kpi.fuelQuarter).toBe(30);

	  // Год: те же 30
	  expect(result.kpi.fuelYear).toBe(30);
	});
  });

  // --- Тесты для складского учета ---
  describe('Stock Management', () => {
    it('should increase fuel balance when Income transaction is created', async () => {
        // 1. Setup: Create Fuel Type and Stock Item
        const fuelType = await addFuelType({ name: 'Diesel', code: 'DT', density: 0.85 });
        const fuelItem = await addGarageStockItem({
            name: 'Diesel Fuel',
            itemType: 'Товар',
            group: 'ГСМ',
            unit: 'л',
            balance: 100,
            fuelTypeId: fuelType.id,
            isActive: true,
            storageType: 'centralWarehouse'
        });

        // 2. Action: Create Income Transaction
        const tx = await addStockTransaction({
            docNumber: 'INC-001',
            date: '2024-01-01',
            type: 'income',
            organizationId: 'org-1',
            items: [{ stockItemId: fuelItem.id, quantity: 500 }]
        });

        // 3. Assert: Check new balance
        const updatedItems = await getGarageStockItems();
        const updatedFuel = updatedItems.find(i => i.id === fuelItem.id);
        
        expect(updatedFuel?.balance).toBe(600); // 100 + 500
        expect(tx.id).toBeDefined();
    });

    it('should enforce stock balance when Waybill consumes fuel', async () => {
        // 1. Setup: Create Vehicle, Driver, Fuel Type, Stock Item (empty)
        const fuelType = await addFuelType({ name: 'A95', code: '95', density: 0.75 });
        const stockItem = await addGarageStockItem({
            name: 'Fuel A95', itemType: 'Товар', group: 'ГСМ', unit: 'л', balance: 0, 
            fuelTypeId: fuelType.id, isActive: true, storageType: 'centralWarehouse'
        });
        const driver = await addEmployee({ fullName: 'D1', shortName: 'D1', employeeType: 'driver', organizationId: 'org1', status: 'Active' });
        const vehicle = await addVehicle({ 
            plateNumber: 'A111AA', brand: 'Lada', fuelTypeId: fuelType.id, status: VehicleStatus.ACTIVE,
            assignedDriverId: driver.id, organizationId: 'org1', fuelConsumptionRates: { summerRate: 10, winterRate: 10 }, vin: '123', mileage: 1000
        });
        
        // 2. Setup Blank
        const batch = await createBlankBatch({ organizationId: 'org1', series: 'BL', startNumber: 1, endNumber: 1 });
        await materializeBatch(batch.id);
        const blank = (await getBlanks())[0];
        await issueBlanksToDriver({ batchId: batch.id, ownerEmployeeId: driver.id, ranges: [{ from: 1, to: 1 }] }, { actorId: 'admin', deviceId: 'test' });

        // 3. Create Waybill that consumes fuel (start: 10, end: 0 => consumed 10)
        // Note: addWaybill doesn't post, so it doesn't trigger stock check yet.
        const waybill = await addWaybill({
            number: 'BL000001', blankId: blank.id, date: '2024-01-01', 
            vehicleId: vehicle.id, driverId: driver.id, status: WaybillStatus.DRAFT,
            odometerStart: 1000, odometerEnd: 1100, 
            fuelAtStart: 10, fuelFilled: 0, fuelAtEnd: 0, // Consumed 10L
            organizationId: 'org1', dispatcherId: 'disp1', validFrom: '2024-01-01', validTo: '2024-01-01', routes: []
        });

        // 4. Action: Try to POST waybill. Should FAIL because stock balance is 0
        await expect(changeWaybillStatus(waybill.id, WaybillStatus.POSTED, { appMode: 'driver' }))
            .rejects.toThrow(/Недостаточно остатка/);

        // 5. Action: Add Income to stock
        await addStockTransaction({
            docNumber: 'INC-95', date: '2024-01-01', type: 'income', organizationId: 'org1',
            items: [{ stockItemId: stockItem.id, quantity: 100 }]
        });

        // 6. Action: Try to POST waybill again. Should SUCCEED.
        const result = await changeWaybillStatus(waybill.id, WaybillStatus.POSTED, { appMode: 'driver' });
        expect(result.data.status).toBe(WaybillStatus.POSTED);

        // 7. Assert: Stock balance reduced
        const updatedItems = await getGarageStockItems();
        const updatedFuel = updatedItems.find(i => i.id === stockItem.id);
        expect(updatedFuel?.balance).toBe(90); // 100 - 10
    });
  });

  // --- Интеграционный тест: полный сценарий ---
  describe('Full Scenario: Waybill Lifecycle', () => {
    it('should correctly handle a waybill from creation to posting with all related entities', async () => {
        // 1. Создание базовых сущностей
        const org = { id: 'org-main', shortName: 'Главная', status: OrganizationStatus.ACTIVE }; // Упрощенно, без addOrganization
        const driver: Employee = { id: 'driver-main', fullName: 'Иванов И.И.', shortName: 'Иванов И.И.', employeeType: 'driver', organizationId: 'org-main', status: 'Active' };
        await addEmployee(driver);
        const vehicle: Vehicle = { id: 'veh-main', plateNumber: 'A111AA777', brand: 'Lada', vin: 'TESTVIN1234567890', mileage: 50000, fuelTypeId: 'petrol-95', assignedDriverId: 'driver-main', organizationId: 'org-main', status: VehicleStatus.ACTIVE, fuelConsumptionRates: { summerRate: 8, winterRate: 10 } };
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
            routes: [{ id: 'r1', from: 'Гараж', to: 'Склад', distanceKm: 50 }],
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

  describe('Waybill lifecycle - edge cases', () => {
    it('should not post waybill when fuel card balance is insufficient', async () => {
        // Arrange
        const driver = await addEmployee({ fullName: 'Low Balance Driver', shortName: 'Low B.', employeeType: 'driver', organizationId: 'org-1', status: 'Active', fuelCardBalance: 0 });
        
        const batch = await createBlankBatch({ organizationId: 'org-1', series: 'LB', startNumber: 1, endNumber: 1 });
        await materializeBatch(batch.id);
        await issueBlanksToDriver({ batchId: batch.id, ownerEmployeeId: driver.id, ranges: [{ from: 1, to: 1 }] }, { actorId: 'admin', deviceId: 'test' });
        const blank = (await getBlanks()).find(b => b.series === 'LB' && b.number === 1);

        const waybill = await addWaybill({
            number: 'LB000001', blankId: blank!.id, date: '2024-01-01', 
            vehicleId: 'veh-1', driverId: driver.id, status: WaybillStatus.DRAFT,
            odometerStart: 100, organizationId: 'org-1', dispatcherId: 'disp-1',
            validFrom: '2024-01-01', validTo: '2024-01-01', routes: [],
            fuelFilled: 50 // Requires 50L from card
        });

        // Act & Assert
        await expect(changeWaybillStatus(waybill.id, WaybillStatus.POSTED, { appMode: 'driver' }))
            .rejects.toThrow(/Недостаточно топлива на карте водителя/);

        const wb = await fetchWaybillById(waybill.id);
        expect(wb?.status).toBe(WaybillStatus.DRAFT);
        
        const d = (await getEmployees()).find(e => e.id === driver.id);
        expect(d?.fuelCardBalance).toBe(0);
    });

    it('should not post waybill when stock balance is insufficient for consumption', async () => {
        const fuelType = await addFuelType({ name: 'Diesel Test', code: 'DT-T', density: 0.85 });
        // Empty stock
        const item = await addGarageStockItem({ 
            name: 'Diesel', itemType: 'Товар', group: 'ГСМ', unit: 'л', balance: 0, 
            fuelTypeId: fuelType.id, isActive: true, storageType: 'centralWarehouse' 
        });
        
        const driver = await addEmployee({ fullName: 'D-Stock', shortName: 'D-S', employeeType: 'driver', organizationId: 'org-1', status: 'Active', fuelCardBalance: 100 });
        const vehicle = await addVehicle({ 
            plateNumber: 'S000SS', brand: 'Test', fuelTypeId: fuelType.id, status: VehicleStatus.ACTIVE, 
            assignedDriverId: driver.id, organizationId: 'org-1', fuelConsumptionRates: { summerRate: 10, winterRate: 10 },
            vin: '123', mileage: 1000
        });

        const batch = await createBlankBatch({ organizationId: 'org-1', series: 'ST', startNumber: 1, endNumber: 1 });
        await materializeBatch(batch.id);
        await issueBlanksToDriver({ batchId: batch.id, ownerEmployeeId: driver.id, ranges: [{ from: 1, to: 1 }] }, { actorId: 'admin', deviceId: 'test' });
        const blank = (await getBlanks()).find(b => b.series === 'ST');

        // Consumed: Start(10) + Filled(0) - End(0) = 10L. Needs to exist in stock.
        const waybill = await addWaybill({
            number: 'ST000001', blankId: blank!.id, date: '2024-01-01', 
            vehicleId: vehicle.id, driverId: driver.id, status: WaybillStatus.DRAFT,
            odometerStart: 1000, odometerEnd: 1100,
            fuelAtStart: 10, fuelFilled: 0, fuelAtEnd: 0,
            organizationId: 'org-1', dispatcherId: 'disp-1', validFrom: '2024-01-01', validTo: '2024-01-01', routes: []
        });

        await expect(changeWaybillStatus(waybill.id, WaybillStatus.POSTED, { appMode: 'driver' }))
            .rejects.toThrow(/Недостаточно остатка/);
    });

    it('should prevent invalid status transition POSTED -> CANCELLED', async () => {
        // Setup valid waybill
        const driver = await addEmployee({ fullName: 'D-Trans', shortName: 'D-T', employeeType: 'driver', organizationId: 'org-1', status: 'Active' });
        const batch = await createBlankBatch({ organizationId: 'org-1', series: 'TR', startNumber: 1, endNumber: 1 });
        await materializeBatch(batch.id);
        await issueBlanksToDriver({ batchId: batch.id, ownerEmployeeId: driver.id, ranges: [{ from: 1, to: 1 }] }, { actorId: 'admin', deviceId: 'test' });
        const blank = (await getBlanks()).find(b => b.series === 'TR');

        const waybill = await addWaybill({
            number: 'TR000001', blankId: blank!.id, date: '2024-01-01', 
            vehicleId: 'veh-1', driverId: driver.id, status: WaybillStatus.DRAFT,
            odometerStart: 100, organizationId: 'org-1', dispatcherId: 'disp-1',
            validFrom: '2024-01-01', validTo: '2024-01-01', routes: []
        });

        await changeWaybillStatus(waybill.id, WaybillStatus.POSTED);

        // Attempt forbidden transition
        await expect(changeWaybillStatus(waybill.id, WaybillStatus.CANCELLED))
            .rejects.toThrow(/Недопустимый переход статуса/);
            
        const wb = await fetchWaybillById(waybill.id);
        expect(wb?.status).toBe(WaybillStatus.POSTED);
    });
  });

  describe('Stock transactions and fuel card operations', () => {
    it('should increase balance on income', async () => {
        const item = await addGarageStockItem({ name: 'Item 1', itemType: 'Товар', group: 'Прочее', unit: 'шт', balance: 10, isActive: true, storageType: 'centralWarehouse' });
        
        await addStockTransaction({
            docNumber: 'INC-1', date: '2024-01-01', type: 'income', organizationId: 'org-1',
            items: [{ stockItemId: item.id, quantity: 5 }]
        });

        const updatedItem = (await getGarageStockItems()).find(i => i.id === item.id);
        expect(updatedItem?.balance).toBe(15);
    });

    it('should decrease balance on expense within limits', async () => {
        const item = await addGarageStockItem({ name: 'Item 2', itemType: 'Товар', group: 'Прочее', unit: 'шт', balance: 10, isActive: true, storageType: 'centralWarehouse' });
        const driver = await addEmployee({ fullName: 'D-Exp', shortName: 'D-E', employeeType: 'driver', organizationId: 'org-1', status: 'Active' });
        const vehicle = await addVehicle({ plateNumber: 'V1', brand: 'B', fuelTypeId: 'f', status: VehicleStatus.ACTIVE, assignedDriverId: driver.id, organizationId: 'org-1', fuelConsumptionRates: {summerRate:1, winterRate:1}, vin:'1', mileage:0 });

        await addStockTransaction({
            docNumber: 'EXP-1', date: '2024-01-01', type: 'expense', organizationId: 'org-1',
            vehicleId: vehicle.id, driverId: driver.id,
            items: [{ stockItemId: item.id, quantity: 4 }]
        });

        const updatedItem = (await getGarageStockItems()).find(i => i.id === item.id);
        expect(updatedItem?.balance).toBe(6);
    });

    it('should reject expense if balance is insufficient', async () => {
        const item = await addGarageStockItem({ name: 'Item 3', itemType: 'Товар', group: 'Прочее', unit: 'шт', balance: 10, isActive: true, storageType: 'centralWarehouse' });
        const driver = await addEmployee({ fullName: 'D-Exp', shortName: 'D-E', employeeType: 'driver', organizationId: 'org-1', status: 'Active' });
        const vehicle = await addVehicle({ plateNumber: 'V1', brand: 'B', fuelTypeId: 'f', status: VehicleStatus.ACTIVE, assignedDriverId: driver.id, organizationId: 'org-1', fuelConsumptionRates: {summerRate:1, winterRate:1}, vin:'1', mileage:0 });

        await expect(addStockTransaction({
            docNumber: 'EXP-2', date: '2024-01-01', type: 'expense', organizationId: 'org-1',
            vehicleId: vehicle.id, driverId: driver.id,
            items: [{ stockItemId: item.id, quantity: 11 }]
        })).rejects.toThrow(/Недостаточно остатка/);

        const updatedItem = (await getGarageStockItems()).find(i => i.id === item.id);
        expect(updatedItem?.balance).toBe(10);
    });

    it('should handle fuelCardTopUp creation correctly', async () => {
        const item = await addGarageStockItem({ name: 'Fuel', itemType: 'Товар', group: 'ГСМ', unit: 'л', balance: 100, isActive: true, storageType: 'centralWarehouse' });
        const driver = await addEmployee({ fullName: 'D-Top', shortName: 'D-T', employeeType: 'driver', organizationId: 'org-1', status: 'Active', fuelCardBalance: 0 });

        await addStockTransaction({
            docNumber: 'TOP-1', date: '2024-01-01', type: 'expense', expenseReason: 'fuelCardTopUp',
            organizationId: 'org-1', driverId: driver.id,
            items: [{ stockItemId: item.id, quantity: 20 }]
        });

        const updatedItem = (await getGarageStockItems()).find(i => i.id === item.id);
        expect(updatedItem?.balance).toBe(80);

        const updatedDriver = (await getEmployees()).find(e => e.id === driver.id);
        expect(updatedDriver?.fuelCardBalance).toBe(20);
    });

    it('should handle fuelCardTopUp deletion correctly', async () => {
        const item = await addGarageStockItem({ name: 'Fuel 2', itemType: 'Товар', group: 'ГСМ', unit: 'л', balance: 100, isActive: true, storageType: 'centralWarehouse' });
        const driver = await addEmployee({ fullName: 'D-Top-Del', shortName: 'D-T', employeeType: 'driver', organizationId: 'org-1', status: 'Active', fuelCardBalance: 0 });

        const tx = await addStockTransaction({
            docNumber: 'TOP-2', date: '2024-01-01', type: 'expense', expenseReason: 'fuelCardTopUp',
            organizationId: 'org-1', driverId: driver.id,
            items: [{ stockItemId: item.id, quantity: 20 }]
        });

        await deleteStockTransaction(tx.id);

        const updatedItem = (await getGarageStockItems()).find(i => i.id === item.id);
        expect(updatedItem?.balance).toBe(100);

        const updatedDriver = (await getEmployees()).find(e => e.id === driver.id);
        expect(updatedDriver?.fuelCardBalance).toBe(0);
    });

    it('should prevent fuelCardTopUp deletion if driver balance is insufficient', async () => {
        const item = await addGarageStockItem({ name: 'Fuel 3', itemType: 'Товар', group: 'ГСМ', unit: 'л', balance: 100, isActive: true, storageType: 'centralWarehouse' });
        const driver = await addEmployee({ fullName: 'D-Drain', shortName: 'D-D', employeeType: 'driver', organizationId: 'org-1', status: 'Active', fuelCardBalance: 0 });

        // 1. Top up 30
        const tx = await addStockTransaction({
            docNumber: 'TOP-3', date: '2024-01-01', type: 'expense', expenseReason: 'fuelCardTopUp',
            organizationId: 'org-1', driverId: driver.id,
            items: [{ stockItemId: item.id, quantity: 30 }]
        });

        // 2. Spend 20 via Waybill
        const vehicle = await addVehicle({ 
            plateNumber: 'V2', brand: 'B', fuelTypeId: 'f', status: VehicleStatus.ACTIVE, 
            assignedDriverId: driver.id, organizationId: 'org-1', fuelConsumptionRates: {summerRate:1, winterRate:1}, vin:'2', mileage:0 
        });
        const batch = await createBlankBatch({ organizationId: 'org-1', series: 'DR', startNumber: 1, endNumber: 1 });
        await materializeBatch(batch.id);
        await issueBlanksToDriver({ batchId: batch.id, ownerEmployeeId: driver.id, ranges: [{ from: 1, to: 1 }] }, { actorId: 'admin', deviceId: 'test' });
        const blank = (await getBlanks()).find(b => b.series === 'DR');

        const waybill = await addWaybill({
            number: 'DR000001', blankId: blank!.id, date: '2024-01-01', 
            vehicleId: vehicle.id, driverId: driver.id, status: WaybillStatus.DRAFT,
            odometerStart: 0, organizationId: 'org-1', dispatcherId: 'd', validFrom: '', validTo: '', routes: [],
            fuelFilled: 20 // Spend 20 from card
        });
        await changeWaybillStatus(waybill.id, WaybillStatus.POSTED);

        // Driver balance should be 30 - 20 = 10.
        // 3. Try to delete top-up (-30). Result would be -20. Forbidden.
        
        await expect(deleteStockTransaction(tx.id)).rejects.toThrow(/Недостаточно средств/);

        const updatedDriver = (await getEmployees()).find(e => e.id === driver.id);
        expect(updatedDriver?.fuelCardBalance).toBe(10);

        const updatedItem = (await getGarageStockItems()).find(i => i.id === item.id);
        expect(updatedItem?.balance).toBe(70); // 100 - 30. Top-up still active.
    });
  });

  describe('WaybillStatus machine', () => {
    it('should allow valid transitions', () => {
      expect(canTransition(WaybillStatus.DRAFT, WaybillStatus.SUBMITTED)).toBe(true);
      expect(canTransition(WaybillStatus.DRAFT, WaybillStatus.POSTED)).toBe(true);
      expect(canTransition(WaybillStatus.DRAFT, WaybillStatus.CANCELLED)).toBe(true);

      expect(canTransition(WaybillStatus.SUBMITTED, WaybillStatus.POSTED)).toBe(true);
      expect(canTransition(WaybillStatus.SUBMITTED, WaybillStatus.DRAFT)).toBe(true);
      expect(canTransition(WaybillStatus.SUBMITTED, WaybillStatus.CANCELLED)).toBe(true);

      expect(canTransition(WaybillStatus.POSTED, WaybillStatus.DRAFT)).toBe(true);
    });

    it('should forbid invalid transitions', () => {
      expect(canTransition(WaybillStatus.POSTED, WaybillStatus.CANCELLED)).toBe(false);
      expect(canTransition(WaybillStatus.CANCELLED, WaybillStatus.DRAFT)).toBe(false);
      expect(canTransition(WaybillStatus.CANCELLED, WaybillStatus.POSTED)).toBe(false);
      expect(canTransition(WaybillStatus.CANCELLED, WaybillStatus.SUBMITTED)).toBe(false);
    });
  });

});