
// --- Парсер отчёта: браузер + Node (jsdom/cheerio) ---
// distanceKm в ReportRow = number
// "шахматка" для локаций, автопометка, инструменты в предпросмотре,
// авто-удаление "пустых", статус-блок и подсветка строк с пробегом > 0.

// Если компилируете как ESM и нет require — эта заглушка снимет ошибки типизации.
declare const require: any;

// --- 1. ТИПЫ ДАННЫХ ---

export interface ReportRow {
  type: 'Date' | 'Movement' | 'Stop' | 'Total' | 'Other';
  rowNumber: string;
  action: string;
  location: string;
  distanceKm: number;
  date: string | null;
  time?: string; // HH:MM
}

export interface RouteSegment {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  date: string; // dd.mm.yyyy
  departureTime?: string; // HH:MM
  arrivalTime?: string; // HH:MM
}

export interface AutoSelectRules {
  unknownLabel?: string;
  markZeroMovement?: boolean;
  markTinyMovementBelowKm?: number;
  markMovementWithoutArrow?: boolean;
  markMovementUnknownBothSides?: boolean;
  markMovementSameFromTo?: boolean;
  markEmptyStop?: boolean;
  markUnknownStop?: boolean;
  markDuplicateStops?: boolean;
}

export interface EmptyRules {
  treatStopsAsEmpty?: boolean;     // считать стоянки пустыми
  zeroMovementAsEmpty?: boolean;   // Movement с 0 км — пустые
  tinyThresholdKm?: number;        // Movement <= threshold — пустые
}

export interface ParseOptions {
  excludeRowIndexes?: number[];
  buildMode?: 'auto' | 'stops' | 'movements';
  autoSelectRules?: AutoSelectRules;
  autoRemoveEmpty?: boolean;       // автоисключение пустых (по умолчанию true)
  emptyRules?: EmptyRules;
}

// --- 2. КОНСТАНТЫ И РЕГУЛЯРНЫЕ ВЫРАЖЕНИЯ ---

const dateRegex = /(\d{2}\.\d{2}\.\d{4})/;
const timeRegex = /(\d{1,2}:\d{2})/;
const ARROW_SPLIT = /\s*(?:→|->|—)\s*/;

// --- 3. УТИЛИТЫ ---

const parseDistanceKm = (text: string | null | undefined): number => {
  if (!text) return 0;
  const normalized = text.replace(/[^\d.,\-]/g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
};

const formatDistance = (n: number): string => {
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '\$1');
};

