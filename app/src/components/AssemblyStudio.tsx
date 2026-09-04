
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useStore } from "../store";
import { Plus, Trash2, GripVertical, Settings2, Info, ZoomIn, ZoomOut, Move } from "lucide-react";
import { motion, Reorder, AnimatePresence } from "motion/react";
import { SubassemblyComponent } from "../types";
import { LayersEditor } from "./LayersEditor";
import { njProfile, njPolygon, NJ_BASE, NJ_PADRAO, type NJTipo } from "../lib/newJersey";

export function getVisualWidthPx(comp: SubassemblyComponent) {
    const scale = 100;
    if (comp.type === 'Sarjeta') {
        const shape = comp.params.shape || 'Triangular';
        let width = 0;
        if (shape === 'Triangular') {
            width = (comp.params.width || 1.0) + (comp.params.bottomWidth || 0.3);
        } else if (shape === 'Trapezoidal') {
            width = (comp.params.width || 0.8) + (comp.params.bottomWidth || 0.4) + (comp.params.cornerRadii || 0.2);
        } else if (shape === 'Retangular') {
            width = (comp.params.width || 0.6);
        } else {
            width = (comp.params.width || 1.0);
        }
        return width * scale;
    }
    if (comp.type === 'Guia') {
        return (comp.params.width || 0.15) * scale;
    }
    if (comp.type === 'New Jersey') {
        /* A base da barreira é a largura que ela ocupa na seção. */
        return njProfile(comp.params as any).base * scale;
    }
    if (comp.params.width) {
        return comp.params.width * scale;
    }
    if (comp.type === 'Pista') return 3.6 * scale;
    if (comp.type === 'Acostamento') return 2.5 * scale;
    if (comp.type === 'Talude') return 200;
    return (comp.params.width || 6) * scale;
}

const computeOffsetsPx = (components: SubassemblyComponent[]) => {
    let currentYPx = 0;
    return components.map(comp => {
        let offsetPx = currentYPx;
        let slopeVal = 0;
        slopeVal = comp.params.slope ?? getDefaultParams(comp.type).slope ?? 0;
        
        const visualWidthPx = getVisualWidthPx(comp);
        let dropPx = - (slopeVal / 100) * visualWidthPx;

        if (comp.type === 'Guia') {
            const heightAbove = comp.params.heightAbove ?? 0.15;
            const heightAbovePx = heightAbove * 100;
            offsetPx -= heightAbovePx;
            
            // Assume the next component attaches to the top (CSE/CSD) for simplicity in this mock view
            dropPx = -heightAbovePx; 
        }

        currentYPx += dropPx;
        return offsetPx;
    });
};

