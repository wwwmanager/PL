
import { type ReactNode } from 'react';
import { ArrowUpIcon, ArrowDownIcon } from '../Icons';

export interface Column<T> {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => ReactNode;
  width?: string;
}

interface Action<T> {
  icon: ReactNode;
  onClick: (item: T) => void;
  className?: string;
  title?: string;
  show?: (item: T) => boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  sortColumn?: (keyof T & string) | null;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: keyof T & string) => void;
  filters?: Record<string, string>;
  onFilterChange?: (key: keyof T & string, value: string) => void;
  isLoading?: boolean;
  actions?: Action<T>[];
  rowKey?: keyof T;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  sortColumn,
  sortDirection,
  onSort,
  filters,
  onFilterChange,
  isLoading,
  actions,
  rowKey = 'id',
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-6 py-3 ${col.sortable !== false ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none' : ''}`}
                onClick={() => col.sortable !== false && onSort && onSort(col.key)}
                style={{ width: col.width }}
              >
                <div className="flex items-center gap-1 group">
                  {col.label}
                  {sortColumn === col.key ? (
                    sortDirection === 'asc' ? (
                      <ArrowUpIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <ArrowDownIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    )
                  ) : (
                    col.sortable !== false && (
                      <ArrowUpIcon className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )
                  )}
                </div>
              </th>
            ))}
            {actions && actions.length > 0 && (
              <th scope="col" className="px-6 py-3 text-center">Действия</th>
            )}
          </tr>
          {filters && onFilterChange && (
            <tr>
              {columns.map((col) => (
                <th key={`${col.key}-filter`} className="px-2 py-1 bg-gray-50 dark:bg-gray-700">
                  <input
                    type="text"
                    value={filters[col.key] || ''}
                    onChange={(e) => onFilterChange(col.key, e.target.value)}
                    placeholder={`Поиск...`}
                    className="w-full text-xs p-1.5 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none transition-shadow"
                  />
                </th>
              ))}
              {actions && actions.length > 0 && <th className="px-2 py-1 bg-gray-50 dark:bg-gray-700"></th>}
            </tr>
          )}
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length + (actions ? 1 : 0)} className="text-center p-8 text-gray-500">
                Загрузка данных...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (actions ? 1 : 0)} className="text-center p-8 text-gray-500">
                Нет данных
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={row[rowKey as string] || idx}
                className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-6 py-4">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
                {actions && actions.length > 0 && (
                  <td className="px-6 py-4 text-center whitespace-nowrap">
                    <div className="flex justify-center items-center gap-2">
                      {actions.map((action, actionIdx) => {
                        if (action.show && !action.show(row)) return null;
                        return (
                          <button
                            key={actionIdx}
                            onClick={(e) => {
                              e.stopPropagation();
                              action.onClick(row);
                            }}
                            className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${action.className || 'text-gray-600 dark:text-gray-400'}`}
                            title={action.title}
                          >
                            {action.icon}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
