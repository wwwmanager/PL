import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ChangeEvent,
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
import { XIcon } from '../Icons';
import { useToast } from '../../hooks/useToast';
import { DB_KEYS } from '../../services/dbKeys';
import { loadJSON, saveJSON, removeKey } from '../../services/storage';

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
};

const INITIAL_FIELD_POSITIONS: PrintPositions = {
  waybillDay: { x: 150, y: 35 },
  waybillMonth: { x: 170, y: 35 },
  waybillYear: { x: 220, y: 35 },
  validFromDay: { x: 65, y: 50 },
  validFromMonth: { x: 85, y: 50 },
  validFromYear: { x: 135, y: 50 },
  validToDay: { x: 175, y: 50 },
  validToMonth: { x: 195, y: 50 },
  validToYear: { x: 245, y: 50 },
  vehicleBrand: { x: 100, y: 110 },
  vehiclePlate: { x: 250, y: 110 },
  driverFullName: { x: 55, y: 135 },
  driverPersonnelNumber: { x: 250, y: 135 },
  driverLicenseNumber: { x: 95, y: 155 },
  driverLicenseCategory: { x: 245, y: 155 },
  driverSnils: { x: 75, y: 170 },
  orgMedicalLicense: { x: 95, y: 185 },
  departureDate: { x: 60, y: 245 },
  departureTime: { x: 110, y: 245 },
  odometerStart: { x: 245, y: 230 },
  driverShortName1: { x: 210, y: 255 },
  departureAllowed: { x: 70, y: 275 },
  fuelTypeName: { x: 245, y: 275 },
  fuelFilled: { x: 245, y: 305 },
  fuelAtStart: { x: 245, y: 325 },
  fuelAtEnd: { x: 245, y: 345 },
  fuelPlanned: { x: 245, y: 365 },
  fuelActual: { x: 245, y: 385 },
  arrivalDate: { x: 60, y: 420 },
  arrivalTime: { x: 110, y: 420 },
  odometerEnd: { x: 245, y: 405 },
  driverPosition1: { x: 190, y: 430 },
  driverShortName2: { x: 300, y: 430 },
  totalDistance: { x: 60, y: 50 },
  calculatorPosition: { x: 60, y: 80 },
  calculatorShortName: { x: 225, y: 80 },
};

const FIELD_LABELS: Record<keyof typeof INITIAL_FIELD_POSITIONS, string> = {
  waybillDay: 'День ПЛ',
  waybillMonth: 'Месяц ПЛ',
  waybillYear: 'Год ПЛ',
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
};

type FieldKey = keyof typeof INITIAL_FIELD_POSITIONS;

