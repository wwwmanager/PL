
import { Waybill, Vehicle, Employee, Organization, FuelType } from '../../../types';

export type PageKey = 'page1' | 'page2';
export type FieldKey = string;

export interface PrintPositions {
    [key: string]: { x: number; y: number; width?: number; height?: number };
}

export interface PageOffsets {
    page1: { x: number; y: number };
    page2: { x: number; y: number };
}

export interface EditorPrefs {
    showLabels?: boolean;
    showGrid?: boolean;
    gridSize?: number;
    pageOffsets?: PageOffsets;
    hiddenFields?: string[];
    fieldPages?: Record<string, PageKey>;
    // New fields
    fontSize?: number;
    fontFamily?: string;
    backgroundImage?: string | null; // Base64
}

export interface PrintDataBundle {
    waybill: Waybill;
    vehicle: Vehicle | undefined;
    driver: Employee | undefined;
    dispatcher: Employee | undefined;
    controller: Employee | undefined;
    fuelType: FuelType | undefined;
    organization: Organization | undefined;
    medicalOrg: Organization | undefined;
    effectiveOrgFields: {
        name: string;
        address: string;
        inn: string;
        phone: string;
    };
    computed: {
        fuelActual: number;
        totalDistance: number;
        controllerShortName: string;
    };
}
