import React, { useState } from "react";
import { Alignment3D, AlignmentStyles, ElementStyle } from "../lib/alignment";
import { useStore } from "../store";
import { AciColorPicker } from "./AciColorPicker";
import { DraggableWindow } from "./DraggableWindow";

interface AlignmentStyleModalProps {
  alignmentId: string;
  onClose: () => void;
}

export function AlignmentStyleModal({ alignmentId, onClose }: AlignmentStyleModalProps) {
  const { alignments, setAlignments, layers } = useStore();
  const alignment = alignments.find(a => a.id === alignmentId);
  
  if (!alignment) return null;

  const defaultStyles: AlignmentStyles = {
    tangents: { color: alignment.color || "#3b82f6", layerId: alignment.layerId, lineType: "solid", visible: true },
    curves: { color: alignment.color || "#3b82f6", layerId: alignment.layerId, lineType: "solid", visible: true },
    spirals: { color: alignment.color || "#3b82f6", layerId: alignment.layerId, lineType: "solid", visible: true },
    extensions: { color: "#ef4444", layerId: alignment.layerId, lineType: "dashed", visible: true },
  };

  const currentStyles = alignment.styles || defaultStyles;

  const [styles, setStyles] = useState<AlignmentStyles>({
    tangents: { ...defaultStyles.tangents, ...currentStyles.tangents },
    curves: { ...defaultStyles.curves, ...currentStyles.curves },
    spirals: { ...defaultStyles.spirals, ...currentStyles.spirals },
    extensions: { ...defaultStyles.extensions, ...currentStyles.extensions },
  });

  const handleUpdate = (type: keyof AlignmentStyles, field: keyof ElementStyle, value: any) => {
    setStyles(prev => ({
      ...prev,
      [type]: {
        ...(prev[type] || {}),
        [field]: value
      }
    }));
  };

  const handleSave = () => {
    const newAlignments = alignments.map(a => {
      if (a.id === alignmentId) {
        const newAlign = Object.assign(Object.create(Object.getPrototypeOf(a)), a);
        newAlign.styles = styles;
        return newAlign;
      }
      return a;
    });
    setAlignments(newAlignments);
    onClose();
  };

  const renderRow = (label: string, key: keyof AlignmentStyles) => {
    const style = styles[key] || {};
    return (
      <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
        <td className="p-2 py-3 text-sm text-slate-700 font-medium">{label}</td>
        <td className="p-2 text-center">
          <input
            type="checkbox"
            checked={style.visible !== false}
            onChange={(e) => handleUpdate(key, "visible", e.target.checked)}
            className="cursor-pointer"
          />
        </td>
        <td className="p-2 flex justify-center">
          <AciColorPicker
            value={style.color || "#ffffff"}
            onChange={(hex) => handleUpdate(key, "color", hex)}
          />
        </td>
        <td className="p-2">
          <select
            value={style.layerId || "layer-eixo"}
            onChange={(e) => handleUpdate(key, "layerId", e.target.value)}
            className="bg-white border border-slate-300 px-2 py-1 text-xs rounded w-full"
          >
            {layers.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </td>
        <td className="p-2">
          <select
            value={style.lineType || "solid"}
            onChange={(e) => handleUpdate(key, "lineType", e.target.value)}
            className="bg-white border border-slate-300 px-2 py-1 text-xs rounded w-full"
          >
            <option value="solid">Contínua</option>
            <option value="dashed">Tracejada</option>
            <option value="dotted">Pontilhada</option>
            <option value="dashdot">Traço-Ponto</option>
          </select>
        </td>
      </tr>
    );
  };

  return (
    <DraggableWindow
      title="Estilos do Alinhamento"
      onClose={onClose}
      initialWidth={500}
      initialHeight={350}
      initialX={window.innerWidth / 2 - 250}
      initialY={window.innerHeight / 2 - 175}
    >
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs text-slate-600">
                  <th className="p-2 font-semibold">Elemento</th>
                  <th className="p-2 font-semibold text-center">Visível</th>
                  <th className="p-2 font-semibold text-center">Cor</th>
                  <th className="p-2 font-semibold">Layer</th>
                  <th className="p-2 font-semibold">Linha</th>
                </tr>
              </thead>
              <tbody>
                {renderRow("Tangentes", "tangents")}
                {renderRow("Curvas", "curves")}
                {renderRow("Espirais", "spirals")}
                {renderRow("Extensões", "extensions")}
              </tbody>
            </table>
          </div>
        </div>
        <div className="p-3 bg-white border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm transition"
          >
            Salvar
          </button>
        </div>
      </div>
    </DraggableWindow>
  );
}
