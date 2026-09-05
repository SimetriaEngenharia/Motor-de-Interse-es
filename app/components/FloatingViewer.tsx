import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { DraggableWindow } from './DraggableWindow';
import { PlanView } from './PlanView';
import { PlanView3D } from './PlanView3D';
import { SectionView } from './SectionView';
import { ProfileView } from './ProfileView';
import { SectionLineView } from './SectionLineView';
import { SuperelevationChartView } from './SuperelevationChartView';
import { UnifiedProfileSuperView } from './UnifiedProfileSuperView';

export function FloatingViewer() {
  const isFloatingViewerOpen = useStore(state => state.isFloatingViewerOpen);
  const setIsFloatingViewerOpen = useStore(state => state.setIsFloatingViewerOpen);
  const floatingViewerMode = useStore(state => state.floatingViewerMode);
  const setFloatingViewerMode = useStore(state => state.setFloatingViewerMode);
  const activeSectionLineId = useStore(state => state.activeSectionLineId);
  const setActiveSectionLineId = useStore(state => state.setActiveSectionLineId);
  const alignments = useStore(state => state.alignments);
  const sectionLines = alignments.filter(a => a.isSectionLine);

  if (!isFloatingViewerOpen) return null;

  return (
    <DraggableWindow
      title="Visualizador Flutuante"
      onClose={() => setIsFloatingViewerOpen(false)}
      initialX={window.innerWidth - 600 - 20}
      initialY={100}
      initialWidth={600}
      initialHeight={500}
    >
      <div className="flex flex-col w-full h-full bg-slate-50 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-100 border-b border-slate-200">
          <ModeButton 
            active={floatingViewerMode === 'plan2d'} 
            onClick={() => setFloatingViewerMode('plan2d')}
          >
            Planta 2D
          </ModeButton>
          <ModeButton 
            active={floatingViewerMode === 'plan3d'} 
            onClick={() => setFloatingViewerMode('plan3d')}
          >
            Planta 3D
          </ModeButton>
          <ModeButton 
            active={floatingViewerMode === 'section'} 
            onClick={() => setFloatingViewerMode('section')}
          >
            Seções
          </ModeButton>
          <ModeButton 
            active={floatingViewerMode === 'profile'} 
            onClick={() => setFloatingViewerMode('profile')}
          >
            Perfil
          </ModeButton>
          <ModeButton 
            active={floatingViewerMode === 'superelevation'} 
            onClick={() => setFloatingViewerMode('superelevation')}
          >
            Superelevação
          </ModeButton>
          <ModeButton 
            active={floatingViewerMode === 'section_line'}
            onClick={() => setFloatingViewerMode('section_line')}
          >
            Linhas de Corte
          </ModeButton>

          {floatingViewerMode === 'section_line' && (
            <div className="ml-auto flex items-center gap-2 pr-2">
              <label className="text-xs font-semibold text-slate-600">Linha de Corte:</label>
              <select 
                className="text-xs p-1 border rounded"
                value={activeSectionLineId || ""}
                onChange={(e) => setActiveSectionLineId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {sectionLines.map(sl => (
                  <option key={sl.id} value={sl.id}>{sl.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="flex-1 relative w-full h-full">
          {floatingViewerMode === 'plan2d' && <PlanView className="w-full h-full" />}
          {floatingViewerMode === 'plan3d' && <PlanView3D className="w-full h-full" />}
          {floatingViewerMode === 'section' && <SectionView className="w-full h-full" />}
          {floatingViewerMode === 'section_line' && <SectionLineView className="w-full h-full" />}
          {floatingViewerMode === 'profile' && <UnifiedProfileSuperView />}
          {floatingViewerMode === 'superelevation' && (
            <div className="w-full h-full overflow-auto">
              <SuperelevationChartView />
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
        active 
          ? 'bg-blue-100 text-blue-700 shadow-sm border border-blue-200' 
          : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
