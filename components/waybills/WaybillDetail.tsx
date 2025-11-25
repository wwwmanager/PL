import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Waybill, Route, Vehicle, Employee, WaybillStatus, Organization, SavedRoute, FuelType, SeasonSettings, Attachment, AppSettings, StockTransaction, GarageStockItem } from '../../types';
import { 
    getVehicles, getEmployees, getOrganizations, addWaybill, updateWaybill, addSavedRoutesFromWaybill, getSavedRoutes, 
    getFuelTypes, getSeasonSettings, isWinterDate, getLastWaybillForVehicle, getAppSettings, generateId, 
    getAvailableFuelExpenses, updateStockTransaction, getStockTransactions, getGarageStockItems,
    getNextBlankForDriver, useBlankForWaybill, getNextWaybillNumber, changeWaybillStatus, getFuelCardBalance
} from '../../services/mockApi';
import { generateRouteFromPrompt } from '../../services/geminiService';
import { TrashIcon, SparklesIcon, PrinterIcon, PaperClipIcon, ChatBubbleLeftRightIcon, UploadIcon, BanknotesIcon, PaperAirplaneIcon, CheckCircleIcon, ArrowUturnLeftIcon, XIcon, PencilIcon } from '../Icons';
import { WAYBILL_STATUS_TRANSLATIONS, WAYBILL_STATUS_COLORS } from '../../constants';
import PrintableWaybill from './PrintableWaybill';
import CollapsibleSection from '../shared/CollapsibleSection';
import { useToast } from '../../hooks/useToast';
import ConfirmationModal from '../shared/ConfirmationModal';
import { RouteImportModal } from '../dictionaries/RouteImportModal';
import { RouteSegment } from '../../services/routeParserService';
import Modal from '../shared/Modal';
import { useAuth } from '../../services/auth';
import CorrectionModal from './CorrectionModal';
import CorrectionReasonModal from './CorrectionReasonModal';


interface WaybillDetailProps {
  waybill: Waybill | null;
  isPrefill?: boolean;
  onClose: () => void;
}

const emptyWaybill: Omit<Waybill, 'id'> = {
  number: '',
  date: new Date().toISOString().split('T')[0],
  vehicleId: '',
  driverId: '',
  status: WaybillStatus.DRAFT,
  odometerStart: 0,
  odometerEnd: 0,
  fuelPlanned: 0,
  fuelAtStart: 0,
  fuelFilled: 0,
  fuelAtEnd: 0,
  routes: [],
  organizationId: '',
  dispatcherId: '',
  controllerId: '',
  validFrom: new Date().toISOString().slice(0, 16),
  validTo: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  attachments: [],
  reviewerComment: '',
  deviationReason: '',
};

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
    {children}
  </div>
);

const FormInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className={`w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200 read-only:bg-gray-200 dark:read-only:bg-gray-800 dark:[color-scheme:dark] disabled:opacity-50 disabled:cursor-not-allowed ${props.className || ''}`} />
);
const FormSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed" />
);


