// services/routeParserService.test.ts
// FIX: Add imports for vitest globals
import { describe, it, expect } from 'vitest';
import { 
    extractRawData,
    enhanceRawData,
    processRoutes,
    computeAutoSelectIndexes,
    parseAndPreviewRouteFile
} from './routeParserService';
import type { ReportRow } from './routeParserService';

// Sample HTML based on the expected structure
const sampleHtml = `
  <html><body><table class="report_query">
    <tbody>
      <tr><td colspan="5">Дата: 01.06.2024</td></tr>
      <tr><td>1</td><td>Стоянка</td><td>г. Златоуст, ул. Ленина 10</td><td></td><td></td></tr>
      <tr><td>2</td><td>Движение</td><td></td><td></td><td>5,2 км</td></tr>
      <tr><td>3</td><td>Стоянка</td><td>г. Миасс, пр. Автозаводцев 55</td><td></td><td></td></tr>
      <tr><td>4</td><td>Движение</td><td></td><td></td><td>0.2 км</td></tr>
      <tr><td>5</td><td>Стоянка</td><td>г. Миасс, пр. Автозаводцев 50</td><td></td><td></td></tr>
      <tr><td>6</td><td>Движение</td><td></td><td></td><td>0.0 км</td></tr>
      <tr><td>7</td><td>Стоянка</td><td>г. Миасс, пр. Автозаводцев 50</td><td></td><td></td></tr>
      <tr><td>8</td><td>Итого за 01.06.2024</td><td></td><td></td><td>5,4 км</td></tr>
      <tr><td colspan="5">Дата: 02.06.2024</td></tr>
      <tr><td>9</td><td>Стоянка</td><td>г. Миасс, пр. Автозаводцев 50</td><td></td><td></td></tr>
      <tr><td>10</td><td>Движение</td><td></td><td></td><td>45.8 км</td></tr>
      <tr><td>11</td><td>Стоянка</td><td>пос. Тургояк, Челябинская область, Россия</td><td></td><td></td></tr>
    </tbody>
  </table></body></html>
`;

// Node.js doesn't have TextEncoder/Blob. Let's polyfill a minimal version for the test.
if (typeof TextEncoder === 'undefined') {
  // FIX: Replaced non-standard `global` with `globalThis` for better compatibility.
  (globalThis as any).TextEncoder = class {
    encode(str: string) {
      const utf8 = unescape(encodeURIComponent(str));
      const arr = new Uint8Array(utf8.length);
      for (let i = 0; i < utf8.length; i++) {
        arr[i] = utf8.charCodeAt(i);
      }
      return arr;
    }
  } as any;

  // FIX: Replaced non-standard `global` with `globalThis` for better compatibility.
  (globalThis as any).TextDecoder = class {
    decode(buf: ArrayBuffer) {
      const arr = new Uint8Array(buf);
      const utf8 = String.fromCharCode.apply(null, arr as any);
      return decodeURIComponent(escape(utf8));
    }
  } as any;
}

