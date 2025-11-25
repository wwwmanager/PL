import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc';

interface SortConfig<T> {
  key: keyof T | null;
  direction: SortDirection;
}

interface Column<T> {
  key: keyof T;
  label: string;
}

type Filters = Record<string, string>;

export const useTable = <T extends Record<string, any>>(
  data: T[],
  columns: Column<T>[]
) => {
  const [sortConfig, setSortConfig] = useState<SortConfig<T>>({ key: null, direction: 'asc' });
  
  const initialFilters = useMemo(() => columns.reduce((acc, col) => {
    acc[col.key as string] = '';
    return acc;
  }, {} as Filters), [columns]);

  const [filters, setFilters] = useState<Filters>(initialFilters);

  const handleFilterChange = (key: keyof T, value: string) => {
    setFilters(prev => ({ ...prev, [key as string]: value }));
  };

  const filteredRows = useMemo(() => {
    if (Object.values(filters).every(f => f === '')) {
      return data;
    }
    return data.filter(row => {
      return (Object.entries(filters) as [string, string][]).every(([key, value]) => {
        if (!value) return true;
        const rowValue = row[key];
        // FIX: The value from the row could be of any type (e.g., number, boolean, null).
        // Convert it to a string before calling string methods to prevent runtime errors.
        return String(rowValue ?? '').toLowerCase().includes(value.toLowerCase());
      });
    });
  }, [data, filters]);

  const sortedRows = useMemo(() => {
    if (!sortConfig.key) {
      return filteredRows;
    }
    const sorted = [...filteredRows].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      
      return 0;
    });
    return sorted;
  }, [filteredRows, sortConfig]);
  
  const handleSort = (key: keyof T) => {
    setSortConfig(prev => {
      const isAsc = prev.key === key && prev.direction === 'asc';
      return { key, direction: isAsc ? 'desc' : 'asc' };
    });
  };

  return {
    rows: sortedRows,
    sortColumn: sortConfig.key,
    sortDirection: sortConfig.direction,
    handleSort,
    filters,
    handleFilterChange,
  };
};

export default useTable;