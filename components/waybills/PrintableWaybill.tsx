
import {
    type FC,
    type ChangeEvent,
    type MouseEvent as ReactMouseEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
    Waybill,
    Vehicle,
    Employee,
    Organization,
    FuelType,
    PrintPositions,
} from '../../types';
import { XIcon, ListBulletIcon, ArrowUturnLeftIcon, ArrowPathIcon } from '../Icons';
import { useToast } from '../../hooks/useToast';
import { DB_KEYS } from '../../services/dbKeys';
import { loadJSON, saveJSON, removeKey } from '../../services/storage';
import ConfirmationModal from '../shared/ConfirmationModal';

interface PrintableWaybillProps {
    waybill: Waybill;
    vehicle: Vehicle | undefined;
    driver: Employee | undefined;
    organization: Organization | undefined;
    dispatcher: Employee | undefined;
    controller: Employee | undefined;
    fuelType: FuelType | undefined;
    allOrganizations: Organization[];
    onClose: () => void;
}

type PageKey = 'page1' | 'page2';

type PageOffsets = Record<PageKey, { x: number; y: number }>;

type StoredPageOffsets = Record<PageKey, { x?: number; y?: number }>;

type EditorPrefs = {
    showLabels?: boolean;
    showGrid?: boolean;
    gridSize?: number;
    pageOffsets?: StoredPageOffsets;
    hiddenFields?: string[];
    fieldPages?: Record<string, PageKey>; // New: Store which page a field belongs to
};

// Default positions for STANDARD fields only.
const INITIAL_FIELD_POSITIONS = {
    waybillDay: { x: 104, y: 36 },
    waybillMonth: { x: 144, y: 36 },
    waybillYear: { x: 260, y: 36 },
    orgName: { x: 55, y: 65 },
    orgAddress: { x: 65, y: 80 },
    orgInn: { x: 200, y: 80 },
    validFromDay: { x: 112, y: 56 },
    validFromMonth: { x: 160, y: 56 },
    validFromYear: { x: 260, y: 56 },
    validToDay: { x: 328, y: 56 },
    validToMonth: { x: 376, y: 56 },
    validToYear: { x: 476, y: 56 },
    vehicleBrand: { x: 204, y: 152 },
    vehiclePlate: { x: 284, y: 176 },
    driverFullName: { x: 112, y: 200 },
    driverPersonnelNumber: { x: 468, y: 200 },
    driverLicenseNumber: { x: 136, y: 228 },
    driverLicenseCategory: { x: 464, y: 232 },
    driverSnils: { x: 136, y: 248 },
    orgMedicalLicense: { x: 140, y: 268 },
    departureDate: { x: 147, y: 434 },
    departureTime: { x: 217, y: 434 },
    odometerStart: { x: 462, y: 413 },
    driverShortName1: { x: 441, y: 441 },
    departureAllowed: { x: 182, y: 476 },
    fuelTypeName: { x: 368, y: 500 },
    fuelFilled: { x: 476, y: 567 },
    fuelAtStart: { x: 462, y: 588 },
    fuelAtEnd: { x: 468, y: 612 },
    fuelPlanned: { x: 462, y: 637 },
    fuelActual: { x: 462, y: 658 },
    arrivalDate: { x: 144, y: 772 },
    arrivalTime: { x: 216, y: 772 },
    odometerEnd: { x: 468, y: 738 },
    driverPosition1: { x: 320, y: 772 },
    driverShortName2: { x: 436, y: 772 },
    totalDistance: { x: 220, y: 728 },
    calculatorPosition: { x: 172, y: 752 },
    calculatorShortName: { x: 388, y: 752 },
};

// Fields hidden by default (user request)
const DEFAULT_HIDDEN_FIELDS = ['orgName', 'orgAddress', 'orgInn'];

// MASTER LIST of ALL available fields (Constructor)
const FIELD_LABELS: Record<string, string> = {
    // Standard fields
    waybillDay: 'День ПЛ',
    waybillMonth: 'Месяц ПЛ',
    waybillYear: 'Год ПЛ',
    orgName: 'Организация (Название)',
    orgAddress: 'Организация (Адрес)',
    orgInn: 'Организация (ИНН)',
    validFromDay: 'Действ. с (День)',
    validFromMonth: 'Действ. с (Месяц)',
    validFromYear: 'Действ. с (Год)',
    validToDay: 'Действ. по (День)',
    validToMonth: 'Действ. по (Месяц)',
    validToYear: 'Действ. по (Год)',
    vehicleBrand: 'Марка ТС',
    vehiclePlate: 'Гос. номер',
    driverFullName: 'ФИО Водителя',
    driverPersonnelNumber: 'Таб. номер',
    driverLicenseNumber: 'Номер ВУ',
    driverLicenseCategory: 'Категории ВУ',
    driverSnils: 'СНИЛС',
    orgMedicalLicense: 'Лицензия мед.',
    departureDate: 'Дата выезда',
    departureTime: 'Время выезда',
    odometerStart: 'Пробег (начало)',
    driverShortName1: 'Водитель (кратко 1)',
    departureAllowed: 'Выезд разрешил',
    fuelTypeName: 'Марка топлива',
    fuelFilled: 'Заправлено',
    fuelAtStart: 'Остаток (выезд)',
    fuelAtEnd: 'Остаток (возврат)',
    fuelPlanned: 'Расход (норма)',
    fuelActual: 'Расход (факт)',
    arrivalDate: 'Дата возврата',
    arrivalTime: 'Время возврата',
    odometerEnd: 'Пробег (конец)',
    driverPosition1: 'Должность водителя',
    driverShortName2: 'Водитель (кратко 2)',
    totalDistance: 'Пройдено, км',
    calculatorPosition: 'Расчет произвел (должность)',
    calculatorShortName: 'Расчет произвел (ФИО)',

    // Extra fields (Constructor capabilities)
    waybillNumber: 'Номер ПЛ (Текст)',
    waybillNotes: 'Примечание',
    vehicleVin: 'VIN автомобиля',
    driverPhone: 'Телефон водителя',
    dispatcherName: 'Диспетчер (ФИО)',
    mechanicName: 'Механик/Контролер (ФИО)',
    orgPhone: 'Телефон организации',
    routeFull: 'Маршрут (полный список)',
};

