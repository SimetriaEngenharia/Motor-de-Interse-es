import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ACI_COLORS } from "../lib/aciColors";

interface AciColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  title?: string;
}

export function AciColorPicker({ value, onChange, className = "", title = "Select Color" }: AciColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredColor, setHoveredColor] = useState<{hex: string, idx: number} | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = rect.bottom + 4;
      let left = rect.left;
      
      // Basic collision detection to keep it on screen
      if (left + 280 > window.innerWidth) {
        left = window.innerWidth - 280 - 10;
      }
      
      // If it goes off the bottom, open upwards
      if (top + 320 > window.innerHeight) {
        top = rect.top - 320 - 4; 
      }
      
      setCoords({ top, left });
    }
  }, [isOpen]);

  // Find index of current value
  const currentValueIndex = ACI_COLORS.findIndex(c => c.toLowerCase() === value?.toLowerCase());

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        onClick={() => setIsOpen(!isOpen)}
        className="w-6 h-6 rounded border border-slate-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 overflow-hidden cursor-pointer"
        style={{ backgroundColor: value || "#ffffff" }}
      />

      {isOpen && createPortal(
        <div 
          ref={popoverRef}
          className="fixed z-[9999] bg-white border border-slate-200 shadow-xl rounded-md p-2 w-[280px]"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="text-xs font-semibold text-slate-700 mb-2 flex justify-between">
            <span>AutoCAD Color Index</span>
            {hoveredColor ? (
              <span className="font-mono text-[10px] text-slate-500">
                Index: {hoveredColor.idx} ({hoveredColor.hex.toUpperCase()})
              </span>
            ) : (
              <span className="font-mono text-[10px] text-slate-500">
                {currentValueIndex !== -1 ? `Index: ${currentValueIndex}` : ''}
              </span>
            )}
          </div>
          
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(16, 1fr)', 
              gap: '1px',
              backgroundColor: '#e2e8f0', // gap color
              padding: '1px',
              borderRadius: '2px'
            }}
          >
            {ACI_COLORS.map((hex, idx) => (
              <button
                key={idx}
                type="button"
                onMouseEnter={() => setHoveredColor({hex, idx})}
                onMouseLeave={() => setHoveredColor(null)}
                onClick={() => {
                  onChange(hex);
                  setIsOpen(false);
                }}
                className="w-full aspect-square relative hover:z-10 focus:outline-none"
                style={{ backgroundColor: hex }}
              >
                {value === hex && (
                  <div className="absolute inset-0 border border-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)] pointer-events-none" />
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
