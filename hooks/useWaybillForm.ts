import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Waybill, WaybillStatus, Route, Attachment, StockTransaction,
    Vehicle, Employee, Organization
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
    getFuelCardBalance, 
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

    // --- Computed Stats (Exposed) ---
    // This allows consuming components to access the base rate used in calculation
    const calculationStats = useMemo(() => {
        return calculateStats(
            formData.routes,
            selectedVehicle,
            seasonSettings,
            formData.date,
            dayMode
        );
    }, [formData.routes, selectedVehicle, seasonSettings, formData.date, dayMode]);

    // --- Effects ---

    // 1. Check AI Availability
    useEffect(() => {
        checkAIAvailability().then(setIsAIAvailable);
    }, []);

    // 2. Initialize Form Data
    useEffect(() => {
        let formDataToSet: Omit<Waybill, 'id'> | Waybill;
        
        if (isPrefill && initialWaybill) {
            formDataToSet = {
                ...emptyWaybill,
                vehicleId: initialWaybill.vehicleId,
                driverId: initialWaybill.driverId,
                odometerStart: Math.round(initialWaybill.odometerEnd ?? 0),
                fuelAtStart: initialWaybill.fuelAtEnd ?? 0,
            };
            // Try to auto-populate responsible persons from driver if prefilling
            const driver = employees.find(e => e.id === initialWaybill.driverId);
            if (driver) {
                if (driver.dispatcherId) (formDataToSet as any).dispatcherId = driver.dispatcherId;
                if (driver.controllerId) (formDataToSet as any).controllerId = driver.controllerId;
                if (driver.organizationId) (formDataToSet as any).organizationId = driver.organizationId;
            }
        } else {
             formDataToSet = initialWaybill ? initialWaybill : { ...emptyWaybill };
             if (!initialWaybill && !isPrefill) {
                 const ownOrg = organizations.find(o => o.isOwn);
                 if (ownOrg) {
                     (formDataToSet as any).organizationId = ownOrg.id;
                 }
             }
        }
        
        if (initialWaybill && 'id' in initialWaybill) {
            const linkedTx = allTransactions.find(tx => tx.waybillId === initialWaybill.id);
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

        if (initialWaybill && !isPrefill) { // Editing existing
            const fromDate = initialWaybill.validFrom.split('T')[0];
            const toDate = initialWaybill.validTo.split('T')[0];
            setDayMode(fromDate === toDate ? 'single' : 'multi');
        } else { // New or Prefill
            setDayMode('multi');
            // Auto-reserve blank number
            const driverId = formDataToSet.driverId;
            if (driverId) {
                const driver = employees.find(e => e.id === driverId);
                // Call internal helper
                updateWaybillNumberForDriverInternal(driver || null, formDataToSet);
            }
        }
    }, [initialWaybill, isPrefill, organizations, employees, allTransactions]);

    // 3. Update Linked Transactions List
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

    // 4. Auto-update responsible persons if missing
    useEffect(() => {
        if (!selectedDriver) return;
        setFormData(prev => {
            let updated = { ...prev };
            let changed = false;
            
            if (!updated.dispatcherId && selectedDriver.dispatcherId) {
                updated.dispatcherId = selectedDriver.dispatcherId;
                changed = true;
            }
            if (!updated.controllerId && selectedDriver.controllerId) {
                updated.controllerId = selectedDriver.controllerId;
                changed = true;
            }
            if (changed) return updated;
            return prev;
        });
    }, [selectedDriver]);

    // 5. Update Organization from Driver (for new waybills)
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

    // 6. Recalculate Stats & Fuel
    useEffect(() => {
        if (!selectedVehicle || !seasonSettings) return;

        const newFuelPlanned = calculationStats.consumption;
        const startOdo = Number(formData.odometerStart) || 0;
        const newOdoEnd = startOdo + calculationStats.distance;
        const startFuel = Number(formData.fuelAtStart) || 0;
        const filledFuel = Number(formData.fuelFilled) || 0;
        const newFuelAtEnd = Math.round((startFuel + filledFuel - newFuelPlanned) * 100) / 100;
        
        setFormData(prev => {
            // Compare primitive values to avoid loops
            if (
                prev.fuelPlanned === newFuelPlanned && 
                prev.odometerEnd === newOdoEnd && 
                prev.fuelAtEnd === newFuelAtEnd
            ) {
                return prev;
            }
            return {
                ...prev,
                odometerEnd: Math.round(newOdoEnd),
                fuelPlanned: newFuelPlanned,
                fuelAtEnd: newFuelAtEnd,
            };
        });
    }, [calculationStats, formData.odometerStart, formData.fuelAtStart, formData.fuelFilled, selectedVehicle, seasonSettings]);


    // --- Helpers ---

    const updateWaybillNumberForDriverInternal = async (driver: Employee | null, currentData: Omit<Waybill, 'id'> | Waybill) => {
        if (!driver?.id) {
            setFormData(prev => ({ ...prev, number: '', blankId: null, blankSeries: null, blankNumber: null }));
            return;
        }
      
        if (!('id' in currentData) || !currentData.id || isPrefill) {
            const orgId = driver.organizationId;
            if (!orgId) {
                return;
            }
      
            const nextBlank = await getNextBlankForDriver(driver.id, orgId);
            if (nextBlank) {
                const numberStr = String(nextBlank.number).padStart(6, '0');
                setFormData(prev => ({
                    ...prev,
                    number: `${nextBlank.series}${numberStr}`,
                    blankId: nextBlank.id,
                    blankSeries: nextBlank.series,
                    blankNumber: nextBlank.number
                }));
            } else {
                showToast('Внимание: закончились номера бланков для этого водителя!', 'error');
                setFormData(prev => ({ ...prev, number: 'БЛАНКОВ НЕТ', blankId: null, blankSeries: null, blankNumber: null }));
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
            
            if (value) {
                getFuelCardBalance(value).then(setFuelCardBalance).catch(() => setFuelCardBalance(null));
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
            setLinkedTxId(null);
            if (fuelCardBalance != null && numericValue != null && !isNaN(numericValue) && numericValue > fuelCardBalance) {
                setFuelFilledError(`Введённый объём (${numericValue} л) превышает баланс на карте (${fuelCardBalance} л)`);
            } else {
                setFuelFilledError(null);
            }
        }
        setFormData(prev => ({...prev, [name]: numericValue }));
    };

    const handleVehicleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const vehicleId = e.target.value;
        const sVehicle = vehicles.find(v => v.id === vehicleId);
        setAutoFillMessage('');
        setMinDate('');

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
            
            if (assignedDriverId) {
                getFuelCardBalance(assignedDriverId).then(setFuelCardBalance).catch(() => setFuelCardBalance(null));
            } else {
                setFuelCardBalance(null);
            }
            
            if (!('id' in formData) || !formData.id || isPrefill) {
                 const lastWaybill = await getLastWaybillForVehicle(sVehicle.id);
                 updates.odometerStart = Math.round(sVehicle.mileage);
                 updates.fuelAtStart = sVehicle.currentFuel;
                 
                 let message = `Стартовые значения одометра и топлива загружены из карточки ТС.`;
                 if (lastWaybill) {
                    message += ` Данные из последнего ПЛ НЕ загружены.`
                    setMinDate(lastWaybill.date);
                 }
                 setAutoFillMessage(message);
                 
                 const tempData = { ...formData, ...updates };
                 updateWaybillNumberForDriverInternal(driver || null, tempData as any);
            }
            
            const newRoutes = formData.routes.map(r => ({
                ...r,
                isCityDriving: sVehicle.useCityModifier ? r.isCityDriving : false,
                isWarming: sVehicle.useWarmingModifier ? r.isWarming : false,
            }));

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

    // --- Route Handlers ---

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
        setFormData(prev => ({ ...prev, routes: [...prev.routes, newRoute] }));
    };

    const handleRouteUpdate = (id: string, field: keyof Route, value: any) => {
        if (field === 'date' && typeof value === 'string' && !isRouteDateValid(value)) {
            showToast(`Дата маршрута выходит за пределы диапазона путевого листа.`, 'error');
            return; 
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
        setFormData(prev => ({ ...prev, routes: prev.routes.filter(r => r.id !== id) }));
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

    // --- Validation and Save ---

    const validateForm = async (): Promise<boolean> => {
        if (!formData.dispatcherId) {
            showToast('Диспетчер не назначен.', 'error');
            return false;
        }
        if (!formData.number || formData.number === 'БЛАНКОВ НЕТ') {
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
                savedWaybill = await addWaybill(formData as Omit<Waybill, 'id'>);
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
        // 1. Блокирующая проверка на отрицательный остаток перед проведением
        if (nextStatus === WaybillStatus.POSTED) {
             const fuelEnd = formData.fuelAtEnd ?? 0;
             if (fuelEnd < -0.05) { 
                 showToast(`Ошибка: Отрицательный остаток топлива (${fuelEnd.toFixed(2)} л). Проведение невозможно.`, 'error');
                 return;
             }
             
             // Если форма не "грязная" (не редактировалась), handleSave не вызовется, 
             // поэтому запускаем валидацию вручную, чтобы проверить остальные поля (например, перелимит бака)
             if (!isDirty) {
                 const isValid = await validateForm();
                 if (!isValid) return;
             }
        }

        let savedWaybill = 'id' in formData ? formData as Waybill : null;
        
        // 2. Сохранение изменений перед сменой статуса
        if (isDirty) {
            savedWaybill = await handleSave(true);
            if (!savedWaybill) return; // Validation failed in handleSave
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
            
            // 3. Обновление состояния: создание новой ссылки для гарантированного ререндера
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
        // Expose calculated stats including base rate
        totalDistance: calculationStats.distance,
        calculatedFuelRate: calculationStats.averageRate,
        baseFuelRate: calculationStats.baseRate,
        actualFuelConsumption: (formData.fuelAtStart || 0) + (formData.fuelFilled || 0) - (formData.fuelAtEnd || 0),
        fuelEconomyOrOverrun: (formData.fuelPlanned || 0) - ((formData.fuelAtStart || 0) + (formData.fuelFilled || 0) - (formData.fuelAtEnd || 0)),

        vehicles,
        employees,
        drivers: employees.filter(e => e.employeeType === 'driver'),
        dispatchers: employees.filter(e => e.employeeType === 'dispatcher'),
        controllers: employees.filter(e => ['controller', 'mechanic', 'accountant'].includes(e.employeeType)),
        organizations,
        stockItems,
        appSettings,

        handleChange,
        handleNumericChange,
        handleVehicleChange,
        handleDayModeChange,
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