const genId = () => {
  try {
    if (globalThis.crypto && typeof (globalThis.crypto as any).randomUUID === 'function') {
      return (globalThis.crypto as any).randomUUID();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const extractTime = (text: string | null | undefined): string | undefined => {
    if (!text) return undefined;
    const m = text.match(timeRegex);
    if (m) {
        // Normalize to HH:MM (08:05)
        const parts = m[1].split(':');
        const h = parts[0].padStart(2, '0');
        const min = parts[1].padStart(2, '0');
        return `${h}:${min}`;
    }
    return undefined;
};

// --- 4. ПАРСИНГ ЛОКАЦИИ ---

export const parseLocation = (locationText: string | null | undefined): string => {
  if (!locationText) return '';

  const blacklist = new Set([
    'Россия',
    'Уральский федеральный округ',
    'Челябинская область',
    'Кусинский район',
    'Златоустовский городской округ',
  ]);

  let text = locationText.replace(/\s+/g, ' ').trim();
  const parts = text.split(',').map(p => p.trim()).filter(Boolean);
  const filtered = parts.filter(p => !blacklist.has(p));
  const clean = filtered.join(', ').replace(/,\s*$/, '').trim();

  if (!clean) {
    if (text.includes('Златоуст')) return 'Златоуст';
    if (text.includes('Петропавловка')) return 'Петропавловка';
  }
  return clean || text;
};

// --- 5. ЭТАП 1: ИЗВЛЕЧЕНИЕ СЫРЫХ ДАННЫХ ---

// 5.1. Браузер
const extractRawDataFromDocument = (doc: Document): ReportRow[] => {
  const rows = doc.querySelectorAll('.report_query tbody tr');
  if (rows.length === 0) return [];

  const rawData: ReportRow[] = [];
  let currentDate: string | null = null;

  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length === 0) return;

    if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
      const fullText = cells[0].textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const m = fullText.match(dateRegex);
      if (m) {
        const dateStr = m[1] || m[0];
        currentDate = dateStr;
        rawData.push({ type: 'Date', date: dateStr, rowNumber: '', action: '', location: '', distanceKm: 0 });
      }
      return;
    }

    const rowNumberText = cells[0]?.textContent?.trim() || '';
    const actionCellText = (cells[1]?.textContent || '').replace(/\s+/g, ' ').trim();
    
    // Extract time from column 2 (typical position)
    const timeText = cells[2]?.textContent?.trim();
    const time = extractTime(timeText);

    if (actionCellText === 'Движение') {
      const lastCell = cells[cells.length - 1];
      const d = parseDistanceKm(lastCell?.textContent?.trim() || '');
      rawData.push({ type: 'Movement', date: currentDate, time, rowNumber: rowNumberText, action: actionCellText, location: '', distanceKm: d });
      return;
    }

    if (actionCellText === 'Стоянка') {
      let locationCell: Element | undefined = cells[cells.length - 2];
      let locationText = locationCell?.textContent?.trim() || '';
      if (!locationText) {
        const candidates = Array.from(cells).slice(2, cells.length - 1);
        candidates.sort((a, b) => (b.textContent?.trim().length || 0) - (a.textContent?.trim().length || 0));
        locationText = candidates[0]?.textContent?.trim() || '';
      }
      rawData.push({ type: 'Stop', date: currentDate, time, rowNumber: rowNumberText, action: actionCellText, location: parseLocation(locationText), distanceKm: 0 });
      return;
    }

    if (/^Итого/i.test(actionCellText) || actionCellText.includes('Итого')) {
      const lastCell = cells[cells.length - 1];
      const d = parseDistanceKm(lastCell?.textContent?.trim() || '');
      rawData.push({ type: 'Total', date: currentDate, rowNumber: rowNumberText, action: actionCellText, location: '', distanceKm: d });
      return;
    }
  });

  return rawData;
};

// 5.2. Node: jsdom
const extractRawDataWithJsdom = (htmlString: string): ReportRow[] => {
  try {
    const { JSDOM } = require('jsdom'); // eslint-disable-line
    const dom = new JSDOM(htmlString);
    const doc: Document = dom.window.document;
    return extractRawDataFromDocument(doc);
  } catch {
    return [];
  }
};

// 5.3. Node: cheerio
const extractRawDataWithCheerio = (htmlString: string): ReportRow[] => {
  try {
    const cheerio: any = require('cheerio'); // eslint-disable-line
    const $ = cheerio.load(htmlString);
    const rows = $('.report_query tbody tr');
    if (rows.length === 0) return [];

    const rawData: ReportRow[] = [];
    let currentDate: string | null = null;

    rows.each((_i: number, tr: any) => {
      const cells = $(tr).find('td');
      if (cells.length === 0) return;

      if (cells.length === 1 && cells.eq(0).attr('colspan') != null) {
        const fullText = cells.eq(0).text().replace(/\s+/g, ' ').trim();
        const m = fullText.match(dateRegex);
        if (m) {
          const dateStr = m[1] || m[0];
          currentDate = dateStr;
          rawData.push({ type: 'Date', date: dateStr, rowNumber: '', action: '', location: '', distanceKm: 0 });
        }
        return;
      }

      const rowNumberText = (cells.eq(0).text() || '').trim();
      const actionCellText = (cells.eq(1).text() || '').replace(/\s+/g, ' ').trim();
      
      const timeText = cells.eq(2).text().trim();
      const time = extractTime(timeText);

      if (actionCellText === 'Движение') {
        const txt = cells.eq(cells.length - 1).text().trim();
        rawData.push({ type: 'Movement', date: currentDate, time, rowNumber: rowNumberText, action: actionCellText, location: '', distanceKm: parseDistanceKm(txt) });
        return;
      }

      if (actionCellText === 'Стоянка') {
        let locationText = (cells.eq(cells.length - 2).text() || '').trim();
        if (!locationText) {
          const middleCells = cells.slice(2, cells.length - 1).toArray();
          middleCells.sort((a: any, b: any) => ($(b).text().trim().length || 0) - ($(a).text().trim().length || 0));
          locationText = (middleCells[0] ? $(middleCells[0]).text().trim() : '') || '';
        }
        rawData.push({ type: 'Stop', date: currentDate, time, rowNumber: rowNumberText, action: actionCellText, location: parseLocation(locationText), distanceKm: 0 });
        return;
      }

      if (/^Итого/i.test(actionCellText) || actionCellText.includes('Итого')) {
        const txt = cells.eq(cells.length - 1).text().trim();
        rawData.push({ type: 'Total', date: currentDate, rowNumber: rowNumberText, action: actionCellText, location: '', distanceKm: parseDistanceKm(txt) });
        return;
      }
    });

    return rawData;
  } catch {
    return [];
  }
};