const PAGE_FIELD_MAP: Record<PageKey, FieldKey[]> = {
  page1: [
    'waybillDay',
    'waybillMonth',
    'waybillYear',
    'validFromDay',
    'validFromMonth',
    'validFromYear',
    'validToDay',
    'validToMonth',
    'validToYear',
    'vehicleBrand',
    'vehiclePlate',
    'driverFullName',
    'driverPersonnelNumber',
    'driverLicenseNumber',
    'driverLicenseCategory',
    'driverSnils',
    'orgMedicalLicense',
    'departureDate',
    'departureTime',
    'odometerStart',
    'driverShortName1',
    'departureAllowed',
    'fuelTypeName',
    'fuelFilled',
    'fuelAtStart',
    'fuelAtEnd',
    'fuelPlanned',
    'fuelActual',
    'arrivalDate',
    'arrivalTime',
    'odometerEnd',
    'driverPosition1',
    'driverShortName2',
  ],
  page2: ['totalDistance', 'calculatorPosition', 'calculatorShortName'],
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
      { x: pos.x, y: pos.y },
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

const PrintableWaybill: FC<PrintableWaybillProps> = ({
  waybill,
  vehicle,
  driver,
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

  useEffect(() => {
    const handleKeydown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onClose]);

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

  const medicalOrg = useMemo(
    () =>
      allOrganizations.find((org) => org.id === driver?.medicalInstitutionId),
    [allOrganizations, driver],
  );

  const renderValue = useCallback(
    (id: FieldKey) => {
      switch (id) {
        case 'waybillDay':
          return getDay(waybill.date);
        case 'waybillMonth':
          return getMonthName(waybill.date);
        case 'waybillYear':
          return getYearShort(waybill.date);
        case 'validFromDay':
          return getDay(waybill.validFrom);
        case 'validFromMonth':
          return getMonthName(waybill.validFrom);
        case 'validFromYear':
          return getYearShort(waybill.validFrom);
        case 'validToDay':
          return getDay(waybill.validTo);
        case 'validToMonth':
          return getMonthName(waybill.validTo);
        case 'validToYear':
          return getYearShort(waybill.validTo);
        case 'vehicleBrand':
          return vehicle?.brand ?? '';
        case 'vehiclePlate':
          return vehicle?.plateNumber ?? '';
        case 'driverFullName':
          return driver?.fullName ?? '';
        case 'driverPersonnelNumber':
          return driver?.personnelNumber ?? '';
        case 'driverLicenseNumber':
          return driver?.documentNumber ?? '';
        case 'driverLicenseCategory':
          return driver?.licenseCategory ?? '';
        case 'driverSnils':
          return driver?.snils ?? '';
        case 'orgMedicalLicense':
          return medicalOrg
            ? `№${medicalOrg.medicalLicenseNumber || ''} от ${formatDateOnly(
                medicalOrg.medicalLicenseIssueDate,
              )}`
            : '';
        case 'departureDate':
          return formatDateOnly(waybill.validFrom);
        case 'departureTime':
          return formatTime(waybill.validFrom);
        case 'odometerStart':
          return formatPrintNumber(waybill.odometerStart);
        case 'driverShortName1':
          return getShortName(driver?.fullName);
        case 'departureAllowed':
          return getShortName(dispatcher?.fullName);
        case 'fuelTypeName':
          return fuelType?.name ?? '';
        case 'fuelFilled':
          return formatPrintNumber(waybill.fuelFilled);
        case 'fuelAtStart':
          return formatPrintNumber(waybill.fuelAtStart);
        case 'fuelAtEnd':
          return formatPrintNumber(waybill.fuelAtEnd);
        case 'fuelPlanned':
          return formatPrintNumber(waybill.fuelPlanned);
        case 'fuelActual':
          return formatPrintNumber(fuelActual);
        case 'arrivalDate':
          return formatDateOnly(waybill.validTo);
        case 'arrivalTime':
          return formatTime(waybill.validTo);
        case 'odometerEnd':
          return formatPrintNumber(waybill.odometerEnd);
        case 'driverPosition1':
          return driver?.position ?? '';
        case 'driverShortName2':
          return getShortName(driver?.fullName);
        case 'totalDistance':
          return formatPrintNumber(totalDistance);
        case 'calculatorPosition':
          return controller?.position ?? '';
        case 'calculatorShortName':
          return controllerShortName;
        default:
          return '';
      }
    },
    [
      waybill,
      vehicle,
      driver,
      dispatcher,
      controller,
      controllerShortName,
      fuelType,
      medicalOrg,
      fuelActual,
      totalDistance,
    ],
  );

  const hasRoutesWithDistance = useMemo(
    () =>
      waybill.routes.some(
        (route) =>
          (route.distanceKm ?? 0) > 0 ||
          (route.notes && route.notes.trim().length > 0),
      ),
    [waybill.routes],
  );

  const [showPlaceholders, setShowPlaceholders] = useState(true);
  const [forcePage2, setForcePage2] = useState(false);

  const [positions, setPositions] = useState<PrintPositions>(() =>
    clonePositions(INITIAL_FIELD_POSITIONS),
  );
  const [editingEnabled, setEditingEnabled] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(10);
  const [pageOffsets, setPageOffsets] =
    useState<PageOffsets>(INITIAL_PAGE_OFFSETS);
  const [selectedIds, setSelectedIds] = useState<FieldKey[]>([]);
  const dragInfo = useRef<{
    isDragging: boolean;
    startPoint: { x: number; y: number };
    startPositions: PrintPositions;
  } | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const savedPositions = await loadJSON<PrintPositions | null>(DB_KEYS.PRINT_POSITIONS, null);
        if (savedPositions) {
          setPositions((prev) => ({
            ...clonePositions(prev),
            ...clonePositions(savedPositions),
          }));
        }

        const prefs = await loadJSON<EditorPrefs | null>(DB_KEYS.PRINT_EDITOR_PREFS, null);
        if (prefs) {
          setShowLabels(
            prefs.showLabels === undefined ? true : Boolean(prefs.showLabels),
          );
          setShowGrid(Boolean(prefs.showGrid));
          setGridSize(
            typeof prefs.gridSize === 'number' && prefs.gridSize > 0
              ? prefs.gridSize
              : 10,
          );

          if (prefs.pageOffsets) {
            setPageOffsets({
              page1: {
                x: prefs.pageOffsets.page1?.x ?? INITIAL_PAGE_OFFSETS.page1.x,
                y: prefs.pageOffsets.page1?.y ?? INITIAL_PAGE_OFFSETS.page1.y,
              },
              page2: {
                x: prefs.pageOffsets.page2?.x ?? INITIAL_PAGE_OFFSETS.page2.x,
                y: prefs.pageOffsets.page2?.y ?? INITIAL_PAGE_OFFSETS.page2.y,
              },
            });
          }
        }
      } catch {
        showToast('Не удалось загрузить сохраненные настройки печати.', 'error');
      }
    })();
  }, [showToast]);

  const handleSavePositions = useCallback(async () => {
    try {
      await saveJSON(DB_KEYS.PRINT_POSITIONS, clonePositions(positions));
      await saveJSON(DB_KEYS.PRINT_EDITOR_PREFS, {
        showLabels,
        showGrid,
        gridSize,
        pageOffsets: {
          page1: { ...pageOffsets.page1 },
          page2: { ...pageOffsets.page2 },
        },
      });
      showToast('Позиции и смещения сохранены.', 'success');
      setEditingEnabled(false);
      setSelectedIds([]);
    } catch {
      showToast('Не удалось сохранить настройки печати.', 'error');
    }
  }, [positions, showLabels, showGrid, gridSize, pageOffsets, showToast]);

  const handleResetPositions = useCallback(async () => {
    if (
      !window.confirm('Сбросить позиции и смещения к заводским настройкам?')
    ) {
      return;
    }

    try {
      await removeKey(DB_KEYS.PRINT_POSITIONS);
      await removeKey(DB_KEYS.PRINT_EDITOR_PREFS);
    } catch {
      showToast('Не удалось очистить сохраненные настройки.', 'error');
    }

    setPositions(clonePositions(INITIAL_FIELD_POSITIONS));
    setPageOffsets(INITIAL_PAGE_OFFSETS);
    setSelectedIds([]);
    showToast('Настройки печати сброшены.', 'info');
  }, [showToast]);

  const handleDragStart = useCallback(
    (id: FieldKey, e: React.MouseEvent<HTMLDivElement>) => {
      if (!editingEnabled) return;

      e.preventDefault();
      e.stopPropagation();

      const multi = e.ctrlKey || e.metaKey;

      setSelectedIds((prev) => {
        if (multi) {
          return prev.includes(id)
            ? prev.filter((key) => key !== id)
            : [...prev, id];
        }
        return prev.includes(id) ? prev : [id];
      });

      dragInfo.current = {
        isDragging: true,
        startPoint: { x: e.clientX, y: e.clientY },
        startPositions: clonePositions(positions),
      };

      document.body.style.cursor = 'grabbing';
    },
    [editingEnabled, positions],
  );

  const handleDrag = useCallback(
    (event: MouseEvent) => {
      if (!dragInfo.current?.isDragging) return;

      const { startPoint, startPositions } = dragInfo.current;
      const deltaX = event.clientX - startPoint.x;
      const deltaY = event.clientY - startPoint.y;

      setPositions(() => {
        const next = clonePositions(startPositions);
        for (const id of selectedIds) {
          const base = startPositions[id];
          if (base) {
            next[id] = {
              x: base.x + deltaX,
              y: base.y + deltaY,
            };
          }
        }
        return next;
      });
    },
    [selectedIds],
  );

  const handleDragEnd = useCallback(() => {
    if (!dragInfo.current?.isDragging) return;

    if (showGrid && gridSize > 0) {
      setPositions((current) => {
        const snapped = clonePositions(current);
        for (const id of selectedIds) {
          const pos = snapped[id];
          if (pos) {
            snapped[id] = {
              x: Math.round(pos.x / gridSize) * gridSize,
              y: Math.round(pos.y / gridSize) * gridSize,
            };
          }
        }
        return snapped;
      });
    }

    dragInfo.current = null;
    document.body.style.cursor = '';
  }, [showGrid, gridSize, selectedIds]);

  useEffect(() => {
    if (!dragInfo.current?.isDragging) return;

    const onMove = (event: MouseEvent) => handleDrag(event);
    const onUp = () => handleDragEnd();

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [handleDrag, handleDragEnd]);

  const handlePageMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        setSelectedIds([]);
      }
    },
    [],
  );

  const updatePageOffset = useCallback(
    (pageKey: PageKey, axis: 'x' | 'y', event: ChangeEvent<HTMLInputElement>) => {
      const raw = Number(event.target.value);
      const value = Number.isFinite(raw) ? raw : 0;
      setPageOffsets((prev) => ({
        ...prev,
        [pageKey]: {
          ...prev[pageKey],
          [axis]: value,
        },
      }));
    },
    [],
  );

  const pageKeysToRender = useMemo(() => {
    const keys: PageKey[] = ['page1'];

    const meaningfulPage2Fields = PAGE_FIELD_MAP.page2.filter((fieldId) => {
      const value = renderValue(fieldId);
      if (value === undefined || value === null) return false;
      const cleaned = String(value).replace(/[_\s.,-]/g, '');
      return cleaned.length > 0 && !/^0+$/.test(cleaned);
    });

    const shouldRenderPage2 =
      forcePage2 ||
      meaningfulPage2Fields.length > 0 ||
      hasRoutesWithDistance ||
      (totalDistance ?? 0) > 0;

    if (shouldRenderPage2) {
      keys.push('page2');
    }

    return keys;
  }, [forcePage2, hasRoutesWithDistance, renderValue, totalDistance]);

  const DraggableField = useCallback(
    ({ id, label, value }: { id: FieldKey; label: string; value: string }) => {
      const pos = positions[id] ?? INITIAL_FIELD_POSITIONS[id];
      const normalized = value ?? '';
      const trimmed =
        normalized === undefined || normalized === null
          ? ''
          : String(normalized);
      const displayText =
        trimmed.trim().length === 0
          ? showPlaceholders
            ? '______'
            : ''
          : trimmed;
      const isSelected = selectedIds.includes(id);

      return (
        <div
          key={id}
          className="print-field-wrapper"
          data-id={id}
          onMouseDown={(event) => handleDragStart(id, event)}
          style={{
            position: 'absolute',
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            cursor: editingEnabled ? 'grab' : 'default',
          }}
        >
          <div
            className={`print-field ${
              editingEnabled ? 'draggable-active' : ''
            } ${isSelected ? 'draggable-selected' : ''}`}
          >
            {editingEnabled && showLabels && (
              <span className="print-label">{label}:</span>
            )}
            <span className="print-value">{displayText}</span>
          </div>
        </div>
      );
    },
    [
      positions,
      editingEnabled,
      showLabels,
      showPlaceholders,
      selectedIds,
      handleDragStart,
    ],
  );

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
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingEnabled}
                  onChange={(event) => {
                    setEditingEnabled(event.target.checked);
                    if (!event.target.checked) {
                      setSelectedIds([]);
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
                    onClick={handleResetPositions}
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
                {(Object.keys(PAGE_FIELD_MAP) as PageKey[]).map((pageKey) => (
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

              return (
                <div className="print-page" key={pageKey}>
                  <div
                    className="print-page__canvas"
                    onMouseDown={handlePageMouseDown}
                    style={{
                      transform: `translate(${pageOffset.x}px, ${pageOffset.y}px)`,
                      transformOrigin: 'top left',
                      ...gridStyles,
                    }}
                  >
                    {PAGE_FIELD_MAP[pageKey].map((id) => (
                      <DraggableField
                        key={id}
                        id={id}
                        label={FIELD_LABELS[id]}
                        value={renderValue(id)}
                      />
                    ))}
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
              padding: 2px 4px;
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

            .print-label {
              font-size: 8pt;
              color: #4b5563 !important;
              font-style: italic;
              user-select: none;
            }

            .print-value {
              font-weight: bold;
              max-width: 260px;
              overflow: hidden;
              text-overflow: ellipsis;
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
              .print-label {
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