import React, { useState } from "react";
import { useStore } from "../store";
import { X, Plus, Trash2 } from "lucide-react";
import { DraggableWindow } from "./DraggableWindow";
import { AciColorPicker } from "./AciColorPicker";

export default function LayerManager({ 
  modalForAlignment, 
  onClose 
}: { 
  modalForAlignment?: string | null;
  onClose: () => void;
}) {
  const { layers, addLayer, updateLayer, removeLayer, setAlignmentLayer, alignments } = useStore();
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerColor, setNewLayerColor] = useState("#ffffff");

  const align = modalForAlignment ? alignments.find(a => a.id === modalForAlignment) : null;

  return (
    <DraggableWindow 
      title={modalForAlignment ? "Alterar Layer" : "Gerenciador de Layers"}
      onClose={onClose}
      initialWidth={400}
      initialHeight={400}
      initialX={window.innerWidth / 2 - 200}
      initialY={window.innerHeight / 2 - 200}
    >
      <div className="p-4 flex flex-col gap-4 text-slate-800 text-sm h-full">
        {modalForAlignment && align && (
          <div className="bg-slate-100 p-2 rounded border border-slate-200">
            <strong>Alinhamento:</strong> {align.name}
            <div className="mt-2 flex items-center gap-2">
              <label>Layer atual:</label>
              <select 
                value={align.layerId || "layer-eixo"}
                onChange={(e) => {
                  setAlignmentLayer(align.id, e.target.value);
                  onClose();
                }}
                className="bg-white border border-slate-300 px-2 py-1 flex-1 text-sm rounded"
              >
                {layers.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 flex-1 overflow-hidden">
          <h4 className="font-semibold text-slate-700">Layers do Projeto</h4>
          <div className="flex gap-2">
             <input 
               type="text" 
               placeholder="Nome do Layer" 
               value={newLayerName}
               onChange={(e) => setNewLayerName(e.target.value)}
               className="bg-white border border-slate-300 px-2 py-1 flex-1 text-sm rounded"
             />
             <AciColorPicker
               value={newLayerColor}
               onChange={(hex) => setNewLayerColor(hex)}
             />
             <button
               onClick={() => {
                 if (!newLayerName.trim()) return;
                 addLayer({
                   id: "layer-" + Date.now(),
                   name: newLayerName,
                   color: newLayerColor,
                   isVisible: true,
                   isLocked: false
                 });
                 setNewLayerName("");
               }}
               className="bg-blue-500 hover:bg-blue-600 text-white p-1 px-2 rounded flex items-center justify-center"
             >
               <Plus size={16} />
             </button>
          </div>

          <div className="overflow-y-auto custom-scrollbar flex-1 border border-slate-200 rounded mt-2">
            <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="bg-slate-50 border-b border-slate-200 text-xs">
                   <th className="p-2 font-medium">Nome</th>
                   <th className="p-2 font-medium text-center w-12">Cor</th>
                   <th className="p-2 font-medium text-center w-16">Visível</th>
                   <th className="p-2 font-medium text-center w-12"></th>
                 </tr>
               </thead>
               <tbody>
                 {layers.map((l) => (
                   <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                     <td className="p-2">
                        <input 
                           type="text"
                           value={l.name}
                           onChange={(e) => updateLayer(l.id, { name: e.target.value })}
                           className="bg-transparent border-none p-0 m-0 w-full focus:ring-0 focus:outline-none"
                        />
                     </td>
                     <td className="p-2 flex justify-center">
                        <AciColorPicker
                          value={l.color || "#ffffff"}
                          onChange={(hex) => updateLayer(l.id, { color: hex })}
                        />
                     </td>
                     <td className="p-2 text-center">
                        <input 
                          type="checkbox"
                          checked={l.isVisible}
                          onChange={(e) => updateLayer(l.id, { isVisible: e.target.checked })}
                          className="cursor-pointer"
                        />
                     </td>
                     <td className="p-2 text-center">
                       {l.id !== "layer-eixo" && (
                          <button
                            onClick={() => removeLayer(l.id)}
                            className="text-slate-400 hover:text-rose-500 transition-colors"
                            title="Remover Layer"
                          >
                            <Trash2 size={14} />
                          </button>
                       )}
                     </td>
                   </tr>
                 ))}
               </tbody>
            </table>
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
}
