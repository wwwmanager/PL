
import { Route } from '../types';
import { generateId } from './mockApi';

export interface ExcelWaybillRow {
  date: string; // YYYY-MM-DD
  validFrom: string; // ISO DateTime
  validTo: string; // ISO DateTime
  number?: string;
  odometerStart: number;
  odometerEnd: number;
  fuelAtStart: number;
  fuelAtEnd: number;
  fuelFilled: number;
  fuelPlanned: number;
  routes: Route[];
  warnings: string[];
}

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-zа-я0-9]/g, '');

// Базовые колонки
const HEADER_MAP: Record<string, string[]> = {
  date: ['датавыезда'],
  dateReturn: ['датавозвращения', 'датаприбытия'], // Если отличается
  timeStart: ['времявыезда', 'выезд'],
  timeEnd: ['времявозвращения', 'времяприбытия', 'прибытие'],
  number: ['номер', 'номерпл', '№'], // Номер записи в экселе, может не быть
  odoStart: ['начальныйпробег', 'пробегвыезд'],
  odoEnd: ['конечныйпробег', 'пробегвозврат'],
  fuelStart: ['остатоктопливапривыезде', 'топливовыезд', 'остатокначало'],
  fuelEnd: ['остатоктопливапривозвращении', 'топливовозврат', 'остатокконец'],
  fuelFilled: ['заправлено', 'заправка'],
  fuelNorm: ['расходтопливапонорме', 'нормасписания', 'расходнорма'],
};

const parseDate = (val: any): string | null => {
  if (!val) return null;
  
  // Excel serial date (число дней с 1900 года)
  if (typeof val === 'number') {
    // Excel считает 1900 год високосным (баг Lotus 1-2-3), поэтому -25569 коррекция для JS Date (Unix epoch)
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    // Коррекция на часовой пояс, чтобы не получить вчерашний день
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    return date.toISOString().split('T')[0];
  }
  
  // String DD.MM.YYYY
  if (typeof val === 'string') {
    const parts = val.match(/(\d{1,2})[\./-](\d{1,2})[\./-](\d{2,4})/);
    if (parts) {
      const d = parts[1].padStart(2, '0');
      const m = parts[2].padStart(2, '0');
      const y = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
      return `${y}-${m}-${d}`;
    }
  }
  
  return null;
};

