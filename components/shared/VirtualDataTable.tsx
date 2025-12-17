import React, { useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  width?: number | string;
}

interface Action<T> {
  icon: React.ReactNode;
  onClick: (item: T) => void;
  className?: string;
  title?: string;
  show?: (item: T) => boolean;
}

interface SelectionProps {
  selectedIds: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectRow: (id: string, checked: boolean) => void;
  isAllSelected: boolean;
}

interface VirtualDataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  sortColumn?: (keyof T & string) | null;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: keyof T & string) => void;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  onEndReached?: () => void;
  actions?: Action<T>[];
  selection?: SelectionProps;
  rowKey?: keyof T;
  height?: number | string;
  estimatedRowHeight?: number;
  tableId?: string;
}

export function VirtualDataTable<T extends Record<string, any>>({
  data,
  columns: initialColumns,
  sortColumn,
  sortDirection,
  onSort,
  isLoading,
  isFetchingNextPage,
  onEndReached,
  actions,
  selection,
  rowKey = 'id',
  height = '100%',
  estimatedRowHeight = 48,
  tableId = 'default-virtual-table',
}: VirtualDataTableProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const { columns, sensors, onDragEnd } = useColumnPersistence(initialColumns, tableId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeColumn = columns.find(c => c.key === activeId);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 10,
  });

  // Detect end reached for infinite scroll
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalItems = data.length;
  const lastVirtualItem = virtualItems[virtualItems.length - 1];

  useEffect(() => {
    if (
      lastVirtualItem &&
      lastVirtualItem.index >= totalItems - 5 && // Load more when 5 items from bottom
      onEndReached &&
      !isLoading &&
      !isFetchingNextPage
    ) {
      onEndReached();
    }
  }, [lastVirtualItem, totalItems, onEndReached, isLoading, isFetchingNextPage]);

  return (
    <DndContext
        sensors={sensors} 
        collisionDetection={closestCenter} 
        onDragEnd={(e) => { setActiveId(null); onDragEnd(e); }}
        onDragStart={(e) => setActiveId(String(e.active.id))}
    >
        <div className="flex flex-col h-full border border-gray-200 dark:border-gray-700 rounded-lg shadow bg-white dark:bg-gray-800">
        {/* Header */}
        <div className="flex bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-shrink-0">
            {selection && (
                <div className="px-4 py-3 flex items-center justify-center w-12 border-r border-gray-200 dark:border-gray-600">
                    <input
                        type="checkbox"
                        checked={selection.isAllSelected}
                        onChange={(e) => selection.onSelectAll(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                </div>
            )}
            <SortableContext items={columns.map(c => c.key)} strategy={horizontalListSortingStrategy}>
                {columns.map((col) => (
                <SortableHeader
                    key={col.key}
                    id={col.key}
                    className={`px-6 py-3 flex items-center gap-1 ${col.sortable !== false ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600' : ''}`}
                    style={{ width: col.width ?? 'auto', flex: col.width ? 'none' : 1 }}
                    onClick={() => col.sortable !== false && onSort && onSort(col.key)}
                >
                    <div className="flex items-center gap-1 overflow-hidden">
                        <span className="truncate">{col.label}</span>
                        {sortColumn === col.key ? (
                            sortDirection === 'asc' ? <ArrowUpIcon className="h-4 w-4 flex-shrink-0" /> : <ArrowDownIcon className="h-4 w-4 flex-shrink-0" />
                        ) : null}
                    </div>
                </SortableHeader>
                ))}
            </SortableContext>
            {actions && <div className="px-6 py-3 w-24 text-center">Действия</div>}
        </div>

        {/* Body */}
        <div
            ref={parentRef}
            className="w-full flex-1 overflow-y-auto relative"
            style={{
                height: typeof height === 'number' ? `${height}px` : height === '100%' ? undefined : height
            }}
        >
            <div
            style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
            }}
            >
            {virtualItems.map((virtualRow) => {
                const row = data[virtualRow.index];
                const id = row[rowKey as string] || virtualRow.index;
                const isSelected = selection?.selectedIds.has(id);

                return (
                <div
                    key={id}
                    style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`flex border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm text-gray-900 dark:text-gray-100 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                >
                    {selection && (
                        <div className="px-4 flex items-center justify-center w-12 border-r border-gray-100 dark:border-gray-700">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => selection.onSelectRow(id, e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            />
                        </div>
                    )}
                    {columns.map((col) => (
                    <div
                        key={col.key}
                        className="px-6 flex items-center overflow-hidden"
                        style={{ width: col.width ?? 'auto', flex: col.width ? 'none' : 1 }}
                    >
                        {col.render ? col.render(row) : row[col.key]}
                    </div>
                    ))}
                    
                    {actions && (
                    <div className="px-6 w-24 flex items-center justify-center gap-2">
                        {actions.map((action, actionIdx) => {
                            if (action.show && !action.show(row)) return null;
                            return (
                            <button
                                key={actionIdx}
                                onClick={(e) => {
                                e.stopPropagation();
                                action.onClick(row);
                                }}
                                className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${action.className || 'text-gray-600 dark:text-gray-400'}`}
                                title={action.title}
                            >
                                {action.icon}
                            </button>
                            );
                        })}
                    </div>
                    )}
                </div>
                );
            })}
            </div>
            
            {isLoading && data.length === 0 && (
                <div className="flex justify-center items-center h-full text-gray-500 absolute inset-0">
                    Загрузка данных...
                </div>
            )}
            
            {isFetchingNextPage && (
                <div className="p-2 text-center text-xs text-gray-500 bg-gray-50 dark:bg-gray-800">
                    Загрузка следующей страницы...
                </div>
            )}
        </div>
        </div>

        {createPortal(
            <DragOverlay>
                {activeColumn ? (
                    <div className="bg-white dark:bg-gray-800 shadow-lg p-3 rounded border dark:border-gray-600 font-bold opacity-80 cursor-grabbing flex items-center gap-2">
                         {activeColumn.label}
                    </div>
                ) : null}
            </DragOverlay>,
            document.body
        )}
    </DndContext>
  );
}