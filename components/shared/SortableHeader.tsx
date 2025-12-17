import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableHeaderProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  // Если true, рендерит как <th>, иначе <div>
  asTh?: boolean;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({ 
  id, 
  children, 
  className = '', 
  style = {}, 
  onClick,
  asTh = false
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const dndStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative',
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none', // Важно для сенсорных устройств
    ...style,
  };

  const content = (
    <div className="flex items-center gap-1 w-full h-full select-none">
      {/* Drag Handle Area - делаем весь заголовок активным для перетаскивания, но onClick обрабатываем отдельно */}
      <div 
        className="flex-grow flex items-center gap-1"
        {...attributes} 
        {...listeners}
      >
        {children}
      </div>
    </div>
  );

  if (asTh) {
    return (
      <th 
        ref={setNodeRef} 
        style={dndStyle} 
        className={className} 
        onClick={onClick}
      >
        {content}
      </th>
    );
  }

  return (
    <div 
      ref={setNodeRef} 
      style={dndStyle} 
      className={className}
      onClick={onClick}
    >
      {content}
    </div>
  );
};