const parseTime = (val: any): string => {
    if (val === undefined || val === null) return '';
    
    // Excel time fraction (0.5 = 12:00)
    if (typeof val === 'number') {
        const totalSeconds = Math.round(val * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    
    // String HH:MM
    if (typeof val === 'string') {
        const parts = val.match(/(\d{1,2})[:\-\.](\d{2})/);
        if (parts) {
            return `${parts[1].padStart(2, '0')}:${parts[2]}`;
        }
    }
    
    return '';
}

const parseNum = (val: any): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const clean = val.replace(',', '.').replace(/[^0-9.\-]/g, ''); // Allow negative just in case, but usually pos
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

export const parseExcelWaybills = async (file: File): Promise<ExcelWaybillRow[]> => {
  // Dynamic import to avoid initialization issues on first load
  const XLSX_LIB = await import('xlsx');
  const XLSX = (XLSX_LIB as any).read ? XLSX_LIB : (XLSX_LIB as any).default;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        if (rows.length === 0) {
          resolve([]);
          return;
        }

        // 1. Находим строку заголовков
        let headerRowIndex = -1;
        const columnMap: Record<string, number> = {};
        
        // Карты для динамических колонок маршрута
        const pointCols: Record<number, number> = {}; // 1 -> colIdx, 2 -> colIdx
        const distCols: Record<number, number> = {};  // 1 -> colIdx

        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const row = rows[i].map((c: any) => normalizeHeader(String(c || '')));
          
          // Ищем статические колонки
          Object.entries(HEADER_MAP).forEach(([key, aliases]) => {
             const idx = row.findIndex((cell: string) => aliases.some(alias => cell === alias || cell.includes(alias))); // Strict or include
             if (idx !== -1) {
               columnMap[key] = idx;
             }
          });

          // Ищем динамические колонки (Пункт 1, Пункт 2, ... Расстояние 1, ...)
          row.forEach((cell: string, idx: number) => {
              // Пункт N
              const pointMatch = cell.match(/пункт(\d+)/) || cell.match(/пункт№(\d+)/);
              if (pointMatch) {
                  const num = parseInt(pointMatch[1], 10);
                  pointCols[num] = idx;
              }
              // Расстояние N
              const distMatch = cell.match(/расстояние(\d+)/);
              if (distMatch) {
                  const num = parseInt(distMatch[1], 10);
                  distCols[num] = idx;
              }
          });

          // Критерий успеха: нашли Дату выезда и хотя бы один пробег/пункт
          if (columnMap.date !== undefined && (columnMap.odoStart !== undefined || Object.keys(pointCols).length > 0)) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          reject(new Error("Не удалось распознать заголовки таблицы (Дата выезда, Пункт 1, Пробег и т.д.)"));
          return;
        }

        const result: ExcelWaybillRow[] = [];

        // 2. Парсим данные
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          // Дата выезда (обязательна)
          const dateVal = columnMap.date !== undefined ? row[columnMap.date] : null;
          const dateStr = parseDate(dateVal);
          if (!dateStr) continue;

          // Дата возвращения (если нет - равна дате выезда)
          const dateRetVal = columnMap.dateReturn !== undefined ? row[columnMap.dateReturn] : null;
          const dateRetStr = parseDate(dateRetVal) || dateStr;

          // Время
          const timeStartStr = columnMap.timeStart !== undefined ? parseTime(row[columnMap.timeStart]) : '08:00';
          const timeEndStr = columnMap.timeEnd !== undefined ? parseTime(row[columnMap.timeEnd]) : '17:00';

          const validFrom = `${dateStr}T${timeStartStr || '08:00'}`;
          const validTo = `${dateRetStr}T${timeEndStr || '17:00'}`;

          // Числовые поля
          const odoStart = columnMap.odoStart !== undefined ? parseNum(row[columnMap.odoStart]) : 0;
          const odoEnd = columnMap.odoEnd !== undefined ? parseNum(row[columnMap.odoEnd]) : 0;
          const fuelStart = columnMap.fuelStart !== undefined ? parseNum(row[columnMap.fuelStart]) : 0;
          const fuelEnd = columnMap.fuelEnd !== undefined ? parseNum(row[columnMap.fuelEnd]) : 0;
          const fuelFilled = columnMap.fuelFilled !== undefined ? parseNum(row[columnMap.fuelFilled]) : 0;
          const fuelPlanned = columnMap.fuelNorm !== undefined ? parseNum(row[columnMap.fuelNorm]) : 0;
          
          const number = columnMap.number !== undefined ? String(row[columnMap.number] || '') : undefined;

          // Сборка маршрута ПАРАМИ
          // Логика: Маршрут 1 берется из (Пункт 1 -> Пункт 2) + Расстояние 1
          // Маршрут 2 берется из (Пункт 3 -> Пункт 4) + Расстояние 2
          // и т.д.
          const routes: Route[] = [];
          
          // Находим макс индекс расстояния, чтобы знать сколько итераций
          const maxDistIndex = Math.max(0, ...Object.keys(distCols).map(Number));

          for (let k = 1; k <= maxDistIndex + 5; k++) { // +5 на всякий случай, если расстояния нет, но пункты есть
              const fromIdx = pointCols[2 * k - 1]; // 1, 3, 5...
              const toIdx = pointCols[2 * k];       // 2, 4, 6...
              const distIdx = distCols[k];          // 1, 2, 3...

              // Если нет колонок для пунктов - прерываем (или если данные пусты)
              if (fromIdx === undefined || toIdx === undefined) break;

              const from = String(row[fromIdx] || '').trim();
              const to = String(row[toIdx] || '').trim();
              const dist = distIdx !== undefined ? parseNum(row[distIdx]) : 0;

              // Если оба пункта пустые - считаем что маршруты кончились
              if (!from && !to) continue; 

              if (from || to) {
                  routes.push({
                      id: generateId(),
                      from: from || 'Н/Д',
                      to: to || 'Н/Д',
                      distanceKm: dist,
                      isCityDriving: false,
                      isWarming: false
                  });
              }
          }
          
          // Fallback: Если пары не сработали, но есть общий пробег, создаем один маршрут
          if (routes.length === 0 && (odoEnd - odoStart) > 0) {
               routes.push({
                  id: generateId(),
                  from: "Гараж",
                  to: "По городу",
                  distanceKm: odoEnd - odoStart,
                  isCityDriving: false,
                  isWarming: false
               });
          }

          const warnings: string[] = [];
          if (odoStart > odoEnd) warnings.push("Нач. пробег > Кон. пробега");
          if (fuelStart + fuelFilled < fuelEnd) warnings.push("Баланс топлива не сходится");

          result.push({
            date: dateStr,
            validFrom,
            validTo,
            number,
            odometerStart: odoStart,
            odometerEnd: odoEnd,
            fuelAtStart: fuelStart,
            fuelAtEnd: fuelEnd,
            fuelFilled,
            fuelPlanned,
            routes,
            warnings
          });
        }

        resolve(result);

      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