// FIX: Changed component to be a named export to resolve module resolution errors.
export const WaybillDetail: React.FC<WaybillDetailProps> = ({ waybill, isPrefill, onClose }) => {
  const [formData, setFormData] = useState<Omit<Waybill, 'id'> | Waybill>(waybill && !isPrefill ? waybill : emptyWaybill);
  const [initialFormData, setInitialFormData] = useState<Omit<Waybill, 'id'> | Waybill | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [seasonSettings, setSeasonSettings] = useState<SeasonSettings | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoFillMessage, setAutoFillMessage] = useState('');
  // Explicitly enable AI features without checking availability
  const [isAIAvailable, setIsAIAvailable] = useState(true);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [dayMode, setDayMode] = useState<'single' | 'multi'>('multi');
  const [minDate, setMinDate] = useState<string>('');
  const { showToast } = useToast();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const { currentUser, can, hasRole } = useAuth();
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isCorrectionReasonModalOpen, setIsCorrectionReasonModalOpen] = useState(false);
  
  // Fuel migration state
  const [isGarageModalOpen, setIsGarageModalOpen] = useState(false);
  const [availableExpenses, setAvailableExpenses] = useState<StockTransaction[]>([]);
  const [stockItems, setStockItems] = useState<GarageStockItem[]>([]);
  const [linkedTxId, setLinkedTxId] = useState<string | null>(null);
  const [initialLinkedTxId, setInitialLinkedTxId] = useState<string | null>(null);

  const [fuelCardBalance, setFuelCardBalance] = useState<number | null>(null);
  const [fuelFilledError, setFuelFilledError] = useState<string | null>(null);
  
  const [linkedTransactions, setLinkedTransactions] = useState<StockTransaction[]>([]);

  const canEdit = useMemo(() => formData.status !== WaybillStatus.POSTED && formData.status !== WaybillStatus.CANCELLED, [formData.status]);
  
  const isDirty = useMemo(() => {
    if (!initialFormData) return false;
    const currentData = { ...formData, linkedTxId };
    const initialData = { ...initialFormData, linkedTxId: initialLinkedTxId };
    return JSON.stringify(currentData) !== JSON.stringify(initialData);
  }, [formData, initialFormData, linkedTxId, initialLinkedTxId]);


  const COLLAPSED_SECTIONS_KEY = 'waybillDetail_collapsedSections';
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
        const saved = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
        return saved ? JSON.parse(saved) : {
            basicInfo: false,
            vehicleDriver: false,
            staff: false,
            fuelMileage: false,
            route: false,
            attachments: false,
            stockLinks: false,
        };
    } catch {
        return {};
    }
  });

  useEffect(() => {
      localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  const toggleSection = (section: string) => {
      setCollapsedSections(prev => ({
          ...prev,
          [section]: !prev[section]
      }));
  };
  
  const drivers = useMemo(() => employees.filter(e => e.employeeType === 'driver'), [employees]);
  
  useEffect(() => {
    const loadData = async () => {
        // Removed checkAIAvailability from Promise.all to disable the check
        const [vehiclesData, employeesData, organizationsData, savedRoutesData, fuelTypesData, settings, appSettingsData, stockItemsData, allTransactions] = await Promise.all([
            getVehicles(),
            getEmployees(),
            getOrganizations(),
            getSavedRoutes(),
            getFuelTypes(),
            getSeasonSettings(),
            getAppSettings(),
            getGarageStockItems(),
            getStockTransactions(),
        ]);
        setVehicles(vehiclesData);
        setEmployees(employeesData);
        setOrganizations(organizationsData);
        setSavedRoutes(savedRoutesData);
        setFuelTypes(fuelTypesData);
        // setIsAIAvailable is already true by default
        setSeasonSettings(settings);
        setAppSettings(appSettingsData);
        setStockItems(stockItemsData);

        let formDataToSet: Omit<Waybill, 'id'> | Waybill;
        if (isPrefill && waybill) {
            formDataToSet = {
                ...emptyWaybill,
                vehicleId: waybill.vehicleId,
                driverId: waybill.driverId,
                odometerStart: Math.round(waybill.odometerEnd ?? 0),
                fuelAtStart: waybill.fuelAtEnd ?? 0,
            };
            if(window.confirm("Скопировать маршруты из предыдущего ПЛ?")) {
                formDataToSet.routes = waybill.routes.map(r => ({...r, id: generateId()}));
            }
        } else {
             formDataToSet = waybill || emptyWaybill;
        }
        
        if (waybill && 'id' in waybill) {
            const linkedTx = allTransactions.find(tx => tx.waybillId === waybill.id);
            if(linkedTx) {
                setLinkedTxId(linkedTx.id);
                setInitialLinkedTxId(linkedTx.id);
            }
        }

        setFormData(formDataToSet);
        setInitialFormData(JSON.parse(JSON.stringify(formDataToSet)));

        if (formDataToSet.driverId) {
            getFuelCardBalance(formDataToSet.driverId)
                .then(setFuelCardBalance)
                .catch(() => setFuelCardBalance(null));
        }

        if (waybill && !isPrefill) { // For editing existing
            const fromDate = waybill.validFrom.split('T')[0];
            const toDate = waybill.validTo.split('T')[0];
            setDayMode(fromDate === toDate ? 'single' : 'multi');
        } else { // For new (blank or prefilled)
            setDayMode('multi');
            // Auto-reserve blank number
            const driverId = formDataToSet.driverId || (isPrefill && waybill?.driverId);
            if (driverId) {
                const driver = employeesData.find(e => e.id === driverId);
                updateWaybillNumberForDriver(driver || null);
            }
        }
    };
    loadData();

  }, [waybill, isPrefill, showToast]);

  useEffect(() => {
    // грузим только если есть ID ПЛ
    const loadLinkedTransactions = async () => {
      if (!formData || !('id' in formData) || !formData.id) {
        setLinkedTransactions([]);
        return;
      }

      try {
        const allTx = await getStockTransactions();
        
        // stockItems state is already populated from the main `loadData` effect.

        const ids = formData.linkedStockTransactionIds ?? [];
        if (!ids.length) {
          setLinkedTransactions([]);
          return;
        }

        const linked = allTx.filter(t => ids.includes(t.id));
        setLinkedTransactions(linked);
      } catch {
        setLinkedTransactions([]);
      }
    };

    loadLinkedTransactions();
  }, [formData]);

  const selectedVehicle = useMemo(() => vehicles.find(v => v.id === formData.vehicleId), [formData.vehicleId, vehicles]);
  const selectedDriver = useMemo(() => employees.find(e => e.id === formData.driverId), [formData.driverId, employees]);
  const selectedOrg = useMemo(() => organizations.find(o => o.id === formData.organizationId), [formData.organizationId, organizations]);
  const selectedDispatcher = useMemo(() => employees.find(e => e.id === formData.dispatcherId), [formData.dispatcherId, employees]);
  const selectedController = useMemo(() => employees.find(e => e.id === formData.controllerId), [formData.controllerId, employees]);
  const selectedFuelType = useMemo(() => fuelTypes.find(f => f.id === selectedVehicle?.fuelTypeId), [selectedVehicle, fuelTypes]);


  useEffect(() => {
    if (selectedDriver?.organizationId) {
        // For new or prefilled waybills, always sync organization with the selected driver.
        // For existing waybills, don't change it automatically.
        if (!('id' in formData) || !formData.id || isPrefill) {
            setFormData(prev => ({
                ...prev,
                organizationId: selectedDriver.organizationId!,
            }));
        }
    }
  }, [selectedDriver, 'id' in formData ? formData.id : undefined, isPrefill]);


  const uniqueLocations = useMemo(() => {
    const locations = new Set<string>();
    
    savedRoutes.forEach(route => {
        if (route.from) locations.add(route.from);
        if (route.to) locations.add(route.to);
    });

    formData.routes.forEach(route => {
        if (route.from) locations.add(route.from);
        if (route.to) locations.add(route.to);
    });

    return Array.from(locations).sort();
  }, [savedRoutes, formData.routes]);


  const totalDistance = useMemo(() => 
      Math.round(formData.routes.reduce((sum, r) => sum + (Number(r.distanceKm) || 0), 0)), 
      [formData.routes]
  );
  
  const actualFuelConsumption = useMemo(() => {
    const start = Number(formData.fuelAtStart) || 0;
    const filled = Number(formData.fuelFilled) || 0;
    const end = Number(formData.fuelAtEnd) || 0;
    return start + filled - end;
  }, [formData.fuelAtStart, formData.fuelFilled, formData.fuelAtEnd]);

  const fuelEconomyOrOverrun = useMemo(() => {
    const planned = Number(formData.fuelPlanned) || 0;
    if (planned === 0 && actualFuelConsumption === 0) return 0;
    return planned - actualFuelConsumption;
  }, [formData.fuelPlanned, actualFuelConsumption]);

  const calculatedFuelRate = useMemo(() => {
    if (!selectedVehicle || !seasonSettings) return 0;
    
    const isWaybillWinter = isWinterDate(formData.date, seasonSettings);
    const baseConsumptionRate = isWaybillWinter ? selectedVehicle.fuelConsumptionRates.winterRate : selectedVehicle.fuelConsumptionRates.summerRate;

    let totalConsumption = 0;
    let totalDistance = 0;

    for (const route of formData.routes) {
        if (!route.distanceKm || route.distanceKm === 0) continue;

        const routeDate = dayMode === 'multi' && route.date ? route.date : formData.date;
        const isWinter = isWinterDate(routeDate, seasonSettings);
        const baseRate = isWinter ? selectedVehicle.fuelConsumptionRates.winterRate : selectedVehicle.fuelConsumptionRates.summerRate;
        let effectiveRate = baseRate;
        
        if (route.isCityDriving && selectedVehicle.useCityModifier && selectedVehicle.fuelConsumptionRates.cityIncreasePercent) {
            effectiveRate *= (1 + selectedVehicle.fuelConsumptionRates.cityIncreasePercent / 100);
        }
        if (route.isWarming && selectedVehicle.useWarmingModifier && selectedVehicle.fuelConsumptionRates.warmingIncreasePercent) {
            effectiveRate *= (1 + selectedVehicle.fuelConsumptionRates.warmingIncreasePercent / 100);
        }
        
        totalConsumption += (route.distanceKm / 100) * effectiveRate;
        totalDistance += route.distanceKm;
    }

    return totalDistance > 0 ? (totalConsumption / totalDistance) * 100 : baseConsumptionRate;
  }, [selectedVehicle, seasonSettings, formData.date, formData.routes, dayMode]);


  useEffect(() => {
    if (!selectedVehicle || !seasonSettings) {
        return;
    }

    const { cityIncreasePercent = 0, warmingIncreasePercent = 0 } = selectedVehicle.fuelConsumptionRates;
    
    let totalConsumption = 0;
    for (const route of formData.routes) {
        const routeDate = dayMode === 'multi' && route.date ? route.date : formData.date;
        const isWinter = isWinterDate(routeDate, seasonSettings);
        const baseRate = isWinter ? selectedVehicle.fuelConsumptionRates.winterRate : selectedVehicle.fuelConsumptionRates.summerRate;
        
        let effectiveRate = baseRate;
        if (route.isCityDriving && selectedVehicle.useCityModifier) {
            effectiveRate *= (1 + cityIncreasePercent / 100);
        }
        if (route.isWarming && selectedVehicle.useWarmingModifier) {
            effectiveRate *= (1 + warmingIncreasePercent / 100);
        }
        totalConsumption += ((Number(route.distanceKm) || 0) / 100) * effectiveRate;
    }
    
    const startOdo = Number(formData.odometerStart) || 0;
    const newOdoEnd = startOdo + totalDistance;
    const newFuelPlanned = Math.round(totalConsumption * 100) / 100;
    
    const startFuel = Number(formData.fuelAtStart) || 0;
    const filledFuel = Number(formData.fuelFilled) || 0;
    const newFuelAtEnd = Math.round((startFuel + filledFuel - newFuelPlanned) * 100) / 100;
    
    setFormData(prev => ({
        ...prev,
        odometerEnd: Math.round(newOdoEnd),
        fuelPlanned: newFuelPlanned,
        fuelAtEnd: newFuelAtEnd,
    }));

  }, [totalDistance, formData.odometerStart, formData.fuelAtStart, formData.fuelFilled, selectedVehicle, formData.date, formData.routes, seasonSettings, dayMode]);
  
  useEffect(() => {
    if (selectedDriver) {
        setFormData(prev => ({
            ...prev,
            dispatcherId: selectedDriver.dispatcherId || selectedDriver.id, // Default to self if not set
            controllerId: selectedDriver.controllerId || selectedDriver.id, // Default to self if not set
        }));
    }
  }, [selectedDriver]);

  const updateWaybillNumberForDriver = async (driver: Employee | null) => {
    if (!driver?.id) {
      setFormData(prev => ({ ...prev, number: '', blankId: null, blankSeries: null, blankNumber: null }));
      return;
    }
  
    if (!('id' in formData) || !formData.id || isPrefill) {
      const orgId = driver.organizationId;
      if (!orgId) {
        showToast('Не удалось определить организацию водителя для подбора бланка.', 'error');
        return;
      }
  
      const nextBlank = await getNextBlankForDriver(driver.id, orgId);
      if (nextBlank) {
        const numberStr = String(nextBlank.number).padStart(6, '0');
        setFormData(prev => ({
          ...prev,
          number: `${nextBlank.series}${numberStr}`,
          blankId: nextBlank.blankId,
          blankSeries: nextBlank.series,
          blankNumber: nextBlank.number
        }));
      } else {
        showToast('Внимание: закончились номера бланков для этого водителя!', 'error');
        setFormData(prev => ({ ...prev, number: 'БЛАНКОВ НЕТ', blankId: null, blankSeries: null, blankNumber: null }));
      }
    }
  };
  

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'driverId') {
      const driver = employees.find(d => d.id === value);
      
      setFormData(prev => {
        const newFormData = { ...prev, driverId: value };
        if (driver?.organizationId && (!('id' in prev) || !prev.id || isPrefill)) {
          newFormData.organizationId = driver.organizationId;
        }
        return newFormData;
      });
  
      updateWaybillNumberForDriver(driver || null);

      if (value) {
        getFuelCardBalance(value)
          .then(bal => setFuelCardBalance(bal))
          .catch(() => setFuelCardBalance(null));
      } else {
        setFuelCardBalance(null);
      }

    } else {
        let newFormData = { ...formData, [name]: value };
        
        if (dayMode === 'single' && name === 'validFrom') {
            const datePart = value.split('T')[0];
            const timePart = formData.validTo.split('T')[1] || '18:00';
            newFormData.validTo = `${datePart}T${timePart}`;
        }
        
        newFormData.date = newFormData.validFrom.split('T')[0];
        
        setFormData(newFormData);
    }
  };
  
  const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let numericValue = value === '' ? undefined : Number(value);

    if ((name === 'odometerStart' || name === 'odometerEnd') && numericValue !== undefined) {
        numericValue = Math.round(numericValue);
    }

    if (name === 'fuelFilled') {
        setLinkedTxId(null); // Manual change breaks the link
        if (fuelCardBalance != null && numericValue != null && !isNaN(numericValue) && numericValue > fuelCardBalance) {
            setFuelFilledError(`Введённый объём (${numericValue} л) превышает баланс на карте (${fuelCardBalance} л)`);
        } else {
            setFuelFilledError(null);
        }
    }
    setFormData(prev => ({...prev, [name]: numericValue }));
  }

  const handleVehicleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vehicleId = e.target.value;
    const selectedVehicle = vehicles.find(v => v.id === vehicleId);
    setAutoFillMessage('');
    setMinDate('');

    if (selectedVehicle) {
        const assignedDriverId = selectedVehicle.assignedDriverId || '';
        let updates: Partial<Waybill> = {
            vehicleId: selectedVehicle.id,
            driverId: assignedDriverId,
        };
        
        if (!('id' in formData) || !formData.id || isPrefill) {
             const lastWaybill = await getLastWaybillForVehicle(selectedVehicle.id);
             updates.odometerStart = Math.round(selectedVehicle.mileage);
             updates.fuelAtStart = selectedVehicle.currentFuel;
             
             if (assignedDriverId) {
                const driver = employees.find(e => e.id === assignedDriverId);
                updateWaybillNumberForDriver(driver || null);
             } else {
                updates.number = '';
             }

             let message = `Стартовые значения одометра и топлива загружены из карточки ТС.`;
             
             if (lastWaybill) {
                // Do not set organization from last waybill, it will be set by driver
                message += ` Данные из последнего ПЛ НЕ загружены.`
                setMinDate(lastWaybill.date);
             }
            
            setAutoFillMessage(message);
        }
        
        const newRoutes = formData.routes.map(r => ({
            ...r,
            isCityDriving: selectedVehicle.useCityModifier ? r.isCityDriving : false,
            isWarming: selectedVehicle.useWarmingModifier ? r.isWarming : false,
        }));

        setFormData(prev => ({ ...prev, ...updates, routes: newRoutes }));

    } else {
        setFormData(prev => ({
            ...prev,
            vehicleId: '',
            driverId: '',
            dispatcherId: '',
            controllerId: ''
        }));
    }
  };
    
  const isRouteDateValid = (routeDate?: string): boolean => {
    if (!routeDate || dayMode === 'single') return true;
    
    try {
        const rDate = new Date(routeDate);
        const sDate = new Date(formData.validFrom.split('T')[0]);
        const eDate = new Date(formData.validTo.split('T')[0]);
        
        rDate.setHours(0,0,0,0);
        sDate.setHours(0,0,0,0);
        eDate.setHours(0,0,0,0);
        
        return rDate >= sDate && rDate <= eDate;
    } catch {
        return false;
    }
  };

  const handleAddRoute = () => {
    const lastRoute = formData.routes.length > 0 ? formData.routes[formData.routes.length - 1] : null;
    const newRoute = { 
        id: generateId(), 
        from: lastRoute ? lastRoute.to : '', 
        to: '', 
        distanceKm: 0, 
        isCityDriving: false, 
        isWarming: false, 
        date: lastRoute?.date ? lastRoute.date : (dayMode === 'multi' ? formData.validFrom.split('T')[0] : undefined)
    };
    setFormData(prev => ({
      ...prev,
      routes: [...prev.routes, newRoute],
    }));
  };

  const handleRouteChance = (id: string, field: keyof Route, value: string | number | boolean) => {
    if (field === 'date' && typeof value === 'string' && !isRouteDateValid(value)) {
        showToast(`Дата маршрута выходит за пределы диапазона путевого листа.`, 'error');
        return; 
    }
      
    setFormData(prev => {
        const newRoutes = prev.routes.map(r => {
            if (r.id !== id) {
                return r;
            }
            
            const updatedRoute = { ...r, [field]: value };

            if ((field === 'from' || field === 'to')) {
                const matchingSavedRoute = savedRoutes.find(sr => 
                    sr.from?.toLowerCase() === updatedRoute.from.toLowerCase() && 
                    sr.to?.toLowerCase() === updatedRoute.to.toLowerCase()
                );
                if (matchingSavedRoute) {
                    updatedRoute.distanceKm = matchingSavedRoute.distanceKm;
                }
            }
            return updatedRoute;
        });

        return {
            ...prev,
            routes: newRoutes,
        };
    });
  };
  
  const handleRemoveRoute = (id: string) => {
    setFormData(prev => ({
      ...prev,
      routes: prev.routes.filter(r => r.id !== id),
    }));
  };

  const handleGenerateRoutes = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    try {
        const generatedRoutes = await generateRouteFromPrompt(aiPrompt);
        setFormData(prev => ({ ...prev, routes: [...prev.routes, ...generatedRoutes] }));
        setAiPrompt('');
    } catch(error) {
        showToast((error as Error).message, 'error');
    } finally {
        setIsGenerating(false);
    }
  };
  
  const handleDayModeChange = (mode: 'single' | 'multi') => {
    setDayMode(mode);
    if (mode === 'single') {
        const datePart = formData.validFrom.split('T')[0];
        const timePart = formData.validTo.split('T')[1] || '18:00';
        setFormData(prev => ({
            ...prev,
            validTo: `${datePart}T${timePart}`
        }));
    } else { // When switching back to 'multi'
        const fromDate = new Date(formData.validFrom);
        const toDate = new Date(formData.validTo);
        // If it's currently a single-day range, expand it to the next day
        if (fromDate.toISOString().split('T')[0] === toDate.toISOString().split('T')[0]) {
            const newToDate = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
            setFormData(prev => ({
                ...prev,
                validTo: newToDate.toISOString().slice(0, 16)
            }));
        }
    }
  };

  const validateForm = async (): Promise<boolean> => {
    if (!formData.dispatcherId) {
        showToast('Диспетчер не назначен. Пожалуйста, укажите его в карточке сотрудника или выберите вручную.', 'error');
        return false;
    }
    
    if (!formData.number || formData.number === 'БЛАНКОВ НЕТ') {
        showToast('Невозможно сохранить ПЛ без номера. Проверьте наличие бланков.', 'error');
        return false;
    }

    if (formData.fuelAtEnd !== undefined && formData.fuelAtEnd < 0) {
        showToast('Расчетный остаток топлива не может быть отрицательным.', 'error');
        return false;
    }

    if (selectedVehicle) {
        if (!selectedVehicle.disableFuelCapacityCheck && selectedVehicle.fuelTankCapacity) {
             const startFuel = formData.fuelAtStart || 0;
            if (startFuel > selectedVehicle.fuelTankCapacity) {
                showToast(`Начальный остаток топлива (${startFuel} л) не может превышать объем бака (${selectedVehicle.fuelTankCapacity} л).`, 'error');
                return false;
            }

            const endFuel = formData.fuelAtEnd || 0;
            if (endFuel > selectedVehicle.fuelTankCapacity) {
                showToast(`Конечный остаток топлива (${endFuel.toFixed(2)} л) не может превышать объем бака (${selectedVehicle.fuelTankCapacity} л).`, 'error');
                return false;
            }
        }
    }

    for (const route of formData.routes) {
        if (!isRouteDateValid(route.date)) {
            const formattedRouteDate = route.date ? new Date(route.date).toLocaleDateString('ru-RU') : 'не указана';
            showToast(`Дата маршрута (${formattedRouteDate}) выходит за пределы срока действия путевого листа.`, 'error');
            return false;
        }
    }

    if ((!('id' in formData) || !formData.id) && formData.vehicleId) {
        if (selectedVehicle && formData.odometerStart < selectedVehicle.mileage) {
            showToast(`Начальный пробег (${formData.odometerStart}) не может быть меньше последнего в карточке ТС (${selectedVehicle.mileage}).`, 'error');
            return false;
        }

        const lastWaybill = await getLastWaybillForVehicle(formData.vehicleId);
        if (lastWaybill) {
            const waybillDate = new Date(formData.date);
            const lastWaybillDate = new Date(lastWaybill.date);
            if (waybillDate.getTime() < lastWaybillDate.getTime()) {
                showToast(`Дата ПЛ (${formData.date}) не может быть раньше даты последнего учтенного ПЛ (${lastWaybill.date}).`, 'error');
                return false;
            }
        }
    }
    return true;
  };

  const handleSave = async (suppressNotifications = false): Promise<Waybill | null> => {
    if (!(await validateForm())) return null;

    try {
      let savedWaybill: Waybill;

      if ('id' in formData && formData.id) {
          savedWaybill = await updateWaybill(formData as Waybill);
      } else {
          savedWaybill = await addWaybill(formData as Omit<Waybill, 'id'>);
          setFormData(savedWaybill); 
      }

      if (savedWaybill && savedWaybill.routes.length > 0) {
          await addSavedRoutesFromWaybill(savedWaybill.routes);
      }
      
      // Handle transaction linking
      const allTransactions = await getStockTransactions();
      const originalLinkedTx = allTransactions.find(tx => tx.id === initialLinkedTxId);
      
      // Unlink old if necessary
      if (originalLinkedTx && originalLinkedTx.id !== linkedTxId) {
          await updateStockTransaction({ ...originalLinkedTx, waybillId: null });
      }

      // Link new if necessary
      if (linkedTxId && linkedTxId !== originalLinkedTx?.id) {
          const newLinkedTx = allTransactions.find(tx => tx.id === linkedTxId);
          if (newLinkedTx) {
              await updateStockTransaction({ ...newLinkedTx, waybillId: savedWaybill.id });
          }
      }
      
      setInitialLinkedTxId(linkedTxId);

      if (!suppressNotifications) {
          showToast('Путевой лист успешно сохранен!', 'success');
      }
      setInitialFormData(JSON.parse(JSON.stringify(savedWaybill)));
      return savedWaybill;
    } catch (error) {
      console.error("Failed to save waybill:", error);
      if (!suppressNotifications) {
          showToast(`Не удалось сохранить. Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`, 'error');
      }
      return null;
    }
  };
  
  const handleCloseRequest = () => {
    if (isDirty) {
        setIsConfirmationModalOpen(true);
    } else {
        onClose();
    }
  };

  const handleConfirmClose = () => {
    setIsConfirmationModalOpen(false);
    onClose();
  };

  const handleAttachmentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const newAttachment: Attachment = {
            name: file.name,
            size: file.size,
            type: file.type,
            content: e.target?.result as string,
            userId: 'local-user',
        };
        setFormData(prev => ({...prev, attachments: [...(prev.attachments || []), newAttachment]}));
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = (name: string) => {
    setFormData(prev => ({...prev, attachments: prev.attachments?.filter(att => att.name !== name)}));
  };

  const handleImportConfirm = (segments: RouteSegment[]) => {
    try {
      const newWaybillRoutes: Route[] = segments.map(seg => {
        // Convert date from dd.mm.yyyy to yyyy-mm-dd
        const dateParts = seg.date.split('.');
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : undefined;

        return {
            id: generateId(),
            from: seg.from,
            to: seg.to,
            distanceKm: seg.distanceKm,
            isCityDriving: selectedVehicle?.useCityModifier || false,
            isWarming: false, // This info is not available in the parsed file
            date: dayMode === 'multi' ? formattedDate : undefined,
        };
      });
      
      if (newWaybillRoutes.length > 0) {
        setFormData(prev => ({...prev, routes: [...prev.routes, ...newWaybillRoutes]}));
        showToast(`Добавлено ${newWaybillRoutes.length} сегментов маршрута.`, 'success');
      } else {
        showToast('Не выбрано ни одного маршрута для импорта.', 'info');
      }
    } catch(e) {
      showToast(e instanceof Error ? e.message : 'Ошибка импорта', 'error');
    } finally {
      setIsImportModalOpen(false);
    }
  };

  const handleOpenGarageModal = async () => {
    if (!formData.driverId) {
      showToast('Сначала выберите водителя.', 'info');
      return;
    }
    const expenses = await getAvailableFuelExpenses(formData.driverId, 'id' in formData ? formData.id : null);
    setAvailableExpenses(expenses);
    setIsGarageModalOpen(true);
  };

  const handleSelectExpense = (tx: StockTransaction) => {
    const fuelItem = tx.items.find(item => stockItems.find(si => si.id === item.stockItemId)?.fuelTypeId);
    if (fuelItem) {
      setFormData(prev => ({...prev, fuelFilled: fuelItem.quantity}));
      setLinkedTxId(tx.id);
      setIsGarageModalOpen(false);
    } else {
      showToast('В накладной не найдено топливо.', 'error');
    }
  };
  
  const handleStatusChange = async (nextStatus: WaybillStatus) => {
    let savedWaybill = 'id' in formData ? formData : null;
    if (isDirty) {
        savedWaybill = await handleSave(true);
        if (!savedWaybill) return; // Save failed, stop status change
    }

    if (!savedWaybill || !('id' in savedWaybill)) {
        showToast('Сначала сохраните путевой лист.', 'error');
        return;
    }

    try {
        const result = await changeWaybillStatus(savedWaybill.id, nextStatus, {
            userId: currentUser?.id,
            appMode: appSettings?.appMode || 'driver',
        });
        const updatedWaybill = result.data as Waybill;
        setFormData(updatedWaybill);
        setInitialFormData(JSON.parse(JSON.stringify(updatedWaybill)));
        showToast(`Статус изменен на "${WAYBILL_STATUS_TRANSLATIONS[nextStatus]}"`, 'success');
    } catch (e) {
        showToast((e as Error).message, 'error');
    }
  };

  const handleReturnToDraft = async (comment: string) => {
      // This is a conceptual action, might not be a direct status change
      // For now, we add a comment and keep it in draft
      const updatedWaybillData = { ...formData, reviewerComment: comment, status: WaybillStatus.DRAFT };
      setFormData(updatedWaybillData);
      await handleSave(true); // Save the comment
      setIsCorrectionModalOpen(false);
      showToast('Комментарий добавлен, ПЛ возвращен в черновики.', 'info');
  };

  const handleConfirmCorrection = async (reason: string) => {
    if (!('id' in formData && formData.id)) {
        return; // Should not happen for a POSTED waybill
    }

    try {
        const result = await changeWaybillStatus(formData.id, WaybillStatus.DRAFT, {
            userId: currentUser?.id,
            appMode: appSettings?.appMode || 'driver',
            reason: reason.trim(),
        });
        const updatedWaybill = result.data as Waybill;
        setFormData(updatedWaybill);
        setInitialFormData(JSON.parse(JSON.stringify(updatedWaybill)));
        showToast('Путевой лист возвращен в черновики для корректировки.', 'success');
        setIsCorrectionReasonModalOpen(false);
    } catch (e) {
        showToast((e as Error).message, 'error');
    }
  };

  const renderFooterActions = () => {
    const isNew = !('id' in formData && formData.id);
  
    return <>
        <button 
            onClick={handleCloseRequest} 
            className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-semibold py-2 px-6 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            aria-label="Закрыть"
        >
            Закрыть
        </button>
        
        <button 
            onClick={() => setIsPrintModalOpen(true)} 
            className="flex items-center gap-2 bg-teal-600 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:bg-teal-700 transition-colors disabled:opacity-50"
            aria-label="Печать на бланке"
            disabled={isNew}
        >
            <PrinterIcon className="h-5 w-5" />
            Печать
        </button>

        {canEdit && (
            <button onClick={() => handleSave()} className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:bg-blue-700">Сохранить</button>
        )}
    </>;
  };

  const statusColors = WAYBILL_STATUS_COLORS[formData.status];
  
  const formattedOverrun = fuelEconomyOrOverrun.toFixed(2);
  const displayOverrun = formattedOverrun === '-0.00' ? '0.00' : formattedOverrun;
  const isOverrun = fuelEconomyOrOverrun < -0.005; // Use a small tolerance for floating point issues


  return (
    <>
      <ConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setIsConfirmationModalOpen(false)}
        onConfirm={handleConfirmClose}
        title="Выйти без сохранения?"
        message="У вас есть несохраненные изменения. Вы уверены, что хотите выйти? Все изменения будут потеряны."
        confirmText="Да, выйти"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
      <CorrectionModal isOpen={isCorrectionModalOpen} onClose={() => setIsCorrectionModalOpen(false)} onSubmit={handleReturnToDraft} />
      <CorrectionReasonModal 
        isOpen={isCorrectionReasonModalOpen} 
        onClose={() => setIsCorrectionReasonModalOpen(false)} 
        onSubmit={handleConfirmCorrection}
      />
      {isPrintModalOpen && (
          <PrintableWaybill 
              waybill={formData as Waybill}
              vehicle={selectedVehicle}
              driver={selectedDriver}
              organization={selectedOrg}
              dispatcher={selectedDispatcher}
              controller={selectedController}
              fuelType={selectedFuelType}
              allOrganizations={organizations}
              onClose={() => setIsPrintModalOpen(false)} 
          />
      )}
      {isImportModalOpen && <RouteImportModal onClose={() => setIsImportModalOpen(false)} onConfirm={handleImportConfirm} />}
      <Modal isOpen={isGarageModalOpen} onClose={() => setIsGarageModalOpen(false)} title="Выбрать расходную накладную">
            <div className="space-y-2">
                {availableExpenses.length > 0 ? availableExpenses.map(tx => {
                    const fuelItem = tx.items.find(item => stockItems.find(si => si.id === item.stockItemId)?.fuelTypeId);
                    if (!fuelItem) return null;
                    const stockItemDetails = stockItems.find(si => si.id === fuelItem.stockItemId);
                    return (
                        <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                            <div>
                                <p>Накладная №{tx.docNumber} от {tx.date}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300">{stockItemDetails?.name}: {fuelItem.quantity} {stockItemDetails?.unit}</p>
                            </div>
                            <button onClick={() => handleSelectExpense(tx)} className="bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg">Выбрать</button>
                        </div>
                    )
                }) : <p>Нет доступных накладных для этого водителя.</p>}
            </div>
      </Modal>

      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-2xl shadow-lg space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{waybill && !isPrefill ? `Путевой лист №${formData.number}` : 'Новый путевой лист'}</h2>
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${statusColors?.bg} ${statusColors?.text}`}>
                    {WAYBILL_STATUS_TRANSLATIONS[formData.status]}
                </span>
            </div>
             <div className="flex items-center gap-3">
                <span className={`text-sm font-medium transition-colors ${dayMode === 'single' ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                    Однодневный
                </span>
                <label htmlFor="dayModeToggle" className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        id="dayModeToggle"
                        className="sr-only peer"
                        checked={dayMode === 'multi'}
                        onChange={(e) => handleDayModeChange(e.target.checked ? 'multi' : 'single')}
                        disabled={!canEdit}
                    />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
                <span className={`text-sm font-medium transition-colors ${dayMode === 'multi' ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                    Многодневный
                </span>
            </div>
        </header>

        {formData.reviewerComment && formData.status === WaybillStatus.DRAFT && (
            <div className="p-4 bg-orange-100 dark:bg-orange-900/50 border-l-4 border-orange-500 rounded-r-lg">
                  <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200 font-semibold">
                      <ChatBubbleLeftRightIcon className="h-5 w-5" />
                      <span>Комментарий проверяющего:</span>
                  </div>
                  <p className="mt-2 text-orange-700 dark:text-orange-300 ml-7">{formData.reviewerComment}</p>
            </div>
        )}

        <CollapsibleSection title="Основная информация" isCollapsed={collapsedSections.basicInfo || false} onToggle={() => toggleSection('basicInfo')}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FormField label="Организация"><FormSelect name="organizationId" value={formData.organizationId} onChange={handleChange} disabled={!canEdit}><option value="">Выберите</option>{organizations.map(o => <option key={o.id} value={o.id}>{o.shortName}</option>)}</FormSelect></FormField>
              <FormField label="Номер ПЛ"><FormInput type="text" name="number" value={formData.number} readOnly /></FormField>
              <div />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
               <FormField label="Дата ПЛ"><FormInput type="date" name="date" value={formData.date} readOnly className="!bg-gray-200 dark:!bg-gray-800" /></FormField>
                <FormField label="Действителен с">
                  <FormInput
                    type="datetime-local"
                    name="validFrom"
                    value={formData.validFrom}
                    min={minDate ? `${minDate}T00:00` : undefined}
                    onChange={handleChange}
                    disabled={!canEdit}
                  />
              </FormField>
               <FormField label="Действителен по">
                  <FormInput
                    type={dayMode === 'single' ? 'time' : 'datetime-local'}
                    name="validTo"
                    value={dayMode === 'single' ? formData.validTo.split('T')[1] : formData.validTo}
                    onChange={(e) => {
                      if (dayMode === 'single') {
                        const datePart = formData.validFrom.split('T')[0];
                        setFormData({ ...formData, validTo: `${datePart}T${e.target.value}` });
                      } else {
                        handleChange(e);
                      }
                    }}
                    min={dayMode === 'multi' ? formData.validFrom : undefined}
                    disabled={!canEdit}
                  />
              </FormField>
          </div>
        </CollapsibleSection>
        
        <CollapsibleSection title="ТС и Водитель" isCollapsed={collapsedSections.vehicleDriver || false} onToggle={() => toggleSection('vehicleDriver')}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="Транспортное средство">
                    <FormSelect name="vehicleId" value={formData.vehicleId} onChange={handleVehicleChange} disabled={!canEdit}>
                        <option value="">Выберите ТС</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand})</option>)}
                    </FormSelect>
                     {autoFillMessage && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{autoFillMessage}</p>}
                </FormField>
                <FormField label="Водитель">
                    <FormSelect name="driverId" value={formData.driverId} onChange={handleChange} disabled={!canEdit}>
                        <option value="">Выберите водителя</option>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                    </FormSelect>
                    {fuelCardBalance != null && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Доступно на карте: {fuelCardBalance.toFixed(2)} л
                        </div>
                    )}
                </FormField>
            </div>
        </CollapsibleSection>
        
        <CollapsibleSection title="Ответственные лица" isCollapsed={collapsedSections.staff || false} onToggle={() => toggleSection('staff')}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="Выезд разрешил (Диспетчер)">
                    <FormSelect name="dispatcherId" value={formData.dispatcherId} onChange={handleChange} disabled={!canEdit}>
                        <option value="">Выберите</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </FormSelect>
                </FormField>
                 <FormField label="Расчет произвел (Контролер/Бухгалтер)">
                    <FormSelect name="controllerId" value={formData.controllerId || ''} onChange={handleChange} disabled={!canEdit}>
                        <option value="">Выберите</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </FormSelect>
                </FormField>
            </div>
        </CollapsibleSection>
        
        <CollapsibleSection title="Пробег и топливо" isCollapsed={collapsedSections.fuelMileage || false} onToggle={() => toggleSection('fuelMileage')}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                 <div>
                    <FormField label="Пробег (выезд)"><FormInput type="number" step="1" name="odometerStart" value={formData.odometerStart || ''} onChange={handleNumericChange} disabled={!canEdit} /></FormField>
                    <FormField label="Пробег (возврат)"><FormInput type="number" step="1" name="odometerEnd" value={formData.odometerEnd || ''} onChange={handleNumericChange} disabled={!canEdit} /></FormField>
                </div>
                 <div>
                    <FormField label="Топливо (выезд)"><FormInput type="number" name="fuelAtStart" value={formData.fuelAtStart || ''} onChange={handleNumericChange} disabled={!canEdit} /></FormField>
                    <FormField label="Заправлено">
                        <div className="flex items-center gap-1">
                            <FormInput type="number" name="fuelFilled" value={formData.fuelFilled || ''} onChange={handleNumericChange} disabled={!canEdit} className={`${linkedTxId ? '!bg-green-100 dark:!bg-green-900' : ''} ${fuelFilledError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}/>
                            <button onClick={handleOpenGarageModal} title="Заполнить из Гаража" className="p-2 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50" disabled={!formData.driverId}><BanknotesIcon className="h-5 w-5"/></button>
                        </div>
                        {fuelFilledError && (<div className="mt-1 text-xs text-red-500">{fuelFilledError}</div>)}
                    </FormField>
                    <FormField label="Топливо (возврат)"><FormInput type="number" name="fuelAtEnd" value={formData.fuelAtEnd || ''} onChange={handleNumericChange} disabled={!canEdit} /></FormField>
                </div>
                <div>
                    <FormField label="Расход (норма)"><FormInput type="number" name="fuelPlanned" value={formData.fuelPlanned || ''} onChange={handleNumericChange} readOnly className="!bg-gray-200 dark:!bg-gray-800" /></FormField>
                    <p className="text-xs text-gray-500 mt-1">Факт: {actualFuelConsumption.toFixed(2)}</p>
                    <p className={`text-xs mt-1 ${fuelEconomyOrOverrun > 0.005 ? 'text-green-600' : isOverrun ? 'text-red-600' : 'text-gray-500'}`}>
                        {fuelEconomyOrOverrun > 0.005 ? `Экономия: ${displayOverrun}` : isOverrun ? `Перерасход: ${Math.abs(fuelEconomyOrOverrun).toFixed(2)}` : 'Совпадает'}
                    </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Пройдено, км: {totalDistance}</p>
                   <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded-lg text-center">
                        <p className="text-xs text-green-700 dark:text-green-300">Расчетная норма</p>
                        <p className="font-bold text-green-800 dark:text-green-200">{calculatedFuelRate.toFixed(2)} л/100км</p>
                    </div>
                </div>
            </div>
             {isOverrun && (
                <div className="mt-4">
                    <FormField label="Причина перерасхода">
                        <input name="deviationReason" value={formData.deviationReason || ''} onChange={handleChange} className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                    </FormField>
                </div>
            )}
        </CollapsibleSection>
        
        {('id' in formData) && formData.id && (
          <CollapsibleSection
            title="Связанные складские операции"
            isCollapsed={collapsedSections.stockLinks || false}
            onToggle={() => toggleSection('stockLinks')}
          >
            {linkedTransactions.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Нет связанных операций на складе.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">Дата</th>
                    <th className="p-2">Тип</th>
                    <th className="p-2">Причина</th>
                    <th className="p-2">Номенклатура</th>
                    <th className="p-2">Количество</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedTransactions.flatMap(tx => {
                    const isIncome = tx.type === 'income';
                    const reason =
                      tx.expenseReason === 'waybill'
                        ? 'Списание по ПЛ'
                        : tx.expenseReason === 'fuelCardTopUp'
                        ? 'Пополнение карты'
                        : tx.type === 'income'
                        ? 'Приход'
                        : 'Расход';
                    const rowCount = tx.items?.length || 1;

                    if (!tx.items || tx.items.length === 0) {
                      return (
                         <tr key={tx.id} className="border-t dark:border-gray-700">
                            <td className="p-2">{tx.date}</td>
                            <td className={`p-2 font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                              {isIncome ? 'Приход' : 'Расход'}
                            </td>
                            <td className="p-2">{reason}</td>
                            <td className="p-2 text-gray-400" colSpan={2}>Нет позиций в документе</td>
                         </tr>
                      );
                    }

                    return tx.items.map((item, itemIndex) => {
                      const stockItem = stockItems.find(i => i.id === item.stockItemId);
                      return (
                        <tr key={`${tx.id}-${itemIndex}`} className="border-t dark:border-gray-700">
                          {itemIndex === 0 && (
                            <>
                              <td className="p-2 align-top" rowSpan={rowCount}>{tx.date}</td>
                              <td className={`p-2 align-top font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'}`} rowSpan={rowCount}>
                                {isIncome ? 'Приход' : 'Расход'}
                              </td>
                              <td className="p-2 align-top" rowSpan={rowCount}>{reason}</td>
                            </>
                          )}
                          <td className="p-2">{stockItem?.name ?? '—'}</td>
                          <td className="p-2">
                            {item.quantity != null ? `${item.quantity} ${stockItem?.unit ?? ''}` : '—'}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            )}
          </CollapsibleSection>
        )}
        
        <CollapsibleSection title="Маршрут" isCollapsed={collapsedSections.route || false} onToggle={() => toggleSection('route')}>
            {(isAIAvailable || appSettings?.isParserEnabled) && (
                <div className="flex gap-4 mb-4 items-center">
                    {isAIAvailable && (
                        <>
                            <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Например: Гараж - Склад А - Клиент - Гараж" className="flex-grow bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" />
                            <button onClick={handleGenerateRoutes} disabled={isGenerating || !aiPrompt} className="flex items-center gap-2 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-purple-700 disabled:opacity-50">
                                <SparklesIcon className="h-5 w-5" />
                                {isGenerating ? 'Генерация...' : 'Сгенерировать (AI)'}
                            </button>
                        </>
                    )}
                    {appSettings?.isParserEnabled && (
                        <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-700">
                           <UploadIcon className="h-5 w-5" /> Импорт из файла
                        </button>
                    )}
                </div>
            )}
            <div className="space-y-4">
                 {formData.routes.map((route) => (
                    <div key={route.id} className={`grid grid-cols-1 ${dayMode === 'multi' ? 'md:grid-cols-[auto,1fr,1fr,100px,auto,auto]' : 'md:grid-cols-[1fr,1fr,100px,auto,auto]'} gap-2 items-end`}>
                        {dayMode === 'multi' && (
                             <FormField label="Дата"><input type="date" name="date" value={route.date || formData.date} onChange={e => handleRouteChance(route.id, 'date', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" /></FormField>
                        )}
                        <FormField label="Откуда"><input list="locations" name="from" value={route.from} onChange={e => handleRouteChance(route.id, 'from', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" /></FormField>
                        <FormField label="Куда"><input list="locations" name="to" value={route.to} onChange={e => handleRouteChance(route.id, 'to', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" /></FormField>
                        <FormField label="Пробег, км"><input type="number" step="0.1" name="distanceKm" value={route.distanceKm} onChange={e => handleRouteChance(route.id, 'distanceKm', Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md p-2" /></FormField>
                        <div className="flex items-center gap-4 pb-2">
                            {selectedVehicle?.useCityModifier && <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={route.isCityDriving} onChange={e => handleRouteChance(route.id, 'isCityDriving', e.target.checked)} /> Город</label>}
                            {selectedVehicle?.useWarmingModifier && <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={route.isWarming} onChange={e => handleRouteChance(route.id, 'isWarming', e.target.checked)} /> Прогрев</label>}
                        </div>
                        <button onClick={() => handleRemoveRoute(route.id)} className="text-red-500 hover:text-red-700 pb-2"><TrashIcon className="h-5 w-5" /></button>
                    </div>
                ))}
                 <datalist id="locations">{uniqueLocations.map(loc => <option key={loc} value={loc} />)}</datalist>
            </div>
            <button onClick={handleAddRoute} className="mt-4 text-blue-600 hover:text-blue-800">+ Добавить маршрут</button>
        </CollapsibleSection>

        <CollapsibleSection title="Приложения" isCollapsed={collapsedSections.attachments || false} onToggle={() => toggleSection('attachments')}>
            <input type="file" ref={attachmentInputRef} onChange={handleAttachmentUpload} className="hidden" />
            <button onClick={() => attachmentInputRef.current?.click()} className="flex items-center gap-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">
                <PaperClipIcon className="h-5 w-5" />
                Прикрепить файл
            </button>
            <div className="mt-4 space-y-2">
                {(formData.attachments || []).map(att => (
                    <div key={att.name} className="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
                        <div>
                            <p className="font-medium text-gray-800 dark:text-white">{att.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{(att.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button onClick={() => removeAttachment(att.name)} className="text-red-500 hover:text-red-700"><TrashIcon className="h-5 w-5" /></button>
                    </div>
                ))}
            </div>
        </CollapsibleSection>
        
        {/* Status Actions */}
        <div className="pt-6 border-t dark:border-gray-600 flex flex-wrap justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-2">
                {formData.status === WaybillStatus.DRAFT && can('waybill.submit') && appSettings?.appMode === 'central' && (
                    <button onClick={() => handleStatusChange(WaybillStatus.SUBMITTED)} className="flex items-center gap-2 bg-blue-500 text-white py-2 px-4 rounded-lg shadow hover:bg-blue-600"><PaperAirplaneIcon className="h-5 w-5" /> Отправить на проверку</button>
                )}
                {formData.status === WaybillStatus.DRAFT && can('waybill.post') && (appSettings?.appMode === 'driver' || !appSettings?.appMode) && (
                    <button onClick={() => handleStatusChange(WaybillStatus.POSTED)} className="flex items-center gap-2 bg-green-600 text-white py-2 px-4 rounded-lg shadow hover:bg-green-700"><CheckCircleIcon className="h-5 w-5" /> Провести</button>
                )}
                {formData.status === WaybillStatus.SUBMITTED && can('waybill.post') && (
                    <button onClick={() => handleStatusChange(WaybillStatus.POSTED)} className="flex items-center gap-2 bg-green-600 text-white py-2 px-4 rounded-lg shadow hover:bg-green-700"><CheckCircleIcon className="h-5 w-5" /> Провести</button>
                )}
                {formData.status === WaybillStatus.SUBMITTED && can('waybill.submit') && ( // Assuming same capability for returning
                    <button onClick={() => setIsCorrectionModalOpen(true)} className="flex items-center gap-2 bg-yellow-500 text-white py-2 px-4 rounded-lg shadow hover:bg-yellow-600"><ArrowUturnLeftIcon className="h-5 w-5" /> Вернуть на доработку</button>
                )}
                {formData.status === WaybillStatus.POSTED && can('waybill.correct') && (
                     <button onClick={() => setIsCorrectionReasonModalOpen(true)} className="flex items-center gap-2 bg-yellow-500 text-white py-2 px-4 rounded-lg shadow hover:bg-yellow-600"><PencilIcon className="h-5 w-5" /> Скорректировать</button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
                {renderFooterActions()}
            </div>
        </div>
      </div>
    </>
  );
};