// Универсальный парсер
export const extractRawData = (htmlString: string): ReportRow[] => {
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      return extractRawDataFromDocument(doc);
    } catch (e) {
      console.error('Ошибка DOMParser:', e);
    }
  }
  const jsdomResult = extractRawDataWithJsdom(htmlString);
  if (jsdomResult.length > 0) return jsdomResult;
  const cheerioResult = extractRawDataWithCheerio(htmlString);
  if (cheerioResult.length > 0) return cheerioResult;
  console.error('Не удалось распарсить HTML: нет DOMParser/jsdom/cheerio.');
  return [];
};

// --- 6. ЭТАП 1.5: "Шахматка" + нули оставляем (по опции) ---

export const enhanceRawData = (
  rawData: ReportRow[],
  opts?: { dropZeroMovement?: boolean; unknownLabel?: string }
): ReportRow[] => {
  const { dropZeroMovement = true, unknownLabel = 'Место не определено' } = opts || {};
  const isNonEmpty = (s?: string | null) => !!s && s.trim().length > 0;

  const result: ReportRow[] = [];
  for (let i = 0; i < rawData.length; i++) {
    const src = rawData[i];
    const row: ReportRow = { ...src };

    if (row.type === 'Movement') {
      if (row.distanceKm <= 0) {
        if (!dropZeroMovement) result.push(row);
        continue;
      }
      if (!isNonEmpty(row.location)) {
        const prev = rawData[i - 1];
        const next = rawData[i + 1];
        const from = isNonEmpty(prev?.location) ? prev!.location.trim() : unknownLabel;
        const to = isNonEmpty(next?.location) ? next!.location.trim() : unknownLabel;
        row.location = `${from} → ${to}`;
      }
    }

    result.push(row);
  }
  return result;
};

// --- 7. ЭТАП 2: ПОСТРОЕНИЕ МАРШРУТОВ ---

export const processRoutes = (
  rawData: ReportRow[],
  buildMode: 'auto' | 'stops' | 'movements' = 'auto',
  unknownLabel = 'Место не определено'
): RouteSegment[] => {
  const segments: RouteSegment[] = [];
  const byDate = new Map<string, ReportRow[]>();
  for (const r of rawData) {
    if (!r.date) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  for (const [date, rows] of byDate) {
    const hasStops = rows.some(r => r.type === 'Stop');
    const mode = buildMode === 'auto' ? (hasStops ? 'stops' : 'movements') : buildMode;

    if (mode === 'stops') {
      let lastStop: string | null = null;
      let firstMoveTime: string | undefined = undefined;
      let accumulated = 0;

      for (const row of rows) {
        if (row.type === 'Movement') {
          if (Number.isFinite(row.distanceKm)) accumulated += row.distanceKm;
          // Track the time of the FIRST movement after a stop as the departure time
          if (!firstMoveTime && row.time) firstMoveTime = row.time;
        } else if (row.type === 'Stop') {
          const to = (row.location || '').trim() || unknownLabel;
          if (lastStop === null) {
            lastStop = to;
            accumulated = 0;
            firstMoveTime = undefined; // Reset for the first actual leg
          } else {
            if (lastStop !== to) {
              segments.push({ 
                  id: genId(), 
                  from: lastStop, 
                  to, 
                  distanceKm: accumulated, 
                  date,
                  departureTime: firstMoveTime,
                  arrivalTime: row.time
              });
            }
            lastStop = to;
            accumulated = 0;
            firstMoveTime = undefined;
          }
        } else if (row.type === 'Total') {
          accumulated = 0;
        }
      }
    } else {
      // Movements Mode
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.type !== 'Movement' || row.distanceKm <= 0) continue;
        const loc = (row.location || '').trim();
        const parts = loc.split(ARROW_SPLIT);
        const from = (parts[0] || '').trim() || unknownLabel;
        const to = (parts[1] || '').trim() || unknownLabel;
        
        // Try to find arrival time from the next row
        let arrivalTime = undefined;
        if (i + 1 < rows.length) {
            arrivalTime = rows[i+1].time;
        }

        segments.push({ 
            id: genId(), 
            from, 
            to, 
            distanceKm: row.distanceKm, 
            date,
            departureTime: row.time,
            arrivalTime
        });
      }
    }
  }

  return segments;
};

