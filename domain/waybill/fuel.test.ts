
import { describe, it, expect } from 'vitest';
import { calculateNormConsumption, calculateFuelEnd } from './fuel';

describe('Domain: Fuel Calculator', () => {
  it('считает простой расход (100км, норма 10)', () => {
    // 100 км / 100 * 10 * 1 = 10
    const result = calculateNormConsumption(100, 10, {});
    expect(result).toBe(10);
  });

  it('учитывает зимний коэффициент (10%)', () => {
    // 100км * 10л/100км * (1 + 0.1) = 11л
    const result = calculateNormConsumption(100, 10, { winter: 0.1 });
    expect(result).toBe(11);
  });

  it('работает со сложными коэффициентами (зима + город)', () => {
    // 100км, норма 20. 
    // Зима 10% (0.1) + Город 5% (0.05) = 0.15 (15%).
    // 20 * 1.15 = 23.
    const result = calculateNormConsumption(100, 20, { winter: 0.1, city: 0.05 });
    expect(result).toBe(23);
  });

  it('обрабатывает нулевой пробег', () => {
    const result = calculateNormConsumption(0, 15, { winter: 0.1 });
    expect(result).toBe(0);
  });

  it('округляет до сотых', () => {
    // 123 км, норма 10.5, без кэф.
    // 1.23 * 10.5 = 12.915 -> 12.92
    const result = calculateNormConsumption(123, 10.5, {});
    expect(result).toBe(12.92);
  });
});

describe('Domain: Fuel Balance', () => {
    it('считает конечный остаток', () => {
        // 10 начальный + 50 заправка - 20 расход = 40
        expect(calculateFuelEnd(10, 50, 20)).toBe(40);
    });

    it('корректно обрабатывает дробные числа', () => {
        // 10.5 + 20.3 - 5.1 = 25.7
        expect(calculateFuelEnd(10.5, 20.3, 5.1)).toBe(25.7);
    });
});