export function AssemblyStudio() {
  const { assemblies, selectedAssemblyId, updateAssembly } = useStore();
  const assembly = assemblies.find((a) => a.id === selectedAssemblyId);

  // States
  const [draggedType, setDraggedType] = useState<string | null>(null);
  const [editingComponent, setEditingComponent] = useState<SubassemblyComponent | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });

  const components = assembly?.components || [];
  const leftComponents = useMemo(() => components.filter(c => c.side === 'Left'), [components]);
  const rightComponents = useMemo(() => components.filter(c => c.side === 'Right'), [components]);

  /* PRÉ-VISUALIZAÇÃO DO ENCAIXE — a seção se remonta ANTES de soltar.
   * O componente arrastado entra na lista como um FANTASMA com os parâmetros
   * reais do tipo (largura e declividade de projeto), então os vizinhos
   * escorregam e reencaixam exatamente como ficarão depois do drop. Sem isto o
   * usuário só descobre onde o elemento cai — e como a seção reage — depois de
   * largar. */
  const [ghost, setGhost] = useState<{ side: "Left" | "Right"; index: number } | null>(null);
  const ghostComp = useMemo<SubassemblyComponent | null>(
    () =>
      draggedType && ghost
        ? {
            id: "__ghost__",
            type: draggedType as any,
            side: ghost.side,
            params: getDefaultParams(draggedType),
          }
        : null,
    [draggedType, ghost],
  );

  const comGhost = (lista: SubassemblyComponent[], side: "Left" | "Right") => {
    if (!ghostComp || ghost?.side !== side) return lista;
    const i = Math.max(0, Math.min(lista.length, ghost.index));
    return [...lista.slice(0, i), ghostComp, ...lista.slice(i)];
  };

  const leftPreview = useMemo(() => comGhost(leftComponents, "Left"), [leftComponents, ghostComp, ghost]);
  const rightPreview = useMemo(() => comGhost(rightComponents, "Right"), [rightComponents, ghostComp, ghost]);

  const leftOffsets = useMemo(() => computeOffsetsPx(leftPreview), [leftPreview]);
  const rightOffsets = useMemo(() => computeOffsetsPx(rightPreview), [rightPreview]);

  /* Índice de encaixe a partir do ponteiro: soma as larguras reais do eixo para
   * fora e entra antes do componente cuja primeira metade contém o ponteiro.
   * Conta com as larguras do modelo, não com medição do DOM — medir o DOM
   * enquanto o fantasma já ocupa espaço realimentaria a própria conta. */
  const indiceDoPonteiro = (side: "Left" | "Right", clientX: number) => {
    const viewer = document.getElementById("assembly-viewer");
    if (!viewer) return 0;
    const rect = viewer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 + pan.x * zoom;
    const lista = side === "Left" ? leftComponents : rightComponents;
    const d = ((side === "Right" ? clientX - centerX : centerX - clientX) || 0) / (zoom || 1);
    let acc = 0;
    let i = 0;
    for (; i < lista.length; i++) {
      const w = getVisualWidthPx(lista[i]);
      if (d < acc + w / 2) break;
      acc += w;
    }
    return i;
  };

  // Ordem visual do lado esquerdo (da borda externa até o eixo). O DOM segue a ordem visual
  // para que o Reorder meça as posições corretamente e o reencaixe aconteça durante o arraste.
  const leftVisual = useMemo(() => [...leftPreview].reverse(), [leftPreview]);
  const leftVisualOffsets = useMemo(() => [...leftOffsets].reverse(), [leftOffsets]);

  const updateComponentSide = (id: string, newSide: 'Left' | 'Right') => {
    if (!assembly) return;
    updateAssembly(assembly.id, {
      components: assembly.components.map(c => c.id === id ? { ...c, side: newSide } : c)
    });
  };

  const handleItemDragEnd = (info: any, comp: SubassemblyComponent) => {
      const viewer = document.getElementById('assembly-viewer');
      if (!viewer) return;
      const rect = viewer.getBoundingClientRect();
      const centerLineX = rect.left + rect.width / 2 + (pan.x * zoom);
      
      if (info.point.x < centerLineX) {
          if (comp.side !== 'Left') updateComponentSide(comp.id, 'Left');
      } else {
          if (comp.side !== 'Right') updateComponentSide(comp.id, 'Right');
      }
  };

  if (!assembly) {
    return <div className="p-4 text-slate-500">Selecione ou crie uma seção tipo.</div>;
  }

  const handleAddComponent = (type: string, side: 'Left' | 'Right', index?: number) => {
    const newComp: SubassemblyComponent = {
      id: `${type.toLowerCase().replace(/ /g, '_')}-${Date.now()}`,
      type: type as any,
      side,
      params: getDefaultParams(type),
    };
    
    const newComponents = [...components];
    if (index !== undefined) {
      // Find the actual index in the full array
      const sideComps = components.filter(c => c.side === side);
      sideComps.splice(index, 0, newComp);
      const otherComps = components.filter(c => c.side !== side);
      updateAssembly(assembly.id, { components: side === 'Left' ? [...sideComps, ...otherComps] : [...otherComps, ...sideComps] });
    } else {
      updateAssembly(assembly.id, { components: [...components, newComp] });
    }
  };

  const handleRemoveComponent = (id: string) => {
    updateAssembly(assembly.id, {
      components: components.filter((c) => c.id !== id),
    });
    if (editingComponent?.id === id) setEditingComponent(null);
  };

  const handleUpdateParam = (id: string, param: string, val: number | string | boolean) => {
    /* Trocar o TIPO da New Jersey traz a base normativa junto (simples 0,38 /
       dupla 0,61) — o tipo não é rótulo, é a geometria. */
    const extra: Record<string, any> = {};
    if (param === 'tipo' && NJ_BASE[val as NJTipo] !== undefined) {
      extra.width = NJ_BASE[val as NJTipo];
      extra.lastroWidth = NJ_BASE[val as NJTipo] + 0.1;
      if (val !== 'Dupla Desnível') extra.desnivel = 0;
      else extra.desnivel = 0.3;
    }
    updateAssembly(assembly.id, {
      components: components.map((c) =>
        c.id === id ? { ...c, params: { ...c.params, [param]: val, ...extra } } : c
      ),
    });
    if (editingComponent?.id === id) {
      setEditingComponent(prev => prev ? { ...prev, params: { ...prev.params, [param]: val, ...extra } } : null);
    }
  };

  const handleUpdateLayers = (id: string, layers: any) => {
    updateAssembly(assembly.id, {
      components: components.map((c) =>
        c.id === id ? { ...c, layers } : c
      ),
    });
    if (editingComponent?.id === id) {
      setEditingComponent(prev => prev ? { ...prev, layers } : null);
    }
  };

  const handleReorder = (side: 'Left'|'Right', newOrder: SubassemblyComponent[]) => {
    const otherComps = components.filter(c => c.side !== side);
    updateAssembly(assembly.id, {
      components: side === 'Left' ? [...newOrder, ...otherComps] : [...otherComps, ...newOrder]
    });
  };

  // Drag from palette
  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData("type", type);
    setDraggedType(type);
  };
  const handleDragEnd = () => {
    setDraggedType(null);
    setGhost(null);
  };

  const handleDrop = (e: React.DragEvent, side: 'Left'|'Right') => {
    e.preventDefault();
    const type = e.dataTransfer.getData("type");
    /* Cai exatamente onde o fantasma estava mostrando. */
    const index = ghost?.side === side ? ghost.index : indiceDoPonteiro(side, e.clientX);
    setGhost(null);
    setDraggedType(null);
    if (type) handleAddComponent(type, side, index);
  };

  const handleDragOver = (e: React.DragEvent, side?: 'Left'|'Right') => {
    e.preventDefault();
    if (!side || !draggedType) return;
    e.dataTransfer.dropEffect = "copy";
    const index = indiceDoPonteiro(side, e.clientX);
    setGhost((g) => (g && g.side === side && g.index === index ? g : { side, index }));
  };

  const handleDragLeaveSide = (e: React.DragEvent, side: 'Left'|'Right') => {
    const para = e.relatedTarget as Node | null;
    if (para && e.currentTarget.contains(para)) return;
    setGhost((g) => (g?.side === side ? null : g));
  };

  const handleViewerPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.component-block')) return;
    isPanningRef.current = true;
    lastPanPoint.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleViewerPointerMove = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
        const dx = e.clientX - lastPanPoint.current.x;
        const dy = e.clientY - lastPanPoint.current.y;
        setPan(prev => ({ x: prev.x + dx / zoom, y: prev.y + dy / zoom }));
        lastPanPoint.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleViewerPointerUp = (e: React.PointerEvent) => {
    isPanningRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleZoomWheel = (e: React.WheelEvent) => {
      // Allow wheel zoom but don't prevent default to avoid passive listener warning
      // Only applying basic zoom
      setZoom(z => Math.min(Math.max(0.2, z - e.deltaY * 0.002), 5));
  };

  const paletteItems = [
    { type: 'Pista', color: 'bg-slate-800/40 border-slate-400/30 text-white backdrop-blur-md' },
    { type: 'Acostamento', color: 'bg-slate-500/40 border-slate-300/30 text-white backdrop-blur-md' },
    { type: 'Faixa de Segurança', color: 'bg-yellow-500/40 border-yellow-300/30 text-slate-800 backdrop-blur-md' },
    { type: 'Canteiro Central', color: 'bg-green-600/40 border-green-400/30 text-white backdrop-blur-md' },
    { type: 'Refúgio', color: 'bg-orange-800/40 border-orange-600/30 text-white backdrop-blur-md' },
    { type: 'Guia', color: 'bg-stone-400/40 border-stone-200/30 text-stone-800 backdrop-blur-md' },
    { type: 'Sarjeta', color: 'bg-stone-300/40 border-stone-200/30 text-stone-700 backdrop-blur-md' },
    { type: 'Talude', color: 'bg-emerald-500/40 border-emerald-300/30 text-emerald-900 backdrop-blur-md' },
    { type: 'Passeio', color: 'bg-teal-600/40 border-teal-300/30 text-teal-900 backdrop-blur-md' },
    { type: 'New Jersey', color: 'bg-zinc-200/50 border-white/50 text-slate-800 backdrop-blur-md' }
  ];

  return (
    <div className="flex h-full bg-gradient-to-br from-indigo-100 via-purple-50 to-emerald-50 relative overflow-hidden font-sans">
      
      {/* Central View: The Assembly Layout */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden p-4">
        
        <div className="text-center mb-4 flex-shrink-0 z-10 pointer-events-none">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{assembly.name}</h2>
            <p className="text-slate-500 text-sm mt-1">Arraste os elementos da paleta para a esquerda ou direita</p>
        </div>

        {/* The Road Section Visual Builder */}
        <div 
            id="assembly-viewer"
            className="relative flex items-center justify-center w-full flex-1 bg-slate-200/40 backdrop-blur-xl border border-white/50 rounded-[2rem] shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing"
            onPointerDown={handleViewerPointerDown}
            onPointerMove={handleViewerPointerMove}
            onPointerUp={handleViewerPointerUp}
            onPointerCancel={handleViewerPointerUp}
            onWheel={handleZoomWheel}
        >
            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-[300]">
                <button onClick={() => setZoom(z => Math.min(z + 0.2, 5))} className="bg-white/80 backdrop-blur border border-white p-2 rounded hover:bg-white text-slate-600 transition-colors">
                    <ZoomIn size={16} />
                </button>
                <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.2))} className="bg-white/80 backdrop-blur border border-white p-2 rounded hover:bg-white text-slate-600 transition-colors">
                    <ZoomOut size={16} />
                </button>
                <button onClick={() => { setZoom(1); setPan({x:0, y:0}); }} className="bg-white/80 backdrop-blur border border-white p-2 rounded hover:bg-white text-slate-600 transition-colors" title="Reset View">
                    <Move size={16} />
                </button>
            </div>

            {/* Assembly Container anchored at the center */}
            <div 
                className="absolute top-1/2 left-1/2 w-0 h-0 flex items-start z-10 transition-transform duration-75"
                style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}
            >
                 
                 {/* Center Line (Eixo) */}
                 <div className="absolute left-0 bottom-[-150px] w-[2px] h-[300px] -ml-[1px] bg-yellow-400 border-x border-yellow-500 border-dashed z-0 pointer-events-none" />
                 <div className="absolute left-0 top-[-160px] -translate-x-1/2 bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-1 rounded-full z-10 pointer-events-none border border-yellow-300">EIXO</div>

                 {/* Left Side */}
                 <div 
                    className={`absolute right-0 top-[-1000px] flex flex-row-reverse items-start pt-[1000px] w-[3000px] h-[2000px] transition-colors rounded-l-3xl ${draggedType ? 'bg-orange-50/40' : ''}`}
                    onDrop={(e) => handleDrop(e, 'Left')}
                    onDragOver={(e) => handleDragOver(e, 'Left')}
                    onDragLeave={(e) => handleDragLeaveSide(e, 'Left')}
                 >
                     {leftComponents.length === 0 && (
                         <div className="absolute right-8 top-[1016px] opacity-40 pointer-events-none whitespace-nowrap">
                             <span className="text-orange-600 font-medium text-sm">Lado Esquerdo</span>
                         </div>
                     )}
                     <Reorder.Group axis="x" values={leftVisual.filter((c) => c.id !== "__ghost__")} onReorder={(val) => handleReorder('Left', [...val].reverse())} className="flex flex-row items-start gap-0 min-h-[100px] z-20">
                         {leftVisual.map((comp, i) =>
                           comp.id === "__ghost__" ? (
                             <GhostBlock key="ghost-left" comp={comp} yOffsetPx={leftVisualOffsets[i]} />
                           ) : (
                             <ComponentBlock key={comp.id} comp={comp} onRemove={() => handleRemoveComponent(comp.id)} onClick={() => setEditingComponent(comp)} yOffsetPx={leftVisualOffsets[i]} onDragEnd={(e, info) => handleItemDragEnd(info, comp)} isSelected={editingComponent?.id === comp.id} index={leftVisual.length - i} />
                           ),
                         )}
                     </Reorder.Group>
                 </div>

                 {/* Right Side */}
                 <div 
                    className={`absolute left-0 top-[-1000px] flex flex-row items-start pt-[1000px] w-[3000px] h-[2000px] transition-colors rounded-r-3xl ${draggedType ? 'bg-indigo-50/40' : ''}`}
                    onDrop={(e) => handleDrop(e, 'Right')}
                    onDragOver={(e) => handleDragOver(e, 'Right')}
                    onDragLeave={(e) => handleDragLeaveSide(e, 'Right')}
                 >
                     {rightComponents.length === 0 && (
                         <div className="absolute left-8 top-[1016px] opacity-40 pointer-events-none whitespace-nowrap">
                             <span className="text-indigo-600 font-medium text-sm">Lado Direito</span>
                         </div>
                     )}
                     <Reorder.Group axis="x" values={rightPreview.filter((c) => c.id !== "__ghost__")} onReorder={(val) => handleReorder('Right', val)} className="flex flex-row items-start gap-0 min-h-[100px] z-20">
                         {rightPreview.map((comp, i) =>
                           comp.id === "__ghost__" ? (
                             <GhostBlock key="ghost-right" comp={comp} yOffsetPx={rightOffsets[i]} />
                           ) : (
                             <ComponentBlock key={comp.id} comp={comp} onRemove={() => handleRemoveComponent(comp.id)} onClick={() => setEditingComponent(comp)} yOffsetPx={rightOffsets[i]} onDragEnd={(e, info) => handleItemDragEnd(info, comp)} isSelected={editingComponent?.id === comp.id} index={i + 1} />
                           ),
                         )}
                     </Reorder.Group>
                 </div>
            </div>
            
        </div>
      </div>

      {/* Right Panel: Palette & Properties */}
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-xl z-20 relative">
        
        {editingComponent ? (
            <div className="flex-1 flex flex-col min-h-0">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Settings2 size={16} className="text-sky-500" />
                        Propriedades
                    </h3>
                    <button onClick={() => setEditingComponent(null)} className="text-xs bg-white border border-slate-200 px-2 py-1 rounded hover:bg-slate-50 text-slate-600 font-medium transition-colors">Voltar</button>
                </div>
                <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="mb-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Tipo</div>
                                <div className="text-lg font-bold text-slate-800">{editingComponent.type}</div>
                            </div>
                            <button 
                                onClick={() => handleRemoveComponent(editingComponent.id)}
                                className="text-red-500 hover:text-white hover:bg-red-500 p-2 rounded-full transition-colors flex items-center justify-center bg-red-50"
                                title="Excluir componente"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                        <div className={`text-xs inline-block px-2 py-0.5 mt-2 rounded-full font-medium ${editingComponent.side === 'Left' ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'}`}>
                            Lado {editingComponent.side === 'Left' ? 'Esquerdo' : 'Direito'}
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        {Object.entries(getDefaultParams(editingComponent.type)).filter(([key]) => {
                            if (editingComponent.type === 'Sarjeta') {
                                const shape = editingComponent.params.shape || 'Triangular';
                                if (shape === 'Triangular' && (key === 'slope')) return false;
                                if (shape === 'Trapezoidal' && (key === 'slope')) return false;
                                if (shape === 'Retangular' && (key === 'slope')) return false;
                                if (shape === 'Simples' && (key === 'bottomWidth' || key === 'depth')) return false;
                            }
                            if (editingComponent.type === 'New Jersey' && key === 'desnivel') {
                                return (editingComponent.params.tipo || 'Simples') === 'Dupla Desnível';
                            }
                            return true;
                        }).map(([key, defaultVal]) => {
                            const val = editingComponent.params[key] ?? defaultVal;
                            const isSlope = key.includes('slope');
                            const isSmall = key.includes('corner') || key.includes('foundation') || key.includes('height') || (key.includes('width') && key !== 'benchWidth') || key === 'thickness' || key === 'depth' || key === 'desnivel' || key === 'lastro' || key === 'lastroWidth' || key === 'toeWidth' || key === 'bellyWidth';
                            const minVal = isSlope ? -100 : 0;
                            const maxVal = isSlope ? 100 : (isSmall ? 2 : 20);
                            const stepVal = isSlope ? 1 : (isSmall ? 0.01 : 0.05);
                            const labelText = 
                                            key === 'width' ? (editingComponent.type === 'Sarjeta' && editingComponent.params.shape === 'Triangular' ? 'Largura (L1)' : editingComponent.type === 'New Jersey' ? 'Largura da Base' : 'Largura') :
                                            key === 'tipo' ? 'Tipo de Barreira' :
                                            key === 'topWidth' ? 'Largura do Topo' :
                                            key === 'toeHeight' ? 'Altura do Pé' :
                                            key === 'toeWidth' ? 'Recuo do Pé' :
                                            key === 'bellyHeight' ? 'Altura da Barriga' :
                                            key === 'bellyWidth' ? 'Recuo do Defletor' :
                                            key === 'desnivel' ? 'Desnível entre Pistas' :
                                            key === 'lastro' ? 'Altura do Lastro' :
                                            key === 'lastroWidth' ? 'Largura do Lastro' :
                                            key === 'benchWidth' ? 'Largura da Banqueta' :
                                            key === 'benchSlope' ? 'Declividade da Banqueta' :
                                            key === 'slope' ? 'Declividade' :
                                            key === 'cutSlope' ? 'Talude de Corte' :
                                            key === 'fillSlope' ? 'Talude de Aterro' :
                                            key === 'maxDrop' ? 'Desnível Máx' :
                                            key === 'depth' ? 'Profundidade' :
                                            key === 'height' ? 'Altura' :
                                            key === 'heightAbove' ? 'Altura Acima' :
                                            key === 'heightBelow' ? 'Altura Abaixo' :
                                            key === 'foundationDepth' ? 'Camada de Fundo' :
                                            key === 'bottomWidth' ? (editingComponent.type === 'Sarjeta' && editingComponent.params.shape === 'Triangular' ? 'Largura (L2)' : 'Base Inferior') :
                                            key === 'thickness' ? 'Espessura' : key === 'shape' ? 'Formato' : key;
                            
                            return (
                            <div key={key} className="flex gap-2 items-center bg-white p-2 border border-slate-200 rounded">
                                <span className="flex-1 text-xs font-medium text-slate-700">{labelText}</span>
                                
                                {key === 'tipo' ? (
                                    <select
                                        value={val}
                                        onChange={(e) => handleUpdateParam(editingComponent.id, key, e.target.value)}
                                        className="w-32 text-[10px] text-sky-700 font-medium bg-slate-100 px-1 py-1 rounded outline-none"
                                    >
                                        <option value="Simples">Simples — 0,38 m</option>
                                        <option value="Dupla">Dupla — 0,61 m</option>
                                        <option value="Dupla Desnível">Dupla em desnível</option>
                                    </select>
                                ) : key === 'shape' ? (
                                    <select
                                        value={val}
                                        onChange={(e) => handleUpdateParam(editingComponent.id, key, e.target.value)}
                                        className="w-24 text-[10px] text-sky-700 font-medium bg-slate-100 px-1 py-1 rounded outline-none"
                                    >
                                        <option value="Triangular">Triangular</option>
                                        <option value="Trapezoidal">Trapezoidal</option>
                                        <option value="Retangular">Retangular</option>
                                        <option value="Simples">Simples</option>
                                    </select>
                                ) : key.includes('corner') ? (
                                    <div className="flex flex-col gap-2 items-end">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-medium text-slate-500 uppercase">On/Off</span>
                                            <div 
                                                className="relative inline-flex items-center cursor-pointer"
                                                onClick={() => handleUpdateParam(editingComponent.id, key + 'On', editingComponent.params[key + 'On'] ? 0 : 1)}
                                            >
                                                <div className={`w-8 h-4 rounded-full transition-colors ${editingComponent.params[key + 'On'] ? 'bg-sky-500' : 'bg-slate-300'}`}>
                                                    <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${editingComponent.params[key + 'On'] ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                </div>
                                            </div>
                                        </div>
                                        {editingComponent.params[key + 'On'] ? (
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] text-slate-500">Raio</span>
                                                <div className="flex items-center gap-1 bg-slate-50 px-1 py-0.5 rounded border border-slate-100">
                                                    <input 
                                                        type="number" 
                                                        value={val}
                                                        onChange={(e) => handleUpdateParam(editingComponent.id, key, e.target.value === "" ? 0.01 : parseFloat(e.target.value))}
                                                        className="w-12 text-xs text-right bg-transparent border-none outline-none text-sky-600 font-mono"
                                                    />
                                                    <span className="text-[10px] text-slate-400">m</span>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 bg-slate-50 px-1 py-0.5 rounded border border-slate-100">
                                        <input 
                                            type="number"
                                            value={val}
                                            onChange={(e) => handleUpdateParam(editingComponent.id, key, e.target.value === "" ? 0 : parseFloat(e.target.value))}
                                            className="w-16 text-xs text-right bg-transparent border-none outline-none text-sky-600 font-mono"
                                        />
                                        <span className="text-[10px] text-slate-400">{key === 'slope' || key === 'benchSlope' ? '%' : (key.includes('Slope') ? ':1' : 'm')}</span>
                                    </div>
                                )}
                            </div>
                        )})}
                    </div>

                    <LayersEditor 
                        component={editingComponent} 
                        onChange={(newLayers) => handleUpdateLayers(editingComponent.id, newLayers)} 
                    />
                </div>
            </div>
        ) : (
            <div className="flex-1 flex flex-col min-h-0">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Plus size={16} className="text-emerald-500" />
                        Componentes
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-1 leading-tight">Arraste os blocos abaixo para a área central da seção tipo.</p>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 overflow-y-auto custom-scrollbar">
                    <SectionGlyphDefs />
                    {paletteItems.map((item) => (
                        <motion.div
                            key={item.type}
                            draggable
                            onDragStart={(e: any) => handleDragStart(e, item.type)}
                            onDragEnd={handleDragEnd}
                            whileHover={{ scale: 1.05, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            className={`${item.color} p-3 rounded-3xl shadow-lg cursor-grab active:cursor-grabbing flex flex-col items-center justify-center gap-2 transition-all hover:shadow-xl hover:bg-white/20 border-t border-l border-white/40`}
                        >
                            <div className="w-full h-12 rounded-xl bg-white/75 border border-white/70 shadow-inner flex items-center justify-center overflow-hidden">
                                <ComponentGlyph type={item.type} />
                            </div>
                            <span className="text-[10px] font-bold text-center leading-tight uppercase tracking-wide">{item.type}</span>
                        </motion.div>
                    ))}
                </div>
            </div>
        )}
      </div>

    </div>
  );
}

/* GLIFOS DOS COMPONENTES — cada figura é a SEÇÃO TRANSVERSAL real do elemento,
 * desenhada com os materiais que ele tem em obra (revestimento asfáltico, base
 * granular, concreto, terra, grama). Emoji não diz nada sobre geometria: aqui a
 * silhueta do New Jersey tem o perfil normativo, a guia tem a face batida, o
 * talude mostra a inclinação e a sarjeta a calha côncava. */
function SectionGlyphDefs() {
    return (
        <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
            <defs>
                <linearGradient id="glyphAsphalt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#57534e" />
                    <stop offset="1" stopColor="#292524" />
                </linearGradient>
                <linearGradient id="glyphConcrete" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f5f5f4" />
                    <stop offset="1" stopColor="#c7c3bd" />
                </linearGradient>
                <linearGradient id="glyphGrass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#65a30d" />
                    <stop offset="1" stopColor="#3f6212" />
                </linearGradient>
                <pattern id="glyphBase" width="3" height="3" patternUnits="userSpaceOnUse">
                    <rect width="3" height="3" fill="#a8a29e" />
                    <circle cx="0.9" cy="1" r="0.45" fill="#78716c" />
                    <circle cx="2.3" cy="2.3" r="0.35" fill="#78716c" />
                </pattern>
                <pattern id="glyphEarth" width="3.4" height="3.4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                    <rect width="3.4" height="3.4" fill="#c9a227" fillOpacity="0.35" />
                    <line x1="0" y1="0" x2="0" y2="3.4" stroke="#92702a" strokeWidth="0.7" />
                </pattern>
            </defs>
        </svg>
    );
}

function ComponentGlyph({ type }: { type: string }) {
    const ink = "#1c1917";
    const svg = (children: React.ReactNode) => (
        <svg viewBox="0 0 44 28" className="w-[86%] h-[86%]" preserveAspectRatio="xMidYMid meet">
            {children}
        </svg>
    );

    switch (type) {
        /* Revestimento sobre base, com abaulamento de 2% e sinalização. */
        case 'Pista':
            return svg(<>
                <polygon points="2,10.5 42,13 42,17 2,14.5" fill="url(#glyphAsphalt)" />
                <polygon points="2,14.5 42,17 42,21.5 2,19" fill="url(#glyphBase)" />
                <polygon points="2,19 42,21.5 42,25 2,22.5" fill="url(#glyphEarth)" />
                <polygon points="6,11 15,11.55 15,10.05 6,9.5" fill="#fafaf9" />
                <polygon points="24,12.1 33,12.65 33,11.15 24,10.6" fill="#fafaf9" />
                <line x1="2" y1="10.5" x2="42" y2="13" stroke={ink} strokeWidth="0.8" />
                <line x1="2" y1="14.5" x2="42" y2="17" stroke={ink} strokeWidth="0.45" opacity="0.7" />
            </>);

        /* Faixa de tráfego à esquerda, acostamento mais delgado e linha de bordo. */
        case 'Acostamento':
            return svg(<>
                <polygon points="2,10.5 16,11.4 16,15.4 2,14.5" fill="url(#glyphAsphalt)" opacity="0.95" />
                <polygon points="16,11.4 42,14.6 42,17.8 16,15.4" fill="url(#glyphAsphalt)" opacity="0.75" />
                <polygon points="2,14.5 42,17.8 42,22 2,19" fill="url(#glyphBase)" />
                <polygon points="2,19 42,22 42,25.5 2,22.5" fill="url(#glyphEarth)" />
                <polygon points="14.2,11.28 17.4,11.48 17.4,9.98 14.2,9.78" fill="#fafaf9" />
                <line x1="2" y1="10.5" x2="16" y2="11.4" stroke={ink} strokeWidth="0.8" />
                <line x1="16" y1="11.4" x2="42" y2="14.6" stroke={ink} strokeWidth="0.8" />
                <line x1="16" y1="11.4" x2="16" y2="15.4" stroke={ink} strokeWidth="0.5" opacity="0.6" />
            </>);

        /* Zebrado pintado sobre o pavimento. */
        case 'Faixa de Segurança':
            return svg(<>
                <defs>
                    <clipPath id="glyphClipFS">
                        <polygon points="2,10.5 42,13 42,17 2,14.5" />
                    </clipPath>
                </defs>
                <polygon points="2,10.5 42,13 42,17 2,14.5" fill="url(#glyphAsphalt)" />
                <g clipPath="url(#glyphClipFS)">
                    {[4, 11, 18, 25, 32, 39].map((x) => (
                        <polygon key={x} points={`${x},9 ${x + 3.4},9 ${x - 1.6},19 ${x - 5},19`} fill="#facc15" opacity="0.95" />
                    ))}
                </g>
                <polygon points="2,14.5 42,17 42,21 2,18.5" fill="url(#glyphBase)" />
                <polygon points="2,10.5 42,13 42,17 2,14.5" fill="none" stroke={ink} strokeWidth="0.8" />
            </>);

        /* Canteiro gramado entre duas guias, com arbusto. */
        case 'Canteiro Central':
            return svg(<>
                <polygon points="0,13 7,13.4 7,17.5 0,17.1" fill="url(#glyphAsphalt)" />
                <polygon points="37,13.4 44,13 44,17.1 37,17.5" fill="url(#glyphAsphalt)" />
                <polygon points="7,10.6 37,10.6 37,22 7,22" fill="url(#glyphEarth)" />
                <path d="M7 10.6 Q22 8.4 37 10.6 L37 13.2 Q22 11 7 13.2 Z" fill="url(#glyphGrass)" />
                <polygon points="7,9.6 10,9.6 10,17.5 7,17.5" fill="url(#glyphConcrete)" stroke={ink} strokeWidth="0.6" />
                <polygon points="34,9.6 37,9.6 37,17.5 34,17.5" fill="url(#glyphConcrete)" stroke={ink} strokeWidth="0.6" />
                <rect x="21.4" y="6" width="1.2" height="4.2" fill="#78350f" />
                <circle cx="22" cy="5" r="3.6" fill="#166534" />
                <circle cx="19.3" cy="6.4" r="2.5" fill="#15803d" />
                <circle cx="24.7" cy="6.4" r="2.5" fill="#15803d" />
            </>);

        /* Refúgio: ilha pavimentada e elevada, com zebrado e guias. */
        case 'Refúgio':
            return svg(<>
                <defs>
                    <clipPath id="glyphClipRef">
                        <polygon points="9,10.4 35,10.4 35,13.4 9,13.4" />
                    </clipPath>
                </defs>
                <polygon points="0,13.2 7,13.6 7,17.6 0,17.2" fill="url(#glyphAsphalt)" />
                <polygon points="37,13.6 44,13.2 44,17.2 37,17.6" fill="url(#glyphAsphalt)" />
                <polygon points="9,13.4 35,13.4 35,21.5 9,21.5" fill="url(#glyphBase)" />
                <polygon points="9,10.4 35,10.4 35,13.4 9,13.4" fill="#e7e5e4" />
                <g clipPath="url(#glyphClipRef)">
                    {[10, 16, 22, 28, 34].map((x) => (
                        <polygon key={x} points={`${x},9.6 ${x + 2.6},9.6 ${x - 1.4},14.4 ${x - 4},14.4`} fill="#f59e0b" opacity="0.9" />
                    ))}
                </g>
                <polygon points="7,9.4 10,10.4 10,17.6 7,17.6" fill="url(#glyphConcrete)" stroke={ink} strokeWidth="0.6" />
                <polygon points="34,10.4 37,9.4 37,17.6 34,17.6" fill="url(#glyphConcrete)" stroke={ink} strokeWidth="0.6" />
                <line x1="9" y1="10.4" x2="35" y2="10.4" stroke={ink} strokeWidth="0.6" />
            </>);

        /* Meio-fio de concreto com face batida. */
        case 'Guia':
            return svg(<>
                <polygon points="2,15.5 20,15.5 20,19.5 2,19.5" fill="url(#glyphAsphalt)" />
                <polygon points="2,19.5 42,19.5 42,24.5 2,24.5" fill="url(#glyphBase)" />
                <polygon points="24,11.5 42,11.5 42,19.5 24,19.5" fill="url(#glyphEarth)" />
                <path d="M24 11.5 Q33 10.6 42 11.5 L42 13.4 Q33 12.5 24 13.4 Z" fill="url(#glyphGrass)" />
                <polygon points="20,11 24,11 24,21 20,21" fill="url(#glyphConcrete)" />
                <polygon points="20,11 24,11 24,21 20,21" fill="none" stroke={ink} strokeWidth="0.75" />
                <line x1="20" y1="12.6" x2="24" y2="12.6" stroke={ink} strokeWidth="0.35" opacity="0.5" />
                <line x1="2" y1="15.5" x2="20" y2="15.5" stroke={ink} strokeWidth="0.7" />
            </>);

        /* Sarjeta: calha côncava de concreto junto à guia. */
        case 'Sarjeta':
            return svg(<>
                <polygon points="2,12 16,12.8 16,17 2,16.2" fill="url(#glyphAsphalt)" />
                <path d="M16 12.8 Q26 20.6 34 12.2 L34 22 L16 22 Z" fill="url(#glyphConcrete)" />
                <path d="M16 12.8 Q26 20.6 34 12.2" fill="none" stroke={ink} strokeWidth="0.8" />
                <path d="M20.5 16.4 Q26 20.9 29.6 16.1 Q26 18.4 20.5 16.4 Z" fill="#38bdf8" opacity="0.85" />
                <polygon points="34,10 38,10 38,22 34,22" fill="url(#glyphConcrete)" stroke={ink} strokeWidth="0.75" />
                <polygon points="2,16.2 38,22 38,25.5 2,19.5" fill="url(#glyphBase)" opacity="0.9" />
                <line x1="2" y1="12" x2="16" y2="12.8" stroke={ink} strokeWidth="0.7" />
            </>);

        /* Talude de aterro 1:1,5 até o terreno natural. */
        case 'Talude':
            return svg(<>
                <polygon points="2,9 14,9.6 14,13.4 2,12.8" fill="url(#glyphAsphalt)" />
                <polygon points="2,12.8 14,13.4 32,23 2,23" fill="url(#glyphEarth)" />
                <path d="M14 13.4 Q23 17.6 32 23" fill="none" stroke="#4d7c0f" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="14" y1="13.4" x2="32" y2="23" stroke={ink} strokeWidth="0.8" />
                <path d="M0 23 Q12 22.4 22 23.2 T44 22.6" fill="none" stroke="#57534e" strokeWidth="0.9" strokeDasharray="3 2" />
                <line x1="2" y1="9" x2="14" y2="9.6" stroke={ink} strokeWidth="0.7" />
                <g stroke="#78716c" strokeWidth="0.5">
                    <line x1="22" y1="18.3" x2="31" y2="18.3" />
                    <line x1="31" y1="18.3" x2="31" y2="22.6" />
                </g>
                <text x="33" y="19.2" fontSize="4.2" fill="#57534e" fontFamily="monospace">1,5</text>
            </>);

        /* Passeio de concreto com juntas, sobre lastro, atrás da guia. */
        case 'Passeio':
            return svg(<>
                <polygon points="2,15 10,15 10,19 2,19" fill="url(#glyphAsphalt)" />
                <polygon points="10,10.5 14,10.5 14,19 10,19" fill="url(#glyphConcrete)" stroke={ink} strokeWidth="0.7" />
                <polygon points="14,10.5 42,11.9 42,14.6 14,13.2" fill="url(#glyphConcrete)" />
                <polygon points="14,13.2 42,14.6 42,18.4 14,17" fill="url(#glyphBase)" />
                <polygon points="14,17 42,18.4 42,22.4 14,21" fill="url(#glyphEarth)" />
                <line x1="14" y1="10.5" x2="42" y2="11.9" stroke={ink} strokeWidth="0.8" />
                <g stroke={ink} strokeWidth="0.45" opacity="0.55">
                    <line x1="23" y1="10.95" x2="23" y2="13.65" />
                    <line x1="32" y1="11.4" x2="32" y2="14.1" />
                </g>
                <g fill="#a8a29e">
                    {[17, 19, 21].map((x) => <circle key={x} cx={x} cy={10.2 + (x - 14) * 0.05} r="0.55" />)}
                </g>
            </>);

        /* Barreira New Jersey — perfil normativo vindo de lib/newJersey (dupla,
           0,61 m de base), com pé, defletor, barriga e pescoço. */
        case 'New Jersey': {
            const g = njPolygon({ tipo: 'Dupla', lastro: 0 }, 1);
            const esc = 17 / g.prof.height;
            const x0 = 22 - (g.prof.base * esc) / 2;
            const y0 = 22;
            const pontos = g.prof.pts.map(q => `${(x0 + q.x * esc).toFixed(2)},${(y0 - q.y * esc).toFixed(2)}`).join(' ');
            return svg(<>
                <polygon points="1,22 43,22 43,26 1,26" fill="url(#glyphAsphalt)" />
                <polygon points={pontos} fill="url(#glyphConcrete)" />
                <polygon points={pontos} fill="none" stroke={ink} strokeWidth="0.85" strokeLinejoin="round" />
                <line x1={x0 + 0.3} y1={y0 - 17 * 0.14} x2={x0 + g.prof.base * esc - 0.3} y2={y0 - 17 * 0.14} stroke={ink} strokeWidth="0.3" opacity="0.35" />
                <line x1="1" y1="22" x2="43" y2="22" stroke={ink} strokeWidth="0.7" />
            </>);
        }

        default:
            return svg(<rect x="6" y="11" width="32" height="6" rx="1" fill="url(#glyphConcrete)" stroke={ink} strokeWidth="0.7" />);
    }
}

function ComponentBlock({ comp, onRemove, onClick, yOffsetPx, onDragEnd, isSelected, index }: { comp: SubassemblyComponent, onRemove: () => void, onClick: () => void, yOffsetPx: number, onDragEnd: (e: any, info: any) => void, isSelected?: boolean, index?: number }) {
    const isLeft = comp.side === 'Left';
    const movedRef = useRef(false);
    
    const visualWidth = getVisualWidthPx(comp);

    let blockContent = null;

    switch(comp.type) {
        case 'Refúgio':
        case 'Pista': {
            const isRefúgio = comp.type === 'Refúgio';
            const widthStr = (comp.params.width ?? (isRefúgio ? 1.5 : 3.6)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const slopeVal = comp.params.slope || (isRefúgio ? -5 : -2);
            const slopeStr = slopeVal.toFixed(2) + '%';
            const skewDeg = Math.atan(Math.abs(slopeVal) / 100) * (180 / Math.PI);
            const skewStyle = isLeft ? (slopeVal < 0 ? -skewDeg : skewDeg) : (slopeVal < 0 ? skewDeg : -skewDeg);

            blockContent = (
                <div className="flex flex-col w-full relative group-hover:brightness-110 transition-all font-mono text-[8px] tracking-tighter z-10">
                    {/* Dimension Line Top */}
                    <div className="absolute bottom-full left-0 right-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
                         <div className="text-slate-500 font-bold leading-none whitespace-nowrap text-[10px] uppercase">{isRefúgio ? 'REFÚGIO' : (isLeft ? 'FAIXA ESQ' : 'FAIXA DIR')}</div>
                         <div className="text-slate-600 font-bold leading-none mt-1 text-[10px] ">{widthStr}</div>
                         <div className="w-full h-[1px] bg-slate-400 relative my-1.5">
                             <div className="absolute left-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                             <div className="absolute right-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                         </div>
                         <div className="text-slate-800 text-[11px] font-bold  leading-none">
                             {slopeStr}
                         </div>
                    </div>

                                        {/* Layers Container */}
                    <div className="w-full flex flex-col border-l border-r border-slate-400/80 relative" style={{ transform: `skewY(${skewStyle}deg)`, transformOrigin: isLeft ? 'top right' : 'top left' }}>
                                                
{(comp.layers || {
                            revestimento: [{ id: 'rev-1', name: 'Revestimento', thickness: 0.05 }],
                            base: [{ id: 'base-1', name: 'Base', thickness: 0.15 }],
                            subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }],
                            cftCorte: 0.2,
                            cftAterro: 0.2,
                            limpeza: 0.2
                        }).revestimento.map((layer: any, i: number) => (
                            <div key={layer.id} className="w-full bg-slate-300 border-b border-slate-400 flex items-center justify-between px-1 relative" style={{ height: layer.thickness * 100 + 'px' }}>
                                {comp.type === 'Acostamento' && i === 0 && <div className={`absolute top-0 ${isLeft ? 'right-0' : 'left-0'} w-1 h-full bg-yellow-400/80 z-20`}></div>}
                                <span className="text-black font-bold z-10 bg-white/80 px-0.5 rounded leading-none text-[6px]">{layer.thickness.toFixed(3)}</span>
                                <span className="text-slate-600 font-bold scale-75 whitespace-nowrap origin-right truncate pl-2">{layer.name}</span>
                            </div>
                        ))}
                        {(comp.layers || {
                            revestimento: [],
                            base: [{ id: 'base-1', name: 'Base', thickness: 0.15 }],
                            subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }],
                            cftCorte: 0.2,
                            cftAterro: 0.2,
                            limpeza: 0.2
                        }).base.map((layer: any) => (
                            <div key={layer.id} className="w-full bg-zinc-600 border-b border-slate-400 flex items-center justify-between px-1 relative overflow-hidden" style={{ height: layer.thickness * 100 + 'px' }}>
                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 3px)' }}></div>
                                <span className="text-white font-bold z-10 bg-zinc-800/80 px-0.5 rounded leading-none text-[7px]">{layer.thickness.toFixed(3)}</span>
                                <span className="text-yellow-300 font-bold scale-75 whitespace-nowrap origin-right z-10 truncate pl-2">{layer.name}</span>
                            </div>
                        ))}
                        {(comp.layers || {
                            revestimento: [], base: [],
                            subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }],
                            cftCorte: 0.2,
                            cftAterro: 0.2,
                            limpeza: 0.2
                        }).subBase.map((layer: any) => (
                            <div key={layer.id} className="w-full bg-slate-700 border-b border-slate-400 flex items-center justify-between px-1 relative overflow-hidden" style={{ height: layer.thickness * 100 + 'px' }}>
                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(60deg, #111 25%, transparent 25%, transparent 75%, #111 75%, #111), linear-gradient(120deg, #111 25%, transparent 25%, transparent 75%, #111 75%, #111)', backgroundSize: '8px 14px' }}></div>
                                <span className="text-white font-bold z-10 bg-slate-900/80 px-0.5 rounded leading-none text-[7px]">{layer.thickness.toFixed(3)}</span>
                                <span className="text-yellow-300 font-bold scale-75 whitespace-nowrap origin-right z-10 truncate pl-2">{layer.name}</span>
                            </div>
                        ))}
                    </div><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 text-white text-lg font-bold pointer-events-none backdrop-blur-sm rounded-sm z-30">{isRefúgio ? 'REFÚGIO' : 'PISTA'}</div>
                </div>
            );
            break;
        }
        case 'Acostamento': {
            const slopeVal = comp.params.slope || -5;
            const slopeStr = slopeVal.toFixed(2) + '%';
            const skewDeg = Math.atan(Math.abs(slopeVal) / 100) * (180 / Math.PI);
            const skewStyle = isLeft ? (slopeVal < 0 ? -skewDeg : skewDeg) : (slopeVal < 0 ? skewDeg : -skewDeg);
            const widthStr = (comp.params.width ?? 2.5).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            blockContent = (
                <div className="flex flex-col w-full relative group-hover:brightness-110 transition-all font-mono text-[8px]">
                    
                    <div className="absolute bottom-full left-0 right-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
                         <div className="text-slate-600 font-bold leading-none whitespace-nowrap text-[9px] ">ACOST.</div>
                         <div className="text-slate-700 font-bold leading-none mt-1 text-[9px] ">{widthStr}</div>
                         <div className="w-full h-[1px] bg-slate-400 relative my-1.5">
                             <div className="absolute left-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                             <div className="absolute right-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                         </div>
                         <div className="text-slate-600 text-[10px] font-bold z-20  leading-none">
                             {slopeStr}
                         </div>
                    </div>

                                        {/* Layers Container */}
                    <div className="w-full flex flex-col border-l border-r border-slate-400/80 relative" style={{ transform: `skewY(${skewStyle}deg)`, transformOrigin: isLeft ? 'top right' : 'top left' }}>
                                                
{(comp.layers || {
                            revestimento: [{ id: 'rev-1', name: 'Revestimento', thickness: 0.05 }],
                            base: [{ id: 'base-1', name: 'Base', thickness: 0.15 }],
                            subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }],
                            cftCorte: 0.2,
                            cftAterro: 0.2,
                            limpeza: 0.2
                        }).revestimento.map((layer: any, i: number) => (
                            <div key={layer.id} className="w-full bg-slate-300 border-b border-slate-400 flex items-center justify-between px-1 relative" style={{ height: layer.thickness * 100 + 'px' }}>
                                {comp.type === 'Acostamento' && i === 0 && <div className={`absolute top-0 ${isLeft ? 'right-0' : 'left-0'} w-1 h-full bg-yellow-400/80 z-20`}></div>}
                                <span className="text-black font-bold z-10 bg-white/80 px-0.5 rounded leading-none text-[6px]">{layer.thickness.toFixed(3)}</span>
                                <span className="text-slate-600 font-bold scale-75 whitespace-nowrap origin-right truncate pl-2">{layer.name}</span>
                            </div>
                        ))}
                        {(comp.layers || {
                            revestimento: [],
                            base: [{ id: 'base-1', name: 'Base', thickness: 0.15 }],
                            subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }],
                            cftCorte: 0.2,
                            cftAterro: 0.2,
                            limpeza: 0.2
                        }).base.map((layer: any) => (
                            <div key={layer.id} className="w-full bg-zinc-600 border-b border-slate-400 flex items-center justify-between px-1 relative overflow-hidden" style={{ height: layer.thickness * 100 + 'px' }}>
                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 3px)' }}></div>
                                <span className="text-white font-bold z-10 bg-zinc-800/80 px-0.5 rounded leading-none text-[7px]">{layer.thickness.toFixed(3)}</span>
                                <span className="text-yellow-300 font-bold scale-75 whitespace-nowrap origin-right z-10 truncate pl-2">{layer.name}</span>
                            </div>
                        ))}
                        {(comp.layers || {
                            revestimento: [], base: [],
                            subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }],
                            cftCorte: 0.2,
                            cftAterro: 0.2,
                            limpeza: 0.2
                        }).subBase.map((layer: any) => (
                            <div key={layer.id} className="w-full bg-slate-700 border-b border-slate-400 flex items-center justify-between px-1 relative overflow-hidden" style={{ height: layer.thickness * 100 + 'px' }}>
                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(60deg, #111 25%, transparent 25%, transparent 75%, #111 75%, #111), linear-gradient(120deg, #111 25%, transparent 25%, transparent 75%, #111 75%, #111)', backgroundSize: '8px 14px' }}></div>
                                <span className="text-white font-bold z-10 bg-slate-900/80 px-0.5 rounded leading-none text-[7px]">{layer.thickness.toFixed(3)}</span>
                                <span className="text-yellow-300 font-bold scale-75 whitespace-nowrap origin-right z-10 truncate pl-2">{layer.name}</span>
                            </div>
                        ))}
                    </div><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 text-white text-lg font-bold pointer-events-none backdrop-blur-sm rounded-sm z-30">ACOST.</div>
                </div>
            );
            break;
        }
        case 'Guia': {
            const widthStr = (comp.params.width ?? 0.15).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const heightAbove = comp.params.heightAbove ?? 0.15;
            const heightBelow = comp.params.heightBelow ?? 0.30;
            const fund = comp.params.foundationDepth || 0;
            const totalHeight = heightAbove + heightBelow + fund;
            const blockHeight = heightAbove + heightBelow;
            blockContent = (
                <div className="flex w-full relative group-hover:brightness-110 transition-all font-mono text-[8px] tracking-tighter z-10" style={{ height: `${totalHeight * 100}px` }}>
                    {/* Dimension Line Top */}
                    <div className="absolute bottom-full left-0 right-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
                         <div className="text-slate-500 font-bold leading-none whitespace-nowrap text-[10px] ">GUIA</div>
                         <div className="text-slate-700 font-bold leading-none mt-1 text-[9px] ">{widthStr}</div>
                         <div className="w-full h-[1px] bg-slate-400 relative my-1.5">
                             <div className="absolute left-0 -top-[5px] w-[1px] h-[1px] bg-slate-400 transform rotate-45"></div>
                             <div className="absolute right-0 -top-[5px] w-[1px] h-[1px] bg-slate-400 transform rotate-45"></div>
                         </div>
                    </div>
                    
                    {/* Block */}
                    <div className="w-full h-full flex flex-col">
                        <div 
                            className="w-full border border-slate-500 bg-slate-200 relative flex items-center justify-center z-20"
                            style={{
                                flex: (heightAbove + heightBelow) / totalHeight,
                                borderTopLeftRadius: 0,
                                borderTopRightRadius: 0
                            }}
                        >
                            <span className="font-bold text-slate-400 rotate-90 whitespace-nowrap">GUIA</span>
                        
                        
                        </div>
                        {fund > 0 && (
                            <div className="w-full border border-t-0 border-slate-600 bg-zinc-600 relative flex items-center justify-center overflow-hidden z-10" style={{ flex: fund / totalHeight }}>
                                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 3px)' }}></div>
                            </div>
                        )}
                    </div>
                </div>
            );
            break;
        }

