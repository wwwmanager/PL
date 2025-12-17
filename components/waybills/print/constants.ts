
import { PageKey, PrintPositions, PageOffsets } from './types';

export const AVAILABLE_FONTS = [
    'Courier New',
    'Arial',
    'Times New Roman',
    'Verdana',
    'Helvetica',
    'Georgia'
];

export const FIELD_LABELS: Record<string, string> = {
    'orgName': 'Организация',
    'orgAddress': 'Адрес орг.',
    'orgPhone': 'Телефон орг.',
    'orgInn': 'ИНН орг.',
    'number': 'Номер ПЛ',
    'date': 'Дата ПЛ',
    'dateDay': 'День',
    'dateMonth': 'Месяц',
    'dateYear': 'Год',
    'vehicleModel': 'Марка ТС',
    'vehiclePlate': 'Гос. номер',
    'driverName': 'Водитель',
    'driverLicense': 'ВУ водителя',
    'driverClass': 'Класс водителя',
    'dispatcherName': 'Диспетчер',
    'mechanicName': 'Механик',
    'medicName': 'Медик',
    'fuelType': 'Марка топлива',
    'odoStart': 'Спидометр выезд',
    'odoEnd': 'Спидометр возврат',
    'fuelStart': 'Остаток выезд',
    'fuelEnd': 'Остаток возврат',
    'fuelGiven': 'Выдано топливо',
    'timeStart': 'Время выезда',
    'timeEnd': 'Время возврата',
    'validFrom': 'Действ. с',
    'validTo': 'Действ. по',
    'medCheckPre': 'Медосмотр пред.',
    'medCheckPost': 'Медосмотр после',
    'techCheckPre': 'Тех. контроль пред.',
    'techCheckPost': 'Тех. контроль после',
    'routeFrom': 'Маршрут: Откуда',
    'routeTo': 'Маршрут: Куда',
    'totalDistance': 'Пробег итого',
    'fuelNorm': 'Расход по норме',
    'fuelFact': 'Расход факт',
    'saveFuel': 'Экономия',
    'overFuel': 'Перерасход',
    // Footer fields
    'driverSign': 'Подпись водителя',
    'dispSign': 'Подпись дисп.',
    'mechSign': 'Подпись мех.',
};

export const PAGE_LABELS: Record<PageKey, string> = {
    'page1': 'Лицевая сторона',
    'page2': 'Оборотная сторона',
};

export const INITIAL_FIELD_POSITIONS: PrintPositions = {
    'orgName': { x: 40, y: 30, width: 300 },
    'number': { x: 300, y: 70, width: 100 },
    'date': { x: 410, y: 70, width: 100 },
    'vehicleModel': { x: 150, y: 120, width: 200 },
    'vehiclePlate': { x: 400, y: 120, width: 100 },
    'driverName': { x: 150, y: 150, width: 200 },
    'driverLicense': { x: 400, y: 150, width: 100 },
    'odoStart': { x: 600, y: 200 },
    'fuelStart': { x: 600, y: 230 },
    'timeStart': { x: 200, y: 200 },
    'timeEnd': { x: 200, y: 250 },
    'medCheckPre': { x: 50, y: 300 },
    'techCheckPre': { x: 300, y: 300 },
    // Page 2 defaults
    'routeFrom': { x: 50, y: 50 },
    'routeTo': { x: 200, y: 50 },
    'totalDistance': { x: 400, y: 50 },
    'fuelNorm': { x: 50, y: 200 },
    'fuelFact': { x: 150, y: 200 },
};

export const DEFAULT_PAGE_FIELD_MAP: Record<string, PageKey> = {
    'routeFrom': 'page2',
    'routeTo': 'page2',
    'totalDistance': 'page2',
    'fuelNorm': 'page2',
    'fuelFact': 'page2',
    'saveFuel': 'page2',
    'overFuel': 'page2',
};

export const INITIAL_PAGE_OFFSETS: PageOffsets = {
    page1: { x: 0, y: 0 },
    page2: { x: 0, y: 0 },
};

export const DEFAULT_HIDDEN_FIELDS: string[] = [
    'dateDay', 'dateMonth', 'dateYear', 'driverClass', 'medicName'
];

export const getInitialFieldPages = (): Record<string, PageKey> => {
    const pages: Record<string, PageKey> = {};
    Object.keys(FIELD_LABELS).forEach(k => {
        pages[k] = DEFAULT_PAGE_FIELD_MAP[k] || 'page1';
    });
    return pages;
};

export const PRINT_STYLES = `
@media print {
    @page { margin: 0; size: auto; }
    body { background: white; margin: 0; padding: 0; }
    .print-modal { position: static; background: white; display: block; overflow: visible; height: auto; }
    .print-modal__content { box-shadow: none; border: none; max-width: none; max-height: none; width: 100%; position: static; }
    .print-modal__toolbar { display: none; }
    #printable-area { background: white; padding: 0; overflow: visible; }
    .print-pages { display: block; }
    .print-page { 
        position: relative; 
        width: 100%; 
        height: 100vh; 
        page-break-after: always; 
        overflow: hidden; 
        border: none;
    }
    /* Hide grid and background image when printing */
    .print-page__canvas { 
        position: absolute; 
        top: 0; left: 0; 
        width: 100%; height: 100%; 
        background-image: none !important;
    }
    .print-field-wrapper { border: none !important; background: transparent !important; }
    .print-label { display: none; }
    .print-value { color: black; } /* Font handled via inline styles now */
    .resize-handle { display: none; }
    .selection-marquee { display: none; }
    /* Hide scrollbars */
    ::-webkit-scrollbar { display: none; }
}
.print-page {
    width: 210mm; /* A4 width */
    height: 297mm; /* A4 height */
    position: relative;
    background: white;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
    margin-bottom: 20px;
    overflow: hidden;
}
.print-field-wrapper {
    position: absolute;
    white-space: nowrap;
    overflow: hidden;
    padding: 2px;
    box-sizing: border-box;
}
.draggable-active:hover {
    outline: 1px dashed #3b82f6;
    background: rgba(59, 130, 246, 0.05);
}
.draggable-selected {
    outline: 2px solid #2563eb;
    background: rgba(37, 99, 235, 0.1);
    z-index: 100;
}
.print-label {
    font-size: 10px;
    color: #9ca3af;
    pointer-events: none;
    user-select: none;
}
.print-value {
    color: #1f2937;
    pointer-events: none;
    line-height: 1.1;
}
.resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    cursor: nwse-resize;
    background: #2563eb;
    border-top-left-radius: 4px;
}
.selection-marquee {
    position: absolute;
    border: 1px dashed #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    pointer-events: none;
    z-index: 1000;
}
`;
