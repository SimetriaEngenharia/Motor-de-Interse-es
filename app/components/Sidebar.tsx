import { AciColorPicker } from "./AciColorPicker";
import { isTopFeature, getFeatureLayerInfo } from "../lib/geomExtract";
import { NovoGalhoPanel } from "./NovoGalhoPanel";
import { AlignmentStyleModal } from "./AlignmentStyleModal";
import React, { useState, useEffect } from "react";
import { useStore, ComposerState } from "../store";
import { PenTool,
  Settings2,
  Layers,
  Map as MapIcon,
  Plus,
  Minus,
  Trash2,
  ArrowLeft,
  Route,
  TrendingUp,
  GitMerge,
  Scissors,
  Folder,
  ChevronRight,
  ChevronDown,
  Edit3,
  MoveDiagonal,
  FlipVertical,
  Eraser,
  Wrench,
  PencilLine,
  MapPin,
  Palette,
  Lock,
  Unlock,
  Edit2,
  Circle,
  SeparatorVertical,
  SquareDashed,
  List,
  Eye,
  EyeOff,
  Printer,
} from "lucide-react";
import { AIGenerator } from "./AIGenerator";
import { SuperelevationPanel } from "../superelevation/SuperelevationPanel";

import { createOffsetAlignment, Alignment3D } from "../lib/alignment";

function FolderGroup({
  title,
  children,
  defaultExpanded = true,
  isIntersection = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  isIntersection?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!children || (Array.isArray(children) && children.length === 0))
    return null;

  return (
    <div className="flex flex-col gap-1 w-full mb-1">
      <div
        className="flex items-center gap-2 px-2 py-1.5 bg-white/40 hover:bg-white/80 rounded cursor-pointer select-none text-slate-700 font-medium text-[11px] border border-slate-200/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown size={14} className="opacity-70" />
        ) : (
          <ChevronRight size={14} className="opacity-70" />
        )}
        {isIntersection ? (
          <GitMerge size={12} className="text-cyan-500" />
        ) : (
          <Folder size={12} className="text-blue-600" />
        )}
        <span className="truncate">{title}</span>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1 pl-4 border-l border-slate-200/40 ml-2 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const [isEditing, setIsEditing] = useState(false);
  const [isCreatingAssembly, setIsCreatingAssembly] = useState(false);

  const activeTab = useStore((state) => state.activeTab);
  const setActiveTab = useStore((state) => state.setActiveTab);
  const setProductionMode = useStore((state) => state.setProductionMode);
  const setPlanMode = useStore((state) => state.setPlanMode);
  const setProfileMode = useStore((state) => state.setProfileMode);
  const setSectionMode = useStore((state) => state.setSectionMode);
  const setPlan3DMode = useStore((state) => state.setPlan3DMode);

  const store = useStore();

  // Sobra de sessões antigas: o contexto Drawing foi absorvido pela coluna Desenho.
  useEffect(() => {
    if (activeTab === "drawing") setActiveTab("horizontal");
  }, [activeTab]);

  const handleTabChange = (tab: any, modeConfig?: () => void) => {
    setActiveTab(tab);
    if (modeConfig) {
      modeConfig();
    }
  };

  if (isCreatingAssembly) {
    return <AIGenerator onClose={() => setIsCreatingAssembly(false)} />;
  }

  if (isEditing) {
    return (
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden text-sm relative z-20">
        <div className="flex border-b border-slate-200 shrink-0 p-3 items-center gap-3 bg-white">
          <button
            onClick={() => setIsEditing(false)}
            className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded text-slate-700 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <Settings2 size={14} className="text-blue-600" /> Editor de Seção
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <EditorPanel store={store} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden text-sm relative z-20">
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === "assemblies" && (
          <AssembliesPanel
            store={store}
            onCreate={() => {
              store.addAssembly();
              // After adding, the store updates synchronously, we can get the new state
              const newAssemblies = useStore.getState().assemblies;
              const newAssembly = newAssemblies[newAssemblies.length - 1];
              if (newAssembly) {
                store.setSelectedAssemblyId(newAssembly.id);
                setIsEditing(true);
              }
            }}
            onEdit={(id) => {
              store.setSelectedAssemblyId(id);
              setIsEditing(true);
            }}
          />
        )}
        {activeTab === "regions" && <RegionsPanel store={store} />}
        {activeTab === "surface" && <SurfacePanel store={store} />}
        {activeTab === "horizontal" && <HorizontalPanel store={store} />}
        {activeTab === "vertical" && <VerticalPanel store={store} />}
        {activeTab === "intersections" && <IntersectionsPanel store={store} />}
        {activeTab === "production" && <ProductionPanel store={store} />}
      </div>
    </div>
  );
}