type FieldKey = keyof typeof INITIAL_FIELD_POSITIONS | string;

// Initial mapping (default)
const DEFAULT_PAGE_FIELD_MAP: Record<PageKey, string[]> = {
    page1: Object.keys(INITIAL_FIELD_POSITIONS),
    page2: [],
};

// Convert the list-based map to a key-value map for easier state management
const getInitialFieldPages = (): Record<string, PageKey> => {
    const map: Record<string, PageKey> = {};
    Object.entries(DEFAULT_PAGE_FIELD_MAP).forEach(([page, fields]) => {
        fields.forEach(field => {
            map[field] = page as PageKey;
        });
    });
    return map;
};

const INITIAL_PAGE_OFFSETS: PageOffsets = {
    page1: { x: 0, y: 0 },
    page2: { x: 0, y: 0 },
};

const PAGE_LABELS: Record<PageKey, string> = {
    page1: 'Стр. 1',
    page2: 'Стр. 2',
};

const GENITIVE_MONTHS = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
];

const clonePositions = (source: PrintPositions): PrintPositions =>
    Object.fromEntries(
        Object.entries(source).map(([key, pos]) => [
            key,
            { ...pos },
        ]),
    ) as PrintPositions;

const getShortName = (fullName?: string): string => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    const lastName = parts[0] ?? '';
    const firstNameInitial = parts[1] ? `${parts[1][0]}.` : '';
    const middleNameInitial = parts[2] ? `${parts[2][0]}.` : '';
    return `${lastName} ${firstNameInitial}${middleNameInitial}`.trim();
};

const getDay = (dateStr?: string): string =>
    dateStr
        ? new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit' })
        : '';

const getMonthName = (dateStr?: string): string =>
    dateStr ? GENITIVE_MONTHS[new Date(dateStr).getMonth()] : '';

const getYearShort = (dateStr?: string): string =>
    dateStr
        ? new Date(dateStr).toLocaleDateString('ru-RU', { year: '2-digit' })
        : '';

const formatDateOnly = (dateStr?: string): string =>
    dateStr ? new Date(dateStr).toLocaleDateString('ru-RU') : '';

const formatTime = (dateStr?: string): string =>
    dateStr
        ? new Date(dateStr).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
        })
        : '';

const formatPrintNumber = (num?: number): string => {
    if (num === undefined || num === null) return '';
    return Number.isInteger(num) ? String(num) : num.toFixed(2).replace('.', ',');
};

// Undo/Redo State Structure
interface HistoryState {
    positions: PrintPositions;
    fieldPages: Record<string, PageKey>;
}