// Доп. утилита, если нужно целое суммарное значение поверх сегментов
export const computeTotalDistanceKm = (segments: RouteSegment[]): { totalKm: number; totalKmRaw: number } => {
  const totalKmRaw = segments.reduce((sum, s) => sum + (Number.isFinite(s.distanceKm) ? s.distanceKm : 0), 0);
  const totalKm = Math.round(totalKmRaw); // только общий результат — целый
  return { totalKm, totalKmRaw };
};

// --- 8. АВТОПОМЕТКА (для галочек) ---

export const computeAutoSelectIndexes = (data: ReportRow[], rules?: AutoSelectRules): number[] => {
  const {
    unknownLabel = 'Место не определено',
    markZeroMovement = true,
    markTinyMovementBelowKm = 0,
    markMovementWithoutArrow = true,
    markMovementUnknownBothSides = true,
    markMovementSameFromTo = true,
    markEmptyStop = true,
    markUnknownStop = true,
    markDuplicateStops = true,
  } = rules || {};

  const res: number[] = [];
  const isNonEmpty = (s?: string | null) => !!s && s.trim().length > 0;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (r.type === 'Date' || r.type === 'Total') continue;

    if (r.type === 'Movement') {
      let mark = false;
      if (markZeroMovement && r.distanceKm <= 0) mark = true;
      if (!mark && markTinyMovementBelowKm > 0 && r.distanceKm > 0 && r.distanceKm <= markTinyMovementBelowKm) mark = true;

      const loc = (r.location || '').trim();
      const hasArrow = ARROW_SPLIT.test(loc);
      const parts = loc.split(ARROW_SPLIT);
      const from = (parts[0] || '').trim();
      const to = (parts[1] || '').trim();

      if (!mark && markMovementWithoutArrow && isNonEmpty(loc) && !hasArrow) mark = true;
      if (!mark && markMovementUnknownBothSides && (!isNonEmpty(from) || from === unknownLabel) && (!isNonEmpty(to) || to === unknownLabel)) mark = true;
      if (!mark && markMovementSameFromTo && isNonEmpty(from) && from === to) mark = true;

      if (mark) res.push(i);
      continue;
    }

    if (r.type === 'Stop') {
      let mark = false;
      const loc = (r.location || '').trim();
      const prev = data[i - 1];
      if (!mark && markEmptyStop && !isNonEmpty(loc)) mark = true;
      if (!mark && markUnknownStop && loc === unknownLabel) mark = true;
      if (!mark && markDuplicateStops && prev && prev.type === 'Stop' && (prev.location || '').trim() === loc) mark = true;
      if (mark) res.push(i);
      continue;
    }
  }
  return res;
};

// --- 9. ВЫЧИСЛЕНИЕ "ПУСТЫХ" ИНДЕКСОВ (для авто-удаления) ---