describe('routeParserService', () => {
    
  describe('extractRawData', () => {
    it('should extract rows correctly from HTML', () => {
      const result = extractRawData(sampleHtml);
      expect(result.length).toBe(11);
      expect(result[0].type).toBe('Date');
      expect(result[0].date).toBe('01.06.2024');
      expect(result[1].type).toBe('Stop');
      expect(result[1].location).toBe('г. Златоуст, ул. Ленина 10');
      expect(result[2].type).toBe('Movement');
      expect(result[2].distanceKm).toBe(5.2);
      expect(result[6].type).toBe('Date');
      expect(result[10].location).toBe('пос. Тургояк'); // Check location parsing
    });
  });
  
  describe('enhanceRawData', () => {
    const rawData: ReportRow[] = [
        { type: 'Date', date: '01.06.2024', rowNumber: '', action: '', location: '', distanceKm: 0 },
        { type: 'Stop', date: '01.06.2024', location: 'A', rowNumber: '1', action: 'Стоянка', distanceKm: 0 },
        { type: 'Movement', date: '01.06.2024', distanceKm: 10, rowNumber: '2', action: 'Движение', location: '' },
        { type: 'Stop', date: '01.06.2024', location: 'B', rowNumber: '3', action: 'Стоянка', distanceKm: 0 },
        { type: 'Movement', date: '01.06.2024', distanceKm: 0, rowNumber: '4', action: 'Движение', location: '' },
    ];
    
    it('should create location string for movements', () => {
      const result = enhanceRawData(rawData, { dropZeroMovement: true });
      expect(result.find(r => r.rowNumber === '2')?.location).toBe('A → B');
    });

    it('should drop zero-km movements by default', () => {
      const result = enhanceRawData(rawData, { dropZeroMovement: true });
      expect(result.find(r => r.rowNumber === '4')).toBeUndefined();
    });

    it('should keep zero-km movements if option is set', () => {
      const result = enhanceRawData(rawData, { dropZeroMovement: false });
      expect(result.find(r => r.rowNumber === '4')).toBeDefined();
    });
  });

  describe('processRoutes', () => {
    const enhancedData: ReportRow[] = [
      { type: 'Date', date: '01.06.2024', rowNumber: '', action: '', location: '', distanceKm: 0 },
      { type: 'Stop', date: '01.06.2024', location: 'A', rowNumber: '1', action: 'Стоянка', distanceKm: 0 },
      { type: 'Movement', date: '01.06.2024', distanceKm: 10, rowNumber: '2', action: 'Движение', location: 'A → B' },
      { type: 'Stop', date: '01.06.2024', location: 'B', rowNumber: '3', action: 'Стоянка', distanceKm: 0 },
    ];

    it('should build routes from movements', () => {
      const result = processRoutes(enhancedData, 'movements');
      expect(result.length).toBe(1);
      expect(result[0].from).toBe('A');
      expect(result[0].to).toBe('B');
      expect(result[0].distanceKm).toBe(10);
      expect(result[0].date).toBe('01.06.2024');
    });
    
    it('should build routes from stops', () => {
      const result = processRoutes(enhancedData, 'stops');
      expect(result.length).toBe(1);
      expect(result[0].from).toBe('A');
      expect(result[0].to).toBe('B');
      expect(result[0].distanceKm).toBe(10);
    });
  });
  
  describe('computeAutoSelectIndexes', () => {
    // FIX: Removed duplicate `distanceKm` properties from object literals.
    const data: ReportRow[] = [
      { type: 'Movement', distanceKm: 0, location: 'A → B', date: '01.01.2024', rowNumber: '1', action: '' }, // idx 0, zero movement
      { type: 'Movement', distanceKm: 0.1, location: 'B → C', date: '01.01.2024', rowNumber: '2', action: '' }, // idx 1, tiny movement
      { type: 'Movement', distanceKm: 10, location: 'C → C', date: '01.01.2024', rowNumber: '3', action: '' }, // idx 2, same from/to
      { type: 'Stop', location: '', date: '01.01.2024', rowNumber: '4', action: '', distanceKm: 0 }, // idx 3, empty stop
      { type: 'Stop', location: 'D', date: '01.01.2024', rowNumber: '5', action: '', distanceKm: 0 },
      { type: 'Stop', location: 'D', date: '01.01.2024', rowNumber: '6', action: '', distanceKm: 0 }, // idx 5, duplicate stop
      { type: 'Movement', distanceKm: 20, location: 'D → E', date: '01.01.2024', rowNumber: '7', action: '' }, // OK
    ];
    
    it('should identify rows to be auto-selected for exclusion', () => {
        const result = computeAutoSelectIndexes(data, { markTinyMovementBelowKm: 0.3 });
        expect(result).toEqual([0, 1, 2, 3, 5]);
    });
  });

  describe('parseAndPreviewRouteFile (Integration)', () => {
    it('should process a file and return segments and HTML preview', async () => {
      const buffer = new TextEncoder().encode(sampleHtml).buffer;
      
      const { routeSegments, previewHtml } = await parseAndPreviewRouteFile(
        buffer,
        'report.html',
        'text/html'
      );
      
      // Check segments (auto-removal of empty stops and zero movements is on by default)
      expect(routeSegments.length).toBe(3);
      expect(routeSegments[0].from).toBe('г. Златоуст, ул. Ленина 10');
      expect(routeSegments[0].to).toBe('г. Миасс, пр. Автозаводцев 55');
      expect(routeSegments[0].distanceKm).toBe(5.2);

      expect(routeSegments[1].from).toBe('г. Миасс, пр. Автозаводцев 55');
      expect(routeSegments[1].to).toBe('г. Миасс, пр. Автозаводцев 50');
      expect(routeSegments[1].distanceKm).toBe(0.2);
      
      expect(routeSegments[2].from).toBe('г. Миасс, пр. Автозаводцев 50');
      expect(routeSegments[2].to).toBe('пос. Тургояк');
      expect(routeSegments[2].distanceKm).toBe(45.8);

      // Check preview
      expect(previewHtml).toContain('<table class="preview-table">');
      expect(previewHtml).toContain('г. Златоуст, ул. Ленина 10');
      expect(previewHtml).toContain('5,2'); // distance formatting
    });
  });
});