case 'Sarjeta': {
            const shape = comp.params.shape || 'Triangular';
            const widthStr = (comp.params.width ?? 1).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const slopeVal = comp.params.slope || 0;
            const slopeStr = slopeVal !== 0 ? (slopeVal.toFixed(2) + '%') : '';
            
            const skewDeg = Math.atan(Math.abs(slopeVal) / 100) * (180 / Math.PI);
            const skewStyle = isLeft ? (slopeVal < 0 ? -skewDeg : skewDeg) : (slopeVal < 0 ? skewDeg : -skewDeg);
            
            let shapeVisual = null;
            if (shape === 'Triangular') {
                const w1 = comp.params.width ?? 1.0;
                const w2 = comp.params.bottomWidth ?? 0.3;
                const H = comp.params.depth ?? 0.25;
                const T = comp.params.thickness ?? 0.10;
                const fund = comp.params.foundationDepth || 0;
                
                const W_px = (w1 + w2) * 100;
                const H_px = H * 100;
                const T_px = T * 100;
                const fund_px = fund * 100;
                const w1_px = w1 * 100;
                const w2_px = w2 * 100;
                
                // For Left side, outer is x=0, inner is x=W_px.
                // Normally L2 is next to curb (outer), L1 is next to road (inner).
                // But flex-row-reverse flips it visually? No, in Reorder.Group it's rendered left-to-right but flex-row-reverse makes the DOM layout reversed.
                // Oh wait, if the container is flex-row-reverse, the first child is on the right.
                // The drawing itself is just drawing inside a div. The div has width=W_px.
                // For a Left side component, x=0 is the left edge (outer), x=W_px is the right edge (inner).
                // The deep point is between L1 and L2.
                // Let's assume L2 is outer and L1 is inner.
                // So deep point is at x = w2_px for left side.
                // For right side, outer is x=W_px, inner is x=0. So L2 is outer, deep point is at x = w1_px.
                const deep_x = isLeft ? w2_px : w1_px;
                const dx1 = Math.max(0.001, deep_x);
                const dx2 = Math.max(0.001, W_px - deep_x);
                
                const L1 = Math.sqrt(dx1 * dx1 + H_px * H_px);
                const L2 = Math.sqrt(dx2 * dx2 + H_px * H_px);
                
                const A_y = T_px * L1 / dx1;
                const C_y = T_px * L2 / dx2;
                
                const B_y = H_px + T_px * (L1 + L2) / W_px;
                const B_x = deep_x + (H_px > 0 ? (T_px / H_px) * ((L1 + L2) * deep_x / W_px - L1) : 0);
                
                const svgH = Math.max(25, B_y); 
                
                const pts = `0,0 ${deep_x},${H_px} ${W_px},0 ${W_px},${C_y} ${B_x},${B_y} 0,${A_y}`;
                
                shapeVisual = (
                    <div className="w-full flex-shrink-0 flex flex-col justify-start">
                         <div className="relative overflow-visible" style={{ width: `${W_px}px`, height: `${svgH}px` }}>
                             <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${W_px} ${svgH}`} className="absolute inset-0 overflow-visible">
                                 <polygon points={pts} fill="#d6d3d1" stroke="#78716c" strokeWidth="2" strokeLinejoin="round" />
                             </svg>
                         </div>
                         {fund > 0 && (
                             <div 
                                 className="w-full border-x border-b border-slate-600 bg-slate-600/80 relative flex items-center justify-center overflow-hidden z-10"
                                 style={{ height: `${fund_px}px` }}
                             >
                                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 4px)' }}></div>
                             </div>
                         )}
                    </div>
                );
            } else if (shape === 'Trapezoidal') {
                const w = comp.params.width ?? 0.8;
                const bw = comp.params.bottomWidth ?? 0.4;
                const sideWidth = comp.params.cornerRadii ?? 0.2; // just an approximation for w3
                const W = w + bw + sideWidth;
                const H = comp.params.depth ?? 0.25;
                const T = comp.params.thickness ?? 0.10;
                const fund = comp.params.foundationDepth || 0;
                
                const W_px = W * 100;
                const H_px = H * 100;
                const T_px = T * 100;
                const fund_px = fund * 100;
                
                const x1 = ((W - bw)/2) * 100;
                const x2 = x1 + (bw * 100);
                
                const dx1 = Math.max(0.001, x1);
                const dx2 = Math.max(0.001, W_px - x2);
                
                const L1 = Math.sqrt(dx1 * dx1 + H_px * H_px);
                const L2 = Math.sqrt(dx2 * dx2 + H_px * H_px);
                
                const A_y = T_px * L1 / dx1;
                const D_y = T_px * L2 / dx2;
                
                const B_x = x1 + (H_px > 0 ? (T_px / H_px) * (dx1 - L1) : 0);
                const C_x = x2 + (H_px > 0 ? (T_px / H_px) * (L2 - dx2) : 0);
                const BC_y = H_px + T_px;
                const svgH = Math.max(25, Math.max(A_y, D_y, BC_y));
                
                const pts = `0,0 ${x1},${H_px} ${x2},${H_px} ${W_px},0 ${W_px},${D_y} ${C_x},${BC_y} ${B_x},${BC_y} 0,${A_y}`;
                
                shapeVisual = (
                    <div className="w-full flex-shrink-0 flex flex-col justify-start">
                         <div className="relative overflow-visible" style={{ width: `${W_px}px`, height: `${svgH}px` }}>
                             <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${W_px} ${svgH}`} className="absolute inset-0 overflow-visible">
                                 <polygon points={pts} fill="#d6d3d1" stroke="#78716c" strokeWidth="2" strokeLinejoin="round" />
                             </svg>
                         </div>
                         {fund > 0 && (
                             <div 
                                 className="w-full border-x border-b border-slate-600 bg-slate-600/80 relative flex items-center justify-center overflow-hidden z-10"
                                 style={{ height: `${fund_px}px` }}
                             >
                                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 4px)' }}></div>
                             </div>
                         )}
                    </div>
                );
            } else if (shape === 'Simples') {
                const W = comp.params.width ?? 1.0;
                const T = comp.params.thickness ?? 0.10;
                const fund = comp.params.foundationDepth || 0;
                
                const W_px = W * 100;
                const T_px = T * 100;
                const fund_px = fund * 100;
                
                const dy = (slopeVal / 100) * W_px; // slope determines height difference
                
                // For Left Side, outer is left (x=0), inner is right (x=W_px).
                // If slope is negative (-5%), outer is lower than inner.
                // In SVG, larger Y is lower.
                let leftY = 0;
                let rightY = 0;
                
                if (isLeft) {
                    if (slopeVal < 0) leftY = -dy; // e.g. -(-5) = 5
                    else rightY = dy;
                } else {
                    if (slopeVal < 0) rightY = -dy;
                    else leftY = dy;
                }
                
                const dy_simples = Math.abs(rightY - leftY);
                const L_simples = Math.sqrt(W_px * W_px + dy_simples * dy_simples);
                const eff_T_px = T_px * L_simples / W_px;
                
                const ptsThickness = `0,${leftY} ${W_px},${rightY} ${W_px},${rightY + eff_T_px} 0,${leftY + eff_T_px}`;
                const ptsFund = `0,${leftY + eff_T_px} ${W_px},${rightY + eff_T_px} ${W_px},${rightY + eff_T_px + fund_px} 0,${leftY + eff_T_px + fund_px}`;
                const maxH = Math.max(leftY, rightY) + eff_T_px + fund_px;

                shapeVisual = (
                    <div className="w-full flex-shrink-0 flex flex-col justify-start">
                         <div className="relative overflow-visible" style={{ width: `${W_px}px`, height: `${maxH}px` }}>
                             <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${W_px} ${maxH}`} className="absolute inset-0 overflow-visible">
                                 {fund > 0 && (
                                     <polygon points={ptsFund} fill="#0284c7" stroke="#0369a1" strokeWidth="2" strokeLinejoin="round" />
                                 )}
                                 <polygon points={ptsThickness} fill="#d6d3d1" stroke="#78716c" strokeWidth="2" strokeLinejoin="round" />
                             </svg>
                         </div>
                    </div>
                );
            } else { // Retangular
                const w = comp.params.width ?? 0.6;
                const H = comp.params.depth ?? 0.25;
                const T = comp.params.thickness ?? 0.10;
                const fund = comp.params.foundationDepth || 0;
                
                const W_px = w * 100;
                const H_px = H * 100;
                const T_px = T * 100;
                const fund_px = fund * 100;
                
                // U shape: inner gap. But usually rectangular sarjeta is a U channel? Or a flat box?
                // The old code drew a U shape: `0,0 ${x2},0 ${x2},60 ${x3},60 ${x3},0 100,0 100,100 0,100`
                // Let's assume the side walls are thickness T and bottom is thickness T.
                // Inner width: W_px - 2*T_px
                // Inner height: H_px
                const pts = `0,0 ${T_px},0 ${T_px},${H_px} ${W_px - T_px},${H_px} ${W_px - T_px},0 ${W_px},0 ${W_px},${H_px + T_px} 0,${H_px + T_px}`;
                
                shapeVisual = (
                    <div className="w-full flex-shrink-0 flex flex-col justify-start">
                         <div className="relative overflow-visible" style={{ width: `${W_px}px`, height: `${H_px + T_px}px` }}>
                             <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 ${W_px} ${H_px + T_px}`} className="absolute inset-0 overflow-visible">
                                 <polygon points={pts} fill="#d6d3d1" stroke="#78716c" strokeWidth="2" strokeLinejoin="round" />
                             </svg>
                         </div>
                         {fund > 0 && (
                             <div 
                                 className="w-full border-x border-b border-slate-600 bg-slate-600/80 relative flex items-center justify-center overflow-hidden z-10"
                                 style={{ height: `${fund_px}px` }}
                             >
                                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 4px)' }}></div>
                             </div>
                         )}
                    </div>
                );
            }

            blockContent = (
                <div className="flex flex-col w-full relative group-hover:brightness-110 transition-all font-mono text-[8px] tracking-tighter z-10" style={{ minHeight: '40px' }}>
                    <div className="absolute bottom-full left-0 right-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
                         <div className="text-slate-500 font-bold leading-none whitespace-nowrap text-[10px]  uppercase mb-1">SARJETA {shape}</div>
                         {shape === 'Triangular' && (
                             <div className="w-full flex flex-col items-center mb-1 px-1">
                                 <div className="text-slate-500 font-bold leading-none text-[7px] ">LT: {((comp.params.width ?? 1) + (comp.params.bottomWidth ?? 0.3)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                 <div className="w-full h-[1px] bg-slate-300 relative mt-0.5">
                                     <div className="absolute left-0 -top-[3px] w-[1px] h-[7px] bg-slate-300 transform rotate-45"></div>
                                     <div className="absolute right-0 -top-[3px] w-[1px] h-[7px] bg-slate-300 transform rotate-45"></div>
                                 </div>
                             </div>
                         )}
                         <div className="flex w-full items-end">
                             {shape === 'Triangular' && isLeft && (
                                 <div className="flex flex-col items-center justify-center" style={{ flex: comp.params.bottomWidth ?? 0.3 }}>
                                     <div className="text-slate-700 font-bold leading-none mt-1 text-[8px] ">L2: {(comp.params.bottomWidth ?? 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                 </div>
                             )}
                             <div className="flex flex-col items-center justify-center" style={{ flex: comp.params.width ?? 1 }}>
                                 <div className="text-slate-700 font-bold leading-none mt-1 text-[9px] ">{shape === 'Triangular' ? 'L1: ' : ''}{widthStr}</div>
                             </div>
                             {shape === 'Triangular' && !isLeft && (
                                 <div className="flex flex-col items-center justify-center" style={{ flex: comp.params.bottomWidth ?? 0.3 }}>
                                     <div className="text-slate-700 font-bold leading-none mt-1 text-[8px] ">L2: {(comp.params.bottomWidth ?? 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                 </div>
                             )}
                         </div>
                         <div className="w-full h-[1px] bg-slate-400 relative my-1.5">
                             <div className="absolute left-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                             {shape === 'Triangular' && (
                                 <div className="absolute -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45" style={{ left: isLeft ? `${(comp.params.bottomWidth ?? 0.3) / ((comp.params.width ?? 1) + (comp.params.bottomWidth ?? 0.3)) * 100}%` : `${(comp.params.width ?? 1) / ((comp.params.width ?? 1) + (comp.params.bottomWidth ?? 0.3)) * 100}%` }}></div>
                             )}
                             <div className="absolute right-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                         </div>
                         <div className="flex w-full justify-around items-start mt-1">
                             {shape === 'Triangular' ? (
                                 <div className="text-slate-800 text-[10px] font-bold  leading-none">H: {(comp.params.depth ?? 0.25).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                             ) : (
                                 slopeStr && <div className="text-slate-800 text-[11px] font-bold  leading-none">{slopeStr}</div>
                             )}
                         </div>
                    </div>
                    
                    <div className="w-full h-full flex flex-col items-center justify-start relative pt-[1px]">
                        {shapeVisual}
                    </div>
                </div>
            );
            break;
        }
        case 'Talude': {
            const cutSlope = (comp.params.cutSlope ?? 1.5).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
            const fillSlope = (comp.params.fillSlope ?? 1.5).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
            
            blockContent = (
                <div className="flex flex-col w-full relative group-hover:brightness-110 transition-all font-mono text-[8px] tracking-tighter z-10" style={{ minHeight: '60px', alignItems: isLeft ? 'flex-end' : 'flex-start' }}>
                    
                    <div className="absolute top-0 flex flex-col pb-2 pointer-events-none" style={{ [isLeft ? 'right' : 'left']: '0', alignItems: isLeft ? 'flex-end' : 'flex-start', transform: 'translateY(-100%)' }}>
                         <div className="text-slate-500 font-bold leading-none whitespace-nowrap text-[10px]  uppercase mb-1">TALUDE</div>
                    </div>
                    
                    <div className="relative w-full h-[60px] flex-shrink-0">
                         <svg width="100%" height="100%" viewBox="0 0 128 60" style={{ overflow: 'visible' }}>
                             {isLeft ? (
                                <>
                                  {/* Cut (Up-Left) */}
                                  <path d="M 128,0 L 88,-20 L 78,-18 L 38,-38" fill="none" stroke="#000" strokeWidth="1.5" />
                                  <path d="M 88,-20 L 88,-30 L 68,-30" fill="none" stroke="#000" strokeWidth="1" />
                                  <text x="93" y="-25" fontSize="10" fontWeight="bold" textAnchor="start" dominantBaseline="middle" fill="#1e293b">1,0</text>
                                  <text x="78" y="-35" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="auto" fill="#1e293b">{cutSlope}</text>
                                  
                                  {/* Fill (Down-Left) */}
                                  <path d="M 128,0 L 88,20 L 78,22 L 38,42" fill="none" stroke="#000" strokeWidth="1.5" strokeDasharray="4 4" />
                                  <path d="M 98,15 L 98,25 L 78,25" fill="none" stroke="#000" strokeWidth="1" />
                                  <text x="103" y="20" fontSize="10" fontWeight="bold" textAnchor="start" dominantBaseline="middle" fill="#1e293b">1,0</text>
                                  <text x="88" y="32" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="hanging" fill="#1e293b">{fillSlope}</text>
                                </>
                             ) : (
                                <>
                                  {/* Cut (Up-Right) */}
                                  <path d="M 0,0 L 40,-20 L 50,-18 L 90,-38" fill="none" stroke="#000" strokeWidth="1.5" />
                                  <path d="M 40,-20 L 40,-30 L 60,-30" fill="none" stroke="#000" strokeWidth="1" />
                                  <text x="35" y="-25" fontSize="10" fontWeight="bold" textAnchor="end" dominantBaseline="middle" fill="#1e293b">1,0</text>
                                  <text x="50" y="-35" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="auto" fill="#1e293b">{cutSlope}</text>
                                  
                                  {/* Fill (Down-Right) */}
                                  <path d="M 0,0 L 40,20 L 50,22 L 90,42" fill="none" stroke="#000" strokeWidth="1.5" strokeDasharray="4 4" />
                                  <path d="M 30,15 L 30,25 L 50,25" fill="none" stroke="#000" strokeWidth="1" />
                                  <text x="25" y="20" fontSize="10" fontWeight="bold" textAnchor="end" dominantBaseline="middle" fill="#1e293b">1,0</text>
                                  <text x="40" y="32" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="hanging" fill="#1e293b">{fillSlope}</text>
                                </>
                             )}
                         </svg>
                    </div>
                </div>
            );
            break;
        }
        /* BARREIRA NEW JERSEY — perfil real, cotado (lib/newJersey). */
        case 'New Jersey': {
            const g = njPolygon(comp.params as any, 100);
            const prof = g.prof;
            const pontos = g.pts.map(q => `${isLeft ? g.w - q.x : q.x},${q.y}`).join(' ');
            const baseStr = prof.base.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const altStr = prof.height.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const xInt = isLeft ? g.w : 0;
            const xExt = isLeft ? 0 : g.w;
            const lastroPts = prof.lastro > 0
                ? (() => {
                    /* O berço pode ser mais largo que a barreira: sai para os
                       dois lados pelo balanço. */
                    const b = g.balancoPx;
                    const xa = (isLeft ? g.w + b : -b);
                    const xb = (isLeft ? -b : g.w + b);
                    const ya = isLeft ? g.yBaseInt : g.yBaseInt;
                    const yb = isLeft ? g.yBaseExt : g.yBaseExt;
                    return `${xa},${ya} ${xb},${yb} ${xb},${yb + g.lastroPx} ${xa},${ya + g.lastroPx}`;
                  })()
                : null;

            blockContent = (
                <div className="flex flex-col w-full relative group-hover:brightness-110 transition-all font-mono text-[8px] tracking-tighter z-10">
                    <div className="absolute bottom-full left-0 right-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
                         <div className="text-slate-500 font-bold leading-none whitespace-nowrap text-[10px] uppercase">{prof.tipo === 'Simples' ? 'NEW JERSEY' : prof.tipo === 'Dupla' ? 'NJ DUPLA' : 'NJ DESNÍVEL'}</div>
                         <div className="text-slate-600 font-bold leading-none mt-1 text-[10px]">{baseStr}</div>
                         <div className="w-full h-[1px] bg-slate-400 relative my-1.5">
                             <div className="absolute left-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                             <div className="absolute right-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                         </div>
                         <div className="text-slate-800 text-[10px] font-bold leading-none">h {altStr}</div>
                    </div>

                    <div className="relative" style={{ width: `${g.w}px`, height: `${g.h}px`, marginTop: `-${g.yBaseInt}px` }}>
                        <svg width="100%" height="100%" viewBox={`0 0 ${g.w} ${g.h}`} preserveAspectRatio="none" className="absolute inset-0 overflow-visible">
                            {lastroPts && (
                                <polygon points={lastroPts} fill="#94a3b8" fillOpacity="0.7" stroke="#475569" strokeWidth="1.5" />
                            )}
                            <polygon points={pontos} fill="#e2e0dd" stroke="#57534e" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>
            );
            break;
        }
        case 'Passeio':
        case 'Faixa de Segurança':
        case 'Canteiro Central':
        default: {
            const widthStr = (comp.params.width ?? 1).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const slopeVal = comp.params.slope || 0;
            const slopeStr = slopeVal !== 0 ? (slopeVal.toFixed(2) + '%') : '';
            const skewDeg = Math.atan(Math.abs(slopeVal) / 100) * (180 / Math.PI);
            const skewStyle = isLeft ? (slopeVal < 0 ? -skewDeg : skewDeg) : (slopeVal < 0 ? skewDeg : -skewDeg);

            blockContent = (
                <div className="flex flex-col w-full relative group-hover:brightness-110 transition-all font-mono text-[8px] tracking-tighter z-10" style={{ minHeight: '40px' }}>
                    <div className="absolute bottom-full left-0 right-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
                         <div className="text-slate-500 font-bold leading-none whitespace-nowrap text-[10px]  uppercase">{comp.type}</div>
                         <div className="text-slate-700 font-bold leading-none mt-1 text-[9px] ">{widthStr}</div>
                         <div className="w-full h-[1px] bg-slate-400 relative my-1.5">
                             <div className="absolute left-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                             <div className="absolute right-0 -top-[5px] w-[1px] h-[11px] bg-slate-400 transform rotate-45"></div>
                         </div>
                         {slopeStr && <div className="text-slate-800 text-[11px] font-bold  leading-none">{slopeStr}</div>}
                    </div>
                    
                    <div className="w-full flex-1 border border-slate-400 bg-slate-100 flex items-center justify-center relative" style={{ transform: `skewY(${skewStyle}deg)`, transformOrigin: isLeft ? 'top right' : 'top left' }}>
                        <span className="font-bold text-slate-500 uppercase px-2 text-center break-words">{comp.type}</span>
                    </div>
                </div>
            );
            break;
                }
    }

    return (
        <Reorder.Item 
            value={comp} 
            drag="x"
            dragElastic={0}
            dragMomentum={false}
            dragTransition={{ bounceStiffness: 900, bounceDamping: 60 }}
            layout="position"
            transition={{ type: "spring", stiffness: 700, damping: 42, mass: 0.5 }}
            onDragStart={() => { movedRef.current = true; }}
            onDragEnd={(e: any, info: any) => { onDragEnd(e, info); setTimeout(() => { movedRef.current = false; }, 60); }}
            className="relative group cursor-grab active:cursor-grabbing flex flex-col justify-start h-auto component-block"
            style={{ width: `${visualWidth}px` }}
            whileDrag={{ scale: 1.06, zIndex: 150, rotate: isLeft ? -1.5 : 1.5, filter: "drop-shadow(0 18px 28px rgba(15,23,42,0.28))" }}
        >
            <motion.div 
                animate={{ y: `${yOffsetPx}px` }}
                transition={{ type: "spring", stiffness: 700, damping: 42, mass: 0.5 }}
                onClick={() => { if (!movedRef.current) onClick(); }}
                className="w-full flex flex-col items-center justify-start"
            >
                {blockContent}
            </motion.div>
        </Reorder.Item>
    );
}

/** BLOCO FANTASMA — o lugar que o componente vai ocupar, com a largura e a
 *  declividade reais do tipo. Não é Reorder.Item: só ocupa espaço no fluxo. */
function GhostBlock({ comp, yOffsetPx }: { comp: SubassemblyComponent; yOffsetPx: number }) {
  const w = getVisualWidthPx(comp);
  const slope = comp.params.slope ?? 0;
  const drop = -(slope / 100) * w;
  return (
    <motion.div
      initial={{ opacity: 0, scaleY: 0.6 }}
      animate={{ opacity: 1, scaleY: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 700, damping: 42, mass: 0.5 }}
      className="relative flex flex-col justify-start h-auto pointer-events-none"
      style={{ width: `${w}px` }}
    >
      <motion.div
        animate={{ y: `${yOffsetPx}px` }}
        transition={{ type: "spring", stiffness: 700, damping: 42, mass: 0.5 }}
        className="w-full"
      >
        <div
          className="relative w-full rounded-[3px] border-2 border-dashed border-sky-400 bg-sky-200/40"
          style={{ height: 26, transform: `skewY(${(Math.atan2(drop, w) * 180) / Math.PI}deg)` }}
        />
        <div className="mt-1 text-center text-[10px] font-bold uppercase tracking-wide text-sky-600 whitespace-nowrap">
          {comp.type}
        </div>
      </motion.div>
    </motion.div>
  );
}

function getDefaultParams(type: string): Record<string, any> {
    switch (type) {
        case 'Pista': return { width: 3.6, slope: -2 };
        case 'Acostamento': return { width: 2.5, slope: -5 };
        case 'Faixa de Segurança': return { width: 1.0, slope: -2 };
        case 'Canteiro Central': return { width: 4.0, slope: 0 };
        case 'Refúgio': return { width: 1.5, slope: -5 };
        case 'Guia': return { width: 0.15, heightAbove: 0.15, heightBelow: 0.30, foundationDepth: 0.10 };
        case 'Sarjeta': return { shape: 'Triangular', width: 1.0, slope: -5, depth: 0.25, bottomWidth: 0.3, thickness: 0.1, foundationDepth: 0 };
        case 'Talude': return { cutSlope: 1.5, fillSlope: 1.5, maxDrop: 5, benchWidth: 2, benchSlope: -5 };
        case 'Passeio': return { width: 1.5, thickness: 0.1, slope: 2 };
        case 'New Jersey': return { ...NJ_PADRAO };
        default: return { width: 2, slope: 0 };
    }
}

