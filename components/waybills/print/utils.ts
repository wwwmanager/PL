
import { PrintPositions } from './types';

export const clonePositions = (pos: PrintPositions): PrintPositions => {
    return JSON.parse(JSON.stringify(pos));
};

export const getShortName = (fullName?: string): string => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    const last = parts[0];
    const first = parts[1][0] + '.';
    const middle = parts.length > 2 ? parts[2][0] + '.' : '';
    return `${last} ${first}${middle}`;
};
