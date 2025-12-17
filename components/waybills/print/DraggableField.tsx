
import React from 'react';
import { FieldKey, PrintPositions } from './types';

interface DraggableFieldProps {
    id: FieldKey;
    label: string;
    value: string;
    positions: PrintPositions;
    isSelected: boolean;
    editingEnabled: boolean;
    showPlaceholders: boolean;
    showLabels: boolean;
    // Font settings
    fontSize: number;
    fontFamily: string;
    
    onDragStart: (id: FieldKey, e: React.MouseEvent<HTMLDivElement>) => void;
    onResizeStart: (id: FieldKey, e: React.MouseEvent<HTMLDivElement>) => void;
}

export const DraggableField: React.FC<DraggableFieldProps> = ({
    id,
    label,
    value,
    positions,
    isSelected,
    editingEnabled,
    showPlaceholders,
    showLabels,
    fontSize,
    fontFamily,
    onDragStart,
    onResizeStart
}) => {
    const pos = positions[id];
    if (!pos) return null;

    let displayValue = value;
    const isEmpty = !value || value.trim() === '';

    if (isEmpty) {
        if (showPlaceholders && editingEnabled) displayValue = `[${label}]`;
        else if (!editingEnabled) return null; // Скрываем пустые при печати
    }

    return (
        <div
            className={`print-field-wrapper ${editingEnabled ? 'cursor-grab active:cursor-grabbing' : ''} ${isSelected ? 'draggable-selected' : ''} ${editingEnabled && !isSelected ? 'draggable-active' : ''}`}
            style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: pos.width ? `${pos.width}px` : 'auto',
                height: pos.height ? `${pos.height}px` : 'auto',
                position: 'absolute',
                zIndex: isSelected ? 10 : 1
            }}
            data-id={id}
            onMouseDown={(e) => onDragStart(id, e)}
        >
            <div className="print-field" style={{ width: '100%', height: '100%' }}>
                {editingEnabled && showLabels && (
                    <span className="print-label mr-1">{label}:</span>
                )}
                <span 
                    className={`print-value ${isEmpty ? 'text-gray-400 italic' : ''}`}
                    style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily, fontWeight: 'bold' }}
                >
                    {displayValue || (editingEnabled ? `[${label}]` : '')}
                </span>
            </div>
            
            {isSelected && editingEnabled && (
                <div 
                    className="resize-handle"
                    onMouseDown={(e) => onResizeStart(id, e)}
                />
            )}
        </div>
    );
};
