
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Waybill, WaybillStatus, Route, Attachment, StockTransaction,
    Vehicle, Employee, Organization, WaybillCalculationMethod
} from '../types';
import { 
    useVehicles, 
    useEmployees, 
    useOrganizations, 
    useFuelTypes, 
    useSavedRoutes, 
    useSeasonSettings, 
    useGarageStockItems, 
    useStockTransactions, 
    useAppSettings,
    QUERY_KEYS
} from './queries';
import { 
    generateId, 
    getLastWaybillForVehicle, 
    calculateDriverBalance, 
    getNextBlankForDriver, 
    addWaybill, 
    updateWaybill, 
    addSavedRoutesFromWaybill, 
    updateStockTransaction,
    changeWaybillStatus
} from '../services/mockApi';
import { checkAIAvailability, generateRouteFromPrompt } from '../services/geminiService';
import { calculateStats } from '../utils/waybillCalculations';
import { useToast } from './useToast';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../services/auth';

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
    calculationMethod: 'by_total', 
};

export const useWaybillForm = (
    initialWaybill: Waybill | null, 
    isPrefill: boolean, 
    onSaveSuccess?: (waybill: Waybill) => void
) => {
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const { currentUser } = useAuth();

    // --- Data Hooks ---
    const { data: vehicles = [] } = useVehicles();
    const { data: employees = [] } = useEmployees();
    const { data: organizations = [] } = useOrganizations();
    const { data: fuelTypes = [] } = useFuelTypes();
    const { data: savedRoutes = [] } = useSavedRoutes();
    const { data: seasonSettings } = useSeasonSettings();
    const { data: stockItems = [] } = useGarageStockItems();
    const { data: allTransactions = [] } = useStockTransactions();
    const { data: appSettings } = useAppSettings();

    // --- Local State ---
    const [formData, setFormData] = useState<Omit<Waybill, 'id'> | Waybill>(initialWaybill && !isPrefill ? initialWaybill : emptyWaybill);
    const [initialFormData, setInitialFormData] = useState<Omit<Waybill, 'id'> | Waybill | null>(null);
    const [isAIAvailable, setIsAIAvailable] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [autoFillMessage, setAutoFillMessage] = useState('');
    const [dayMode, setDayMode] = useState<'single' | 'multi'>('multi');
    const [minDate, setMinDate] = useState<string>('');
    
    // Extra fields
    const [fuelCardBalance, setFuelCardBalance] = useState<number | null>(null);
    const [fuelFilledError, setFuelFilledError] = useState<string | null>(null);
    const [linkedTxId, setLinkedTxId] = useState<string | null>(null);
    const [initialLinkedTxId, setInitialLinkedTxId] = useState<string | null>(null);
    const [linkedTransactions, setLinkedTransactions] = useState<StockTransaction[]>([]);
    
    // New state to track if fuelPlanned was manually edited or should be preserved
    const [isFuelPlannedManual, setIsFuelPlannedManual] = useState(false);

    // --- Computed Values ---
    const selectedVehicle = useMemo(() => vehicles.find(v => v.id === formData.vehicleId), [formData.vehicleId, vehicles]);
    const selectedDriver = useMemo(() => employees.find(e => e.id === formData.driverId), [formData.driverId, employees]);
    const selectedFuelType = useMemo(() => fuelTypes.find(f => f.id === selectedVehicle?.fuelTypeId), [selectedVehicle, fuelTypes]);
    
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

    const isDirty = useMemo(() => {
        if (!initialFormData) return false;
        const currentData = { ...formData, linkedTxId };
        const initialData = { ...initialFormData, linkedTxId: initialLinkedTxId };
        return JSON.stringify(currentData) !== JSON.stringify(initialData);
    }, [formData, initialFormData, linkedTxId, initialLinkedTxId]);

    // --- Smart Employee Lists ---
    const dispatchers = useMemo(() => {
        const base = employees.filter(e => ['dispatcher', 'manager', 'other'].includes(e.employeeType));
        const additionalIds = new Set<string>();
        if (selectedDriver?.dispatcherId) additionalIds.add(selectedDriver.dispatcherId);
        if (formData.dispatcherId) additionalIds.add(formData.dispatcherId);
        additionalIds.forEach(id => {
            const emp = employees.find(e => e.id === id);
            if (emp && !base.find(b => b.id === emp.id)) {
                base.push(emp);
            }
        });
        return base.sort((a, b) => a.shortName.localeCompare(b.shortName));
    }, [employees, selectedDriver, formData.dispatcherId]);

    const controllers = useMemo(() => {
        const base = employees.filter(e => ['controller', 'mechanic', 'accountant', 'manager', 'other'].includes(e.employeeType));
        const additionalIds = new Set<string>();
        if (selectedDriver?.controllerId) additionalIds.add(selectedDriver.controllerId);
        if (formData.controllerId) additionalIds.add(formData.controllerId);
        additionalIds.forEach(id => {
            const emp = employees.find(e => e.id === id);
            if (emp && !base.find(b => b.id === emp.id)) {
                base.push(emp);
            }
        });
        return base.sort((a, b) => a.shortName.localeCompare(b.shortName));
    }, [employees, selectedDriver, formData.controllerId]);


    // --- Computed Stats (Exposed) ---
    const calculationStats = useMemo(() => {
        return calculateStats(
            formData.routes,
            selectedVehicle,
            seasonSettings,
            formData.date,
            dayMode,
            formData.calculationMethod 
        );
    }, [formData.routes, selectedVehicle, seasonSettings, formData.date, dayMode, formData.calculationMethod]);

    // --- Effects ---

    useEffect(() => {
        checkAIAvailability().then(setIsAIAvailable);
    }, []);

    // Effect to calculate dynamic balance when driver or date changes
    useEffect(() => {
        if (formData.driverId && formData.date) {
            calculateDriverBalance(formData.driverId, formData.date)
                .then(setFuelCardBalance)
                .catch(err => {
                    console.error("Failed to calc balance", err);
                    setFuelCardBalance(null);
                });
        } else {
            setFuelCardBalance(null);
        }
    }, [formData.driverId, formData.date, allTransactions]); 

    // 1. Main Initialization Effect (Runs ONLY on mount or prop change)
    useEffect(() => {
        let formDataToSet: Omit<Waybill, 'id'> | Waybill;
        
        if (isPrefill && initialWaybill) {
            formDataToSet = {
                ...emptyWaybill,
                vehicleId: initialWaybill.vehicleId,
                driverId: initialWaybill.driverId,
                odometerStart: Math.round(initialWaybill.odometerEnd ?? 0),
                fuelAtStart: initialWaybill.fuelAtEnd ?? 0,
                calculationMethod: initialWaybill.calculationMethod ?? 'by_total',
                organizationId: initialWaybill.organizationId || '',
                dispatcherId: initialWaybill.dispatcherId,
                controllerId: initialWaybill.controllerId,
            };
        } else {
             formDataToSet = initialWaybill ? initialWaybill : { ...emptyWaybill };
             if (!formDataToSet.calculationMethod) {
                 formDataToSet.calculationMethod = 'by_total';
             }
        }
        
        setFormData(formDataToSet);
        setInitialFormData(JSON.parse(JSON.stringify(formDataToSet)));
        setIsFuelPlannedManual(false); 

        if (initialWaybill && !isPrefill) {
            const fromDate = initialWaybill.validFrom.split('T')[0];
            const toDate = initialWaybill.validTo.split('T')[0];
            setDayMode(fromDate === toDate ? 'single' : 'multi');
        } else {
            setDayMode('multi');
        }
    }, [initialWaybill, isPrefill]);

    // 2. Default Organization Effect
    useEffect(() => {
        if (!initialWaybill && !isPrefill && organizations.length > 0) {
             setFormData(prev => {
                 if (!prev.organizationId) {
                     const ownOrg = organizations.find(o => o.isOwn);
                     if (ownOrg) return { ...prev, organizationId: ownOrg.id };
                 }
                 return prev;
             });
        }
    }, [organizations, initialWaybill, isPrefill]);

    // 3. Linked Transaction Effect
    useEffect(() => {
        if (initialWaybill && 'id' in initialWaybill) {
            const linkedTx = allTransactions.find(tx => tx.waybillId === initialWaybill.id);
            if(linkedTx) {
                setLinkedTxId(linkedTx.id);
                setInitialLinkedTxId(linkedTx.id);
            }
        }
    }, [initialWaybill, allTransactions]);

    // 4. Initial Number Generation (If driver exists on load/prefill)
    useEffect(() => {
        if ((!initialWaybill || isPrefill) && selectedDriver) {
             if (!formData.number && !formData.blankId) {
                  updateWaybillNumberForDriverInternal(selectedDriver, formData);
             }
        }
    }, [selectedDriver, isPrefill, initialWaybill]); 

    useEffect(() => {
        if (!formData || !('id' in formData) || !formData.id) {
            setLinkedTransactions([]);
            return;
        }
        const ids = formData.linkedStockTransactionIds ?? [];
        if (!ids.length) {
            setLinkedTransactions([]);
            return;
        }
        const linked = allTransactions.filter(t => ids.includes(t.id));
        setLinkedTransactions(linked);
    }, [formData, allTransactions]);

    // Update dispatchers/controllers when driver changes
    useEffect(() => {
        if (!selectedDriver) return;
        setFormData(prev => {
            let updated = { ...prev };
            let changed = false;
            
            // Auto-fill only if empty or invalid
            if (!updated.dispatcherId && selectedDriver.dispatcherId) {
                updated.dispatcherId = selectedDriver.dispatcherId;
                changed = true;
            } else if (updated.dispatcherId && !dispatchers.find(d => d.id === updated.dispatcherId)) {
                // If current dispatcher is invalid (not in list), try to set default
                if (dispatchers.length > 0) {
                    updated.dispatcherId = dispatchers[0].id;
                    changed = true;
                }
            } else if (!updated.dispatcherId && dispatchers.length > 0) {
                 // Try to set default if empty
                 updated.dispatcherId = dispatchers[0].id;
                 changed = true;
            }

            if (!updated.controllerId && selectedDriver.controllerId) {
                updated.controllerId = selectedDriver.controllerId;
                changed = true;
            } else if (!updated.controllerId && controllers.length > 0) {
                updated.controllerId = controllers[0].id;
                changed = true;
            }

            if (changed) return updated;
            return prev;
        });
    }, [selectedDriver, dispatchers, controllers]);

    useEffect(() => {
        if (selectedDriver?.organizationId) {
            if (!('id' in formData) || !formData.id || isPrefill) {
                setFormData(prev => ({
                    ...prev,
                    organizationId: selectedDriver.organizationId!,
                }));
            }
        }
    }, [selectedDriver, 'id' in formData ? formData.id : undefined, isPrefill]);

    // Recalculate Stats & Fuel
    useEffect(() => {
        if (!selectedVehicle || !seasonSettings) return;

        const newFuelPlanned = calculationStats.consumption;
        const startOdo = Number(formData.odometerStart) || 0;
        const newOdoEnd = startOdo + calculationStats.distance;
        const startFuel = Number(formData.fuelAtStart) || 0;
        const filledFuel = Number(formData.fuelFilled) || 0;
        
        const routesJson = JSON.stringify(formData.routes);
        const initialRoutesJson = initialFormData ? JSON.stringify(initialFormData.routes) : '';
        const routesChanged = routesJson !== initialRoutesJson;
        
        let effectiveFuelPlanned = formData.fuelPlanned;

        if (isFuelPlannedManual) {
            effectiveFuelPlanned = formData.fuelPlanned;
        } else if (!routesChanged && initialFormData && !isPrefill) {
            effectiveFuelPlanned = initialFormData.fuelPlanned;
        } else {
            effectiveFuelPlanned = newFuelPlanned;
        }

        const newFuelAtEnd = Math.round((startFuel + filledFuel - (effectiveFuelPlanned || 0)) * 100) / 100;
        
        setFormData(prev => {
            if (
                prev.fuelPlanned === effectiveFuelPlanned && 
                prev.odometerEnd === newOdoEnd && 
                prev.fuelAtEnd === newFuelAtEnd
            ) {
                return prev;
            }
            return {
                ...prev,
                odometerEnd: Math.round(newOdoEnd),
                fuelPlanned: effectiveFuelPlanned,
                fuelAtEnd: newFuelAtEnd,
            };
        });
    }, [
        calculationStats, 
        formData.odometerStart, 
        formData.fuelAtStart, 
        formData.fuelFilled, 
        selectedVehicle, 
        seasonSettings,
        isFuelPlannedManual,
        initialFormData,
        isPrefill,
        formData.routes 
    ]);


    // --- Helpers ---

    const updateWaybillNumberForDriverInternal = async (driver: Employee | null, currentData: Omit<Waybill, 'id'> | Waybill) => {
        if (!driver?.id) {
            if (!('id' in currentData)) {
                 setFormData(prev => ({ ...prev, number: '', blankId: null, blankSeries: null, blankNumber: null }));
            }
            return;
        }
      
        if (!('id' in currentData) || !currentData.id || isPrefill) {
            const orgId = driver.organizationId;
            if (!orgId) return;
      
            const nextBlank = await getNextBlankForDriver(driver.id, orgId);
            if (nextBlank) {
                setFormData(prev => ({
                    ...prev,
                    number: '',
                    blankId: nextBlank.id,
                    blankSeries: nextBlank.series,
                    blankNumber: nextBlank.number
                }));
            } else {
                setFormData(prev => ({ ...prev, number: '', blankId: null, blankSeries: null, blankNumber: null }));
            }
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

    // --- Field Handlers ---

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        
        if (name === 'driverId') {
            const driver = employees.find(d => d.id === value);
            setFormData(prev => {
                const newFormData = { ...prev, driverId: value };
                if (driver && (!('id' in prev) || !prev.id || isPrefill)) {
                    if (driver.organizationId) newFormData.organizationId = driver.organizationId;
                    if (driver.dispatcherId) newFormData.dispatcherId = driver.dispatcherId;
                    if (driver.controllerId) newFormData.controllerId = driver.controllerId;
                }
                updateWaybillNumberForDriverInternal(driver || null, newFormData);
                return newFormData;
            });
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
            setLinkedTxId(null);
            setFuelFilledError(null);
        }
        
        if (name === 'fuelPlanned') {
            setIsFuelPlannedManual(true);
        }

        setFormData(prev => ({...prev, [name]: numericValue }));
    };

    const handleVehicleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const vehicleId = e.target.value;
        const sVehicle = vehicles.find(v => v.id === vehicleId);
        setAutoFillMessage('');
        setMinDate('');
        
        setIsFuelPlannedManual(false);

        if (sVehicle) {
            const assignedDriverId = sVehicle.assignedDriverId || '';
            const driver = employees.find(e => e.id === assignedDriverId);

            let updates: Partial<Waybill> = {
                vehicleId: sVehicle.id,
                driverId: assignedDriverId,
            };
            
            if (driver && (!('id' in formData) || !formData.id || isPrefill)) {
                 if (driver.dispatcherId) updates.dispatcherId = driver.dispatcherId;
                 if (driver.controllerId) updates.controllerId = driver.controllerId;
            }
            
            if (!('id' in formData) || !formData.id || isPrefill) {
                 const lastWaybill = await getLastWaybillForVehicle(sVehicle.id);
                 
                 if (lastWaybill) {
                     updates.odometerStart = Math.round(lastWaybill.odometerEnd ?? sVehicle.mileage);
                     updates.fuelAtStart = lastWaybill.fuelAtEnd ?? sVehicle.currentFuel;
                     
                     setAutoFillMessage(`Данные загружены из последнего ПЛ (от ${new Date(lastWaybill.date).toLocaleDateString()}).`);
                     setMinDate(lastWaybill.date);
                 } else {
                     updates.odometerStart = Math.round(sVehicle.mileage);
                     updates.fuelAtStart = sVehicle.currentFuel;
                     setAutoFillMessage(`Стартовые значения загружены из карточки ТС (история пуста).`);
                 }
                 
                 const tempData = { ...formData, ...updates };
                 // Await this to prevent race condition
                 await updateWaybillNumberForDriverInternal(driver || null, tempData as any);
            }
            
            const newRoutes = formData.routes.map(r => ({
                ...r,
                isCityDriving: sVehicle.useCityModifier ? r.isCityDriving : false,
                isWarming: sVehicle.useWarmingModifier ? r.isWarming : false,
            }));

            // Force update with latest computed values
            setFormData(prev => ({ ...prev, ...updates, routes: newRoutes }));
        } else {
            setFuelCardBalance(null);
            setFormData(prev => ({ ...prev, vehicleId: '', driverId: '', dispatcherId: '', controllerId: '' }));
        }
    };

    const handleDayModeChange = (mode: 'single' | 'multi') => {
        setDayMode(mode);
        if (mode === 'single') {
            const datePart = formData.validFrom.split('T')[0];
            const timePart = formData.validTo.split('T')[1] || '18:00';
            setFormData(prev => ({ ...prev, validTo: `${datePart}T${timePart}` }));
        } else {
            const fromDate = new Date(formData.validFrom);
            const toDate = new Date(formData.validTo);
            if (fromDate.toISOString().split('T')[0] === toDate.toISOString().split('T')[0]) {
                const newToDate = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
                setFormData(prev => ({ ...prev, validTo: newToDate.toISOString().slice(0, 16) }));
            }
        }
    };

    const handleMethodChange = (method: WaybillCalculationMethod) => {
        setIsFuelPlannedManual(false);
        setFormData(prev => ({ ...prev, calculationMethod: method }));
    };

    // --- Route Handlers ---

    const handleAddRoute = () => {
        setIsFuelPlannedManual(false);
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
        setFormData(prev => ({ ...prev, routes: [...prev.routes, newRoute] }));
    };

    const handleRouteUpdate = (id: string, field: keyof Route, value: any) => {
        if (field === 'date' && typeof value === 'string' && !isRouteDateValid(value)) {
            showToast(`Дата маршрута выходит за пределы диапазона путевого листа.`, 'error');
            return; 
        }
        
        if (['distanceKm', 'isCityDriving', 'isWarming', 'from', 'to'].includes(field)) {
            setIsFuelPlannedManual(false);
        }

        setFormData(prev => {
            const newRoutes = prev.routes.map(r => {
                if (r.id !== id) return r;
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
            return { ...prev, routes: newRoutes };
        });
    };

    const handleRemoveRoute = (id: string) => {
        setIsFuelPlannedManual(false);
        setFormData(prev => ({ ...prev, routes: prev.routes.filter(r => r.id !== id) }));
    };

    const handleGenerateRoutes = async () => {
        if (!aiPrompt) return;
        setIsGenerating(true);
        try {
            const generatedRoutes = await generateRouteFromPrompt(aiPrompt);
            setIsFuelPlannedManual(false);
            setFormData(prev => ({ ...prev, routes: [...prev.routes, ...generatedRoutes] }));
            setAiPrompt('');
        } catch(error) {
            showToast((error as Error).message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    // --- Validation and Save ---

    const validateForm = async (): Promise<boolean> => {
        // Auto-fix: if dispatcher missing, try to set from list
        if (!formData.dispatcherId && dispatchers.length > 0) {
             setFormData(prev => ({ ...prev, dispatcherId: dispatchers[0].id }));
             // Allow validation to pass this time, assuming the setFormData will take effect
             // Actually React state update won't be immediate for this check.
             // We return true but rely on the fact that next render will have it. 
             // BUT for save to work NOW, we need to pass corrected data.
             // Best to just block and let user click again or auto-fill worked in useEffect.
             // However, let's be strict but helpful.
             
             // Hack: Directly mutate for validation check context if we want to proceed? 
             // No, better to just error if useEffect didn't catch it.
             // But we added logic in useEffect to auto-fill.
             // If still empty, it means no dispatchers exist.
        }

        if (!formData.dispatcherId && dispatchers.length === 0) {
             // Edge case: No dispatchers in system. Allow save if user is admin? 
             // Or just warn.
             showToast('В системе нет диспетчеров. Создайте сотрудника с типом "Диспетчер".', 'error');
             return false;
        }

        if (!formData.dispatcherId) {
            showToast('Диспетчер не назначен.', 'error');
            return false;
        }
        
        if (('id' in formData) && (!formData.number || formData.number === 'БЛАНКОВ НЕТ')) {
            showToast('Невозможно сохранить ПЛ без номера.', 'error');
            return false;
        }
        if (formData.fuelAtEnd !== undefined && formData.fuelAtEnd < -0.05) {
            showToast('Расчетный остаток топлива не может быть отрицательным.', 'error');
            return false;
        }
        if (selectedVehicle && !selectedVehicle.disableFuelCapacityCheck && selectedVehicle.fuelTankCapacity) {
             const startFuel = formData.fuelAtStart || 0;
             const endFuel = formData.fuelAtEnd || 0;
            if (startFuel > selectedVehicle.fuelTankCapacity) {
                showToast(`Начальный остаток топлива превышает объем бака.`, 'error');
                return false;
            }
            if (endFuel > selectedVehicle.fuelTankCapacity) {
                showToast(`Конечный остаток топлива превышает объем бака.`, 'error');
                return false;
            }
        }
        for (const route of formData.routes) {
            if (!isRouteDateValid(route.date)) {
                showToast(`Дата маршрута выходит за пределы срока действия.`, 'error');
                return false;
            }
        }
        if ((!('id' in formData) || !formData.id) && formData.vehicleId) {
            if (selectedVehicle && formData.odometerStart < selectedVehicle.mileage) {
                showToast(`Начальный пробег меньше последнего в карточке ТС.`, 'error');
                return false;
            }
            const lastWaybill = await getLastWaybillForVehicle(formData.vehicleId);
            if (lastWaybill) {
                const waybillDate = new Date(formData.date);
                const lastWaybillDate = new Date(lastWaybill.date);
                if (waybillDate.getTime() < lastWaybillDate.getTime()) {
                    showToast(`Дата ПЛ раньше последнего учтенного.`, 'error');
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
                savedWaybill = await addWaybill(formData as Omit<Waybill, 'id'>, { userId: currentUser?.id });
                setFormData(savedWaybill); 
            }

            if (savedWaybill && savedWaybill.routes.length > 0) {
                await addSavedRoutesFromWaybill(savedWaybill.routes);
            }
            
            const originalLinkedTx = allTransactions.find(tx => tx.id === initialLinkedTxId);
            if (originalLinkedTx && originalLinkedTx.id !== linkedTxId) {
                await updateStockTransaction({ ...originalLinkedTx, waybillId: null });
            }
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
            setIsFuelPlannedManual(false); // Reset manual flag on save
            
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybills });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vehicles });
            
            if (onSaveSuccess) onSaveSuccess(savedWaybill);
            return savedWaybill;
        } catch (error) {
            console.error("Failed to save waybill:", error);
            if (!suppressNotifications) {
                showToast(`Не удалось сохранить: ${error instanceof Error ? error.message : 'Ошибка'}`, 'error');
            }
            return null;
        }
    };

    const handleStatusChange = async (nextStatus: WaybillStatus) => {
        if (nextStatus === WaybillStatus.POSTED) {
             const fuelEnd = formData.fuelAtEnd ?? 0;
             if (fuelEnd < -0.05) { 
                 showToast(`Ошибка: Отрицательный остаток топлива (${fuelEnd.toFixed(2)} л). Проведение невозможно.`, 'error');
                 return;
             }
             
             if (!isDirty) {
                 const isValid = await validateForm();
                 if (!isValid) return;
             }
        }

        let savedWaybill = 'id' in formData ? formData as Waybill : null;
        
        if (isDirty) {
            savedWaybill = await handleSave(true);
            if (!savedWaybill) return; 
        }
        
        if (!savedWaybill || !savedWaybill.id) {
            showToast('Сначала сохраните путевой лист.', 'error');
            return;
        }

        try {
            const result = await changeWaybillStatus(savedWaybill.id, nextStatus, {
                userId: currentUser?.id,
                appMode: appSettings?.appMode || 'driver',
            });
            const updatedWaybill = result.data as Waybill;
            
            setFormData({ ...updatedWaybill });
            setInitialFormData(JSON.parse(JSON.stringify(updatedWaybill)));
            
            const statusText = nextStatus === WaybillStatus.POSTED ? 'проведен' : 'обновлен';
            showToast(`Путевой лист успешно ${statusText}`, 'success');
            
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybills });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vehicles });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.employees });
        } catch (e) {
            showToast((e as Error).message, 'error');
        }
    };

    const handleSelectExpense = (tx: StockTransaction) => {
        const fuelItem = tx.items.find(item => stockItems.find(si => si.id === item.stockItemId)?.fuelTypeId);
        if (fuelItem) {
            setFormData(prev => ({...prev, fuelFilled: fuelItem.quantity}));
            setLinkedTxId(tx.id);
        } else {
            showToast('В накладной не найдено топливо.', 'error');
        }
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

    const handleImportConfirm = (newRoutes: Route[]) => {
        setIsFuelPlannedManual(false);
        setFormData(prev => ({...prev, routes: [...prev.routes, ...newRoutes]}));
        showToast(`Добавлено ${newRoutes.length} сегментов.`, 'success');
    };

    return {
        formData,
        setFormData,
        initialFormData,
        setInitialFormData,
        isDirty,
        isAIAvailable,
        aiPrompt,
        setAiPrompt,
        isGenerating,
        autoFillMessage,
        dayMode,
        minDate,
        fuelCardBalance,
        fuelFilledError,
        linkedTxId,
        linkedTransactions,
        
        selectedVehicle,
        selectedDriver,
        selectedFuelType,
        uniqueLocations,
        totalDistance: calculationStats.distance,
        calculatedFuelRate: calculationStats.averageRate,
        baseFuelRate: calculationStats.baseRate,
        actualFuelConsumption: (formData.fuelAtStart || 0) + (formData.fuelFilled || 0) - (formData.fuelAtEnd || 0),
        fuelEconomyOrOverrun: (formData.fuelPlanned || 0) - ((formData.fuelAtStart || 0) + (formData.fuelFilled || 0) - (formData.fuelAtEnd || 0)),

        vehicles,
        employees,
        drivers: employees.filter(e => e.employeeType === 'driver'),
        dispatchers,
        controllers,
        organizations,
        stockItems,
        appSettings,

        handleChange,
        handleNumericChange,
        handleVehicleChange,
        handleDayModeChange,
        handleMethodChange, // Export new handler
        handleAddRoute,
        handleRouteUpdate,
        handleRemoveRoute,
        handleGenerateRoutes,
        handleSave,
        handleStatusChange,
        handleSelectExpense,
        handleAttachmentUpload,
        removeAttachment,
        handleImportConfirm
    };
};
