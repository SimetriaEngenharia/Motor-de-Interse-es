import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function DraggableWindow({ 
  title, 
  children, 
  onClose,
  initialWidth = 600,
  initialHeight = 300,
  initialX = 50,
  initialY = 50
}: { 
  title: string, 
  children: React.ReactNode, 
  onClose?: () => void,
  initialWidth?: number,
  initialHeight?: number,
  initialX?: number,
  initialY?: number
}) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ w: initialWidth, h: initialHeight });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, initPosX: number, initPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number, startY: number, initW: number, initH: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPos({ x: Math.max(0, dragRef.current.initPosX + dx), y: Math.max(0, dragRef.current.initPosY + dy) });
      }
      if (isResizing && resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        setSize({ w: Math.max(200, resizeRef.current.initW + dx), h: Math.max(100, resizeRef.current.initH + dy) });
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
       window.addEventListener('mousemove', handleMouseMove);
       window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
       window.removeEventListener('mousemove', handleMouseMove);
       window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing]);

  return createPortal(
    <div 
      className="fixed bg-white border border-slate-300 shadow-2xl rounded-md overflow-hidden flex flex-col z-[300] pointer-events-auto"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div 
        className="h-8 bg-slate-50 flex items-center justify-between px-3 cursor-move border-b border-slate-300 select-none"
        onMouseDown={(e) => {
           setIsDragging(true);
           dragRef.current = { startX: e.clientX, startY: e.clientY, initPosX: pos.x, initPosY: pos.y };
        }}
      >
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        {onClose && (
           <button onClick={onClose} className="text-slate-500 hover:text-slate-900" onMouseDown={e => e.stopPropagation()}>
             {/* Close icon */}
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
           </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden relative">
        {children}
      </div>
      {/* Resize Handle */}
      <div 
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-[300]"
        onMouseDown={(e) => {
           e.stopPropagation();
           setIsResizing(true);
           resizeRef.current = { startX: e.clientX, startY: e.clientY, initW: size.w, initH: size.h };
        }}
      >
        <svg viewBox="0 0 24 24" className="w-full h-full text-slate-500 opacity-50"><path fill="currentColor" d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM14 22H12V20H14V22ZM18 18H16V16H18V18Z"/></svg>
      </div>
        </div>,
    document.body
  );
}