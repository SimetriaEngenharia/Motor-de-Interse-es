import React, { useState, useRef, useEffect } from "react";
import { useStore } from "../store";
import { FAIXA_ADICIONAL_W } from "../store";
import { X, SlidersHorizontal, Hammer, ChevronRight, Check, Crosshair } from "lucide-react";
import { calculateARTESP } from "../lib/artesp";
import { createOffsetAlignment } from "../lib/alignment";
import { papelDosQuadrantesDaInt } from "../lib/flowRules";

export function IntersectionStudio() {
  const store = useStore() as any;
  const id = store.editingIntersectionId;
  const int = store.intersections.find((i: any) => i.id === id);
  const assemblies = store.assemblies;

  const [step, setStep] = useState(1);

  useEffect(() => {
    // Activate lane direction mode when the assistant opens
    store.setInteractionMode("select_lane_direction");
    
    return () => {
      store.setInteractionMode("none");
    };
  }, []);

  if (!int) return null;

  /* Papel dos dois quadrantes pela MESMA conta do store e da planta
   * (lib/flowRules). Cada painel aqui refazia a conta com uma regra própria,
   * mais pobre; quando ela discordava do store, o L/T arrastado ia para o campo
   * do outro movimento e a faixa ficava igual. */
  const papel = papelDosQuadrantesDaInt(store, int);

  /* QUADRANTE ESQUERDO / DIREITO — por TOKEN DE BRAÇO, não por lista de ids.
   *
   * A ordem do id do quadrante vem da ordenação angular dos braços em
   * buildIntersectionPolygon: o mesmo quadrante nasce "M-Back-B-Arm" num
   * projeto e "B-Arm-M-Back" noutro. As duas listas antigas de ids
   * SOBREPUNHAM-SE ("M-Fwd-B-Arm" estava na lista da esquerda e
   * "B-Arm-M-Back" na da direita), então os dois selectores caíam no MESMO
   * alinhamento — e "Separar por Ramos" criava dois offsets com o mesmo pai,
   * geometricamente IDÊNTICOS. Com uma linha só no lugar de duas, existe um
   * cruzamento só com o bordo da principal: por isso aparecia apenas o NF-01.
   *
   * O par é sempre B-Arm + M-Back (esquerdo) e B-Arm + M-Fwd (direito). */
  const quadrantePorToken = (token: "M-Back" | "M-Fwd") => {
    const pref = `align-${int.id}-`;
    const porId = store.alignments.find((a: any) => {
      const id = String(a?.id || "");
      if (!id.startsWith(pref)) return false;
      const resto = id.slice(pref.length);
      return resto === `${token}-B-Arm` || resto === `B-Arm-${token}`;
    });
    if (porId) return porId;
    /* Sem id canónico (projeto antigo, alinhamento renomeado): pelo nome. */
    const lado = token === "M-Back" ? "Esq" : "Dir";
    return store.alignments.find((a: any) => {
      const n = String(a?.name || "");
      return n.includes("Bordo") && n.includes("Ramo") && n.includes(lado) && !n.includes("Offset");
    });
  };

  const leftEdgeAlign = quadrantePorToken("M-Back");
  const rightEdgeAlignRaw = quadrantePorToken("M-Fwd");
  /* Nunca deixar os dois apontarem para o mesmo alinhamento: era exatamente
   * isso que colapsava os dois ramos num só. */
  const rightEdgeAlign =
    rightEdgeAlignRaw && leftEdgeAlign && rightEdgeAlignRaw.id === leftEdgeAlign.id
      ? undefined
      : rightEdgeAlignRaw;

  const hasLeftOffset = store.alignments.some((a: any) => a.id === `align-${int.id}-offset-left`);
  const hasRightOffset = store.alignments.some((a: any) => a.id === `align-${int.id}-offset-right`);

  return (
    <div className="absolute top-0 right-0 bottom-0 w-96 bg-white border-l border-slate-300 flex flex-col shadow-2xl z-[300] overflow-hidden pointer-events-auto">
      <div className="shrink-0 p-4 border-b border-slate-200 flex items-center justify-between bg-slate-100/50">
        <div className="flex items-center gap-2">
           <SlidersHorizontal className="w-5 h-5 text-sky-400" />
           <h2 className="font-semibold text-slate-800 tracking-tight text-sm">Assistente de Interseção</h2>
        </div>
        <button 
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            store.setEditingIntersectionId(null);
          }}
          className="text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex shrink-0 p-3 bg-slate-100 border-b border-slate-200 gap-2">
         <div className={`flex-1 h-1.5 rounded-full ${step >= 1 ? 'bg-sky-500' : 'bg-slate-50'}`} />
         <div className={`flex-1 h-1.5 rounded-full ${step >= 2 ? 'bg-sky-500' : 'bg-slate-50'}`} />
         <div className={`flex-1 h-1.5 rounded-full ${step >= 3 ? 'bg-sky-500' : 'bg-slate-50'}`} />
         <div className={`flex-1 h-1.5 rounded-full ${step >= 4 ? 'bg-sky-500' : 'bg-slate-50'}`} />
         <div className={`flex-1 h-1.5 rounded-full ${step >= 5 ? 'bg-sky-500' : 'bg-slate-50'}`} />
      </div>

      <div className="p-5 flex-1 overflow-y-auto">
        {step === 1 && (
           <div className="space-y-6">
             <div>
               <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="bg-sky-500/20 text-sky-400 w-5 h-5 flex items-center justify-center rounded-sm">1</span> Geometria (Raios)
               </h3>
               
               <div className="space-y-4">
                 <div className="space-y-1 mt-4">
                   <div className="flex justify-between text-xs">
                     <span className="text-slate-500">Raio Quadrante Esquerdo</span>
                     <span className="text-cyan-700 font-mono">{int.leftRadius}m</span>
                   </div>
                   <input
                     type="range" min="5" max="100" step="1" value={int.leftRadius}
                     onMouseDown={() => store.setIsDynamicInteraction(true)}
                     onTouchStart={() => store.setIsDynamicInteraction(true)}
                     onMouseUp={() => store.setIsDynamicInteraction(false)}
                     onTouchEnd={() => store.setIsDynamicInteraction(false)}
                     onChange={(e) => store.updateIntersection(int.id, { leftRadius: parseFloat(e.target.value) })}
                     className="w-full accent-cyan-500 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
                   />
                 </div>
                 <div className="space-y-1">
                   <div className="flex justify-between text-xs">
                     <span className="text-slate-500">Raio Quadrante Direito</span>
                     <span className="text-cyan-700 font-mono">{int.rightRadius}m</span>
                   </div>
                   <input
                     type="range" min="5" max="100" step="1" value={int.rightRadius}
                     onMouseDown={() => store.setIsDynamicInteraction(true)}
                     onTouchStart={() => store.setIsDynamicInteraction(true)}
                     onMouseUp={() => store.setIsDynamicInteraction(false)}
                     onTouchEnd={() => store.setIsDynamicInteraction(false)}
                     onChange={(e) => store.updateIntersection(int.id, { rightRadius: parseFloat(e.target.value) })}
                     className="w-full accent-cyan-500 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
                   />
                 </div>

                 <div className="space-y-4 mt-4 pt-4 border-t border-slate-200">
<div className="flex gap-2 items-center">
                     <input
                        type="checkbox"
                        checked={hasLeftOffset || hasRightOffset}
                        onChange={(e) => {
                           const isChecked = e.target.checked;
                           if (isChecked) {
                               let defaultW = 3.5;
                               const branchAlign = store.alignments.find((a: any) => a.id === int.branchAlignmentId);
                               if (branchAlign) {
                                   const offsetAlign = store.alignments.find((a: any) => a.parentId === branchAlign.id);
                                   if (offsetAlign && offsetAlign.offsetValue) {
                                       defaultW = Math.abs(offsetAlign.offsetValue);
                                   }
                               }
                               store.updateIntersection(int.id, { leftBranchWidth: defaultW, rightBranchWidth: defaultW });

                               const newAligns: any[] = [];
                               if (leftEdgeAlign) {
                                   try {
                                       const newAlignL = createOffsetAlignment(leftEdgeAlign, -defaultW, `${int.name || 'Interseção'} Bordo Esq > Offset Esq ${defaultW}m`);
                                       newAlignL.id = `align-${int.id}-offset-left`;
                                       newAlignL.layerId = "layer-auxiliar";
                                       newAlignL.parentId = leftEdgeAlign.id;
                                       newAlignL.offsetValue = -defaultW;
                                       newAligns.push(newAlignL);
                                   } catch(err) {}
                               }
                               if (rightEdgeAlign && rightEdgeAlign.id !== leftEdgeAlign?.id) {
                                   try {
                                       const newAlignR = createOffsetAlignment(rightEdgeAlign, -defaultW, `${int.name || 'Interseção'} Bordo Dir > Offset Dir ${defaultW}m`);
                                       newAlignR.id = `align-${int.id}-offset-right`;
                                       newAlignR.layerId = "layer-auxiliar";
                                       newAlignR.parentId = rightEdgeAlign.id;
                                       newAlignR.offsetValue = -defaultW;
                                       newAligns.push(newAlignR);
                                   } catch(err) {}
                               }

                               if (newAligns.length > 0) {
                                   if (!store.layers.some((l: any) => l.id === "layer-auxiliar")) {
                                       store.addLayer({ id: "layer-auxiliar", name: "Auxiliar", color: "#a8a29e", isVisible: false, isLocked: false });
                                   }
                                   store.setAlignments([...store.alignments, ...newAligns]);
                               }
                           } else {
                               store.updateIntersection(int.id, { leftBranchWidth: undefined, rightBranchWidth: undefined, hasRefugio: false });
                               const idsFora = new Set([
                                 `align-${int.id}-offset-left`,
                                 `align-${int.id}-offset-right`,
                               ]);
                               store.setAlignments(store.alignments.filter((a: any) => !idsFora.has(a.id)));
                           }
                        }}
                        className="w-5 h-5 shrink-0 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
                     />
                     {/* "Acoplamento bordo a bordo pai/filho" é o nome interno da
                         mecânica; no painel vale a linguagem do projetista. */}
                     <span className="text-slate-700 text-sm font-medium">Separar por Ramos</span>
                   </div>
                   {(hasLeftOffset || hasRightOffset) && (
                   <div className="pl-6 space-y-4 mt-4">
                      <div className="space-y-1">
                           <div className="flex justify-between text-xs">
                             <span className="text-slate-500">Largura do Ramo Esquerdo</span>
                             <span className="text-cyan-700 font-mono">{int.leftBranchWidth ? `${int.leftBranchWidth}m` : 'Automático'}</span>
                           </div>
                           <input
                             type="number" min="3.0" max="15.0" step="0.1" 
                             value={int.leftBranchWidth || ''}
                             placeholder="Automático"
                             onChange={(e) => {
                                const val = e.target.value ? parseFloat(e.target.value) : undefined;
                                store.updateIntersection(int.id, { leftBranchWidth: val });
                                if (val) {
                                   const childOffset = store.alignments.find((a: any) => a.id === `align-${int.id}-offset-left`);
                                   if (childOffset) {
                                      childOffset.offsetValue = -Math.abs(val);
                                      childOffset.name = `${int.name || 'Interseção'} Bordo Esq > Offset Esq ${Math.abs(val)}m`;
                                      store.setAlignments([...store.alignments]);
                                   }
                                }
                             }}
                             className="w-full bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded p-2 focus:ring-1 focus:ring-sky-500 outline-none"
                           />
                         </div>
                         <div className="space-y-1">
                           <div className="flex justify-between text-xs">
                             <span className="text-slate-500">Largura do Ramo Direito</span>
                             <span className="text-cyan-700 font-mono">{int.rightBranchWidth ? `${int.rightBranchWidth}m` : 'Automático'}</span>
                           </div>
                           <input
                             type="number" min="3.0" max="15.0" step="0.1" 
                             value={int.rightBranchWidth || ''}
                             placeholder="Automático"
                             onChange={(e) => {
                                const val = e.target.value ? parseFloat(e.target.value) : undefined;
                                store.updateIntersection(int.id, { rightBranchWidth: val });
                                if (val) {
                                   const childOffset = store.alignments.find((a: any) => a.id === `align-${int.id}-offset-right`);
                                   if (childOffset) {
                                      childOffset.offsetValue = -Math.abs(val);
                                      childOffset.name = `${int.name || 'Interseção'} Bordo Dir > Offset Dir ${Math.abs(val)}m`;
                                      store.setAlignments([...store.alignments]);
                                   }
                                }
                             }}
                             className="w-full bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded p-2 focus:ring-1 focus:ring-sky-500 outline-none"
                           />
                         </div>
                      </div>
                   )}
                 </div>

                 {/* Refúgio só existe com acoplamento pai/filho: é contra o bordo
                     do filho que ele se mede. Sem offsets, não há garganta onde
                     alargar. */}
                 <div className={`pt-4 border-t border-slate-200 ${hasLeftOffset || hasRightOffset ? "" : "hidden"}`}>
                   <label className="text-xs text-slate-700 flex items-center gap-2 cursor-pointer">
                     <input
                       type="checkbox"
                       checked={int.hasRefugio || false}
                       onChange={(e) => store.updateIntersection(int.id, {
                         hasRefugio: e.target.checked,
                         refugioWidth: int.refugioWidth ?? 1.5,
                       })}
                       className="accent-sky-500"
                     />
                     Refúgio na garganta
                   </label>
                   <p className="text-[11px] text-slate-500 leading-snug mt-1 mb-0">
                     Alarga a seção da principal para dentro da ilha, entre os narizes.
                     O nariz físico passa a ser construído contra o bordo do refúgio.
                   </p>

                   {int.hasRefugio && (
                     <div className="space-y-1 mt-3 animate-in fade-in slide-in-from-top-2">
                       <div className="flex justify-between text-xs">
                         <span className="text-slate-500">Largura do Refúgio</span>
                         <span className="text-cyan-700 font-mono">
                           {(int.refugioWidth ?? 1.5).toFixed(2)} m
                         </span>
                       </div>
                       <input
                         type="range" min="0.5" max="6" step="0.1"
                         value={int.refugioWidth ?? 1.5}
                         onChange={(e) => store.updateIntersection(int.id, { refugioWidth: parseFloat(e.target.value) })}
                         className="w-full accent-sky-500"
                       />
                     </div>
                   )}
                 </div>

                 <div className="pt-4 border-t border-slate-200 hidden">
                   <label className="text-xs text-slate-700 flex items-center gap-2 cursor-pointer mb-4">
                     <input
                       type="checkbox"
                       checked={int.hasIsland || false}
                       onChange={(e) => store.updateIntersection(int.id, { hasIsland: e.target.checked })}
                       className="accent-sky-500"
                     />
                     Inserir ilha?
                   </label>
                 </div>
                 <div className="pt-4 border-t border-slate-200 hidden">
                   <label className="text-xs text-slate-700 flex items-center gap-2 cursor-pointer mb-4">
                     <input
                       type="checkbox"
                       checked={int.hasSpiral || false}
                       onChange={(e) => store.updateIntersection(int.id, { 
                         hasSpiral: e.target.checked,
                         spiralLength: int.spiralLength || 20,
                       })}
                       className="accent-sky-500"
                     />
                     Adicionar espiral de transição antes da curva?
                   </label>

                   {int.hasSpiral && (
                     <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                       <div className="space-y-1">
                         <div className="flex justify-between text-xs">
                           <span className="text-slate-500">Comprimento da Espiral</span>
                           <span className="text-cyan-700 font-mono">{int.spiralLength || 20}m</span>
                         </div>
                         <input
                           type="range" min="5" max="100" step="1" value={int.spiralLength || 20}
                           onChange={(e) => store.updateIntersection(int.id, { spiralLength: parseFloat(e.target.value) })}
                           className="w-full accent-cyan-500 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
                         />
                       </div>
                     </div>
                   )}
                 </div>
               </div>
             </div>
           </div>
        )}

        {step === 2 && (
           <div className="space-y-6">
             <div>
               <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="bg-sky-500/20 text-sky-400 w-5 h-5 flex items-center justify-center rounded-sm">2</span> Mudança de Velocidade
               </h3>
               
               <div className="space-y-4">
                 <div className="flex items-center gap-2 mb-4">
                   <label className="text-xs text-slate-700 flex items-center gap-2 cursor-pointer">
                     <input
                       type="checkbox"
                       checked={int.hasAccelDecel || false}
                       onChange={(e) => store.updateIntersection(int.id, { 
                         hasAccelDecel: e.target.checked,
                         accelL: int.accelL || 50,
                         accelT: int.accelT || 30,
                         decelL: int.decelL || 50,
                         decelT: int.decelT || 30,
                       })}
                       className="w-4 h-4 rounded border-slate-300 bg-white text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-950"
                     />
                     Adicionar Faixas de Aceleração / Desaceleração
                   </label>
                 </div>

                 {int.hasAccelDecel && (
                   <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                     <div className="space-y-4 p-3 bg-slate-50/50 rounded border border-sky-900/50">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-semibold text-sky-400 flex items-center gap-2">
                            Auto-Calcular (Norma ARTESP)
                          </h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 uppercase">Vel. Via Principal</label>
                            <select 
                              className="w-full bg-white border border-slate-300 text-slate-700 text-xs rounded p-1.5"
                              value={int.mainSpeed || 80}
                              onChange={(e) => store.updateIntersection(int.id, { mainSpeed: parseInt(e.target.value) })}
                            >
                              {[60,70,80,90,100,110,120].map(s => <option key={s} value={s}>{s} km/h</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 uppercase">Vel. do Ramo</label>
                            <select 
                              className="w-full bg-white border border-slate-300 text-slate-700 text-xs rounded p-1.5"
                              value={int.branchSpeed || 40}
                              onChange={(e) => store.updateIntersection(int.id, { branchSpeed: parseInt(e.target.value) })}
                            >
                              {[0,20,30,40,50,60,70,80].map(s => <option key={s} value={s}>{s} km/h</option>)}
                            </select>
                          </div>
                          <div className="space-y-1 col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase">Tipo de Acesso</label>
                            <select 
                              className="w-full bg-white border border-slate-300 text-slate-700 text-xs rounded p-1.5"
                              value={int.accessType || "standard"}
                              onChange={(e) => store.updateIntersection(int.id, { accessType: e.target.value as any })}
                            >
                              <option value="standard">Padrão / Dispositivo</option>
                              <option value="comercial">Acesso Comercial</option>
                              <option value="nao_comercial_polo">Acesso Não Comercial (Polo Gerador)</option>
                              <option value="residencial">Acesso Residencial</option>
                            </select>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            const mainAlign = store.alignments.find((a: any) => a.id === int.mainAlignmentId);
                            let grade = 0;
                            if (mainAlign && mainAlign.getGradeAtStation) {
                              grade = mainAlign.getGradeAtStation(int.mainStation);
                            }
                            const accel = calculateARTESP("accel", int.mainSpeed || 80, int.branchSpeed || 40, grade, int.accessType || "standard");
                            const decel = calculateARTESP("decel", int.mainSpeed || 80, int.branchSpeed || 40, grade, int.accessType || "standard");
                            store.updateIntersection(int.id, {
                              accelL: accel.L,
                              accelT: accel.T,
                              decelL: decel.L,
                              decelT: decel.T
                            });
                          }}
                          className="w-full bg-sky-600 hover:bg-sky-500 text-white text-xs py-1.5 rounded flex items-center justify-center gap-2 transition-colors"
                        >
                          <Crosshair className="w-3 h-3" />
                          Aplicar Valores ARTESP
                        </button>
                      </div>

                      <div className="space-y-3 p-3 bg-slate-50/50 rounded border border-slate-200">
                        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          Largura das Faixas Adicionais
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Padrão de {FAIXA_ADICIONAL_W.toFixed(2).replace(".", ",")} m, independente da largura dos ramos de acesso. Informe um valor para trocar.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-600 font-medium">Faixa de Aceleração</span>
                              <span className="text-cyan-700 font-mono">{int.accelWidth ? `${int.accelWidth}m` : `${FAIXA_ADICIONAL_W.toFixed(2)}m`}</span>
                            </div>
                            <input
                              type="number"
                              min="2.5"
                              max="12.0"
                              step="0.1"
                              value={int.accelWidth || ''}
                              placeholder={`Padrão ${FAIXA_ADICIONAL_W.toFixed(2)} m`}
                              onChange={(e) => {
                                const val = e.target.value ? parseFloat(e.target.value) : undefined;
                                store.updateIntersection(int.id, { accelWidth: val });
                              }}
                              className="w-full bg-white border border-slate-300 text-slate-700 text-xs rounded p-1.5 focus:ring-1 focus:ring-sky-500 outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-600 font-medium">Faixa de Desaceleração</span>
                              <span className="text-cyan-700 font-mono">{int.decelWidth ? `${int.decelWidth}m` : (int.accelWidth ? `${int.accelWidth}m` : `${FAIXA_ADICIONAL_W.toFixed(2)}m`)}</span>
                            </div>
                            <input
                              type="number"
                              min="2.5"
                              max="12.0"
                              step="0.1"
                              value={int.decelWidth || ''}
                              placeholder={`Padrão ${FAIXA_ADICIONAL_W.toFixed(2)} m`}
                              onChange={(e) => {
                                const val = e.target.value ? parseFloat(e.target.value) : undefined;
                                store.updateIntersection(int.id, { decelWidth: val });
                              }}
                              className="w-full bg-white border border-slate-300 text-slate-700 text-xs rounded p-1.5 focus:ring-1 focus:ring-sky-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {[
                        { chave: "back", rotulo: "Quadrante Anterior", tipo: papel.back },
                        { chave: "fwd", rotulo: "Quadrante Posterior", tipo: papel.fwd },
                      ].map((q) => {
                        const desacel = q.tipo === "Desaceleração";
                        const L = desacel ? int.decelL || 50 : int.accelL || 50;
                        const T = desacel ? int.decelT || 30 : int.accelT || 30;
                        const movimento = desacel
                          ? "Entrada no Ramo / Ramo de Saída"
                          : "Saída do Ramo / Ramo de Entrada";
                        return (
                          <div
                            key={q.chave}
                            className="space-y-4 p-3 bg-slate-50/30 rounded border border-slate-200"
                          >
                            <h4 className="text-xs font-medium text-slate-500">
                              {`${q.rotulo}: Faixa de ${q.tipo} (${movimento})`}
                            </h4>

                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Comprimento (L)</span>
                                <span className="text-emerald-600 font-mono">{L}m</span>
                              </div>
                              <input
                                type="range"
                                min="10"
                                max="250"
                                step="5"
                                value={L}
                                onChange={(e) =>
                                  store.updateIntersection(
                                    int.id,
                                    desacel
                                      ? { decelL: parseFloat(e.target.value) }
                                      : { accelL: parseFloat(e.target.value) },
                                  )
                                }
                                className="w-full accent-emerald-500 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Taper (T)</span>
                                <span className="text-emerald-600 font-mono">{T}m</span>
                              </div>
                              <input
                                type="range"
                                min="10"
                                max="150"
                                step="5"
                                value={T}
                                onChange={(e) =>
                                  store.updateIntersection(
                                    int.id,
                                    desacel
                                      ? { decelT: parseFloat(e.target.value) }
                                      : { accelT: parseFloat(e.target.value) },
                                  )
                                }
                                className="w-full accent-emerald-500 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                          </div>
                        );
                      })}
                   </div>
                 )}
               </div>
             </div>
           </div>
        )}

        {step === 3 && (
           <div className="space-y-6">
              <div>
               <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="bg-sky-500/20 text-sky-400 w-5 h-5 flex items-center justify-center rounded-sm">3</span> Seções Tipo
               </h3>
               
               <div className="space-y-4">
                 <div>
                   <label className="text-xs text-slate-500 block mb-1">Seção Quadrante Interseção</label>
                   <select 
                     className="w-full bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded p-2 focus:ring-1 focus:ring-sky-500 outline-none"
                     onChange={(e) => store.updateIntersection(int.id, { assemblyId: e.target.value })}
                     value={int.assemblyId || ""}
                   >
                      {assemblies.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                   </select>
                 </div>

                 <div className="mt-4">
                   <label className="text-xs text-slate-500 block mb-1">Alinhamento Alvo Eixo Principal (Opcional)</label>
                   <div className="flex gap-2">
                     <select 
                       className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded p-2 focus:ring-1 focus:ring-sky-500 outline-none"
                       onChange={(e) => store.updateIntersection(int.id, { mainTargetId: e.target.value })}
                       value={int.mainTargetId || ""}
                     >
                        <option value="">Automático (Eixo Principal)</option>
                        {store.alignments.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                     </select>
                     <button
                       className={`flex items-center justify-center w-8 h-8 rounded border ${
                         store.interactionMode === 'select_intersection_target_main' ? 'bg-sky-500/20 border-sky-500 text-sky-400' : 'bg-white border-slate-300 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                       } transition-colors`}
                       onClick={() => store.setInteractionMode(
                         store.interactionMode === 'select_intersection_target_main' ? 'none' : 'select_intersection_target_main'
                       )}
                       title="Selecionar na planta"
                     >
                        <Crosshair size={16} />
                     </button>
                   </div>
                 </div>

                 <div className="mt-4">
                   <label className="text-xs text-slate-500 block mb-1">Alinhamento Alvo Eixo Ramo (Opcional)</label>
                   <div className="flex gap-2">
                     <select 
                       className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded p-2 focus:ring-1 focus:ring-sky-500 outline-none"
                       onChange={(e) => store.updateIntersection(int.id, { branchTargetId: e.target.value })}
                       value={int.branchTargetId || ""}
                     >
                        <option value="">Automático (Eixo Ramo)</option>
                        {store.alignments.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                     </select>
                     <button
                       className={`flex items-center justify-center w-8 h-8 rounded border ${
                         store.interactionMode === 'select_intersection_target_branch' ? 'bg-sky-500/20 border-sky-500 text-sky-400' : 'bg-white border-slate-300 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                       } transition-colors`}
                       onClick={() => store.setInteractionMode(
                         store.interactionMode === 'select_intersection_target_branch' ? 'none' : 'select_intersection_target_branch'
                       )}
                       title="Selecionar na planta"
                     >
                        <Crosshair size={16} />
                     </button>
                   </div>
                 </div>
                 
                 <div className="space-y-1 mt-4">
                   <div className="flex justify-between text-xs">
                     <span className="text-slate-500">Superelevação Principal</span>
                     <span className="text-emerald-600 font-mono">{int.mainCrossSlope}%</span>
                   </div>
                   <input
                     type="range" min="-10" max="10" step="0.5" value={int.mainCrossSlope}
                     onChange={(e) => store.updateIntersection(int.id, { mainCrossSlope: parseFloat(e.target.value) })}
                     className="w-full accent-emerald-500 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
                   />
                 </div>

                 <div className="space-y-1">
                   <div className="flex justify-between text-xs">
                     <span className="text-slate-500">Superelevação Ramo</span>
                     <span className="text-emerald-600 font-mono">{int.branchCrossSlope}%</span>
                   </div>
                   <input
                     type="range" min="-10" max="10" step="0.5" value={int.branchCrossSlope}
                     onChange={(e) => store.updateIntersection(int.id, { branchCrossSlope: parseFloat(e.target.value) })}
                     className="w-full accent-emerald-500 h-1.5 bg-slate-50 rounded-lg appearance-none cursor-pointer"
                   />
                 </div>
               </div>
             </div>
           </div>
        )}


        {step === 4 && (() => {
           const nts = (store.intersectionNTs?.[int.id] || []) as any[];
           return (
           <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-2">
                  <span className="bg-sky-500/20 text-sky-400 w-5 h-5 flex items-center justify-center rounded-sm">4</span> Narizes Teóricos
                </h3>
                <p className="text-[11px] text-slate-500 leading-snug mb-4">
                  Onde um bordo de cada rodovia se cruza, existe um <b>NT</b>. São encontrados
                  automaticamente e acompanham a geometria: mude raio, largura ou posição e eles
                  se relocam.
                </p>

                {nts.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic">
                    Nenhum NT encontrado ainda — gere a interseção para que os bordos se cruzem.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-semibold">NT</th>
                          <th className="text-right px-2 py-1.5 font-semibold font-mono">E</th>
                          <th className="text-right px-2 py-1.5 font-semibold font-mono">N</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nts.map((nt) => (
                          <tr key={nt.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 font-mono font-bold text-rose-600">{nt.id}</td>
                            <td className="text-right px-2 py-1.5 font-mono text-slate-700">{nt.x.toFixed(3)}</td>
                            <td className="text-right px-2 py-1.5 font-mono text-slate-700">{nt.y.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  onClick={() => store.setNtWindowIntersectionId(int.id)}
                  className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition"
                >
                  <Crosshair size={13} /> Abrir janela de narizes
                </button>
              </div>
           </div>
           );
        })()}

        {step === 5 && (
           <div className="space-y-6">
              <div className="text-center py-6">
                 <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Hammer className="w-8 h-8 text-emerald-600" />
                 </div>
                 <h3 className="text-sm font-semibold text-slate-800 mb-2">Pronto para Gerar</h3>
                 <p className="text-xs text-slate-500">
                    O assistente irá construir todos os corredores baseados nos alinhamentos principal, ramo e nos raios definidos.
                 </p>
              </div>
           </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-100 flex justify-between gap-2">
        {step > 1 ? (
           <button 
             onClick={() => setStep(step - 1)}
             className="px-4 py-2 border border-slate-300 bg-slate-50 text-slate-700 rounded text-xs hover:bg-slate-100 transition"
           >
             Voltar
           </button>
        ) : <div />}
        
        {step < 5 ? (
           <button 
             onClick={() => setStep(step + 1)}
             className="px-4 py-2 bg-sky-600 text-white rounded text-xs font-semibold hover:bg-sky-500 transition flex items-center gap-1"
           >
             Avançar <ChevronRight className="w-3 h-3" />
           </button>
        ) : (
           <button 
             onClick={() => {
                store.rebuildIntersectionCorridors(int.id);
                store.setEditingIntersectionId(null);
             }}
             className="px-4 py-2 bg-emerald-600 text-white rounded text-xs font-semibold flex items-center gap-2 hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/20 flex-1 justify-center"
           >
             <Check className="w-4 h-4" /> Construir Corredores
           </button>
        )}
      </div>
    </div>
  );
}
