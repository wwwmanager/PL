import React, { useState } from 'react';
import { ArrowUpIcon, ArrowDownIcon } from '../Icons';
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useColumnPersistence } from '../../hooks/useColumnPersistence';
import { SortableHeader } from './SortableHeader';
import { createPortal } from 'react-dom';

export interface Column<T> {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  width?: string;
}

interface Action<T> {
  icon: React.ReactNode;
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
  tableId?: string; // Required for persistence
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns: initialColumns,
  sortColumn,
  sortDirection,
  onSort,
  filters,
  onFilterChange,
  isLoading,
  actions,
  rowKey = 'id',
  tableId = 'default-table',
}: DataTableProps<T>) {
  
  const { columns, sensors, onDragEnd } = useColumnPersistence(initialColumns, tableId);
  
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeColumn = columns.find(c => c.key === activeId);

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragEnd={(e) => { setActiveId(null); onDragEnd(e); }}
      onDragStart={(e) => setActiveId(String(e.active.id))}
    >
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="w-full text-sm text-left text-gray-700 dark:text-gray-300">
          <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <SortableContext items={columns.map(c => c.key)} strategy={horizontalListSortingStrategy}>
                {columns.map((col) => (
                  <SortableHeader
                    key={col.key}
                    id={col.key}
                    asTh
                    className={`px-6 py-3 font-medium ${col.sortable !== false ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''}`}
                    onClick={() => col.sortable !== false && onSort && onSort(col.key)}
                    style={{ width: col.width }}
                  >
                    <div className="flex items-center gap-1 group">
                      {col.label}
                      {sortColumn === col.key ? (
                        sortDirection === 'asc' ? (
                          <ArrowUpIcon className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ArrowDownIcon className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        )
                      ) : (
                        col.sortable !== false && (
                          <ArrowUpIcon className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )
                      )}
                    </div>
                  </SortableHeader>
                ))}
              </SortableContext>
              {actions && actions.length > 0 && (
                <th scope="col" className="px-6 py-3 text-center font-medium">Действия</th>
              )}
            </tr>
            {filters && onFilterChange && (
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                {columns.map((col) => (
                  <th key={`${col.key}-filter`} className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
                    <input
                      type="text"
                      value={filters[col.key] || ''}
                      onChange={(e) => onFilterChange(col.key, e.target.value)}
                      placeholder={`Поиск...`}
                      className="w-full text-xs p-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow placeholder-gray-400"
                    />
                  </th>
                ))}
                {actions && actions.length > 0 && <th className="px-2 py-2 border-b border-gray-200 dark:border-gray-700"></th>}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="text-center p-8 text-gray-500">
                  <div className="flex justify-center items-center gap-2">
                     <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                     Загрузка данных...
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="text-center p-8 text-gray-500 italic">
                  Нет данных для отображения
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={row[rowKey as string] || idx}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-6 py-3 whitespace-nowrap">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                  {actions && actions.length > 0 && (
                    <td className="px-6 py-3 text-center whitespace-nowrap">
                      <div className="flex justify-center items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                        {actions.map((action, actionIdx) => {
                          if (action.show && !action.show(row)) return null;
                          return (
                            <button
                              key={actionIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                action.onClick(row);
                              }}
                              className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${action.className || 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
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
      
      {createPortal(
        <DragOverlay>
            {activeColumn ? (
                <div className="bg-white dark:bg-gray-800 shadow-lg p-3 rounded border dark:border-gray-600 font-bold opacity-80 cursor-grabbing">
                    {activeColumn.label}
                </div>
            ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}