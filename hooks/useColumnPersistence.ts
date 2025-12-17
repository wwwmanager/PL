import { useState, useEffect, useCallback } from 'react';
import {
  useSensors,
  useSensor,
  MouseSensor,
  TouchSensor,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

interface Identifiable {
  key: string;
  [k: string]: any;
}

export function useColumnPersistence<T extends Identifiable>(
  defaultColumns: T[],
  tableId: string
) {
  const [columns, setColumns] = useState<T[]>(defaultColumns);
  const storageKey = `table_cols_v1_${tableId}`;

  // Инициализация и синхронизация при изменении дефолтных колонок
  useEffect(() => {
    try {
      const savedOrder = localStorage.getItem(storageKey);
      if (savedOrder) {
        const orderIds: string[] = JSON.parse(savedOrder);
        
        // 1. Создаем карту существующих колонок для быстрого доступа
        const colMap = new Map(defaultColumns.map(c => [c.key, c]));
        
        // 2. Восстанавливаем сохраненный порядок
        const newCols: T[] = [];
        const processedIds = new Set<string>();

        // Добавляем колонки в сохраненном порядке, если они все еще существуют в коде
        orderIds.forEach(id => {
          const col = colMap.get(id);
          if (col) {
            newCols.push(col);
            processedIds.add(id);
          }
        });

        // 3. Добавляем новые колонки (которых не было в сохранении) в конец
        defaultColumns.forEach(col => {
          if (!processedIds.has(col.key)) {
            newCols.push(col);
          }
        });

        setColumns(newCols);
      } else {
        setColumns(defaultColumns);
      }
    } catch (e) {
      console.error('Failed to load column order', e);
      setColumns(defaultColumns);
    }
  }, [defaultColumns, storageKey]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5, // Чтобы клик для сортировки не считался началом перетаскивания
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex((item) => item.key === active.id);
        const newIndex = items.findIndex((item) => item.key === over?.id);
        
        const newOrder = arrayMove(items, oldIndex, newIndex);
        
        // Сохраняем только ID
        const orderIds = newOrder.map(c => c.key);
        localStorage.setItem(storageKey, JSON.stringify(orderIds));
        
        return newOrder;
      });
    }
  }, [storageKey]);

  return {
    columns,
    sensors,
    onDragEnd
  };
}