const PrintableWaybill: FC<PrintableWaybillProps> = ({
    waybill,
    vehicle,
    driver,
    organization,
    dispatcher,
    controller,
    fuelType,
    allOrganizations,
    onClose,
}) => {
    const portalNodeRef = useRef<HTMLDivElement | null>(
        typeof document !== 'undefined' ? document.createElement('div') : null,
    );

    useEffect(() => {
        const portalNode = portalNodeRef.current;
        if (!portalNode || typeof document === 'undefined') return;

        portalNode.id = 'print-modal-portal';
        portalNode.classList.add('print-modal-portal');
        document.body.appendChild(portalNode);

        return () => {
            portalNode.classList.remove('print-modal-portal');
            portalNode.parentNode?.removeChild(portalNode);
        };
    }, []);

    // --- States ---

    // Data States
    const [positions, setPositions] = useState<PrintPositions>(() =>
        clonePositions(INITIAL_FIELD_POSITIONS),
    );
    const [fieldPages, setFieldPages] = useState<Record<string, PageKey>>(() => getInitialFieldPages());

    // UI States
    const [showPlaceholders, setShowPlaceholders] = useState(true);
    const [forcePage2, setForcePage2] = useState(false);
    const [editingEnabled, setEditingEnabled] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showGrid, setShowGrid] = useState(false);
    const [gridSize, setGridSize] = useState(10);
    const [pageOffsets, setPageOffsets] = useState<PageOffsets>(INITIAL_PAGE_OFFSETS);
    const [selectedIds, setSelectedIds] = useState<FieldKey[]>([]);
    const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set(DEFAULT_HIDDEN_FIELDS));
    const [isFieldSettingsOpen, setIsFieldSettingsOpen] = useState(false);

    // States for Selection and Resizing
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    const [activePage, setActivePage] = useState<PageKey | null>(null);

    // Undo/Redo
    const [history, setHistory] = useState<{ past: HistoryState[], future: HistoryState[] }>({ past: [], future: [] });
    // Snapshot for drag operation
    const historySnapshot = useRef<HistoryState | null>(null);

    const dragInfo = useRef<{
        type: 'drag' | 'resize';
        startPoint: { x: number; y: number };
        // For Drag
        startPositions?: PrintPositions;
        // For Resize
        initialWidths?: Record<string, number>;
        initialHeights?: Record<string, number | undefined>; // NEW: Store initial heights
    } | null>(null);

    const { showToast } = useToast();

    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    // --- Derived Values ---

    const totalDistance = useMemo(
        () =>
            waybill.routes.reduce(
                (sum, route) => sum + (route.distanceKm ?? 0),
                0,
            ),
        [waybill.routes],
    );

    const fuelActual = useMemo(
        () =>
            (waybill.fuelAtStart ?? 0) +
            (waybill.fuelFilled ?? 0) -
            (waybill.fuelAtEnd ?? 0),
        [waybill.fuelAtStart, waybill.fuelFilled, waybill.fuelAtEnd],
    );

    const controllerShortName = useMemo(
        () => getShortName(controller?.fullName),
        [controller],
    );

    const effectiveOrgFields = useMemo(() => {
        if (!organization) return {};
        if (organization.parentOrganizationId) {
            const parent = allOrganizations.find(o => o.id === organization.parentOrganizationId);
            if (parent) {
                return {
                    name: parent.fullName || parent.shortName,
                    address: parent.address || organization.address,
                    inn: parent.inn || organization.inn,
                    phone: parent.phone || organization.phone
                };
            }
        }
        return {
            name: organization.fullName || organization.shortName,
            address: organization.address,
            inn: organization.inn,
            phone: organization.phone
        };
    }, [organization, allOrganizations]);

    const medicalOrg = useMemo(
        () =>
            allOrganizations.find((org) => org.id === driver?.medicalInstitutionId),
        [allOrganizations, driver],
    );

    const renderValue = useCallback(
        (id: FieldKey) => {
            switch (id) {
                // --- Standard Fields ---
                case 'waybillDay': return getDay(waybill.date);
                case 'waybillMonth': return getMonthName(waybill.date);
                case 'waybillYear': return getYearShort(waybill.date);
                case 'orgName': return effectiveOrgFields.name ?? '';
                case 'orgAddress': return effectiveOrgFields.address ?? '';
                case 'orgInn': return effectiveOrgFields.inn ?? '';
                case 'validFromDay': return getDay(waybill.validFrom);
                case 'validFromMonth': return getMonthName(waybill.validFrom);
                case 'validFromYear': return getYearShort(waybill.validFrom);
                case 'validToDay': return getDay(waybill.validTo);
                case 'validToMonth': return getMonthName(waybill.validTo);
                case 'validToYear': return getYearShort(waybill.validTo);
                case 'vehicleBrand': return vehicle?.brand ?? '';
                case 'vehiclePlate': return vehicle?.plateNumber ?? '';
                case 'driverFullName': return driver?.fullName ?? '';
                case 'driverPersonnelNumber': return driver?.personnelNumber ?? '';
                case 'driverLicenseNumber': return driver?.documentNumber ?? '';
                case 'driverLicenseCategory': return driver?.licenseCategory ?? '';
                case 'driverSnils': return driver?.snils ?? '';
                case 'orgMedicalLicense': return medicalOrg ? `№${medicalOrg.medicalLicenseNumber || ''} от ${formatDateOnly(medicalOrg.medicalLicenseIssueDate)}` : '';
                case 'departureDate': return formatDateOnly(waybill.validFrom);
                case 'departureTime': return formatTime(waybill.validFrom);
                case 'odometerStart': return formatPrintNumber(waybill.odometerStart);
                case 'driverShortName1': return getShortName(driver?.fullName);
                case 'departureAllowed': return getShortName(dispatcher?.fullName);
                case 'fuelTypeName': return fuelType?.name ?? '';
                case 'fuelFilled': return formatPrintNumber(waybill.fuelFilled);
                case 'fuelAtStart': return formatPrintNumber(waybill.fuelAtStart);
                case 'fuelAtEnd': return formatPrintNumber(waybill.fuelAtEnd);
                case 'fuelPlanned': return formatPrintNumber(waybill.fuelPlanned);
                case 'fuelActual': return formatPrintNumber(fuelActual);
                case 'arrivalDate': return formatDateOnly(waybill.validTo);
                case 'arrivalTime': return formatTime(waybill.validTo);
                case 'odometerEnd': return formatPrintNumber(waybill.odometerEnd);
                case 'driverPosition1': return driver?.position ?? '';
                case 'driverShortName2': return getShortName(driver?.fullName);
                case 'totalDistance': return formatPrintNumber(totalDistance);
                case 'calculatorPosition': return controller?.position ?? '';
                case 'calculatorShortName': return controllerShortName;

                // --- Extra Fields (Constructor) ---
                case 'waybillNumber': return waybill.number;
                case 'waybillNotes': return waybill.notes || '';
                case 'vehicleVin': return vehicle?.vin || '';
                case 'driverPhone': return driver?.phone || '';
                case 'dispatcherName': return dispatcher?.fullName || '';
                case 'mechanicName': return controller?.fullName || '';
                case 'orgPhone': return effectiveOrgFields.phone || '';
                case 'createdBy': return 'Система'; // Placeholder or use waybill.createdBy if available
                case 'routeFull': return waybill.routes.map(r => `${r.from} - ${r.to}`).join('; ');

                default: return '';
            }
        },
        [waybill, effectiveOrgFields, vehicle, driver, dispatcher, controller, controllerShortName, fuelType, medicalOrg, fuelActual, totalDistance],
    );

    const hasRoutesWithDistance = useMemo(
        () => waybill.routes.some((route) => (route.distanceKm ?? 0) > 0 || (route.notes && route.notes.trim().length > 0)),
        [waybill.routes],
    );

    const pageFieldList = useMemo(() => {
        const p1: FieldKey[] = [];
        const p2: FieldKey[] = [];
        Object.entries(fieldPages).forEach(([key, page]) => {
            if (page === 'page1') p1.push(key as FieldKey);
            else p2.push(key as FieldKey);
        });
        return { page1: p1, page2: p2 };
    }, [fieldPages]);

    // --- Effects ---

    useEffect(() => {
        (async () => {
            try {
                const savedPositions = await loadJSON<PrintPositions | null>(DB_KEYS.PRINT_POSITIONS, null);
                if (savedPositions) {
                    setPositions((prev) => ({ ...clonePositions(prev), ...clonePositions(savedPositions) }));
                }

                const prefs = await loadJSON<EditorPrefs | null>(DB_KEYS.PRINT_EDITOR_PREFS, null);
                if (prefs) {
                    setShowLabels(prefs.showLabels === undefined ? true : Boolean(prefs.showLabels));
                    setShowGrid(Boolean(prefs.showGrid));
                    setGridSize(typeof prefs.gridSize === 'number' && prefs.gridSize > 0 ? prefs.gridSize : 10);

                    if (prefs.fieldPages) {
                        setFieldPages(prefs.fieldPages);
                    }

                    if (prefs.pageOffsets) {
                        setPageOffsets({
                            page1: { x: prefs.pageOffsets.page1?.x ?? INITIAL_PAGE_OFFSETS.page1.x, y: prefs.pageOffsets.page1?.y ?? INITIAL_PAGE_OFFSETS.page1.y },
                            page2: { x: prefs.pageOffsets.page2?.x ?? INITIAL_PAGE_OFFSETS.page2.x, y: prefs.pageOffsets.page2?.y ?? INITIAL_PAGE_OFFSETS.page2.y },
                        });
                    }
                    if (prefs.hiddenFields) {
                        setHiddenFields(new Set(prefs.hiddenFields));
                    }
                }
            } catch {
                showToast('Не удалось загрузить сохраненные настройки печати.', 'error');
            }
        })();
    }, [showToast]);

    // Handle Undo/Redo keybinds
    useEffect(() => {
        if (!editingEnabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
                e.preventDefault();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                handleRedo();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingEnabled, history, onClose]);

    // --- Handlers ---

    const recordHistory = useCallback((newState: HistoryState) => {
        setHistory(prev => {
            const newPast = [...prev.past, newState];
            if (newPast.length > 50) newPast.shift(); // Limit history size
            return {
                past: newPast,
                future: []
            };
        });
    }, []);

    const handleUndo = useCallback(() => {
        setHistory(prev => {
            if (prev.past.length === 0) return prev;
            const previous = prev.past[prev.past.length - 1];
            const newPast = prev.past.slice(0, -1);

            // Save current to future
            const current: HistoryState = { positions: clonePositions(positions), fieldPages: { ...fieldPages } };

            setPositions(previous.positions);
            setFieldPages(previous.fieldPages);

            return {
                past: newPast,
                future: [current, ...prev.future]
            };
        });
    }, [positions, fieldPages]);

    const handleRedo = useCallback(() => {
        setHistory(prev => {
            if (prev.future.length === 0) return prev;
            const next = prev.future[0];
            const newFuture = prev.future.slice(1);

            // Save current to past
            const current: HistoryState = { positions: clonePositions(positions), fieldPages: { ...fieldPages } };

            setPositions(next.positions);
            setFieldPages(next.fieldPages);

            return {
                past: [...prev.past, current],
                future: newFuture
            };
        });
    }, [positions, fieldPages]);

    const savePreferences = useCallback(async (currentHiddenFields: Set<string>, currentFieldPages: Record<string, PageKey>) => {
        try {
            await saveJSON(DB_KEYS.PRINT_EDITOR_PREFS, {
                showLabels,
                showGrid,
                gridSize,
                pageOffsets: {
                    page1: { ...pageOffsets.page1 },
                    page2: { ...pageOffsets.page2 },
                },
                hiddenFields: Array.from(currentHiddenFields),
                fieldPages: currentFieldPages
            });
        } catch {
            console.error('Failed to save print preferences');
        }
    }, [showLabels, showGrid, gridSize, pageOffsets]);

    const handleSavePositions = useCallback(async () => {
        try {
            await saveJSON(DB_KEYS.PRINT_POSITIONS, clonePositions(positions));
            await savePreferences(hiddenFields, fieldPages);
            showToast('Позиции и настройки сохранены.', 'success');
            setEditingEnabled(false);
            setSelectedIds([]);
            setHistory({ past: [], future: [] }); // Clear history on save
        } catch {
            showToast('Не удалось сохранить настройки печати.', 'error');
        }
    }, [positions, hiddenFields, savePreferences, fieldPages, showToast]);

    const handleResetPositions = useCallback(async () => {
        setIsResetConfirmOpen(false);
        try {
            await removeKey(DB_KEYS.PRINT_POSITIONS);
            await removeKey(DB_KEYS.PRINT_EDITOR_PREFS);
        } catch {
            showToast('Не удалось очистить сохраненные настройки.', 'error');
        }

        setPositions(clonePositions(INITIAL_FIELD_POSITIONS));
        setPageOffsets(INITIAL_PAGE_OFFSETS);
        setFieldPages(getInitialFieldPages());
        setHiddenFields(new Set(DEFAULT_HIDDEN_FIELDS));
        setSelectedIds([]);
        setHistory({ past: [], future: [] });
        showToast('Настройки печати сброшены.', 'info');
    }, [showToast]);

    const toggleFieldVisibility = (field: string) => {
        const isHidden = hiddenFields.has(field);
        const existsInPositions = positions[field] !== undefined;

        if (!isHidden && existsInPositions) {
            // Hide it
            setHiddenFields(prev => new Set([...prev, field]));
        } else {
            // Show it
            setHiddenFields(prev => {
                const next = new Set(prev);
                next.delete(field);
                return next;
            });

            // Constructor Logic: If it strictly doesn't exist in positions yet, add it
            if (!existsInPositions) {
                setPositions(prev => ({
                    ...prev,
                    [field]: { x: 50, y: 50 } // Default spawn point
                }));
                setFieldPages(prev => ({
                    ...prev,
                    [field]: 'page1'
                }));
            }
        }
    };

    const closeFieldSettings = () => {
        savePreferences(hiddenFields, fieldPages);
        setIsFieldSettingsOpen(false);
    };

    const handleDragStart = useCallback(
        (id: FieldKey, e: ReactMouseEvent<HTMLDivElement>) => {
            if (!editingEnabled) return;

            e.preventDefault();
            e.stopPropagation();

            // Save snapshot BEFORE change
            historySnapshot.current = {
                positions: clonePositions(positions),
                fieldPages: { ...fieldPages }
            };

            const multi = e.ctrlKey || e.metaKey;

            setSelectedIds((prev) => {
                if (multi) {
                    return prev.includes(id)
                        ? prev.filter((key) => key !== id)
                        : [...prev, id];
                }
                return prev.includes(id) ? prev : [id];
            });

            // We need to know which page we started dragging from to handle cross-page drag visual
            // For now, dragging is visual via CSS 'left/top'. Cross-page logic happens on MouseUp.

            dragInfo.current = {
                type: 'drag',
                startPoint: { x: e.clientX, y: e.clientY },
                startPositions: clonePositions(positions),
            };

            document.body.style.cursor = 'grabbing';
        },
        [editingEnabled, positions, fieldPages],
    );

    const handleResizeStart = useCallback(
        (id: FieldKey, e: ReactMouseEvent<HTMLDivElement>) => {
            if (!editingEnabled) return;
            e.preventDefault();
            e.stopPropagation();

            historySnapshot.current = {
                positions: clonePositions(positions),
                fieldPages: { ...fieldPages }
            };

            if (!selectedIds.includes(id)) {
                setSelectedIds([id]);
            }

            const targets = selectedIds.includes(id) ? selectedIds : [id];
            const initialWidths: Record<string, number> = {};
            const initialHeights: Record<string, number | undefined> = {};

            targets.forEach(tid => {
                const w = positions[tid]?.width;
                const h = positions[tid]?.height;
                initialWidths[tid] = w || 150;
                initialHeights[tid] = h;
            });

            dragInfo.current = {
                type: 'resize',
                startPoint: { x: e.clientX, y: e.clientY },
                initialWidths,
                initialHeights
            };

            document.body.style.cursor = 'nwse-resize';
        },
        [editingEnabled, selectedIds, positions, fieldPages]
    );

    const handleGlobalMouseMove = useCallback(
        (event: globalThis.MouseEvent) => {
            if (!dragInfo.current) {
                // Marquee logic...
                if (selectionBox && activePage) {
                    const canvas = document.getElementById(`print-page-canvas-${activePage}`);
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const x = event.clientX - rect.left;
                        const y = event.clientY - rect.top;
                        setSelectionBox(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
                    }
                }
                return;
            }

            const { type, startPoint } = dragInfo.current;
            const deltaX = event.clientX - startPoint.x;
            const deltaY = event.clientY - startPoint.y;

            if (type === 'drag') {
                const { startPositions } = dragInfo.current;
                if (!startPositions) return;

                setPositions(() => {
                    const next = clonePositions(startPositions);
                    for (const id of selectedIds) {
                        const base = startPositions[id];
                        if (base) {
                            next[id] = {
                                ...base,
                                x: base.x + deltaX,
                                y: base.y + deltaY,
                            };
                        }
                    }
                    return next;
                });
            } else if (type === 'resize') {
                const { initialWidths, initialHeights } = dragInfo.current;
                if (!initialWidths || !initialHeights) return;

                setPositions((current) => {
                    const next = clonePositions(current);
                    Object.keys(initialWidths).forEach(id => {
                        const startW = initialWidths[id];
                        const newW = Math.max(20, startW + deltaX);

                        const startH = initialHeights[id];
                        // If height was previously auto/undefined, treat it as roughly 15px for calculation base
                        // or just add delta to a base value.
                        // Better approach: If startH is undefined, capture rendered height? 
                        // For simplicity, treat undefined as 15px (approx font size height).
                        const baseH = startH || 15;
                        const newH = Math.max(10, baseH + deltaY);

                        if (next[id]) {
                            next[id].width = newW;
                            next[id].height = newH;
                        }
                    });
                    return next;
                });
            }
        },
        [selectedIds, selectionBox, activePage],
    );

    const handleGlobalMouseUp = useCallback((e: globalThis.MouseEvent) => {
        // 1. Handle Drag/Resize End
        if (dragInfo.current) {
            const wasDrag = dragInfo.current.type === 'drag';

            let newPositions = clonePositions(positions);
            let newFieldPages = { ...fieldPages };

            // Handle Drag Snapping & Cross-Page Move
            if (wasDrag) {
                // Check for cross-page drop
                // We need to check if we are over a DIFFERENT page than where items currently are.
                // Items might be on different pages, but let's assume selection moves together.
                // We check the page under the mouse cursor.

                const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);
                let targetPage: PageKey | null = null;

                for (const el of elementsUnder) {
                    if (el.id === 'print-page-canvas-page1') { targetPage = 'page1'; break; }
                    if (el.id === 'print-page-canvas-page2') { targetPage = 'page2'; break; }
                }

                if (targetPage) {
                    const targetPageEl = document.getElementById(`print-page-canvas-${targetPage}`);
                    const targetRect = targetPageEl?.getBoundingClientRect();

                    if (targetRect) {
                        // Update field pages and coordinates
                        selectedIds.forEach(fieldId => {
                            const currentPage = fieldPages[fieldId];

                            // Apply Grid Snapping first (visual cleanup)
                            if (showGrid && gridSize > 0) {
                                const p = newPositions[fieldId];
                                if (p) {
                                    newPositions[fieldId] = { ...p, x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
                                }
                            }

                            // If changing pages
                            if (targetPage !== currentPage) {
                                const currentPos = newPositions[fieldId];
                                if (currentPos) {
                                    // We need to calculate position relative to NEW page.
                                    // Visual pos was updated via MouseMove relative to OLD page origin + delta.
                                    // But technically React hasn't re-rendered with new parent yet.
                                    // So `currentPos` is relative to OLD parent.
                                    // Absolute Screen Pos = OldParentRect.left + currentPos.x
                                    // New Local Pos = Absolute Screen Pos - NewParentRect.left

                                    const oldPageEl = document.getElementById(`print-page-canvas-${currentPage}`);
                                    const oldRect = oldPageEl?.getBoundingClientRect();

                                    if (oldRect) {
                                        const absX = oldRect.left + currentPos.x;
                                        const absY = oldRect.top + currentPos.y;

                                        const newX = absX - targetRect.left;
                                        const newY = absY - targetRect.top;

                                        newPositions[fieldId] = { ...currentPos, x: newX, y: newY };
                                        newFieldPages[fieldId] = targetPage as PageKey;

                                        // Re-snap to grid on new page
                                        if (showGrid && gridSize > 0) {
                                            newPositions[fieldId].x = Math.round(newPositions[fieldId].x / gridSize) * gridSize;
                                            newPositions[fieldId].y = Math.round(newPositions[fieldId].y / gridSize) * gridSize;
                                        }
                                    }
                                }
                            }
                        });
                    }
                } else {
                    // Drop outside any page? Revert? Or just snap to current page boundaries?
                    // Just snap to grid on current page
                    if (showGrid && gridSize > 0) {
                        selectedIds.forEach(id => {
                            const p = newPositions[id];
                            if (p) {
                                newPositions[id] = { ...p, x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
                            }
                        });
                    }
                }
            }

            // Update State
            setPositions(newPositions);
            setFieldPages(newFieldPages);

            // Record History if changed
            if (historySnapshot.current) {
                const hasChanged = JSON.stringify(newPositions) !== JSON.stringify(historySnapshot.current.positions) ||
                    JSON.stringify(newFieldPages) !== JSON.stringify(historySnapshot.current.fieldPages);

                if (hasChanged) {
                    recordHistory(historySnapshot.current);
                }
            }

            dragInfo.current = null;
            historySnapshot.current = null;
            document.body.style.cursor = '';
        }

        // 2. Handle Selection End (Marquee)
        if (selectionBox && activePage) {
            const { startX, startY, currentX, currentY } = selectionBox;
            const x = Math.min(startX, currentX);
            const y = Math.min(startY, currentY);
            const w = Math.abs(currentX - startX);
            const h = Math.abs(currentY - startY);

            if (w > 2 || h > 2) {
                const newSelectedIds: FieldKey[] = [];
                const fieldsOnPage = pageFieldList[activePage];

                fieldsOnPage.forEach(fieldId => {
                    const el = document.querySelector(`[data-id="${fieldId}"]`);
                    if (el) {
                        const canvas = document.getElementById(`print-page-canvas-${activePage}`);
                        if (canvas) {
                            const canvasRect = canvas.getBoundingClientRect();
                            const elRect = el.getBoundingClientRect();

                            const elLeft = elRect.left - canvasRect.left;
                            const elTop = elRect.top - canvasRect.top;
                            const elRight = elLeft + elRect.width;
                            const elBottom = elTop + elRect.height;

                            const selRight = x + w;
                            const selBottom = y + h;

                            if (x < elRight && selRight > elLeft && y < elBottom && selBottom > elTop) {
                                newSelectedIds.push(fieldId);
                            }
                        }
                    }
                });

                if (newSelectedIds.length > 0) {
                    setSelectedIds(newSelectedIds);
                } else {
                    setSelectedIds([]);
                }
            } else {
                setSelectedIds([]);
            }

            setSelectionBox(null);
            setActivePage(null);
        }
    }, [showGrid, gridSize, selectedIds, selectionBox, activePage, positions, fieldPages, pageFieldList, recordHistory]);

    useEffect(() => {
        if (editingEnabled) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [editingEnabled, handleGlobalMouseMove, handleGlobalMouseUp]);

    const updatePageOffset = (page: PageKey, axis: 'x' | 'y', e: ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
            setPageOffsets(prev => ({
                ...prev,
                [page]: {
                    ...prev[page],
                    [axis]: val
                }
            }));
        }
    };

    const handlePageMouseDown = (pageKey: PageKey, e: ReactMouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && editingEnabled) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            setActivePage(pageKey);
            setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y });
            setSelectedIds([]);
        }
    };

    const DraggableField: FC<{ id: FieldKey; label: string; value: string }> = ({ id, label, value }) => {
        const pos = positions[id];
        const isSelected = selectedIds.includes(id);

        let displayValue = value;
        const isEmpty = !value || value.trim() === '';

        if (isEmpty) {
            if (showPlaceholders && editingEnabled) displayValue = `[${label}]`;
            else if (!editingEnabled) return null; // Hide in print preview if empty
        }

        return (
            <div
                className={`print-field-wrapper ${editingEnabled ? 'cursor-grab active:cursor-grabbing' : ''} ${isSelected ? 'draggable-selected' : ''} ${editingEnabled && !isSelected ? 'draggable-active' : ''}`}
                style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    width: pos.width ? `${pos.width}px` : 'auto',
                    height: pos.height ? `${pos.height}px` : 'auto',
                    position: 'absolute',
                    zIndex: isSelected ? 10 : 1
                }}
                data-id={id}
                onMouseDown={(e) => handleDragStart(id, e)}
            >
                <div className="print-field" style={{ width: '100%', height: '100%' }}>
                    {editingEnabled && showLabels && (
                        <span className="print-label mr-1">{label}:</span>
                    )}
                    <span className={`print-value ${isEmpty ? 'text-gray-400 italic' : ''}`}>
                        {displayValue || (editingEnabled ? `[${label}]` : '')}
                    </span>
                </div>

                {isSelected && editingEnabled && (
                    <div
                        className="resize-handle"
                        onMouseDown={(e) => handleResizeStart(id, e)}
                    />
                )}
            </div>
        );
    };

    const pageKeysToRender = useMemo(() => {
        const keys: PageKey[] = ['page1'];
        // Logic to detect if page 2 is needed
        // Check if any fields are assigned to page2
        const hasFieldsOnPage2 = Object.values(fieldPages).some(p => p === 'page2');

        // Also keep old logic for backward compat if data not migrated (though we default map)
        const meaningfulPage2Fields = pageFieldList.page2.filter((fieldId) => {
            const value = renderValue(fieldId);
            if (value === undefined || value === null) return false;
            const cleaned = String(value).replace(/[_\s.,-]/g, '');
            return cleaned.length > 0 && !/^0+$/.test(cleaned);
        });

        const shouldRenderPage2 =
            forcePage2 ||
            hasFieldsOnPage2 ||
            hasRoutesWithDistance ||
            (totalDistance ?? 0) > 0 ||
            meaningfulPage2Fields.length > 0;

        if (shouldRenderPage2) {
            keys.push('page2');
        }

        return keys;
    }, [forcePage2, hasRoutesWithDistance, renderValue, totalDistance, fieldPages, pageFieldList]);

    if (!portalNodeRef.current) {
        return null;
    }

    return createPortal(
        <div
            id="print-modal"
            role="dialog"
            aria-modal="true"
            className="print-modal fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4"
            onClick={onClose}
        >
            <ConfirmationModal
                isOpen={isResetConfirmOpen}
                onClose={() => setIsResetConfirmOpen(false)}
                onConfirm={handleResetPositions}
                title="Сбросить настройки?"
                message="Сбросить позиции, смещения и распределение по страницам к заводским настройкам?"
                confirmText="Сбросить"
                confirmButtonClass="bg-yellow-600 hover:bg-yellow-700"
            />

            {isFieldSettingsOpen && (
                <div className="absolute top-16 right-4 z-[60] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-4 w-96 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-3 pb-2 border-b dark:border-gray-700">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Настройка полей</h4>
                        <button onClick={closeFieldSettings} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                            <XIcon className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {Object.entries(FIELD_LABELS).map(([key, label]) => {
                            const isActive = positions[key] !== undefined && !hiddenFields.has(key);
                            return (
                                <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded">
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={() => toggleFieldVisibility(key)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className={`truncate ${!isActive ? 'text-gray-500' : 'text-gray-700 dark:text-gray-200 font-medium'}`}>{label}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div className="mt-3 pt-2 border-t dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 text-center">
                        Новые поля появятся в центре 1-й стр.
                    </div>
                </div>
            )}

            <div
                className="print-modal__content bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col border border-gray-300"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="print-modal__toolbar flex flex-wrap gap-4 items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Печать путевого листа
                    </h3>

                    <div className="flex flex-col gap-3 items-end w-full lg:w-auto">
                        <div className="flex flex-wrap items-center gap-3 justify-end text-sm text-gray-700 dark:text-gray-200">
                            {editingEnabled && (
                                <div className="flex items-center gap-1 mr-2 border-r pr-3 dark:border-gray-600">
                                    <button
                                        onClick={handleUndo}
                                        disabled={history.past.length === 0}
                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                                        title="Отменить (Ctrl+Z)"
                                    >
                                        <ArrowUturnLeftIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={handleRedo}
                                        disabled={history.future.length === 0}
                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transform scale-x-[-1]"
                                        title="Повторить (Ctrl+Y)"
                                    >
                                        <ArrowUturnLeftIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={() => setIsFieldSettingsOpen(!isFieldSettingsOpen)}
                                className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${isFieldSettingsOpen ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white dark:bg-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                title="Настроить видимость полей"
                            >
                                <ListBulletIcon className="h-4 w-4" />
                                Поля
                            </button>

                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={editingEnabled}
                                    onChange={(event) => {
                                        setEditingEnabled(event.target.checked);
                                        if (!event.target.checked) {
                                            setSelectedIds([]);
                                            setSelectionBox(null);
                                            dragInfo.current = null;
                                            document.body.style.cursor = '';
                                        }
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Режим ред.
                            </label>

                            {editingEnabled && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleSavePositions}
                                        className="bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 transition-colors"
                                    >
                                        Сохранить
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsResetConfirmOpen(true)}
                                        className="bg-yellow-500 text-white font-semibold py-1 px-3 rounded-lg hover:bg-yellow-600 transition-colors"
                                    >
                                        Сбросить
                                    </button>
                                    <label className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={showLabels}
                                            onChange={(event) => setShowLabels(event.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        Подписи
                                    </label>
                                    <label className="inline-flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={showGrid}
                                            onChange={(event) => setShowGrid(event.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        Сетка
                                    </label>
                                    {showGrid && (
                                        <label className="inline-flex items-center gap-2">
                                            <span>Шаг</span>
                                            <input
                                                type="number"
                                                min={1}
                                                value={gridSize}
                                                onChange={(event) =>
                                                    setGridSize(Math.max(1, Number(event.target.value)))
                                                }
                                                className="w-16 p-1 text-sm bg-white dark:bg-gray-600 border rounded"
                                            />
                                            <span>px</span>
                                        </label>
                                    )}
                                </>
                            )}

                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={showPlaceholders}
                                    onChange={(event) => setShowPlaceholders(event.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Пустые поля
                            </label>
                            <label className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={forcePage2}
                                    onChange={(event) => setForcePage2(event.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Всегда 2-я стр.
                            </label>

                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Печать
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                                aria-label="Закрыть"
                            >
                                <XIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {editingEnabled && (
                            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-gray-700 dark:text-gray-200">
                                {(Object.keys(PAGE_LABELS) as PageKey[]).map((pageKey) => (
                                    <div
                                        key={pageKey}
                                        className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"
                                    >
                                        <span className="font-semibold">{PAGE_LABELS[pageKey]}</span>
                                        <span>X:</span>
                                        <input
                                            type="number"
                                            value={pageOffsets[pageKey].x}
                                            onChange={(event) => updatePageOffset(pageKey, 'x', event)}
                                            className="w-16 p-1 bg-white dark:bg-gray-600 border rounded"
                                        />
                                        <span>Y:</span>
                                        <input
                                            type="number"
                                            value={pageOffsets[pageKey].y}
                                            onChange={(event) => updatePageOffset(pageKey, 'y', event)}
                                            className="w-16 p-1 bg-white dark:bg-gray-600 border rounded"
                                        />
                                        <span>px</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </header>

                <main
                    id="printable-area"
                    className="p-4 overflow-auto flex-grow bg-gray-200 dark:bg-gray-900"
                >
                    <div className="print-pages flex flex-col items-center gap-6">
                        {pageKeysToRender.map((pageKey) => {
                            const pageOffset = pageOffsets[pageKey];
                            const gridStyles =
                                editingEnabled && showGrid
                                    ? {
                                        backgroundSize: `${gridSize}px ${gridSize}px`,
                                        backgroundImage:
                                            'linear-gradient(to right, #ccc 1px, transparent 1px), linear-gradient(to bottom, #ccc 1px, transparent 1px)',
                                        backgroundPosition: '-1px -1px',
                                    }
                                    : {};

                            const isPageActive = activePage === pageKey && selectionBox !== null;
                            const selectionStyle = isPageActive && selectionBox ? {
                                left: Math.min(selectionBox.startX, selectionBox.currentX),
                                top: Math.min(selectionBox.startY, selectionBox.currentY),
                                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                                height: Math.abs(selectionBox.currentY - selectionBox.startY)
                            } : {};

                            return (
                                <div className="print-page" key={pageKey}>
                                    <div
                                        id={`print-page-canvas-${pageKey}`}
                                        className="print-page__canvas"
                                        onMouseDown={(e) => handlePageMouseDown(pageKey, e)}
                                        style={{
                                            transform: `translate(${pageOffset.x}px, ${pageOffset.y}px)`,
                                            transformOrigin: 'top left',
                                            ...gridStyles,
                                        }}
                                    >
                                        {isPageActive && selectionBox && (
                                            <div className="selection-marquee" style={selectionStyle} />
                                        )}

                                        {pageFieldList[pageKey].map((id) => {
                                            if (hiddenFields.has(id)) return null;

                                            return (
                                                <DraggableField
                                                    key={id}
                                                    id={id}
                                                    label={FIELD_LABELS[id]}
                                                    value={renderValue(id)}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>
            </div>

            <style
                dangerouslySetInnerHTML={{
                    __html: `
            .print-modal__toolbar input[type='checkbox'] {
              accent-color: #2563eb;
            }

            .print-pages {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 1.5rem;
            }

            .print-page {
              position: relative;
              width: 148.5mm;
              height: 210mm;
              background: #fff;
              box-shadow: 0 0 10px rgba(0,0,0,.15);
              box-sizing: border-box;
              break-inside: avoid;
              page-break-inside: avoid;
              overflow: hidden;
              border: 1px solid rgba(0,0,0,0.08);
            }

            .print-page__canvas {
              position: absolute;
              inset: 0;
            }

            .print-field-wrapper {
              position: absolute;
            }

            .print-field,
            .print-field * {
              color: #000 !important;
              background: transparent !important;
              font-family: 'Times New Roman', Times, serif;
              font-size: 11pt;
              white-space: nowrap;
            }

            .print-field {
              display: inline-flex;
              align-items: baseline;
              gap: 6px;
              padding: 0;
              line-height: 1;
              position: relative;
              align-items: flex-start;
              white-space: nowrap;
            }

            .draggable-active {
              border: 1px dashed rgba(220, 38, 38, 0.8);
              background: rgba(254, 226, 226, 0.4);
              border-radius: 4px;
            }

            .draggable-selected {
              border-color: rgba(37, 99, 235, 0.9) !important;
              background: rgba(191, 219, 254, 0.45) !important;
              box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18);
              z-index: 5;
            }

            .resize-handle {
                position: absolute;
                right: -5px;
                bottom: -5px;
                width: 10px;
                height: 10px;
                background: #2563eb;
                border: 1px solid white;
                border-radius: 50%;
                cursor: nwse-resize;
                z-index: 10;
            }

            .selection-marquee {
                position: absolute;
                background: rgba(59, 130, 246, 0.2);
                border: 1px solid rgba(59, 130, 246, 0.8);
                pointer-events: none; /* Let clicks pass through */
                z-index: 100;
            }

            .print-label {
              font-size: 8pt;
              color: #4b5563 !important;
              font-style: italic;
              user-select: none;
            }

            .print-value {
              font-weight: bold;
              /* max-width removed to allow user resizing via wrapper width */
              overflow: hidden;
              text-overflow: ellipsis;
              width: 100%;
            }

            @page {
              size: A5 portrait;
              margin: 6mm;
            }

            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                width: auto !important;
                height: auto !important;
                overflow: visible !important;
              }

              body > :not(#print-modal-portal) {
                display: none !important;
              }

              #print-modal-portal {
                display: block !important;
                position: static !important;
                margin: 0 !important;
                padding: 0 !important;
                background: transparent !important;
              }

              #print-modal {
                position: static !important;
                inset: auto !important;
                display: block !important;
                width: auto !important;
                height: auto !important;
                padding: 0 !important;
                background: transparent !important;
              }

              .print-modal__content {
                display: block !important;
                width: auto !important;
                max-width: none !important;
                height: auto !important;
                box-shadow: none !important;
                background: transparent !important;
                border: none !important;
              }

              .print-modal__toolbar {
                display: none !important;
              }

              #printable-area {
                padding: 0 !important;
                margin: 0 !important;
                background: transparent !important;
                overflow: visible !important;
              }

              .print-pages {
                display: block !important;
                gap: 0 !important;
              }

              .print-page {
                margin: 0 auto !important;
                box-shadow: none !important;
                border: none !important;
                page-break-after: auto !important;
                break-after: auto !important;
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }

              .draggable-active,
              .draggable-selected,
              .print-label,
              .resize-handle,
              .selection-marquee {
                display: none !important;
              }

              .print-page:not(:last-child) {
                page-break-after: always !important;
                break-after: page !important;
              }

              .print-page:last-child {
                page-break-after: avoid !important;
                break-after: avoid-page !important;
              }

              .print-page__canvas {
                background-image: none !important;
              }
            }
          `,
                }}
            />
        </div>,
        portalNodeRef.current,
    );
};

export default PrintableWaybill;