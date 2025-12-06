
import { useState, useMemo, useEffect } from 'react';

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

interface UseTableOptions<T> {
    initialSort?: SortConfig<T>;
    onSortChange?: (sort: SortConfig<T>) => void;
    initialFilters?: Filters;
}

export const useTable = <T extends Record<string, any>>(
  data: T[],
  columns: Column<T>[],
  options?: UseTableOptions<T>
) => {
  const [sortConfig, setSortConfig] = useState<SortConfig<T>>(options?.initialSort || { key: null, direction: 'asc' });
  
  const initialFilters = useMemo(() => {
      if (options?.initialFilters) return options.initialFilters;
      return columns.reduce((acc, col) => {
        acc[col.key as string] = '';
        return acc;
      }, {} as Filters);
  }, [columns, options?.initialFilters]);

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
        return String(rowValue ?? '').toLowerCase().includes(value.toLowerCase());
      });
    });
  }, [data, filters]);

  const sortedRows = useMemo(() => {
    if (!sortConfig.key) {
      return filteredRows;
    }
    const sorted = [...filteredRows].sort((a, b) => {
      // Cast keys to ensure access
      const key = sortConfig.key as keyof T;
      const aValue = a[key];
      const bValue = b[key];

      // Handle null/undefined values (always at bottom)
      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Numeric sorting
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // String sorting (case-insensitive, locale-aware)
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      
      return 0;
    });
    return sorted;
  }, [filteredRows, sortConfig]);
  
  const handleSort = (key: keyof T) => {
    setSortConfig(prev => {
      const isAsc = prev.key === key && prev.direction === 'asc';
      const newConfig = { key, direction: isAsc ? 'desc' : 'asc' } as SortConfig<T>;
      if (options?.onSortChange) {
          options.onSortChange(newConfig);
      }
      return newConfig;
    });
  };

  return {
    rows: sortedRows,
    sortColumn: sortConfig.key as (keyof T & string) | null,
    sortDirection: sortConfig.direction,
    handleSort,
    filters,
    handleFilterChange,
  };
};

export default useTable;