function EditorPanel({ store }: { store: ComposerState }) {
  const assembly = store.assemblies.find(
    (a) => a.id === store.selectedAssemblyId,
  );

  if (!assembly) {
    return (
      <div className="text-slate-500 text-center mt-10 text-sm">
        Selecione uma Seção Tipo na aba correspondente para editar.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col pb-2 border-b border-slate-200">
        <h3 className="text-slate-800 font-medium">Parâmetros (Input)</h3>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-blue-600">Editando:</span>
          <input
            type="text"
            className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-600"
            value={assembly.name}
            onChange={(e) => store.updateAssembly(assembly.id, { name: e.target.value })}
            placeholder="Nome da Seção"
          />
        </div>
      </div>

      {assembly.parameters.map((param) => (
        <div
          key={param.id}
          className="flex flex-col gap-1 gap-y-1.5 p-3 bg-white rounded-md border border-slate-200/50"
        >
          <div className="flex justify-between items-center text-xs">
            <span className="text-blue-300 font-mono font-medium">
              {param.name}
            </span>
            <span className="text-slate-500">{param.type}</span>
          </div>
          <input
            type="number"
            value={param.value}
            step={0.1}
            onChange={(e) =>
              store.updateParameter(
                assembly.id,
                param.id,
                parseFloat(e.target.value) || 0,
              )
            }
            className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-slate-800 w-full focus:outline-none focus:border-blue-600 font-mono text-sm"
          />
        </div>
      ))}

      {assembly.parameters.length === 0 && (
        <div className="text-slate-500 text-xs italic">
          Nenhum parâmetro definido.
        </div>
      )}
    </div>
  );
}

import { ContextMenu } from "./ContextMenu";

import { AlignmentEditorPanel } from "./AlignmentEditorPanel";

function HorizontalPanel({ store }: { store: ComposerState }) {
  const [showSuperPanel, setShowSuperPanel] = useState(false);
  const [showOffsetPrompt, setShowOffsetPrompt] = useState(false);
  const [offsetValue, setOffsetValue] = useState("3.6");
  const [offsetSide, setOffsetSide] = useState<"left" | "right">("right");
  const [offsetDynamic, setOffsetDynamic] = useState(true);
  const [renamePrompt, setRenamePrompt] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [stylePrompt, setStylePrompt] = useState<{ id: string } | null>(null);
  const alignment =
    store.alignments.find((a) => a.id === store.activeAlignmentId) ||
    (store.alignments.length > 0 ? store.alignments[0] : null);

  const visibleAlignments = store.alignments.filter((a) => !a.isHidden);

  const baseAlignments = visibleAlignments.filter(
    (a) => !a.id.startsWith("align-int-") && !a.id.startsWith("feat-"),
  );
  // Group intersections alignments
  const intAlignsByInt = new Map<string, typeof visibleAlignments>();
  visibleAlignments.forEach((a) => {
    if (a.id.startsWith("align-int-")) {
      const parts = a.id.split("-");
      if (parts.length >= 3) {
        const intId = `${parts[1]}-${parts[2]}`;
        if (!intAlignsByInt.has(intId)) intAlignsByInt.set(intId, []);
        intAlignsByInt.get(intId)!.push(a);
      }
    }
  });

  const renderAlignment = (a: any) => (
    <ContextMenu
      key={a.id}
      items={[
        {
          label: "Renomear Alinhamento",
          icon: <Edit3 size={14} />,
          onClick: () => {
            if (a.isLocked) return;
            setRenamePrompt({ id: a.id, name: a.name });
            setRenameValue(a.name);
          },
        },
        {
          label: "Cor do Alinhamento",
          icon: <Palette size={14} />,
          onClick: () => {
            setStylePrompt({ id: a.id });
          },
        },
        ...(!a.isLocked ? [{
          label: "Excluir Alinhamento",
          danger: true,
          icon: <Trash2 size={14} />,
          onClick: () => {
            store.removeAlignment(a.id);
          },
        }] : []),
      ]}
    >
      <div
        onClick={() => {
          store.setActiveAlignmentId(a.id);
        }}
        className={`px-3 py-2 text-[11px] rounded transition-colors text-left flex items-center gap-2 cursor-pointer ${
          store.activeAlignmentId === a.id
            ? "bg-blue-900/40 border border-blue-600/50 text-blue-100 font-medium"
            : "bg-white border border-slate-200/50 text-slate-500 hover:bg-slate-50 cursor-pointer"
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            store.toggleAlignmentLock(a.id);
          }}
          className="hover:text-amber-600 transition-colors"
          title={a.isLocked ? "Desbloquear Alinhamento" : "Bloquear Alinhamento"}
        >
          {a.isLocked ? <Lock size={12} className="text-amber-500" /> : <Unlock size={12} className="opacity-50" />}
        </button>
        <Route
          size={12}
          className={
            store.activeAlignmentId === a.id ? "text-blue-600" : "opacity-50"
          }
        />
        {a.name}
      </div>
    </ContextMenu>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="pb-2 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-slate-800 font-medium">Alinhamentos (Plantas)</h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const newName = `Alinhamento ${store.alignments.length + 1}`;
              const newAlign = new Alignment3D(newName, 0, [], []);
              store.importAlignment(newAlign);
              store.setActiveAlignmentId(newAlign.id);
              store.setInteractionMode("draw_alignment_pi");
            }}
            className="text-slate-500 hover:text-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded-sm"
            title="Adicionar Alinhamento"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto mb-3 pr-1 custom-scrollbar">
          {baseAlignments.map((a) => {
            // Find sub-folders (features linked to this alignment)
            const featuresForAlign = visibleAlignments.filter((feat) => {
              if (!feat.id.startsWith("feat-")) return false;
              const corr = store.corridors.find((c) =>
                feat.id.startsWith("feat-" + c.id),
              );
              return corr && corr.alignmentId === a.id;
            });

            return (
              <div
                key={a.id}
                className="flex flex-col gap-1 w-full bg-white/30"
              >
                {renderAlignment(a)}
                {featuresForAlign.length > 0 && (
                  <div className="pl-2 border-l-2 border-slate-300/30 ml-2 py-1">
                    <FolderGroup
                      title="Alinhamentos de Componentes (Offset)"
                      defaultExpanded={false}
                    >
                      {featuresForAlign.map(renderAlignment)}
                    </FolderGroup>
                  </div>
                )}
              </div>
            );
          })}

          {Array.from(intAlignsByInt.entries()).map(([intId, aligns]) => {
            const intersection = store.intersections.find(
              (i) => i.id === intId,
            );
            if (!intersection) return null;
            return (
              <FolderGroup
                key={intId}
                title={intersection.name || "Interseção"}
                isIntersection={true}
              >
                {aligns.map(renderAlignment)}
              </FolderGroup>
            );
          })}

          {visibleAlignments.length === 0 && (
            <div className="text-xs text-slate-500 italic p-2 bg-white/50 rounded text-center border border-dashed border-slate-200">
              Nenhum alinhamento encontrado.
            </div>
          )}
        </div>

        <p className="text-[10px] uppercase font-bold text-slate-500 mt-2 mb-2">
          Ferramentas (Alinhamento Ativo)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() => {
            const currentMode = store.interactionMode;
            if (
              currentMode === "draw_alignment_pi" ||
              currentMode === "extend_alignment"
            ) {
              store.setInteractionMode("none");
            } else {
              if (store.activeAlignmentId) {
                const align = store.alignments.find(
                  (a) => a.id === store.activeAlignmentId,
                );
                if (align && align.keyPoints.length > 0) {
                  const structPIs = align.keyPoints
                    .filter((p) => p.pi)
                    .map((p) => ({ x: p.x, y: p.y, radius: p.radius }));
                  store.setTempPIs(structPIs);
                  store.setInteractionMode("extend_alignment");
                } else {
                  store.clearTempPIs();
                  store.setInteractionMode("draw_alignment_pi");
                }
              } else {
                store.clearTempPIs();
                store.setInteractionMode("draw_alignment_pi");
              }
            }
          }}
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : `cursor-pointer ${store.interactionMode === "draw_alignment_pi" || store.interactionMode === "extend_alignment" ? "bg-slate-50 border-emerald-600 text-emerald-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}`}
        >
          <Route size={20} className="mb-2" />
          <span className="text-[10px] uppercase font-bold text-center">
            {store.activeAlignmentId &&
            (store.alignments.find((a) => a.id === store.activeAlignmentId)
              ?.keyPoints.length ?? 0) > 0
              ? "Esticar Tangente"
              : "Criar PI"}
          </span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "create_curve"
                ? "none"
                : "create_curve",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : `cursor-pointer ${store.interactionMode === "create_curve" ? "bg-slate-50 border-emerald-600 text-emerald-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}`}
        >
          <div
            className="w-5 h-5 rounded-full border-t-2 border-r-2 mb-2 transform -rotate-45"
            style={{ borderColor: "currentColor" }}
          />
          <span className="text-[10px] uppercase font-bold">Curva Simples</span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "delete_curve" ? "none" : "delete_curve",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : `cursor-pointer ${store.interactionMode === "delete_curve" ? "bg-slate-50 border-rose-600 text-rose-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}`}
        >
          <Eraser size={20} className={`mb-2 ${store.interactionMode === "delete_curve" ? "text-rose-600" : "text-slate-500"}`} />
          <span className="text-[10px] uppercase font-bold text-center">
            Excluir Curva
          </span>
        </button>
        <button disabled={alignment?.isLocked || alignment?.isSectionLine} className={`flex flex-col items-center justify-center p-3 border border-slate-200 rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white text-slate-500" : "bg-white hover:bg-slate-50 cursor-pointer text-slate-700"}`}>
          <div className={`flex gap-1 mb-2 ${alignment?.isLocked ? "text-slate-500" : "text-blue-600"}`}>
            <div className="w-3 h-3 rounded-tr-full border-t border-r border-current" />
            <div className="w-3 h-3 rounded-bl-full border-b border-l border-current" />
          </div>
          <span className="text-[10px] uppercase font-bold">
            Curva Reversa/Composta
          </span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() => {
            if (!alignment || alignment.isLocked) return;
            setShowOffsetPrompt(true);
          }}
          className={`flex flex-col items-center justify-center p-3 border border-slate-200 rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white text-slate-500" : "bg-white hover:bg-slate-50 cursor-pointer text-slate-700"}`}
        >
          <div className="flex gap-1 mb-2">
            <div className="w-5 h-0 border-b-2 border-dashed border-slate-400" />
            <div className="w-5 h-0 border-b-2 border-emerald-400" />
          </div>
          <span className="text-[10px] uppercase font-bold">Offset</span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() => {
            if (alignment?.isLocked) return;
            const isActivating = store.interactionMode !== 'modify_trim';
            store.setInteractionMode(isActivating ? 'modify_trim' : 'none');
            store.setModifyState(isActivating ? { step: 'select1' } : null);
          }}
          className={`flex flex-col items-center justify-center p-3 border border-slate-200 rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white text-slate-500" : (store.interactionMode === 'modify_trim' ? "bg-slate-100 text-slate-900 border-slate-300 shadow-inner" : "bg-white hover:bg-slate-50 cursor-pointer text-slate-700")}`}
        >
          <div className="flex relative mb-2 h-5 w-5 items-center justify-center">
            <div className="w-5 h-0 border-b-2 border-slate-400 transform rotate-45 absolute" />
            <div className="w-5 h-0 border-b-2 border-rose-400 transform -rotate-45 absolute" />
          </div>
          <span className="text-[10px] uppercase font-bold">Trim</span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() => {
            if (alignment?.isLocked) return;
            const isActivating = store.interactionMode !== 'modify_extend';
            store.setInteractionMode(isActivating ? 'modify_extend' : 'none');
            store.setModifyState(isActivating ? { step: 'select1' } : null);
          }}
          className={`flex flex-col items-center justify-center p-3 border border-slate-200 rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white text-slate-500" : (store.interactionMode === 'modify_extend' ? "bg-slate-100 text-slate-900 border-slate-300 shadow-inner" : "bg-white hover:bg-slate-50 cursor-pointer text-slate-700")}`}
        >
          <div className="flex relative mb-2 h-5 w-5 items-center justify-center">
            <div className="w-3 h-0 border-b-2 border-slate-400 mr-2" />
            <div className="w-2 h-0 border-b-2 border-dashed border-rose-400" />
            <div className="w-0 h-4 border-l-2 border-slate-600 absolute right-0" />
          </div>
          <span className="text-[10px] uppercase font-bold">Extend</span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() => {
            if (alignment?.isLocked) return;
            store.setShowAlignmentEditor(true);
          }}
          className={`flex flex-col items-center justify-center p-3 border border-slate-200 rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white text-slate-500" : "bg-white hover:bg-slate-50 cursor-pointer text-slate-700"}`}
        >
          <Settings2 size={20} className="mb-2 text-slate-500" />
          <span className="text-[10px] uppercase font-bold text-center">
            Parametros P.I.
          </span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() => {
            if (alignment?.isLocked) return;
            setShowSuperPanel(true);
          }}
          className={`flex flex-col items-center justify-center p-3 border border-slate-200 rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white text-slate-500" : "bg-white hover:bg-slate-50 cursor-pointer text-slate-700"}`}
        >
          <TrendingUp size={20} className="mb-2 text-cyan-700" />
          <span className="text-[10px] uppercase font-bold text-center">
            Superelevação
          </span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "insert_pi" ? "none" : "insert_pi",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : `cursor-pointer ${store.interactionMode === "insert_pi" ? "bg-slate-50 border-emerald-600 text-emerald-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}`}
        >
          <MapPin
            size={20}
            className={`mb-2 ${store.interactionMode === "insert_pi" ? "text-emerald-600" : "text-yellow-400"}`}
          />
          <span className="text-[10px] uppercase font-bold text-center">
            Inserir PI
          </span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "delete_pi" ? "none" : "delete_pi",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : `cursor-pointer ${store.interactionMode === "delete_pi" ? "bg-slate-50 border-rose-600 text-rose-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}`}
        >
          <Eraser size={20} className={`mb-2 ${store.interactionMode === "delete_pi" ? "text-rose-600" : "text-slate-500"}`} />
          <span className="text-[10px] uppercase font-bold text-center">
            Excluir PI
          </span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() => {
            if (store.interactionMode === "join_alignments") {
              store.setInteractionMode("none");
              store.setModifyState(null);
            } else {
              store.setInteractionMode("join_alignments");
              store.setModifyState({ step: 'select1', radius: 0 });
            }
          }}
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : `cursor-pointer ${store.interactionMode === "join_alignments" ? "bg-slate-50 border-purple-600 text-purple-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}`}
        >
          <GitMerge size={20} className={`mb-2 ${store.interactionMode === "join_alignments" ? "text-purple-600" : "text-indigo-400"}`} />
          <span className="text-[10px] uppercase font-bold text-center">
            Unir Alinh.
          </span>
        </button>
        <button
          disabled={alignment?.isLocked || alignment?.isSectionLine}
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "create_spiral" ? "none" : "create_spiral",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors ${(alignment?.isLocked || alignment?.isSectionLine) ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : `cursor-pointer ${store.interactionMode === "create_spiral" ? "bg-slate-50 border-orange-600 text-orange-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}`}
        >
          <div className="flex relative mb-2 h-5 w-5 items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${store.interactionMode === "create_spiral" ? "text-orange-600" : "text-orange-400"}`}>
              <path d="M4 4c0 4.5 3.5 8 8 8s8-3.5 8-8" />
              <path d="M12 12v8" />
              <path d="M8 20h8" />
            </svg>
          </div>
          <span className="text-[10px] uppercase font-bold text-center">
            Espiral
          </span>
        </button>
        {showSuperPanel && alignment && (
          <div className="fixed inset-0 z-[300] bg-white flex flex-col overflow-hidden">
            <SuperelevationPanel
              alignmentId={alignment.id}
              onClose={() => setShowSuperPanel(false)}
            />
          </div>
        )}
        {store.showAlignmentEditor && alignment && (
          <AlignmentEditorPanel
            alignmentId={alignment.id}
            onClose={() => store.setShowAlignmentEditor(false)}
          />
        )}
        {showOffsetPrompt && alignment && (
          <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-300 rounded-lg p-5 w-full max-w-sm" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
              <h3 className="text-slate-800 font-medium mb-4">Criar Offset</h3>
              <div className="mb-4">
                <label className="block text-slate-500 text-xs mb-1">
                  Distância (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={offsetValue}
                  onChange={(e) => setOffsetValue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 px-3 py-2 rounded text-sm focus:outline-none focus:border-blue-600"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const baseD = parseFloat(offsetValue.replace(",", "."));
                      if (!isNaN(baseD) && baseD !== 0) {
                        const d = offsetSide === "left" ? -Math.abs(baseD) : Math.abs(baseD);
                        const sideStr = offsetSide === "left" ? "Esq" : "Dir";
                        const newAlign = createOffsetAlignment(
                          alignment,
                          d,
                          `${alignment.name} Offset ${sideStr} ${Math.abs(d)}m`,
                        );
                        if (offsetDynamic) {
                          newAlign.parentId = alignment.id;
                          newAlign.offsetValue = d;
                        }
                        store.setAlignments([...store.alignments, newAlign]);
                        setShowOffsetPrompt(false);
                      }
                    } else if (e.key === "Escape") {
                      setShowOffsetPrompt(false);
                    }
                  }}
                />
              </div>
              <div className="mb-4">
                <label className="block text-slate-500 text-xs mb-2">Lado</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                    <input 
                      type="radio" 
                      name="offsetSide" 
                      checked={offsetSide === "left"} 
                      onChange={() => setOffsetSide("left")}
                      className="accent-blue-600"
                    />
                    Esquerda
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                    <input 
                      type="radio" 
                      name="offsetSide" 
                      checked={offsetSide === "right"} 
                      onChange={() => setOffsetSide("right")}
                      className="accent-blue-600"
                    />
                    Direita
                  </label>
                </div>
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input 
                    type="checkbox" 
                    checked={offsetDynamic} 
                    onChange={(e) => setOffsetDynamic(e.target.checked)}
                    className="accent-blue-600"
                  />
                  Offset Dinâmico (Vincular ao pai)
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowOffsetPrompt(false)}
                  className="px-4 py-2 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const baseD = parseFloat(offsetValue.replace(",", "."));
                    if (!isNaN(baseD) && baseD !== 0) {
                      const d = offsetSide === "left" ? -Math.abs(baseD) : Math.abs(baseD);
                      const sideStr = offsetSide === "left" ? "Esq" : "Dir";
                      const newAlign = createOffsetAlignment(
                        alignment,
                        d,
                        `${alignment.name} Offset ${sideStr} ${Math.abs(d)}m`,
                      );
                      if (offsetDynamic) {
                        newAlign.parentId = alignment.id;
                        newAlign.offsetValue = d;
                      }
                      store.setAlignments([...store.alignments, newAlign]);
                      setShowOffsetPrompt(false);
                    }
                  }}
                  className="px-4 py-2 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
                >
                  Criar Offset
                </button>
              </div>
            </div>
          </div>
        )}

        {renamePrompt && (
          <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-300 rounded-lg p-5 w-full max-w-sm">
              <h3 className="text-slate-900 font-medium mb-4">Renomear Alinhamento</h3>
              <div className="mb-4">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 px-3 py-2 rounded text-sm focus:outline-none focus:border-blue-600"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (renameValue.trim() !== "") {
                        const newAlignments = store.alignments.map((align) => {
                          if (align.id === renamePrompt.id) {
                            return Object.assign(Object.create(Object.getPrototypeOf(align)), align, { name: renameValue.trim() });
                          }
                          return align;
                        });
                        store.setAlignments(newAlignments);
                        setRenamePrompt(null);
                      }
                    } else if (e.key === "Escape") {
                      setRenamePrompt(null);
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRenamePrompt(null)}
                  className="px-4 py-2 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (renameValue.trim() !== "") {
                      const newAlignments = store.alignments.map((align) => {
                        if (align.id === renamePrompt.id) {
                          return Object.assign(Object.create(Object.getPrototypeOf(align)), align, { name: renameValue.trim() });
                        }
                        return align;
                      });
                      store.setAlignments(newAlignments);
                      setRenamePrompt(null);
                    }
                  }}
                  className="px-4 py-2 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
                >
                  Renomear
                </button>
              </div>
            </div>
          </div>
        )}

        {stylePrompt && (
          <AlignmentStyleModal 
            alignmentId={stylePrompt.id} 
            onClose={() => setStylePrompt(null)} 
          />
        )}
      </div>

      {alignment ? (
        <div className="mt-4">
          <div className="pb-2 border-b border-slate-200 mb-3">
            <h4 className="text-slate-700 text-sm font-medium">
              Pontos Notáveis
            </h4>
          </div>
          <div className="bg-white rounded-md border border-slate-200/50 overflow-hidden">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/50 text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Estaca</th>
                  <th className="px-3 py-2">X</th>
                  <th className="px-3 py-2">Y</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {alignment.keyPoints.slice(0, 50).map((pt: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/30">
                    <td className="px-3 py-1.5 text-slate-800 font-bold">
                      {pt.label || "-"}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-cyan-700">
                      {Math.floor(pt.sta / 20)}+{(pt.sta % 20).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5">{pt.x.toFixed(2)}</td>
                    <td className="px-3 py-1.5">{pt.y.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-4 p-4 border border-slate-200 border-dashed rounded-md text-center text-slate-500 text-xs">
          Nenhum alinhamento ativo. Comece a traçar no Plan View ou importe do
          Civil 3D.
        </div>
      )}
    </div>
  );
}

function VerticalPanel({ store }: { store: ComposerState }) {
  const alignment =
    store.alignments.find((a) => a.id === store.activeAlignmentId) ||
    (store.alignments.length > 0 ? store.alignments[0] : null);

  if (!alignment) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
        <TrendingUp size={32} className="opacity-20" />
        <span className="text-center px-4">
          Selecione um Alinhamento Horizontal ativo para prosseguir.
        </span>
      </div>
    );
  }

  const profs = alignment.keyProfilePoints || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="pb-2 border-b border-slate-200">
        <h3 className="text-slate-800 font-medium">
          Editor de Alinhamento Vertical
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Profile View (Pontos Notáveis, {profs.length} PVI)
        </p>
      </div>

      <p className="text-[10px] uppercase font-bold text-slate-500 mt-2 mb-2">
        Ferramentas (Greide Ativo)
      </p>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          onClick={() => {
            const currentMode = store.interactionMode;
            if (
              currentMode === "draw_profile_pvi" ||
              currentMode === "extend_profile"
            ) {
              store.setInteractionMode("none");
            } else {
              if (store.activeAlignmentId) {
                if (alignment.profile && alignment.profile.length > 0) {
                  // Pre-fill existing PIVs
                  const existingPivs = alignment.keyProfilePoints
                    .filter(p => ["PP", "PIV", "PF"].includes(p.label || ""))
                    .map(p => ({ sta: p.sta, elev: p.elev, l: p.l, k: p.k }));
                  store.setTempProfilePIVs(existingPivs);
                  store.setInteractionMode("extend_profile");
                } else {
                  store.setTempProfilePIVs([]);
                  store.setInteractionMode("draw_profile_pvi");
                }
              }
            }
          }}
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors cursor-pointer ${store.interactionMode === "draw_profile_pvi" || store.interactionMode === "extend_profile" ? "bg-slate-50 border-rose-600 text-rose-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}
        >
          <TrendingUp size={20} className="mb-2" />
          <span className="text-[10px] uppercase font-bold text-center">
            {alignment.profile && alignment.profile.length > 0
              ? "Esticar Greide"
              : "Criar PIV"}
          </span>
        </button>
        <button
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "create_profile_curve"
                ? "none"
                : "create_profile_curve",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors cursor-pointer ${store.interactionMode === "create_profile_curve" ? "bg-slate-50 border-rose-600 text-rose-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}
        >
          <div
            className="w-5 h-5 rounded-full border-b-2 border-slate-400 mb-2"
            style={{ 
              borderColor: store.interactionMode === "create_profile_curve" ? 'currentColor' : '#94a3b8'
            }}
          />
          <span className="text-[10px] uppercase font-bold text-center">
            Curva Parabólica
          </span>
        </button>
        <button
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "delete_profile_curve" ? "none" : "delete_profile_curve",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors cursor-pointer ${store.interactionMode === "delete_profile_curve" ? "bg-slate-50 border-rose-600 text-rose-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}
        >
          <Eraser size={20} className={`mb-2 ${store.interactionMode === "delete_profile_curve" ? "text-rose-600" : "text-slate-500"}`} />
          <span className="text-[10px] uppercase font-bold text-center">
            Excluir Curva
          </span>
        </button>
        <button
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "edit_pvi" ? "none" : "edit_pvi",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors cursor-pointer ${store.interactionMode === "edit_pvi" ? "bg-slate-50 border-rose-600 text-rose-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}
        >
          <Settings2 size={20} className={`mb-2 ${store.interactionMode === "edit_pvi" ? "text-rose-600" : "text-slate-500"}`} />
          <span className="text-[10px] uppercase font-bold text-center">
            Editar PIV
          </span>
        </button>
        <button
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "insert_pvi" ? "none" : "insert_pvi",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors cursor-pointer ${store.interactionMode === "insert_pvi" ? "bg-slate-50 border-rose-600 text-rose-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}
        >
          <MapPin
            size={20}
            className={`mb-2 ${store.interactionMode === "insert_pvi" ? "text-rose-600" : "text-yellow-400"}`}
          />
          <span className="text-[10px] uppercase font-bold text-center">
            Inserir PIV
          </span>
        </button>
        <button
          onClick={() =>
            store.setInteractionMode(
              store.interactionMode === "delete_pvi" ? "none" : "delete_pvi",
            )
          }
          className={`flex flex-col items-center justify-center p-3 border rounded transition-colors cursor-pointer ${store.interactionMode === "delete_pvi" ? "bg-slate-50 border-rose-600 text-rose-600" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"}`}
        >
          <Trash2
            size={20}
            className={`mb-2 ${store.interactionMode === "delete_pvi" ? "text-rose-600" : "text-red-400"}`}
          />
          <span className="text-[10px] uppercase font-bold text-center">
            Excluir PIV
          </span>
        </button>
      </div>

      {alignment.profile.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-6 text-slate-500 gap-2">
          <TrendingUp size={32} className="opacity-20" />
          <span className="text-center px-4">
            Sem dados de greide projetado (Profile).
          </span>
          <button
            onClick={() => {
              // This relies on whatever mechanism sets a default profile, maybe store handles it internally currently via a hack or we just rely on the tool
              const currentMode = store.interactionMode;
              store.setActiveAlignmentId(alignment.id); 
            }}
            className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded font-medium transition-colors"
          >
            Criar Greide Padrão
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-slate-200/50 overflow-hidden">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/50 text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Estaca</th>
                <th className="px-3 py-2">Cota</th>
                <th className="px-3 py-2">L</th>
                <th className="px-3 py-2">K</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {profs.slice(0, 100).map((pt, i) => (
                <tr key={i} className="hover:bg-slate-50/30">
                  <td className="px-3 py-1.5 text-slate-800 font-bold">
                    {pt.label || "-"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-rose-300">
                    {pt.sta.toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{pt.elev.toFixed(2)}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-500">
                    {pt.l !== undefined ? pt.l.toFixed(2) : "-"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-500">
                    {pt.k !== undefined ? pt.k.toFixed(2) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {profs.length > 100 && (
            <div className="text-center p-2 text-xs text-slate-500 bg-white border-t border-slate-200/50">
              Mostrando primeiros 100 pontos.
            </div>
          )}
        </div>
      )}

      {/* Seção PERFIS */}
      <div className="mt-4 pt-4 border-t border-slate-200">
        <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">
          Caixa dos Perfis
        </p>
        <div className="flex flex-col gap-2">
          <div className="bg-white rounded-md border border-slate-200/50 p-2 mb-2">
            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
              Nome (Finished Grade)
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-rose-600"
              value={alignment.profileName || "Finished Grade"}
              onChange={(e) => {
                const newAlignments = store.alignments.map((a) => {
                  if (a.id === alignment.id) {
                    return Object.assign(Object.create(Object.getPrototypeOf(a)), a, { profileName: e.target.value });
                  }
                  return a;
                });
                store.setAlignments(newAlignments);
              }}
              placeholder="Finished Grade"
            />
          </div>

          <button
            onClick={() => {
              store.setPendingProfileLineStart(null);
              store.setInteractionMode(
                store.interactionMode === "draw_profile_line" ? "none" : "draw_profile_line"
              );
            }}
            className={`flex items-center justify-center gap-2 p-2 border rounded transition-colors cursor-pointer ${
              store.interactionMode === "draw_profile_line"
                ? "bg-slate-50 border-rose-600 text-rose-600"
                : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
            }`}
          >
            <SeparatorVertical size={16} />
            <span className="text-xs font-bold uppercase">
              Desenhar Linha
            </span>
          </button>

          {store.profileLines.length > 0 && (
            <div className="bg-white rounded-md border border-slate-200/50 overflow-hidden mt-2">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/50 text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {store.profileLines.filter((l) => l.alignmentId === store.activeAlignmentId).map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50/30">
                      <td className="px-3 py-1.5 text-slate-800">
                        {line.id.split("-")[1]}
                      </td>
                      <td className="px-3 py-1.5 text-slate-800">
                        <input
                          type="text"
                          value={line.description || ""}
                          onChange={(e) => store.updateProfileLine(line.id, { description: e.target.value })}
                          placeholder="Descrição"
                          className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs text-slate-800 outline-none focus:border-emerald-600 w-full"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right flex justify-end gap-1 items-center">
                        <AciColorPicker
                          value={line.color || "#06b6d4"}
                          onChange={(hex) => store.updateProfileLine(line.id, { color: hex })}
                        />
                        <button
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-rose-600 rounded transition-colors"
                          onClick={() => store.removeProfileLine(line.id)}
                          title="Excluir linha"
                        >
                          <Eraser size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssembliesPanel({
  store,
  onEdit,
  onCreate,
}: {
  store: ComposerState;
  onEdit: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center pb-2 border-b border-slate-200">
        <h3 className="text-slate-800 font-medium">Seções Tipo Disponíveis</h3>
        <button
          onClick={onCreate}
          className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white transition-colors cursor-pointer"
          title="Nova Seção Tipo"
        >
          <Plus size={14} />
        </button>
      </div>

      {store.assemblies.map((assembly) => {
        const isSelected = store.selectedAssemblyId === assembly.id;
        return (
          <div
            key={assembly.id}
            className={`p-3 rounded-md border transition-colors cursor-pointer group flex items-center justify-between ${isSelected ? "bg-emerald-900/20 border-emerald-600/50" : "bg-white border-slate-200/50 hover:bg-slate-50"}`}
            onClick={() => store.setSelectedAssemblyId(assembly.id)}
          >
            <div className="flex flex-col gap-1">
              <span
                className={`font-semibold text-sm flex items-center gap-2 ${isSelected ? "text-emerald-600" : "text-slate-700"}`}
              >
                <Layers size={14} />
                {assembly.name}
              </span>
              <span className="text-xs text-slate-500 ml-5">
                {assembly.parameters.length} parâmetros
              </span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(assembly.id);
                }}
                className="text-slate-500 hover:text-blue-600 p-1.5 bg-slate-100 rounded"
                title="Editar Parâmetros"
              >
                <Settings2 size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  store.removeAssembly(assembly.id);
                }}
                className="text-slate-500 hover:text-red-400 p-1.5 bg-slate-100 rounded"
                title="Remover"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SurfacePanel({ store }: { store: ComposerState }) {
  const [expandedMDTs, setExpandedMDTs] = useState(true);
  const [expandedEditor, setExpandedEditor] = useState(true);
  const [editSurfacePrompt, setEditSurfacePrompt] = useState<{ id: string; majorInterval: number; minorInterval: number; majorColor: string; minorColor: string; pointsColor: string; pointSize: number; pointStyle: "circle" | "cross" | "x" | "square"; trianglesColor: string; boundaryColor: string; crs: string; showMajorContourElevations?: boolean; showMinorContourElevations?: boolean; showPointElevations?: boolean } | null>(null);
  const [showMDTEditsModal, setShowMDTEditsModal] = useState(false);
  const isAnySurfaceLocked = store.surfaces.some(s => s.isLocked);

  return (
    <div className="flex flex-col gap-4">
      {store.surfaces.length === 0 ? (
        <div className="flex flex-col gap-3 text-slate-500 text-center mt-6 mb-2">
          <MapIcon size={32} className="mx-auto text-slate-600 mb-2" />
          <p>Nenhum MDT (Modelo Digital de Terreno) carregado.</p>
          <p className="text-xs">
            Utilize o botão 'Importar MDT' no cabeçalho superior para carregar um
            arquivo LandXML com os triângulos da superfície.
          </p>
        </div>
      ) : (
        <>
          <div 
            className="flex justify-between items-center pb-2 border-b border-slate-200 cursor-pointer select-none"
            onClick={() => setExpandedMDTs(!expandedMDTs)}
          >
            <h3 className="text-slate-800 font-medium">
              MDTs Importados
            </h3>
            <button className="text-slate-500 hover:text-slate-800 transition-colors">
              {expandedMDTs ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
          
          {expandedMDTs && (
            <div className="flex flex-col gap-2">
              {store.surfaces.map(surfaceLayer => (
              <div key={surfaceLayer.id} className="flex flex-col bg-white border border-slate-200 p-2 rounded-md">
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         store.toggleSurfaceLock(surfaceLayer.id);
                       }}
                       className="hover:text-amber-600 transition-colors shrink-0"
                       title={surfaceLayer.isLocked ? "Desbloquear Superfície" : "Bloquear Superfície"}
                     >
                       {surfaceLayer.isLocked ? <Lock size={12} className="text-amber-500" /> : <Unlock size={12} className="text-slate-500" />}
                     </button>
                     <input
                        type="checkbox"
                        checked={surfaceLayer.isVisible}
                        onChange={(e) => store.updateSurfaceLayer(surfaceLayer.id, { isVisible: e.target.checked })}
                        className="rounded border-slate-300 bg-slate-50 text-amber-500 focus:ring-amber-500/20 shrink-0"
                     />
                     <div className="flex flex-col flex-1 min-w-0">
                       <input
                         type="text"
                         value={surfaceLayer.name}
                         disabled={surfaceLayer.isLocked}
                         onChange={(e) => store.updateSurfaceLayer(surfaceLayer.id, { name: e.target.value })}
                         className={`bg-transparent border-none text-slate-700 text-sm w-full focus:outline-none focus:ring-1 focus:ring-amber-500/50 rounded px-1 ${surfaceLayer.isLocked ? "opacity-70 cursor-not-allowed" : ""}`}
                         title={surfaceLayer.name}
                       />
                       {surfaceLayer.crs && (
                         <div className="text-[10px] text-amber-500/80 px-1 font-mono truncate" title={surfaceLayer.crs}>
                           {surfaceLayer.crs}
                         </div>
                       )}
                     </div>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={() => setEditSurfacePrompt({
                        id: surfaceLayer.id,
                        majorInterval: surfaceLayer.majorContourInterval || 5,
                        minorInterval: surfaceLayer.minorContourInterval || 1,
                        majorColor: surfaceLayer.majorContourColor || "#f87171",
                        minorColor: surfaceLayer.minorContourColor || "#64748b",
                        pointsColor: surfaceLayer.pointsColor || "#ffffff",
                        pointSize: surfaceLayer.pointSize || 1,
                        pointStyle: surfaceLayer.pointStyle || "circle",
                        trianglesColor: surfaceLayer.trianglesColor || "#ffffff",
                        boundaryColor: surfaceLayer.boundaryColor || "#eab308",
                        crs: surfaceLayer.crs || "",
                        showPointElevations: surfaceLayer.showPointElevations ?? false,
                        showMajorContourElevations: surfaceLayer.showMajorContourElevations ?? false,
                        showMinorContourElevations: surfaceLayer.showMinorContourElevations ?? false,
                      })}
                      className="text-slate-500 hover:text-blue-600 p-1.5 ml-1 transition-colors shrink-0"
                      title="Editar Propriedades"
                    >
                      <Settings2 size={14} />
                    </button>
                    {!surfaceLayer.isLocked && (
                      <button
                         onClick={() => store.removeSurfaceLayer(surfaceLayer.id)}
                         className="text-slate-500 hover:text-red-400 p-1.5 transition-colors shrink-0"
                         title="Remover MDT"
                      >
                         <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {surfaceLayer.isVisible && (
                  <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-200/50 pl-6">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={surfaceLayer.showTriangles ?? true}
                          onChange={(e) => store.updateSurfaceLayer(surfaceLayer.id, { showTriangles: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-8 h-4 bg-slate-50 rounded-full peer peer-checked:bg-amber-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-2 h-2 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                      </div>
                      <span className="text-slate-500 text-xs group-hover:text-amber-600 transition-colors">
                        Exibir Triângulos (TIN)
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={surfaceLayer.showBoundary ?? true}
                          onChange={(e) => store.updateSurfaceLayer(surfaceLayer.id, { showBoundary: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-8 h-4 bg-slate-50 rounded-full peer peer-checked:bg-amber-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-2 h-2 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                      </div>
                      <span className="text-slate-500 text-xs group-hover:text-amber-600 transition-colors">
                        Exibir Borda (Boundary)
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={surfaceLayer.showPoints ?? false}
                          onChange={(e) => store.updateSurfaceLayer(surfaceLayer.id, { showPoints: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-8 h-4 bg-slate-50 rounded-full peer peer-checked:bg-amber-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-2 h-2 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                      </div>
                      <span className="text-slate-500 text-xs group-hover:text-amber-600 transition-colors">
                        Exibir Pontos (Points)
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={surfaceLayer.showMajorContours ?? false}
                          onChange={(e) => store.updateSurfaceLayer(surfaceLayer.id, { showMajorContours: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-8 h-4 bg-slate-50 rounded-full peer peer-checked:bg-amber-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-2 h-2 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                      </div>
                      <span className="text-slate-500 text-xs group-hover:text-amber-600 transition-colors">
                        Exibir Curvas Maiores (Major Contours)
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={surfaceLayer.showMinorContours ?? false}
                          onChange={(e) => store.updateSurfaceLayer(surfaceLayer.id, { showMinorContours: e.target.checked })}
                          className="peer sr-only"
                        />
                        <div className="w-8 h-4 bg-slate-50 rounded-full peer peer-checked:bg-amber-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-2 h-2 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                      </div>
                      <span className="text-slate-500 text-xs group-hover:text-amber-600 transition-colors">
                        Exibir Curvas Menores (Minor Contours)
                      </span>
                    </label>
                  </div>
                )}
              </div>
            ))}
            </div>
          )}

          <div className="flex flex-col gap-2 p-3 bg-slate-100 rounded-md border border-slate-200 text-xs mt-2 hover:border-slate-300 transition-colors">
            <div 
              className="flex justify-between items-center cursor-pointer select-none mb-2"
              onClick={() => setExpandedEditor(!expandedEditor)}
            >
              <h4 className="font-semibold text-slate-700 flex items-center gap-2 m-0">
                <Edit3 size={14} className="text-amber-500" />
                Editor de MDT
              </h4>
              <div className="flex items-center gap-2">
                <button 
                  className="text-amber-500 hover:text-amber-600 p-1 bg-amber-500/10 rounded transition-colors"
                  onClick={(e) => { e.stopPropagation(); setShowMDTEditsModal(true); }}
                  title="Histórico de Modificações"
                >
                  <List size={14} />
                </button>
                <button className="text-slate-500 hover:text-slate-800 transition-colors">
                  {expandedEditor ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>
            </div>
            
            {expandedEditor && (
              <>
                <button
                  disabled={isAnySurfaceLocked}
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${isAnySurfaceLocked ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : store.mdtEditMode === "cut" ? "bg-amber-100 border-amber-600/50 text-amber-600" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() =>
                    store.setMdtEditMode(store.mdtEditMode === "cut" ? "none" : "cut")
                  }
                >
                  <Scissors
                    size={14}
                    className={
                      isAnySurfaceLocked ? "text-slate-500" : store.mdtEditMode === "cut" ? "text-amber-500" : "text-slate-500"
                    }
                  />
                  <span>Cortar o MDT</span>
                </button>
                <button
                  disabled={isAnySurfaceLocked}
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${isAnySurfaceLocked ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : store.mdtEditMode === "add_point" ? "bg-green-600/20 border-green-500/50 text-green-400" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() =>
                    store.setMdtEditMode(
                      store.mdtEditMode === "add_point" ? "none" : "add_point",
                    )
                  }
                >
                  <Plus
                    size={14}
                    className={
                      isAnySurfaceLocked ? "text-slate-500" : store.mdtEditMode === "add_point"
                        ? "text-green-500"
                        : "text-slate-500"
                    }
                  />
                  <span>Adicionar Pontos</span>
                </button>
                <button
                  disabled={isAnySurfaceLocked}
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${isAnySurfaceLocked ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : store.mdtEditMode === "remove_point" ? "bg-rose-100 border-rose-600/50 text-rose-600" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() =>
                    store.setMdtEditMode(
                      store.mdtEditMode === "remove_point" ? "none" : "remove_point",
                    )
                  }
                >
                  <Minus
                    size={14}
                    className={
                      isAnySurfaceLocked ? "text-slate-500" : store.mdtEditMode === "remove_point"
                        ? "text-rose-500"
                        : "text-slate-500"
                    }
                  />
                  <span>Remover Pontos</span>
                </button>
                <button
                  disabled={isAnySurfaceLocked}
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${isAnySurfaceLocked ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : store.mdtEditMode === "extrapolate" ? "bg-amber-100 border-amber-600/50 text-amber-600" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() => {
                    store.clearTempPIs();
                    store.setMdtEditMode(
                      store.mdtEditMode === "extrapolate" ? "none" : "extrapolate",
                    );
                  }}
                >
                  <MoveDiagonal
                    size={14}
                    className={
                      isAnySurfaceLocked ? "text-slate-500" : store.mdtEditMode === "extrapolate"
                        ? "text-amber-500"
                        : "text-slate-500"
                    }
                  />
                  <span>Extender Terreno</span>
                </button>
                <button
                  disabled={isAnySurfaceLocked}
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${isAnySurfaceLocked ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : store.mdtEditMode === "add_line" ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-400" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() => {
                    store.clearTempPIs();
                    store.setMdtEditMode(
                      store.mdtEditMode === "add_line" ? "none" : "add_line",
                    );
                  }}
                >
                  <PencilLine
                    size={14}
                    className={
                      isAnySurfaceLocked ? "text-slate-500" : store.mdtEditMode === "add_line"
                        ? "text-indigo-500"
                        : "text-slate-500"
                    }
                  />
                  <span>Adicionar Linhas</span>
                </button>
                <button
                  disabled={isAnySurfaceLocked}
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${isAnySurfaceLocked ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : store.mdtEditMode === "remove_line" ? "bg-rose-100 border-rose-600/50 text-rose-600" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() =>
                    store.setMdtEditMode(
                      store.mdtEditMode === "remove_line" ? "none" : "remove_line",
                    )
                  }
                >
                  <Eraser
                    size={14}
                    className={
                      isAnySurfaceLocked ? "text-slate-500" : store.mdtEditMode === "remove_line"
                        ? "text-rose-500"
                        : "text-slate-500"
                    }
                  />
                  <span>Remover Linhas</span>
                </button>
                <button
                  disabled={isAnySurfaceLocked}
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${isAnySurfaceLocked ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : store.mdtEditMode === "flip_triangle" ? "bg-teal-600/20 border-teal-500/50 text-teal-400" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() =>
                    store.setMdtEditMode(
                      store.mdtEditMode === "flip_triangle" ? "none" : "flip_triangle",
                    )
                  }
                >
                  <FlipVertical
                    size={14}
                    className={
                      isAnySurfaceLocked ? "text-slate-500" : store.mdtEditMode === "flip_triangle"
                        ? "text-teal-500"
                        : "text-slate-500"
                    }
                  />
                  <span>Inverter Triângulo</span>
                </button>
                <button
                  disabled={isAnySurfaceLocked}
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${isAnySurfaceLocked ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-500" : store.mdtEditMode === "boundary" ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-400" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() =>
                    store.setMdtEditMode(
                      store.mdtEditMode === "boundary" ? "none" : "boundary",
                    )
                  }
                >
                  <SquareDashed
                    size={14}
                    className={
                      isAnySurfaceLocked
                        ? "text-slate-500"
                        : store.mdtEditMode === "boundary"
                        ? "text-indigo-500"
                        : "text-slate-500"
                    }
                  />
                  <span>Criar Boundary</span>
                </button>
                <button
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900`}
                  onClick={() => store.setPendingCleanBoundary(true)}
                >
                  <Scissors size={14} className="text-slate-500" />
                  <span>Limpar Borda</span>
                </button>
                <button
                  className={`flex items-center gap-2 p-2 rounded transition-colors text-left border ${store.mdtEditMode === "fill_holes" ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-400" : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900"}`}
                  onClick={() => store.setMdtEditMode(store.mdtEditMode === "fill_holes" ? "none" : "fill_holes")}
                >
                  <SquareDashed size={14} className={store.mdtEditMode === "fill_holes" ? "text-indigo-500" : "text-slate-500"} />
                  <span>Preencher Furos</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

            {editSurfacePrompt && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg p-5 w-full max-w-sm">
            <h3 className="text-white font-medium mb-4">Propriedades do MDT</h3>
            
            <div className="flex flex-col gap-3 mb-4 text-sm max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Geral</h4>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Sistema de Coordenadas (CRS)</label>
                <input
                  type="text"
                  placeholder="Ex: EPSG:31983"
                  value={editSurfacePrompt.crs}
                  onChange={(e) => setEditSurfacePrompt({ ...editSurfacePrompt, crs: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>

              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Curvas Maiores</h4>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Exibir Elevação</label>
                <div className="relative flex items-center cursor-pointer" onClick={() => setEditSurfacePrompt({ ...editSurfacePrompt, showMajorContourElevations: !editSurfacePrompt.showMajorContourElevations })}>
                  <input
                    type="checkbox"
                    checked={editSurfacePrompt.showMajorContourElevations}
                    readOnly
                    className="peer sr-only"
                  />
                  <div className="w-8 h-4 bg-slate-50 rounded-full peer peer-checked:bg-amber-600 transition-colors"></div>
                  <div className="absolute left-1 top-1 w-2 h-2 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Intervalo</label>
                <input
                  type="number"
                  value={editSurfacePrompt.majorInterval}
                  onChange={(e) => setEditSurfacePrompt({ ...editSurfacePrompt, majorInterval: parseFloat(e.target.value) || 5 })}
                  className="w-24 bg-slate-50 border border-slate-300 text-white px-2 py-1 rounded focus:outline-none focus:border-blue-600 text-right"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Cor</label>
                <AciColorPicker
                  value={editSurfacePrompt.majorColor}
                  onChange={(hex) => setEditSurfacePrompt({ ...editSurfacePrompt, majorColor: hex })}
                />
              </div>

              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Curvas Menores</h4>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Exibir Elevação</label>
                <div className="relative flex items-center cursor-pointer" onClick={() => setEditSurfacePrompt({ ...editSurfacePrompt, showMinorContourElevations: !editSurfacePrompt.showMinorContourElevations })}>
                  <input
                    type="checkbox"
                    checked={editSurfacePrompt.showMinorContourElevations}
                    readOnly
                    className="peer sr-only"
                  />
                  <div className="w-8 h-4 bg-slate-50 rounded-full peer peer-checked:bg-amber-600 transition-colors"></div>
                  <div className="absolute left-1 top-1 w-2 h-2 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Intervalo</label>
                <input
                  type="number"
                  value={editSurfacePrompt.minorInterval}
                  onChange={(e) => setEditSurfacePrompt({ ...editSurfacePrompt, minorInterval: parseFloat(e.target.value) || 1 })}
                  className="w-24 bg-slate-50 border border-slate-300 text-white px-2 py-1 rounded focus:outline-none focus:border-blue-600 text-right"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Cor</label>
                <AciColorPicker
                  value={editSurfacePrompt.minorColor}
                  onChange={(hex) => setEditSurfacePrompt({ ...editSurfacePrompt, minorColor: hex })}
                />
              </div>
              
              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Cores Base</h4>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Triângulos (TIN)</label>
                <AciColorPicker
                  value={editSurfacePrompt.trianglesColor}
                  onChange={(hex) => setEditSurfacePrompt({ ...editSurfacePrompt, trianglesColor: hex })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Borda (Boundary)</label>
                <AciColorPicker
                  value={editSurfacePrompt.boundaryColor}
                  onChange={(hex) => setEditSurfacePrompt({ ...editSurfacePrompt, boundaryColor: hex })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Exibir Elevação (Pontos)</label>
                <div className="relative flex items-center cursor-pointer" onClick={() => setEditSurfacePrompt({ ...editSurfacePrompt, showPointElevations: !editSurfacePrompt.showPointElevations })}>
                  <input
                    type="checkbox"
                    checked={editSurfacePrompt.showPointElevations}
                    readOnly
                    className="peer sr-only"
                  />
                  <div className="w-8 h-4 bg-slate-50 rounded-full peer peer-checked:bg-amber-600 transition-colors"></div>
                  <div className="absolute left-1 top-1 w-2 h-2 bg-slate-400 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-all"></div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Pontos (Cor)</label>
                <AciColorPicker
                  value={editSurfacePrompt.pointsColor}
                  onChange={(hex) => setEditSurfacePrompt({ ...editSurfacePrompt, pointsColor: hex })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Pontos (Tamanho)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={editSurfacePrompt.pointSize}
                  onChange={(e) => setEditSurfacePrompt({ ...editSurfacePrompt, pointSize: parseFloat(e.target.value) || 1 })}
                  className="w-24 bg-slate-50 border border-slate-300 text-white px-2 py-1 rounded focus:outline-none focus:border-blue-600 text-right"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-slate-500">Pontos (Estilo)</label>
                <select
                  value={editSurfacePrompt.pointStyle}
                  onChange={(e) => setEditSurfacePrompt({ ...editSurfacePrompt, pointStyle: e.target.value as any })}
                  className="w-24 bg-slate-50 border border-slate-300 text-white px-2 py-1 rounded focus:outline-none focus:border-blue-600"
                >
                  <option value="circle">Círculo</option>
                  <option value="cross">Cruz (+)</option>
                  <option value="x">X</option>
                  <option value="square">Quadrado</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditSurfacePrompt(null)}
                className="px-4 py-2 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  store.updateSurfaceLayer(editSurfacePrompt.id, {
                    majorContourInterval: editSurfacePrompt.majorInterval,
                    minorContourInterval: editSurfacePrompt.minorInterval,
                    majorContourColor: editSurfacePrompt.majorColor,
                    minorContourColor: editSurfacePrompt.minorColor,
                    pointsColor: editSurfacePrompt.pointsColor,
                    pointSize: editSurfacePrompt.pointSize,
                    pointStyle: editSurfacePrompt.pointStyle,
                    trianglesColor: editSurfacePrompt.trianglesColor,
                    boundaryColor: editSurfacePrompt.boundaryColor,
                    crs: editSurfacePrompt.crs,
                    showPointElevations: editSurfacePrompt.showPointElevations,
                    showMajorContourElevations: editSurfacePrompt.showMajorContourElevations,
                    showMinorContourElevations: editSurfacePrompt.showMinorContourElevations,
                  });
                  setEditSurfacePrompt(null);
                }}
                className="px-4 py-2 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {showMDTEditsModal && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg p-5 w-full max-w-lg">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <List size={16} className="text-amber-500" />
              Modificações do MDT
            </h3>
            
            <div className="flex flex-col gap-2 mb-4 text-sm max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {store.mdtEdits.length === 0 ? (
                <div className="text-slate-500 text-center py-8">
                  Nenhuma modificação aplicada ao MDT.
                </div>
              ) : (
                store.mdtEdits.map((edit, index) => (
                  <div key={edit.id} className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-300">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => store.toggleMDTEdit(edit.id)}
                        className={`${edit.enabled ? "text-amber-500 hover:text-amber-600" : "text-slate-500 hover:text-slate-500"} transition-colors`}
                        title={edit.enabled ? "Desativar Modificação" : "Ativar Modificação"}
                      >
                        {edit.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <div>
                        <div className={`font-medium ${edit.enabled ? "text-slate-800" : "text-slate-500 line-through"}`}>
                          {index + 1}. {
                            edit.type === "cut" ? "Cortar (Furo)" :
                            edit.type === "boundary" ? "Aplicar Borda" :
                            edit.type === "add_point" ? "Adicionar Ponto" :
                            edit.type === "remove_point" ? "Remover Ponto" :
                            edit.type === "extrapolate" ? "Extrapolar (Linha)" :
                            edit.type === "add_line" ? "Adicionar Linha (Breakline)" :
                            edit.type === "remove_line" ? "Remover Linha (Breakline)" :
                            edit.type === "flip_triangle" ? "Inverter Triângulo" :
                            edit.type === "clean_boundary" ? "Limpar Borda" :
                            edit.type === "fill_holes" ? "Preencher Furos" : edit.type
                          }
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => store.removeMDTEdit(edit.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                      title="Excluir Modificação"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex justify-end pt-2 border-t border-slate-300">
              <button
                onClick={() => setShowMDTEditsModal(false)}
                className="px-4 py-2 rounded text-xs font-medium bg-slate-100 hover:bg-slate-600 text-white transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export function ExtractedGeometrySection({ store }: { store: ComposerState }) {
  const [expanded, setExpanded] = useState(true);
  const [sel, setSel] = useState("");
  const [tol, setTol] = useState(0.01);
  const [linked, setLinked] = useState(true);
  const [smartSnap, setSmartSnap] = useState(true);
  const [tangencia, setTangencia] = useState(true);
  const [busy, setBusy] = useState(false);

  /* Só linhas de topo: datum, base e fundo de guia não são geometria de projeto. */
  const features = (store.corridorFeatures || []).filter((f) => isTopFeature(f.id));
  const geoms = store.drawnGeometries || [];
  const opcoes = { smartSnapRadius: smartSnap, enforceTangency: tangencia };

  const grouped: Record<string, { key: string; id: string; rotulo: string; n: number }[]> = {};
  features.forEach((f) => {
    const cName = store.corridors.find((c) => c.id === f.corridorId)?.name || f.corridorId;
    if (!grouped[cName]) grouped[cName] = [];
    grouped[cName].push({
      key: `${f.corridorId}|${f.id}`,
      id: f.id,
      rotulo: getFeatureLayerInfo(f.id).displayName,
      n: f.worldPoints.length,
    });
  });

  const extract = () => {
    const key = sel || Object.values(grouped)[0]?.[0]?.key;
    if (!key) return;
    const sep = key.lastIndexOf("|");
    const corridorId = key.slice(0, sep);
    const featureId = key.slice(sep + 1);
    store.extractGeometryFromFeature(corridorId, featureId, { tolerance: tol, linked, ...opcoes });
  };

  const extractAll = async () => {
    if (busy) return;
    const prevFreq = store.globalCorridorFrequency;
    setBusy(true);
    try {
      // Refina temporariamente a frequência dos corredores para 0,10 m: a cadeia de pontos
      // fica densa e o ajuste de reta/arco sai muito mais preciso.
      if (prevFreq !== 0.1) {
        useStore.getState().setGlobalCorridorFrequency(0.1);
        let last = -1;
        for (let t = 0; t < 60; t++) {
          await new Promise((r) => setTimeout(r, 120));
          const feats = useStore.getState().corridorFeatures || [];
          const total = feats.reduce((s, f) => s + f.worldPoints.length, 0);
          if (total > 0 && total === last) break;
          last = total;
        }
      }
      const st = useStore.getState();
      (st.corridorFeatures || []).forEach((f) => {
        const already = st.drawnGeometries.some(
          (g) => g.sourceCorridorId === f.corridorId && g.sourceFeatureId === f.id,
        );
        if (already) return;
        st.extractGeometryFromFeature(f.corridorId, f.id, { tolerance: tol, linked, ...opcoes });
      });
    } finally {
      if (store.globalCorridorFrequency !== prevFreq || useStore.getState().globalCorridorFrequency !== prevFreq) {
        useStore.getState().setGlobalCorridorFrequency(prevFreq);
      }
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-100 rounded-md border border-slate-200 text-xs mt-2 hover:border-slate-300 transition-colors">
      <div
        className="flex justify-between items-center cursor-pointer select-none mb-1"
        onClick={() => setExpanded(!expanded)}
      >
        <h4 className="font-semibold text-slate-700 flex items-center gap-2 m-0">
          <PencilLine size={14} className="text-rose-500" />
          GEOMETRIA EXTRAÍDA
        </h4>
        <button className="text-slate-500 hover:text-slate-800 transition-colors">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {expanded && (
        <>
          <p className="text-[10px] text-slate-500 leading-snug m-0">
            Cria linhas e arcos exatos sobre o bordo resultante do corredor — inclusive nos bordos de
            interseção, cujo alinhamento de construção fica invisível.
          </p>

          <select
            className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-[11px] text-slate-700"
            value={sel}
            onChange={(e) => setSel(e.target.value)}
          >
            <option value="">
              {features.length === 0 ? "Nenhum corredor calculado" : "Selecione a linha do corredor…"}
            </option>
            {Object.entries(grouped).map(([cName, list]) => (
              <optgroup key={cName} label={cName}>
                {list.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.rotulo} ({o.id}) · {o.n} pts
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 whitespace-nowrap">Tolerância (m)</label>
            <input
              type="number"
              step={0.005}
              min={0.001}
              value={tol}
              onChange={(e) => setTol(Math.max(0.001, parseFloat(e.target.value) || 0.01))}
              className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-700"
            />
            <label className="flex items-center gap-1 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={linked}
                onChange={(e) => setLinked(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500 bg-white"
              />
              <span className="text-[10px] text-slate-600">Vinculada</span>
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={smartSnap}
                onChange={(e) => setSmartSnap(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500 bg-white"
              />
              <span className="text-[10px] text-slate-600">
                Calibrar raios de projeto (R=50, 100, 250…)
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={tangencia}
                onChange={(e) => setTangencia(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500 bg-white"
              />
              <span className="text-[10px] text-slate-600">Concordância tangente (G1)</span>
            </label>
          </div>

          <button
            onClick={() => {
              const n = store.extractUnifiedGeometriesByLayer({ tolerance: tol, linked, ...opcoes }).length;
              if (!n) alert("Nenhuma linha de topo a unir.");
            }}
            disabled={features.length === 0 || busy}
            className="flex items-center justify-center gap-2 p-2 rounded transition-colors border bg-rose-600 border-rose-600 text-white hover:bg-rose-500 disabled:opacity-40"
            title="Costura as feições da mesma camada num traçado contínuo e extrai uma linha por camada"
          >
            <GitMerge size={14} />
            <span>Unir e Extrair por Camada</span>
          </button>

          <button
            onClick={extract}
            disabled={features.length === 0 || busy}
            className="flex items-center justify-center gap-2 p-2 rounded transition-colors border bg-white border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-40 disabled:hover:bg-white"
          >
            <Plus size={14} className="text-rose-500" />
            <span>Extrair do Corredor</span>
          </button>

          <button
            onClick={extractAll}
            disabled={features.length === 0 || busy}
            className="flex items-center justify-center gap-2 p-2 rounded transition-colors border bg-white border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-40 disabled:hover:bg-white"
            title="Refina os corredores para 0,10 m, extrai todas as linhas e devolve a frequência original"
          >
            <Layers size={14} className="text-rose-500" />
            <span>{busy ? "Refinando e extraindo…" : `Extrair Todas (${features.length})`}</span>
          </button>

          {busy && (
            <p className="text-[10px] text-amber-600 leading-snug m-0">
              Corredores em 0,10 m para o ajuste — a frequência original volta ao terminar.
            </p>
          )}

          {geoms.length > 0 && (
            <div className="flex flex-col gap-1 mt-1 max-h-56 overflow-y-auto custom-scrollbar pr-1">
              {geoms.map((g) => {
                const lines = g.segments.filter((s) => s.type === "line").length;
                const arcs = g.segments.filter((s) => s.type === "arc").length;
                const polys = g.segments.filter((s) => s.type === "poly").length;
                const layer = store.layers.find((l) => l.id === g.layerId);
                return (
                  <div key={g.id} className="bg-white border border-slate-200 rounded p-1.5 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] text-slate-700 truncate" title={g.name}>
                        {g.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <AciColorPicker
                          value={g.color || layer?.color || "#e11d48"}
                          onChange={(hex) => store.updateDrawnGeometry(g.id, { color: hex })}
                        />
                        <button
                          onClick={() => store.refreshDrawnGeometry(g.id)}
                          className="text-slate-500 hover:text-blue-600 p-1"
                          title="Atualizar a partir do corredor"
                        >
                          <GitMerge size={12} />
                        </button>
                        <button
                          onClick={() => store.removeDrawnGeometry(g.id)}
                          className="text-slate-500 hover:text-rose-600 p-1"
                          title="Remover"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="font-mono text-slate-600">
                        {lines}L · {arcs}A · {polys}P
                      </span>
                      <span>{g.length.toFixed(2)} m</span>
                      <label className="flex items-center gap-1 cursor-pointer ml-auto">
                        <input
                          type="checkbox"
                          checked={g.isVisible !== false}
                          onChange={(e) => store.updateDrawnGeometry(g.id, { isVisible: e.target.checked })}
                          className="rounded text-rose-600 focus:ring-rose-500 bg-white"
                        />
                        <span>Visível</span>
                      </label>
                    </div>
                    <div className="flex items-center gap-1">
                      <select
                        value={g.layerId}
                        onChange={(e) => store.updateDrawnGeometry(g.id, { layerId: e.target.value })}
                        className="flex-1 bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] text-slate-600"
                      >
                        {store.layers.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => store.updateDrawnGeometry(g.id, { linked: !g.linked })}
                        className={`px-1.5 py-0.5 rounded border text-[10px] ${g.linked ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}
                        title={g.linked ? "Segue o corredor" : "Geometria congelada"}
                      >
                        {g.linked ? "vinculada" : "congelada"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {geoms.length > 1 && (
            <button
              onClick={() => store.refreshLinkedGeometries()}
              className="text-[10px] text-slate-500 hover:text-blue-600 underline self-start"
            >
              Atualizar todas
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function DrawingPanel({ store, foco }: { store: ComposerState; foco?: "ponto" | "linha" | "circulo" }) {
  // Sem foco, tudo aberto. Com foco, só a seção pedida — é o que o símbolo de
  // edição de cada botão da barra superior manda.
  const [expandedPoints3D, setExpandedPoints3D] = useState(!foco || foco === "ponto");
  const [expandedLines3D, setExpandedLines3D] = useState(!foco || foco === "linha");
  const [expandedCircles3D, setExpandedCircles3D] = useState(!foco || foco === "circulo");
  
  const [editPointPrompt, setEditPointPrompt] = useState<{ id: string; x: number; y: number; z: number; description?: string } | null>(null);
  const [editLinePrompt, setEditLinePrompt] = useState<{ id: string; p1: {x: number, y: number, z: number}; p2: {x: number, y: number, z: number}; description?: string } | null>(null);
  const [editCirclePrompt, setEditCirclePrompt] = useState<{ id: string; center: {x: number, y: number, z: number}; radius: number; description?: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">

<div className="flex flex-col gap-2 p-3 bg-slate-100 rounded-md border border-slate-200 text-xs mt-2 hover:border-slate-300 transition-colors">
        <div 
          className="flex justify-between items-center cursor-pointer select-none mb-2"
          onClick={() => setExpandedPoints3D(!expandedPoints3D)}
        >
          <h4 className="font-semibold text-slate-700 flex items-center gap-2 m-0">
            <MapPin size={14} className="text-emerald-500" />
            POINTS 3D
          </h4>
          <button className="text-slate-500 hover:text-slate-800 transition-colors">
            {expandedPoints3D ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
        
        {expandedPoints3D && (
          <>
            <p className="text-[10px] text-slate-500 leading-tight">
              Crie pontos pelo botão POINTS 3D na barra superior. Clique num item da
              lista para selecioná-lo (Ctrl para somar à seleção).
            </p>
            {store.points3D && store.points3D.length > 0 && (
              <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {store.points3D.map(pt => (
                  <div key={pt.id} className={`flex justify-between items-center bg-white border p-1.5 rounded cursor-pointer ${store.selecaoDesenho.some((x) => x.tipo === "ponto" && x.id === pt.id) ? "border-blue-500 ring-1 ring-blue-400/40" : "border-slate-200 hover:border-slate-300"}`}
                    onClick={(e) => store.alternarSelecaoDesenho({ tipo: "ponto", id: pt.id }, e.ctrlKey || e.metaKey || e.shiftKey)}>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-700">X: {pt.x.toFixed(2)} Y: {pt.y.toFixed(2)}</span>
                      <span className="text-[10px] text-emerald-600 font-mono">Z: {pt.z.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AciColorPicker
                        value={pt.color || "#10b981"}
                        onChange={(hex) => store.updatePoint3D(pt.id, { color: hex })}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditPointPrompt(pt); }}
                        className="text-slate-500 hover:text-blue-600 p-1"
                        title="Editar Ponto"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); store.removePoint3D(pt.id); }}
                        className="text-slate-500 hover:text-rose-600 p-1"
                        title="Remover Ponto"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3 bg-slate-100 rounded-md border border-slate-200 text-xs mt-2 hover:border-slate-300 transition-colors">
        <div 
          className="flex justify-between items-center cursor-pointer select-none mb-2"
          onClick={() => setExpandedLines3D(!expandedLines3D)}
        >
          <h4 className="font-semibold text-slate-700 flex items-center gap-2 m-0">
            <TrendingUp size={14} className="text-yellow-500" />
            LINES 3D
          </h4>
          <button className="text-slate-500 hover:text-slate-800 transition-colors">
            {expandedLines3D ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
        
        {expandedLines3D && (
          <>
            <p className="text-[10px] text-slate-500 leading-tight">
              Ative LINES 3D na barra superior e clique no visualizador 2D para
              conectar pontos e criar linhas 3D.
            </p>
            {store.lines3D && store.lines3D.length > 0 && (
              <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {store.lines3D.map(line => (
                  <div key={line.id} className={`flex justify-between items-center bg-white border p-1.5 rounded cursor-pointer ${store.selecaoDesenho.some((x) => x.tipo === "linha" && x.id === line.id) ? "border-blue-500 ring-1 ring-blue-400/40" : "border-slate-200 hover:border-slate-300"}`}
                    onClick={(e) => store.alternarSelecaoDesenho({ tipo: "linha", id: line.id }, e.ctrlKey || e.metaKey || e.shiftKey)}>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-700">P1: {line.p1.x.toFixed(1)}, {line.p1.y.toFixed(1)}</span>
                      <span className="text-[10px] text-slate-700">P2: {line.p2.x.toFixed(1)}, {line.p2.y.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AciColorPicker
                        value={line.color || "#eab308"}
                        onChange={(hex) => store.updateLine3D(line.id, { color: hex })}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditLinePrompt({ id: line.id, p1: line.p1, p2: line.p2, description: line.description || "" }); }}
                        className="text-slate-500 hover:text-blue-600 p-1"
                        title="Editar Linha"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); store.removeLine3D(line.id); }}
                        className="text-slate-500 hover:text-rose-600 p-1"
                        title="Remover Linha"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="w-full h-px bg-slate-50 my-2" />

        {/* CIRCLES 3D */}
        <div 
          className="flex justify-between items-center cursor-pointer select-none mb-2"
          onClick={() => setExpandedCircles3D(!expandedCircles3D)}
        >
          <h4 className="font-semibold text-slate-700 flex items-center gap-2 m-0">
            <Circle size={14} className="text-pink-500" />
            CIRCLES 3D
          </h4>
          <button className="text-slate-500 hover:text-slate-800 transition-colors">
            {expandedCircles3D ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
        
        {expandedCircles3D && (
          <>
            <p className="text-[10px] text-slate-500 leading-tight mt-1">
              Ative CIRCLES 3D na barra superior, clique no visualizador para definir
              o centro e clique novamente para definir o raio.
            </p>
            {store.circles3D && store.circles3D.length > 0 && (
              <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {store.circles3D.map(circle => (
                  <div key={circle.id} className={`flex justify-between items-center bg-white border p-1.5 rounded cursor-pointer ${store.selecaoDesenho.some((x) => x.tipo === "circulo" && x.id === circle.id) ? "border-blue-500 ring-1 ring-blue-400/40" : "border-slate-200 hover:border-slate-300"}`}
                    onClick={(e) => store.alternarSelecaoDesenho({ tipo: "circulo", id: circle.id }, e.ctrlKey || e.metaKey || e.shiftKey)}>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-700">C: {circle.center.x.toFixed(1)}, {circle.center.y.toFixed(1)}</span>
                      <span className="text-[10px] text-slate-700">R: {circle.radius.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AciColorPicker
                        value={circle.color || "#ec4899"}
                        onChange={(hex) => store.updateCircle3D(circle.id, { color: hex })}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditCirclePrompt({ id: circle.id, center: circle.center, radius: circle.radius, description: circle.description || "" }); }}
                        className="text-slate-500 hover:text-blue-600 p-1"
                        title="Editar Círculo"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); store.removeCircle3D(circle.id); }}
                        className="text-slate-500 hover:text-rose-600 p-1"
                        title="Remover Círculo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {editPointPrompt && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg p-5 w-full max-w-sm">
            <h3 className="text-white font-medium mb-4">Editar Ponto 3D</h3>
            
            <div className="flex flex-col gap-3 mb-4 text-sm">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Coordenada X</label>
                <input
                  type="number"
                  value={editPointPrompt.x}
                  onChange={(e) => setEditPointPrompt({ ...editPointPrompt, x: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Coordenada Y</label>
                <input
                  type="number"
                  value={editPointPrompt.y}
                  onChange={(e) => setEditPointPrompt({ ...editPointPrompt, y: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Elevação (Z)</label>
                <input
                  type="number"
                  value={editPointPrompt.z}
                  onChange={(e) => setEditPointPrompt({ ...editPointPrompt, z: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Descrição</label>
                <input
                  type="text"
                  value={editPointPrompt.description || ""}
                  onChange={(e) => setEditPointPrompt({ ...editPointPrompt, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                  placeholder="Ex: Ponto de Controle"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditPointPrompt(null)}
                className="px-4 py-2 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  store.updatePoint3D(editPointPrompt.id, {
                    x: editPointPrompt.x,
                    y: editPointPrompt.y,
                    z: editPointPrompt.z,
                    description: editPointPrompt.description
                  });
                  setEditPointPrompt(null);
                }}
                className="px-4 py-2 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {editLinePrompt && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg p-5 w-full max-w-sm">
            <h3 className="text-white font-medium mb-4">Editar Linha 3D</h3>
            
            <div className="flex flex-col gap-3 mb-4 text-sm max-h-96 overflow-y-auto pr-1">
              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Ponto Inicial (P1)</h4>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Coordenada X (P1)</label>
                <input
                  type="number"
                  value={editLinePrompt.p1.x}
                  onChange={(e) => setEditLinePrompt({ ...editLinePrompt, p1: { ...editLinePrompt.p1, x: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Coordenada Y (P1)</label>
                <input
                  type="number"
                  value={editLinePrompt.p1.y}
                  onChange={(e) => setEditLinePrompt({ ...editLinePrompt, p1: { ...editLinePrompt.p1, y: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Elevação Z (P1)</label>
                <input
                  type="number"
                  value={editLinePrompt.p1.z}
                  onChange={(e) => setEditLinePrompt({ ...editLinePrompt, p1: { ...editLinePrompt.p1, z: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>

              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Ponto Final (P2)</h4>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Coordenada X (P2)</label>
                <input
                  type="number"
                  value={editLinePrompt.p2.x}
                  onChange={(e) => setEditLinePrompt({ ...editLinePrompt, p2: { ...editLinePrompt.p2, x: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Coordenada Y (P2)</label>
                <input
                  type="number"
                  value={editLinePrompt.p2.y}
                  onChange={(e) => setEditLinePrompt({ ...editLinePrompt, p2: { ...editLinePrompt.p2, y: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Elevação Z (P2)</label>
                <input
                  type="number"
                  value={editLinePrompt.p2.z}
                  onChange={(e) => setEditLinePrompt({ ...editLinePrompt, p2: { ...editLinePrompt.p2, z: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>

              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Geral</h4>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Descrição</label>
                <input
                  type="text"
                  value={editLinePrompt.description || ""}
                  onChange={(e) => setEditLinePrompt({ ...editLinePrompt, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                  placeholder="Ex: Eixo do muro"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditLinePrompt(null)}
                className="px-4 py-2 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  store.updateLine3D(editLinePrompt.id, {
                    p1: editLinePrompt.p1,
                    p2: editLinePrompt.p2,
                    description: editLinePrompt.description
                  });
                  setEditLinePrompt(null);
                }}
                className="px-4 py-2 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {editCirclePrompt && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg p-5 w-full max-w-sm">
            <h3 className="text-white font-medium mb-4">Editar Círculo 3D</h3>
            
            <div className="flex flex-col gap-3 mb-4 text-sm max-h-96 overflow-y-auto pr-1">
              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Centro</h4>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Coordenada X</label>
                <input
                  type="number"
                  value={editCirclePrompt.center.x}
                  onChange={(e) => setEditCirclePrompt({ ...editCirclePrompt, center: { ...editCirclePrompt.center, x: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Coordenada Y</label>
                <input
                  type="number"
                  value={editCirclePrompt.center.y}
                  onChange={(e) => setEditCirclePrompt({ ...editCirclePrompt, center: { ...editCirclePrompt.center, y: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Elevação Z</label>
                <input
                  type="number"
                  value={editCirclePrompt.center.z}
                  onChange={(e) => setEditCirclePrompt({ ...editCirclePrompt, center: { ...editCirclePrompt.center, z: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>

              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Raio</h4>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Comprimento do Raio</label>
                <input
                  type="number"
                  value={editCirclePrompt.radius}
                  onChange={(e) => setEditCirclePrompt({ ...editCirclePrompt, radius: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                />
              </div>

              <h4 className="text-slate-700 font-medium border-b border-slate-300 pb-1 mt-2">Geral</h4>
              <div className="flex flex-col gap-1">
                <label className="text-slate-500">Descrição</label>
                <input
                  type="text"
                  value={editCirclePrompt.description || ""}
                  onChange={(e) => setEditCirclePrompt({ ...editCirclePrompt, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-white px-3 py-2 rounded focus:outline-none focus:border-blue-600"
                  placeholder="Ex: Área de influência"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditCirclePrompt(null)}
                className="px-4 py-2 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  store.updateCircle3D(editCirclePrompt.id, {
                    center: editCirclePrompt.center,
                    radius: editCirclePrompt.radius,
                    description: editCirclePrompt.description
                  });
                  setEditCirclePrompt(null);
                }}
                className="px-4 py-2 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

function IntersectionsPanel({ store }: { store: ComposerState }) {
  if (store.intersections.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <NovoGalhoPanel />
        <div className="flex flex-col gap-3 text-slate-500 text-center mt-4">
          <MapIcon size={32} className="mx-auto text-slate-600 mb-2 opacity-50" />
          <p>Nenhuma Interseção Detectada.</p>
          <p className="text-xs">
            Aproxime o Ponto Inicial (POB) ou Final (POE) de um alinhamento sobre
            outro alinhamento para conectá-los — ou crie um galho a partir da
            principal, acima.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <NovoGalhoPanel />
      {store.intersections.map((int) => {
        const mainAlg = store.alignments.find(
          (a) => a.id === int.mainAlignmentId,
        );
        const branchAlg = store.alignments.find(
          (a) => a.id === int.branchAlignmentId,
        );
        const isSelected = store.selectedIntersectionId === int.id;

        return (
          <div
            key={int.id}
            className={`p-3 rounded-md border flex flex-col gap-3 cursor-pointer ${isSelected ? "bg-cyan-900/20 border-cyan-300" : "bg-white border-slate-200/50"}`}
            onClick={() => store.setSelectedIntersectionId(int.id)}
          >
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1 flex-1 mr-2">
                <input
                  type="text"
                  value={int.name || "Interseção"}
                  onChange={(e) => {
                    store.updateIntersection(int.id, { name: e.target.value }, { noRebuild: true });
                    store.rebuildIntersectionCorridors(int.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-none text-slate-800 font-medium text-sm focus:outline-none focus:ring-0 p-0"
                />
                <span className="text-xs text-slate-500">
                  {branchAlg?.name} → {mainAlg?.name}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  store.removeIntersection(int.id);
                }}
                className="text-slate-500 hover:text-rose-600 transition-colors p-1"
                title="Excluir Interseção"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {isSelected && (
              <div className="mt-2 flex flex-col gap-3 border-t border-slate-200 pt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    store.setEditingIntersectionId(int.id);
                    store.setInteractionMode("select_lane_direction");
                  }}
                  className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 rounded text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-sparkles"
                  >
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                    <path d="M5 3v4" />
                    <path d="M19 17v4" />
                    <path d="M3 5h4" />
                    <path d="M17 19h4" />
                  </svg>
                  Assistente de Interseção
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); store.setNtWindowIntersectionId(int.id); }}
                  className="w-full mt-1.5 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 rounded text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                  </svg>
                  Narizes Teóricos
                </button>

              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const RegionCard = ({ corridor, region, isActive, store }: any) => {
  const [showSplit, setShowSplit] = useState(false);
  const [splitStation, setSplitStation] = useState<number | string>(
    Math.round((region.startStation + region.endStation) / 2),
  );

  useEffect(() => {
    if (
      showSplit &&
      store.station > region.startStation &&
      store.station < region.endStation
    ) {
      setSplitStation(Number(store.station.toFixed(2)));
    }
  }, [store.station, showSplit, region.startStation, region.endStation]);

  const isSelected = store.selectedRegionId === region.id;

  return (
    <div
      onClick={() => store.setSelectedRegionId(region.id)}
      className={`p-3 rounded-md border flex flex-col gap-3 cursor-pointer transition-all ${isActive ? "bg-purple-900/20" : "bg-white"} ${isSelected ? "border-blue-600 ring-1 ring-blue-500" : isActive ? "border-purple-600/50" : "border-slate-200/50 hover:border-slate-600"}`}
    >
      <div className="flex justify-between items-center">
        <input
          type="text"
          value={region.name}
          onChange={(e) =>
            store.updateRegion(corridor.id, region.id, {
              name: e.target.value,
            })
          }
          className="bg-transparent border-none text-slate-800 font-medium text-sm focus:outline-none focus:ring-0 p-0 w-32"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setShowSplit(!showSplit)}
            className={`text-slate-500 hover:text-blue-600 ${showSplit ? "text-blue-600" : ""}`}
            title="Dividir Região"
          >
            <Scissors size={14} />
          </button>
          <button
            onClick={() => store.removeRegion(corridor.id, region.id)}
            className="text-slate-500 hover:text-red-400"
            title="Excluir"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {showSplit && (
        <div className="bg-slate-100 p-2 rounded border border-slate-300 flex flex-col gap-2">
          <label className="text-xs text-slate-500">Estaca para dividir:</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={splitStation}
              onChange={(e) =>
                setSplitStation(
                  e.target.value === "" ? "" : parseFloat(e.target.value),
                )
              }
              className="flex-1 bg-white border border-slate-300 rounded px-2 text-xs text-slate-800"
            />
            <button
              onClick={() => {
                store.splitRegion(corridor.id, region.id, Number(splitStation));
                setShowSplit(false);
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1 text-xs"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 uppercase">
            Estaca Inicial
          </label>
          <input
            type="number"
            value={region.startStation}
            onChange={(e) =>
              store.updateRegion(corridor.id, region.id, {
                startStation: parseFloat(e.target.value) || 0,
              })
            }
            className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs font-mono"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 uppercase">
            Estaca Final
          </label>
          <input
            type="number"
            value={region.endStation}
            onChange={(e) =>
              store.updateRegion(corridor.id, region.id, {
                endStation: parseFloat(e.target.value) || 0,
              })
            }
            className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs font-mono"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase">
          Seção Tipo (Assembly)
        </label>
        <select
          value={region.assemblyId}
          onChange={(e) =>
            store.updateRegion(corridor.id, region.id, {
              assemblyId: e.target.value,
            })
          }
          className="bg-slate-100 border border-slate-300 rounded px-2 py-1.5 text-slate-800 text-xs"
        >
          <option value="">- Selecione -</option>
          {store.assemblies.map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

function RegionsPanel({ store }: { store: ComposerState }) {
  /* Painel organizado por ALINHAMENTO: cada alinhamento é um grupo e dentro
   * dele estão os seus corredores. Visibilidade e foco de edição são camadas
   * independentes — editar um corredor nunca esconde os outros. */
  const [focusCorridor, setFocusCorridor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const visB: Record<string, boolean> = (store as any).baselineVisibility || {};
  const visC: Record<string, boolean> = (store as any).corridorVisibility || {};
  const baselineOn = (id?: string) => !id || visB[id] !== false;
  const corridorOn = (c: any) => visC[c.id] !== false;

  const cena: any = (store as any).planScene || { ribbons: [] };
  const desenhadas = new Map<string, number>();
  (cena.ribbons || []).forEach((r: any) => {
    if (!r.corridorId) return;
    desenhadas.set(r.corridorId, (desenhadas.get(r.corridorId) || 0) + 1);
  });

  /* Porque é que um corredor não aparece na planta — antes falhava em silêncio. */
  const diagnostico = (corridor: any): string | null => {
    if (!corridor.alignmentId) return "sem baseline";
    const al: any = store.alignments.find((a) => a.id === corridor.alignmentId);
    if (!al) return "baseline inexistente";
    if (!corridor.regions || corridor.regions.length === 0) return "sem região";
    const comSecao = corridor.regions.filter((r: any) => store.assemblies.find((a) => a.id === r.assemblyId));
    if (comSecao.length === 0) return "regiões sem seção tipo";
    const staIni = al.points?.[0]?.sta ?? 0;
    const staFim = al.points?.[al.points.length - 1]?.sta ?? al.length ?? 0;
    if (corridor.regions.every((r: any) => r.startStation >= staFim || r.endStation <= staIni)) return "regiões fora do eixo";
    if ((desenhadas.get(corridor.id) || 0) === 0) return "não calculado";
    return null;
  };

  const Toggle = ({ on, onClick, title, disabled }: { on: boolean; onClick: (e: any) => void; title: string; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${disabled ? "bg-slate-200" : on ? "bg-purple-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on && !disabled ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );

  const renderCorridor = (corridor: any) => {
    const emFoco = focusCorridor === corridor.id;
    const on = corridorOn(corridor) && baselineOn(corridor.alignmentId);
    const d = diagnostico(corridor);
    return (
      <ContextMenu
        key={corridor.id}
        items={[
          {
            label: "Excluir Corredor",
            danger: true,
            icon: <Trash2 size={14} />,
            onClick: () => store.removeCorridor(corridor.id),
          },
        ]}
      >
        <div className={`rounded-md border ${emFoco ? "border-purple-300 bg-purple-50/40" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Toggle
              on={on}
              title={on ? "Corredor ligado — desligar" : "Corredor desligado — ligar"}
              onClick={(e) => { e.stopPropagation(); (store as any).setCorridorVisible(corridor.id, !corridorOn(corridor)); }}
            />
            <input
              type="text"
              value={corridor.name}
              onChange={(e) => store.updateCorridor(corridor.id, { name: e.target.value })}
              onFocus={() => setFocusCorridor(corridor.id)}
              className={`bg-transparent border-none text-sm font-medium focus:outline-none focus:ring-0 p-0 flex-1 min-w-0 ${on ? "text-slate-800" : "text-slate-400"}`}
            />
            <span className="text-[10px] text-slate-400 shrink-0">{corridor.regions?.length || 0} reg.</span>
            <button
              onClick={() => setFocusCorridor(emFoco ? null : corridor.id)}
              className="text-slate-500 hover:text-purple-700 shrink-0"
              title={emFoco ? "Fechar" : "Editar corredor"}
            >
              {emFoco ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          {d && (
            <div className="px-2 pb-1.5">
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                não desenhado: {d}
              </span>
            </div>
          )}

          {emFoco && (
            <div className="flex flex-col gap-2 px-2 pb-2 border-t border-slate-200 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Baseline:</span>
                <select
                  value={corridor.alignmentId || ""}
                  onChange={(e) => store.updateCorridor(corridor.id, { alignmentId: e.target.value })}
                  className="bg-white border border-slate-200 rounded text-slate-700 text-xs px-1 py-0.5 flex-1"
                >
                  <option value="">- Selecione -</option>
                  {store.alignments.filter((a) => !a.isHidden).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Frequência (m):</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={corridor.frequency || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) store.updateCorridor(corridor.id, { frequency: val });
                    else store.updateCorridor(corridor.id, { frequency: undefined });
                  }}
                  className="bg-white border border-slate-300 text-slate-700 text-xs rounded px-1 w-16"
                  placeholder="Global"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Mão da via:</span>
                <select
                  value={(corridor as any).mao || "auto"}
                  onChange={(e) => {
                    const v = e.target.value;
                    store.updateCorridor(corridor.id, {
                      mao: v === "auto" ? undefined : (v as any),
                      maoSentido: v === "unica" ? ((corridor as any).maoSentido || "forward") : undefined,
                    } as any);
                  }}
                  className="bg-white border border-slate-200 rounded text-slate-700 text-xs px-1 py-0.5 flex-1"
                  title="Automático lê a seção: faixa de um lado só = mão única; dos dois lados = mão dupla. Circulação pela direita."
                >
                  <option value="auto">Automática (pela seção)</option>
                  <option value="dupla">Mão dupla</option>
                  <option value="unica">Mão única</option>
                </select>
              </div>
              {(corridor as any).mao === "unica" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Sentido:</span>
                  <select
                    value={(corridor as any).maoSentido || "forward"}
                    onChange={(e) => store.updateCorridor(corridor.id, { maoSentido: e.target.value as any } as any)}
                    className="bg-white border border-slate-200 rounded text-slate-700 text-xs px-1 py-0.5 flex-1"
                  >
                    <option value="forward">A favor do estaqueamento</option>
                    <option value="backward">Contra o estaqueamento</option>
                  </select>
                </div>
              )}

              <div className="flex justify-between items-center pb-1 border-b border-slate-200">
                <h4 className="text-slate-700 text-xs font-semibold uppercase tracking-wide">Regiões (Trechos)</h4>
                <button
                  onClick={() => store.addRegion(corridor.id)}
                  className="p-1 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors"
                  title="Adicionar Região"
                >
                  <Plus size={12} />
                </button>
              </div>

              {(corridor.regions || []).map((region: any) => (
                <RegionCard
                  key={region.id}
                  corridor={corridor}
                  region={region}
                  isActive={store.station >= region.startStation && store.station <= region.endStation}
                  store={store}
                />
              ))}
            </div>
          )}
        </div>
      </ContextMenu>
    );
  };

  const orfaos = store.corridors.filter(
    (c) => !c.alignmentId || !store.alignments.find((a) => a.id === c.alignmentId),
  );
  const nAlinhamentos = store.alignments.filter((a) => !a.isHidden).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">
            {nAlinhamentos} alinhamento{nAlinhamentos === 1 ? "" : "s"} · {store.corridors.length} corredor{store.corridors.length === 1 ? "" : "es"}
          </span>
          <button
            onClick={() => { (store as any).showAllBaselines(); (store as any).showAllCorridors(); }}
            className="text-[11px] text-purple-700 hover:underline"
          >
            Ligar tudo
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Frequência global (m):</span>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={store.globalCorridorFrequency || 2}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) store.setGlobalCorridorFrequency(val);
            }}
            className="w-20 bg-white border border-slate-300 text-slate-700 text-sm rounded px-2 py-1 outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {store.alignments.filter((a) => !a.isHidden).map((al) => {
        const corrs = store.corridors.filter((c) => c.alignmentId === al.id);
        const aberto = collapsed[al.id] !== true;
        const on = baselineOn(al.id);
        return (
          <div key={al.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-md">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [al.id]: aberto }))}
                className="text-slate-500 hover:text-slate-800 shrink-0"
                title={aberto ? "Recolher" : "Expandir"}
              >
                {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: (al as any).color || "#3b82f6" }} />
              <span className={`text-sm font-semibold truncate flex-1 ${on ? "text-slate-800" : "text-slate-400 line-through"}`}>
                {al.name || "Alinhamento sem nome"}
              </span>
              <span className="text-[10px] text-slate-400 shrink-0">{corrs.length} corr.</span>
              <Toggle
                on={on}
                title={on ? "Baseline ligada — desligar" : "Baseline desligada — ligar"}
                onClick={() => (store as any).setBaselineVisible(al.id, !on)}
              />
              <button
                onClick={() => (store as any).isolateBaseline(al.id)}
                className="shrink-0 text-[10px] text-slate-500 hover:text-purple-700 px-1.5 py-0.5 border border-slate-300 rounded bg-white"
                title="Mostrar apenas esta baseline"
              >
                isolar
              </button>
            </div>

            {aberto && (
              <div className="flex flex-col gap-2 pl-3">
                {corrs.length === 0 ? (
                  <span className="text-[11px] text-slate-400 italic">Sem corredores neste alinhamento.</span>
                ) : (
                  corrs.map(renderCorridor)
                )}
                <button
                  onClick={() => (store as any).addCorridor(al.id)}
                  className="w-full flex items-center justify-center gap-2 p-1.5 border border-slate-200 border-dashed rounded text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  <Plus size={14} /> Corredor neste alinhamento
                </button>
              </div>
            )}
          </div>
        );
      })}

      {orfaos.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
            <span className="text-sm font-semibold text-amber-800 flex-1">Sem baseline atribuída</span>
            <span className="text-[10px] text-amber-700">{orfaos.length}</span>
          </div>
          <div className="flex flex-col gap-2 pl-3">{orfaos.map(renderCorridor)}</div>
        </div>
      )}
    </div>
  );
}

const TIPOS_JANELA: { tipo: string; nome: string }[] = [
  { tipo: "viewport planta", nome: "Viewport Planta" },
  { tipo: "viewport perfil", nome: "Viewport Perfil" },
  { tipo: "viewport seção tipo", nome: "Viewport Seção Tipo" },
  { tipo: "viewport seções acabadas", nome: "Viewport Seções Acabadas" },
  { tipo: "viewport articulação de folhas", nome: "Articulação de Folhas" },
];

/* Modelos rápidos: apenas pré-preenchem as janelas — o layout continua livre. */
const MODELOS_LAYOUT: Record<string, string[]> = {
  "Em branco": [],
  "Planta": ["viewport planta"],
  "Planta e Perfil": ["viewport planta", "viewport perfil"],
  "Perfil": ["viewport perfil"],
  "Seções acabadas": ["viewport seções acabadas"],
  "Seção tipo": ["viewport seção tipo", "viewport seção tipo", "viewport seção tipo", "viewport seção tipo"],
};

const ESCALAS = ["1:100", "1:200", "1:250", "1:500", "1:1000", "1:2000", "1:2500", "1:5000"];

function ProductionPanel({ store }: { store: ComposerState }) {
  const cadernos: any[] = (store as any).productionCadernos || [];
  const setCadernos = (store as any).setProductionCadernos;
  const cadAtivo = cadernos.find((c) => c.id === (store as any).productionCadernoAtivo) || cadernos[0] || null;
  const layoutAtivo = (cadAtivo?.layouts || []).find((l: any) => l.id === store.productionLayout) || null;

  const [novoLayoutAberto, setNovoLayoutAberto] = React.useState(false);
  const [nl, setNl] = React.useState({ nome: "", modelo: "Planta", folha: "A1", orientacao: "Landscape", escala: "1:1000" });
  const [addJanelaAberto, setAddJanelaAberto] = React.useState(false);

  const rotulo = "text-xs font-semibold text-slate-500 uppercase tracking-wider";
  const campo = "w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-800 focus:border-blue-600 outline-none";

  const patchCaderno = (cid: string, fn: (c: any) => any) =>
    setCadernos(cadernos.map((c) => (c.id === cid ? fn(c) : c)));
  const patchLayout = (lid: string, patch: any) => {
    if (!cadAtivo) return;
    patchCaderno(cadAtivo.id, (c) => ({
      ...c,
      layouts: (c.layouts || []).map((l: any) => (l.id === lid ? { ...l, ...patch } : l)),
    }));
  };

  /* Aplicar um layout = carregar a sua configuração e a sua folha/orientação. */
  const aplicarLayout = (l: any) => {
    const alignId = store.productionActiveAlignment || store.alignments[0]?.id;
    if (alignId) store.loadProductionConfig(alignId, l.id);
    else store.setProductionLayout(l.id);
    store.setProductionSheetSize(l.folha);
    store.setProductionSheetOrientation(l.orientacao as "Landscape" | "Portrait");
  };

  const criarCaderno = () => {
    const id = "cad-" + Date.now();
    const novo = { id, nome: "Caderno " + (cadernos.length + 1), layouts: [] as any[] };
    setCadernos([...cadernos, novo]);
    (store as any).setProductionCadernoAtivo(id);
  };

  const criarLayout = () => {
    if (!cadAtivo) return;
    const id = "lay-" + Date.now();
    const janelas = (MODELOS_LAYOUT[nl.modelo] || []).map((t, i) => ({ id: id + "-j" + i, tipo: t }));
    const novo = {
      id,
      nome: nl.nome.trim() || "Layout " + ((cadAtivo.layouts || []).length + 1),
      folha: nl.folha,
      orientacao: nl.orientacao,
      escala: nl.escala,
      carimbo: false,
      janelas,
    };
    patchCaderno(cadAtivo.id, (c) => ({ ...c, layouts: [...(c.layouts || []), novo] }));
    setNovoLayoutAberto(false);
    setNl({ ...nl, nome: "" });
    setTimeout(() => aplicarLayout(novo), 0);
  };

  const addJanela = (tipo: string) => {
    if (!layoutAtivo) return;
    setAddJanelaAberto(false);
    if (tipo === "tabela") { store.addProductionTable(); return; }
    if (tipo === "carimbo") { patchLayout(layoutAtivo.id, { carimbo: true }); return; }
    patchLayout(layoutAtivo.id, {
      janelas: [...(layoutAtivo.janelas || []), { id: layoutAtivo.id + "-j" + Date.now(), tipo }],
    });
  };

  const removerJanela = (jid: string) => {
    if (!layoutAtivo) return;
    patchLayout(layoutAtivo.id, { janelas: (layoutAtivo.janelas || []).filter((j: any) => j.id !== jid) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex pb-2 border-b border-slate-200">
        <h3 className="text-slate-800 font-medium">Produção</h3>
      </div>

      {/* CADERNOS */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className={rotulo}>Cadernos ({cadernos.length})</label>
          <button onClick={criarCaderno} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold">
            <Plus className="w-3.5 h-3.5" /> Novo caderno
          </button>
        </div>
        {cadernos.length === 0 ? (
          <button onClick={criarCaderno} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded px-3 py-2 text-sm flex items-center justify-center gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Criar primeiro caderno
          </button>
        ) : (
          <div className="flex flex-col gap-1">
            {cadernos.map((c) => {
              const ativo = cadAtivo?.id === c.id;
              const nL = (c.layouts || []).length;
              return (
                <div
                  key={c.id}
                  onClick={() => (store as any).setProductionCadernoAtivo(c.id)}
                  onDoubleClick={() => {
                    const n = window.prompt("Nome do caderno", c.nome);
                    if (n) patchCaderno(c.id, (x) => ({ ...x, nome: n }));
                  }}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer border ${
                    ativo ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="truncate flex-1">{c.nome}</span>
                  <span className="text-[10px] text-slate-400 mr-1">{nL} layout{nL === 1 ? "" : "s"}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCadernos(cadernos.filter((x) => x.id !== c.id)); }}
                    className="text-slate-400 hover:text-red-500 p-0.5 rounded"
                    title="Excluir caderno"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* LAYOUTS DO CADERNO */}
      {cadAtivo && (
        <div className="flex flex-col gap-2 pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <label className={rotulo}>Layouts — {cadAtivo.nome}</label>
            <button onClick={() => setNovoLayoutAberto((v) => !v)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold">
              <Plus className="w-3.5 h-3.5" /> Novo layout
            </button>
          </div>

          {novoLayoutAberto && (
            <div className="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded p-2">
              <input
                value={nl.nome}
                onChange={(e) => setNl({ ...nl, nome: e.target.value })}
                placeholder={"Layout " + ((cadAtivo.layouts || []).length + 1)}
                className={campo}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 uppercase">Folha</span>
                  <select value={nl.folha} onChange={(e) => setNl({ ...nl, folha: e.target.value })} className={campo}>
                    {["A0", "A1", "A2", "A3", "A4"].map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 uppercase">Orientação</span>
                  <select value={nl.orientacao} onChange={(e) => setNl({ ...nl, orientacao: e.target.value })} className={campo}>
                    <option value="Landscape">Paisagem</option>
                    <option value="Portrait">Retrato</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 uppercase">Escala</span>
                  <select value={nl.escala} onChange={(e) => setNl({ ...nl, escala: e.target.value })} className={campo}>
                    {ESCALAS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 uppercase">Modelo</span>
                  <select value={nl.modelo} onChange={(e) => setNl({ ...nl, modelo: e.target.value })} className={campo}>
                    {Object.keys(MODELOS_LAYOUT).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setNovoLayoutAberto(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
                <button onClick={criarLayout} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded">Criar layout</button>
              </div>
            </div>
          )}

          {(cadAtivo.layouts || []).length === 0 && !novoLayoutAberto && (
            <p className="text-[11px] text-slate-500 italic m-0">
              Sem layouts. Crie um layout escolhendo folha, escala e orientação — depois escolha as janelas.
            </p>
          )}

          <div className="flex flex-col gap-1">
            {(cadAtivo.layouts || []).map((l: any) => {
              const ativo = store.productionLayout === l.id;
              return (
                <div
                  key={l.id}
                  onClick={() => aplicarLayout(l)}
                  onDoubleClick={() => {
                    const n = window.prompt("Nome do layout", l.nome);
                    if (n) patchLayout(l.id, { nome: n });
                  }}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer border ${
                    ativo ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="truncate flex-1">{l.nome}</span>
                  <span className="text-[10px] text-slate-400 mr-1">{l.folha} · {l.escala}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      patchCaderno(cadAtivo.id, (c) => ({ ...c, layouts: (c.layouts || []).filter((x: any) => x.id !== l.id) }));
                    }}
                    className="text-slate-400 hover:text-red-500 p-0.5 rounded"
                    title="Excluir layout"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
