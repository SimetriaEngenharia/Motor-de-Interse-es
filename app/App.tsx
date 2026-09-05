import React, { useState, useEffect } from "react";
import { BarraSuperior } from "./components/BarraSuperior";
import { Sidebar } from "./components/Sidebar";
import { PlanView } from "./components/PlanView";
import { PlanView3D } from "./components/PlanView3D";
import { ProfileView } from "./components/ProfileView";
import { SectionView } from "./components/SectionView";
import { SuperelevationChartView } from "./components/SuperelevationChartView";
import { UnifiedProfileSuperView } from "./components/UnifiedProfileSuperView";
import { useStore, undoProjectAction, redoProjectAction } from "./store";

import { IntersectionStudio } from "./components/IntersectionStudio";
import { NTWindow } from "./components/NTWindow";

import { AssemblyStudio } from "./components/AssemblyStudio";
import { ProductionStudio } from "./components/ProductionStudio";
import { initPersistence } from './lib/persistence';
import LayerManager from "./components/LayerManager";
import { FloatingViewer } from "./components/FloatingViewer";

export default function App() {
  const ambiente = useStore((state) => state.ambiente);
  const activeTab = useStore((state) => state.activeTab);
  const editingIntersectionId = useStore((state) => state.editingIntersectionId);
  const activeAlignmentId = useStore((state) => state.activeAlignmentId);
  const isLayerManagerOpen = useStore((state) => state.isLayerManagerOpen);
  const layerModalForAlignment = useStore((state) => state.layerModalForAlignment);
  const setIsLayerManagerOpen = useStore((state) => state.setIsLayerManagerOpen);
  const setLayerModalForAlignment = useStore((state) => state.setLayerModalForAlignment);
  const alignments = useStore((state) => state.alignments);
  
  useEffect(() => {
    initPersistence();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If user is focused on an input or textarea, don't intercept project undo/redo
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && !e.altKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            redoProjectAction();
          } else {
            undoProjectAction();
          }
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          redoProjectAction();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Derive active alignment name
  const activeAlignmentName = alignments.find(a => a.id === activeAlignmentId)?.name || "Alinhamento";
  const planMode = useStore((state) => state.planMode);
  const plan3DMode = useStore((state) => state.plan3DMode);
  const sectionMode = useStore((state) => state.sectionMode);
  const profileMode = useStore((state) => state.profileMode);

  return (
    <div className="h-screen w-screen flex flex-col bg-blue-50 text-slate-800 font-sans overflow-hidden">
      <BarraSuperior />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          {ambiente === "secoes" ? (
             <AssemblyStudio />
          ) : ambiente === "producao" ? (
             <ProductionStudio />
          ) : (
            <>
              {/* Split top area for 2D and 3D views */}
              {(!profileMode && !sectionMode) && (
                <div className={`flex min-h-0 relative ${planMode || plan3DMode ? "flex-1" : "flex-[1.5] border-b border-slate-200"}`}>
                 {!plan3DMode && <PlanView className={`border-slate-200 ${planMode ? "w-full h-full" : "flex-1 border-r"}`} />}
                 {!planMode && <PlanView3D className={`border-slate-200 ${plan3DMode ? "w-full h-full" : "flex-1"}`} />}
              </div>
              )}
            
            {/* Bottom area for Sections and Profile */}
            {(!planMode && !plan3DMode) && (
              <div className="flex-1 flex min-h-0">
                {!profileMode && <SectionView className={`border-slate-200 ${sectionMode ? "w-full h-full" : "flex-[1.2] border-r"}`} />}
                
                {!sectionMode && (
                  <div className={`border-slate-200 relative bg-blue-50 ${profileMode ? "w-full h-full" : "flex-1 border-l"}`}>
                    {activeAlignmentId ? (
                       <UnifiedProfileSuperView />
                    ) : (
                       <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                         <p className="text-sm">Selecione um alinhamento para visualizar o perfil</p>
                       </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
          )}

          {editingIntersectionId && <IntersectionStudio />}
        </div>
      </div>
      {(isLayerManagerOpen || layerModalForAlignment) && (
        <LayerManager 
          modalForAlignment={layerModalForAlignment}
          onClose={() => {
            setIsLayerManagerOpen(false);
            setLayerModalForAlignment(null);
          }}
        />
      )}
      <FloatingViewer />
      <NTWindow />
    </div>
  );
}