const computeEmptyIndexes = (data: ReportRow[], rules: EmptyRules): number[] => {
  const {
    treatStopsAsEmpty = true,
    zeroMovementAsEmpty = true,
    tinyThresholdKm = 0.3,
  } = rules || {};

  const res: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (r.type === 'Date' || r.type === 'Total') continue;

    if (r.type === 'Stop') {
      if (treatStopsAsEmpty) res.push(i);
      continue;
    }
    if (r.type === 'Movement') {
      if (zeroMovementAsEmpty && r.distanceKm === 0) { res.push(i); continue; }
      if (tinyThresholdKm > 0 && r.distanceKm > 0 && r.distanceKm <= tinyThresholdKm) { res.push(i); continue; }
    }
  }
  return res;
};

// --- 10. ПРЕДПРОСМОТР С ПОДСВЕТКОЙ И СТАТУСОМ ---

export const createPreviewTable = (
  rawData: ReportRow[],
  precheckedIndexes: number[] = [],
  opts?: { stats?: { total: number; autoEmpty: number } }
): string => {
  if (rawData.length === 0) return '<p>Нет данных для предпросмотра.</p>';

  const pre = new Set(precheckedIndexes);
  const uid = 'route-preview-' + Math.random().toString(36).slice(2, 8);
  const includeTotalsInHighlight = false;

    // FIX: Fixed incorrect template literal syntax that was causing multiple parsing errors.
    let html = `
    <style>
      .preview-wrap { width: 100%; font-size: 12px; }

      .preview-toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
        margin: 6px 0 8px;
        flex-wrap: wrap;
      }

      .preview-toolbar button,
      .preview-toolbar .rp-toggle-label {
        padding: 4px 8px;
        cursor: pointer;
        border-radius: 4px;
        border: 1px solid #d0d7e2;
        background: #f5f7fb;
        color: #243b6b;
        font-size: 11px;
        line-height: 1.4;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: background 120ms ease-in-out, border-color 120ms ease-in-out, box-shadow 120ms ease-in-out;
        user-select: none;
      }

      .preview-toolbar button:hover,
      .preview-toolbar .rp-toggle-label:hover {
        background: #e4ebff;
        border-color: #b0bce0;
        box-shadow: 0 0 0 1px rgba(96, 119, 184, 0.2);
      }

      .preview-toolbar button:active,
      .preview-toolbar .rp-toggle-label:active {
        background: #d2ddff;
      }

      .preview-toolbar button {
        /* чтобы кнопки слегка отличались от чекбокс-лейбла */
        background: #edf1ff;
      }

      .preview-toolbar button:focus-visible,
      .preview-toolbar .rp-toggle-label:focus-within {
        outline: 2px solid #4c6fff;
        outline-offset: 1px;
      }

      .preview-toolbar .rp-toggle-label input[type="checkbox"] {
        transform: scale(1.15);
        cursor: pointer;
      }

      .preview-table { width: 100%; border-collapse: collapse; }
      .preview-table th, .preview-table td { border: 1px solid #ddd; padding: 4px; }
      .preview-table thead { background-color: #f4f4f4; }
      .preview-table .muted { background-color: #eee; font-weight: bold; }
      .txt-right { text-align: right; }
      .txt-left  { text-align: left; }
      .center { text-align: center; }
      .preview-table input[type="checkbox"] { transform: scale(1.1); }
      .preview-table tr.row-nz td {
        background: #eafbea !important;
        color: #14532d;
        font-weight: 600;
        transition: background 120ms ease-in-out;
      }
      .preview-status {
        background: #f5f7ff;
        color: #243b6b;
        border: 1px solid #dbe4ff;
        padding: 6px 8px;
        border-radius: 6px;
        font-size: 12px;
        margin-bottom: 6px;
      }
    </style>
    <div id="${uid}" class="preview-wrap">
      <div class="preview-status">
        Найдено: <b>${opts?.stats?.total ?? rawData.length}</b> строк. 
        Пустых: <b>${opts?.stats?.autoEmpty ?? 0}</b> (будут удалены автоматически)
      </div>

      <div class="preview-toolbar">
        <label class="rp-toggle-label">
          <input type="checkbox" class="rp-chk-all" />
          Выбрать все
        </label>

        <button type="button" class="rp-btn-uncheck-nz" title="Снять галочки у строк с ненулевым пробегом">
          Сбросить непустые
        </button>

        <button type="button" class="rp-btn-keep-nz" title="Удалить пустые строки (оставить только непустые)">
          Оставить только непустые
        </button>

        <button type="button" class="rp-btn-keep-empty" title="Удалить непустые строки (оставить только пустые)">
          Оставить только пустые
        </button>

        <button type="button" class="rp-btn-delete">
          Удалить отмеченные
        </button>

        <button type="button" class="rp-btn-clear">
          Сбросить отметки
        </button>
      </div>
      <table class="preview-table">
        <thead>
          <tr>
            <th class="center" style="width: 28px;">✓</th>
            <th>Дата</th>
            <th>Время</th>
            <th>Тип</th>
            <th>№</th>
            <th>Действие</th>
            <th>Локация</th>
            <th class="txt-right">Пробег</th>
          </tr>
        </thead>
        <tbody>
  `;

  const shouldShowDistance = (r: ReportRow) =>
    (r.type === 'Movement' || r.type === 'Total') && r.distanceKm > 0;

  rawData.forEach((row, i) => {
    const isHeader = row.type === 'Date' || row.type === 'Total';
    const trClass = isHeader ? 'muted' : '';
    const checkboxDisabled = isHeader ? 'disabled' : '';
    const checked = pre.has(i) ? 'checked' : '';

    const distanceIsNonZero =
      (row.type === 'Movement' && row.distanceKm > 0) ||
      (includeTotalsInHighlight && row.type === 'Total' && row.distanceKm > 0);

    const distanceCell = shouldShowDistance(row) ? formatDistance(row.distanceKm) : '';
    const rowNzClass = distanceIsNonZero ? ' row-nz' : '';

    html += `
      <tr data-index="${i}" class="${rowNzClass}">
        <td class="center ${trClass}">
          <input type="checkbox" class="route-row-select" data-index="${i}" ${checkboxDisabled} ${checked} />
        </td>
        <td class="${trClass}">${row.date || ''}</td>
        <td class="${trClass}">${row.time || ''}</td>
        <td class="${trClass}">${row.type}</td>
        <td class="${trClass}">${row.rowNumber}</td>
        <td class="${trClass}">${row.action}</td>
        <td class="${trClass} txt-left">${row.location}</td>
        <td class="${trClass} txt-right">${distanceCell}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>

    <!-- Фолбэк‑скрипт (в React события вешаются в компоненте) -->
    <script>
    (function(){
      var root = document.getElementById('${uid}');
      if (!root) return;

      function q(sel){ return root.querySelector(sel); }
      function qa(sel){ return Array.prototype.slice.call(root.querySelectorAll(sel)); }
      function getSelectedIndexes(){
        return qa('input.route-row-select:checked').map(function(el){
          return parseInt(el.getAttribute('data-index'), 10);
        }).filter(function(n){ return Number.isFinite(n); });
      }

      var chkAll = q('.rp-chk-all');
      if (chkAll) chkAll.addEventListener('change', function(){
        var checked = chkAll.checked;
        qa('input.route-row-select:not(:disabled)').forEach(function(cb){ cb.checked = checked; });
      });

      var btnClear = q('.rp-btn-clear');
      if (btnClear) btnClear.addEventListener('click', function(){
        qa('input.route-row-select').forEach(function(cb){ cb.checked = false; });
        if (chkAll) chkAll.checked = false;
      });

      var btnUncheckNZ = q('.rp-btn-uncheck-nz');
      if (btnUncheckNZ) btnUncheckNZ.addEventListener('click', function(){
        qa('tr.row-nz input.route-row-select').forEach(function(cb){ if(!cb.disabled) cb.checked = false; });
        if (chkAll) chkAll.checked = false;
      });

      var btnKeepNZ = q('.rp-btn-keep-nz');
      if (btnKeepNZ) btnKeepNZ.addEventListener('click', function(){
        var empties = qa('tr:not(.row-nz) input.route-row-select:not(:disabled)');
        var idxs = empties.map(function(cb){ return parseInt(cb.getAttribute('data-index'),10) }).filter(Number.isFinite);
        empties.forEach(function(cb){ var tr = cb.closest('tr'); if (tr && tr.parentNode) tr.parentNode.removeChild(tr); });
        root.dispatchEvent(new CustomEvent('routePreviewDeleteSelected', { bubbles:true, detail:{ indexes: Array.from(new Set(idxs)) } }));
        if (chkAll) chkAll.checked = false;
      });

      var btnKeepEmpty = q('.rp-btn-keep-empty');
      if (btnKeepEmpty) btnKeepEmpty.addEventListener('click', function(){
        var nonEmpty = qa('tr.row-nz input.route-row-select:not(:disabled)');
        var idxs = nonEmpty.map(function(cb){ return parseInt(cb.getAttribute('data-index'),10) }).filter(Number.isFinite);
        nonEmpty.forEach(function(cb){ var tr = cb.closest('tr'); if (tr && tr.parentNode) tr.parentNode.removeChild(tr); });
        root.dispatchEvent(new CustomEvent('routePreviewDeleteSelected', { bubbles:true, detail:{ indexes: Array.from(new Set(idxs)) } }));
        if (chkAll) chkAll.checked = false;
      });

      var btnDelete = q('.rp-btn-delete');
      if (btnDelete) btnDelete.addEventListener('click', function(){
        var idxs = Array.from(new Set(getSelectedIndexes()));
        if (!idxs.length) return;
        idxs.forEach(function(i){
          var el = root.querySelector('input.route-row-select[data-index="' + i + '"]');
          if (el && el.closest) { var tr = el.closest('tr'); if (tr && tr.parentNode) tr.parentNode.removeChild(tr); }
        });
        root.dispatchEvent(new CustomEvent('routePreviewDeleteSelected', { bubbles: true, detail: { indexes: idxs } }));
        if (chkAll) chkAll.checked = false;
      });
    })();
    </script>
  `;

  return html;
};

// --- 11. ОСНОВНАЯ ФУНКЦИЯ ---

export const parseAndPreviewRouteFile = async (
  buffer: ArrayBuffer,
  fileName: string,
  fileType: string,
  options?: ParseOptions
): Promise<{ routeSegments: RouteSegment[], previewHtml: string }> => {
  const looksHtml =
    /html/i.test(fileType || '') || /.html?$/i.test(fileName || '');
  if (!looksHtml) {
    // не валим процесс — попробуем распарсить всё равно
    console.warn('Unknown file type, trying to parse anyway:', fileType, fileName);
  }

  const htmlString = new TextDecoder().decode(buffer);
  const rawData = extractRawData(htmlString);
  if (rawData.length === 0) {
    const previewHtml = '<p style="margin:8px 0;color:#a00;">Нет данных для предпросмотра (таблица не найдена). Проверьте файл отчёта.</p>';
    return { routeSegments: [], previewHtml };
  }

  // оставляем нули — чтобы можно было помечать/исключать
  const enhancedData = enhanceRawData(rawData, { dropZeroMovement: false });

  // автопометка (галочки)
  const autoSelected = computeAutoSelectIndexes(enhancedData, options?.autoSelectRules);

  // авто‑удаление пустых (включено по умолчанию)
  const emptyRules: EmptyRules = {
    treatStopsAsEmpty: true,
    zeroMovementAsEmpty: true,
    tinyThresholdKm: 0.3,
    ...(options?.emptyRules || {})
  };
  const autoEmptyIdx = (options?.autoRemoveEmpty ?? true)
    ? computeEmptyIndexes(enhancedData, emptyRules)
    : [];

  // пользовательские исключения
  const exclude = new Set(options?.excludeRowIndexes ?? []);
  autoEmptyIdx.forEach(i => exclude.add(i));

  // предпросмотр (отмечаем авто/ручные)
  const prechecked = [...new Set([...autoSelected, ...exclude])];
  const previewHtml = createPreviewTable(enhancedData, prechecked, {
    stats: { total: enhancedData.length, autoEmpty: autoEmptyIdx.length }
  });

  // сборка сегментов без исключённых
  const filteredForBuild = enhancedData.filter((_r, idx) => !exclude.has(idx));
  const segments = processRoutes(filteredForBuild, options?.buildMode ?? 'auto');

  return { routeSegments: segments, previewHtml };
};
