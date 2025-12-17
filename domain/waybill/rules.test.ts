
import { describe, it, expect } from 'vitest';
import { WaybillRules } from './rules';
import { Waybill, WaybillStatus } from '../../types';

// Хелпер для создания мока
const mockWaybill = (status: WaybillStatus, date = '2024-01-01'): Waybill => ({
    id: '1',
    status,
    date,
    number: '1',
    vehicleId: 'v1',
    driverId: 'd1',
    organizationId: 'org1',
    odometerStart: 100,
    odometerEnd: 150,
    fuelAtStart: 10,
    fuelAtEnd: 5,
    fuelPlanned: 5,
    routes: [],
    validFrom: '',
    validTo: ''
});

describe('Waybill Rules', () => {
    describe('canEdit', () => {
        it('разрешает редактирование черновика в открытом периоде', () => {
            const wb = mockWaybill(WaybillStatus.DRAFT);
            const result = WaybillRules.canEdit(wb, false); // Period NOT closed
            expect(result.allowed).toBe(true);
        });

        it('запрещает редактирование в закрытом периоде', () => {
            const wb = mockWaybill(WaybillStatus.DRAFT);
            const result = WaybillRules.canEdit(wb, true); // Period CLOSED
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('закрыт');
        });

        it('запрещает редактирование проведенного документа', () => {
            const wb = mockWaybill(WaybillStatus.POSTED);
            const result = WaybillRules.canEdit(wb, false);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('проведен');
        });
    });

    describe('canPost', () => {
        it('запрещает проведение без водителя', () => {
            const wb = mockWaybill(WaybillStatus.DRAFT);
            // @ts-ignore
            wb.driverId = null;
            const result = WaybillRules.canPost(wb);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('водитель');
        });

        it('запрещает проведение с отрицательным балансом топлива', () => {
            const wb = mockWaybill(WaybillStatus.DRAFT);
            wb.fuelAtEnd = -5;
            const result = WaybillRules.canPost(wb);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Отрицательный');
        });

        it('разрешает проведение корректного документа', () => {
            const wb = mockWaybill(WaybillStatus.DRAFT);
            const result = WaybillRules.canPost(wb);
            expect(result.allowed).toBe(true);
        });
    });
});
