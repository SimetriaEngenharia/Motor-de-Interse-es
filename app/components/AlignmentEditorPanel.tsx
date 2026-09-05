import React, { useState } from "react";
import { useStore } from "../store";
import { Settings2, X, Plus, Trash2 } from "lucide-react";
import { rebuildFromPIs } from "../lib/alignment";

export function AlignmentEditorPanel({
  alignmentId,
  onClose,
}: {
  alignmentId: string;
  onClose: () => void;
}) {
  const { alignments, setAlignments, recomputeGeometry } = useStore();
  const alignment = alignments.find((a) => a.id === alignmentId);

  // Extract PIs mapping radius
  const [pis, setPis] = useState<{ x: number; y: number; radius?: number; spiralIn?: number; spiralOut?: number }[]>(
    () => {
      if (!alignment) return [];
      return alignment.keyPoints
        .filter(
          (p) =>
            p.pi || p.label === "PP" || p.label === "PT" || p.label === "PIV",
        )
        .map((p) => ({
          x: p.x,
          y: p.y,
          radius: p.radius || 0,
          spiralIn: p.spiralIn || 0,
          spiralOut: p.spiralOut || 0,
        }));
    },
  );

  if (!alignment) return null;

  const handleApply = () => {
    const { points, keyPoints, length } = rebuildFromPIs(pis);

    // Update alignment in store
    const newAlignments = alignments.map((a) => {
      if (a.id === alignmentId) {
        // keep the same instance reference or clone? better clone
        const clone = Object.assign(
          Object.create(Object.getPrototypeOf(a)),
          a,
        ) as any;
        clone.points = points;
        clone.keyPoints = keyPoints;
        clone.length = length;
        return clone;
      }
      return a;
    });

    setAlignments(newAlignments);
    recomputeGeometry();
    onClose();
  };

  const updatePI = (index: number, field: string, value: number) => {
    const newPIs = [...pis];
    newPIs[index] = { ...newPIs[index], [field]: value };
    setPis(newPIs);
  };

  return (
    <div className="absolute inset-0 z-[300] bg-white flex flex-col">
      <div className="flex border-b border-slate-200 shrink-0 p-3 items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-emerald-600" />
          <span className="font-medium text-slate-800">Parâmetros P.I.</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-50 rounded text-slate-500 hover:text-slate-800 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/50 text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2 w-10">P.I.</th>
                <th className="px-3 py-2">X</th>
                <th className="px-3 py-2">Y</th>
                <th className="px-3 py-2">Raio Curva</th>
                <th className="px-3 py-2 text-center" title="Espiral de Entrada">Le</th>
                <th className="px-3 py-2 text-center" title="Espiral de Saída">Ls</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {pis.map((pi, i) => (
                <tr key={i} className="hover:bg-slate-50/30">
                  <td className="px-3 py-2 font-bold text-center">
                    {i === 0 ? "PP" : i === pis.length - 1 ? "PT" : `PI-${i}`}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={pi.x}
                      onChange={(e) =>
                        updatePI(i, "x", parseFloat(e.target.value))
                      }
                      className="w-full bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-800 min-w-[60px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={pi.y}
                      onChange={(e) =>
                        updatePI(i, "y", parseFloat(e.target.value))
                      }
                      className="w-full bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-800 min-w-[60px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {i > 0 && i < pis.length - 1 ? (
                      <input
                        type="number"
                        value={pi.radius || 0}
                        onChange={(e) =>
                          updatePI(i, "radius", parseFloat(e.target.value))
                        }
                        className="w-full bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-800 min-w-[50px]"
                      />
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {i > 0 && i < pis.length - 1 ? (
                      <input
                        type="number"
                        value={pi.spiralIn || 0}
                        onChange={(e) =>
                          updatePI(i, "spiralIn", parseFloat(e.target.value))
                        }
                        className="w-full bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-800 min-w-[40px] text-center"
                      />
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {i > 0 && i < pis.length - 1 ? (
                      <input
                        type="number"
                        value={pi.spiralOut || 0}
                        onChange={(e) =>
                          updatePI(i, "spiralOut", parseFloat(e.target.value))
                        }
                        className="w-full bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-800 min-w-[40px] text-center"
                      />
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {i > 0 && i < pis.length - 1 && (
                      <button
                        onClick={() =>
                          setPis(pis.filter((_, idx) => idx !== i))
                        }
                        className="p-1 hover:bg-slate-100 hover:text-rose-600 rounded transition-colors text-slate-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-3 border-t border-slate-200 bg-white flex justify-end gap-2 shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 border border-slate-300 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleApply}
          className="px-4 py-2 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          Aplicar Alterações
        </button>
      </div>
    </div>
  );
}
