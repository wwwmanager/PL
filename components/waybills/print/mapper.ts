
import { PrintDataBundle } from './types';
import { getShortName } from './utils';

export const getFieldValue = (field: string, bundle: PrintDataBundle): string => {
    const { 
        waybill, vehicle, driver, dispatcher, controller, fuelType, organization, 
        effectiveOrgFields, computed 
    } = bundle;

    const dateObj = new Date(waybill.date);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear());

    switch(field) {
        case 'orgName': return effectiveOrgFields.name;
        case 'orgAddress': return effectiveOrgFields.address;
        case 'orgPhone': return effectiveOrgFields.phone;
        case 'orgInn': return effectiveOrgFields.inn;
        
        case 'number': return waybill.number;
        case 'date': return new Date(waybill.date).toLocaleDateString('ru-RU');
        case 'dateDay': return day;
        case 'dateMonth': return new Date(waybill.date).toLocaleString('ru-RU', { month: 'long' });
        case 'dateYear': return year;
        
        case 'vehicleModel': return vehicle ? `${vehicle.brand} ${vehicle.plateNumber}` : '';
        case 'vehiclePlate': return vehicle?.plateNumber || '';
        
        case 'driverName': return getShortName(driver?.fullName);
        case 'driverLicense': return driver?.documentNumber || '';
        case 'driverClass': return ''; // Not tracked currently
        
        case 'dispatcherName': return getShortName(dispatcher?.fullName);
        case 'mechanicName': return computed.controllerShortName;
        case 'medicName': return ''; // Would be medical institution name or medic name if added
        
        case 'fuelType': return fuelType?.name || '';
        
        case 'odoStart': return String(waybill.odometerStart);
        case 'odoEnd': return String(waybill.odometerEnd || '');
        
        case 'fuelStart': return String(waybill.fuelAtStart?.toFixed(2) || '');
        case 'fuelEnd': return String(waybill.fuelAtEnd?.toFixed(2) || '');
        case 'fuelGiven': return String(waybill.fuelFilled?.toFixed(2) || '');
        
        case 'timeStart': return waybill.validFrom.split('T')[1] || '';
        case 'timeEnd': return waybill.validTo.split('T')[1] || '';
        
        case 'validFrom': return new Date(waybill.validFrom).toLocaleString('ru-RU');
        case 'validTo': return new Date(waybill.validTo).toLocaleString('ru-RU');
        
        case 'medCheckPre': return 'Прошел';
        case 'techCheckPre': return 'Выпуск разрешен';
        
        // Page 2
        case 'routeFrom': return waybill.routes.map(r => r.from).join('; ');
        case 'routeTo': return waybill.routes.map(r => r.to).join('; ');
        case 'totalDistance': return String(Math.round(computed.totalDistance));
        case 'fuelNorm': return String(waybill.fuelPlanned?.toFixed(2) || '');
        case 'fuelFact': return String(computed.fuelActual.toFixed(2));
        
        default: return '';
    }
};
