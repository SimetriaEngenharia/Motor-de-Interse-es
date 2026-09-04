import React, { useState, useEffect, useRef, ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
}

interface ContextMenuProps {
  children: ReactNode;
  items: ContextMenuItem[];
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    // Close on any regular click anywhere too
    const handleRegularClick = () => {
      if (isOpen) setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("click", handleRegularClick);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("click", handleRegularClick);
    };
  }, [isOpen]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsOpen(true);
    setPosition({ x: e.pageX, y: e.pageY });
  };

  return (
    <div onContextMenu={handleContextMenu} className="relative cursor-context-menu">
      {children}
      
      {isOpen && (
        <div
          ref={menuRef}
          className="fixed z-[300] bg-slate-50 border border-slate-300/50 rounded-md shadow-xl py-1 min-w-[160px]"
          style={{ top: position.y, left: position.x }}
          onClick={(e) => e.stopPropagation()} // Prevent closing immediately when clicking inside
        >
          {items.map((item, index) => (
            <button
              key={index}
              className={`w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2 transition-colors ${
                item.danger ? "text-rose-600 hover:text-rose-300" : "text-slate-800"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
                setIsOpen(false);
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
