import React from 'react';
import { SubassemblyComponent, PavementLayersConfig, PavementLayer } from '../types';

interface LayersEditorProps {
    component: SubassemblyComponent;
    onChange: (layers: PavementLayersConfig) => void;
}

const defaultLayers: PavementLayersConfig = {
    revestimento: [{ id: 'rev-1', name: 'Revestimento', thickness: 0.05 }],
    base: [{ id: 'base-1', name: 'Base', thickness: 0.15 }],
    subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }],
    cftCorte: 0.2,
    cftAterro: 0.2,
    limpeza: 0.2
};

export const LayersEditor: React.FC<LayersEditorProps> = ({ component, onChange }) => {
    if (component.type !== 'Pista' && component.type !== 'Acostamento' && component.type !== 'Refúgio') return null;

    const layers = component.layers || defaultLayers;

    const handleChange = (newLayers: PavementLayersConfig) => {
        onChange(newLayers);
    };

    const updateLayerList = (list: PavementLayer[], index: number, updates: Partial<PavementLayer>) => {
        const newList = [...list];
        newList[index] = { ...newList[index], ...updates };
        return newList;
    };

    const addLayer = (type: 'revestimento' | 'base' | 'subBase') => {
        if (layers[type].length >= 3) return;
        handleChange({
            ...layers,
            [type]: [...layers[type], { id: Math.random().toString(), name: `Nova Camada (${type})`, thickness: 0.1 }]
        });
    };

    const removeLayer = (type: 'revestimento' | 'base' | 'subBase', index: number) => {
        handleChange({
            ...layers,
            [type]: layers[type].filter((_, i) => i !== index)
        });
    };

    const renderLayerList = (type: 'revestimento' | 'base' | 'subBase', title: string) => {
        return (
            <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase">{title}</h4>
                    {layers[type].length < 3 && (
                        <button onClick={() => addLayer(type)} className="text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-600 px-1.5 py-0.5 rounded transition-colors">
                            + Adicionar
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {layers[type].map((layer, index) => (
                        <div key={layer.id} className="flex gap-2 items-center bg-white p-2 border border-slate-200 rounded">
                            <input 
                                type="text" 
                                value={layer.name} 
                                onChange={(e) => handleChange({ ...layers, [type]: updateLayerList(layers[type], index, { name: e.target.value }) })}
                                className="flex-1 text-xs border-none outline-none bg-transparent font-medium text-slate-700 min-w-0"
                                placeholder="Nome da camada"
                            />
                            <div className="flex items-center gap-1">
                                <input 
                                    type="number" 
                                    value={layer.thickness} 
                                    step={0.01}
                                    min={0.01}
                                    onChange={(e) => handleChange({ ...layers, [type]: updateLayerList(layers[type], index, { thickness: parseFloat(e.target.value) || 0 }) })}
                                    className="w-16 text-xs text-right bg-slate-100 rounded px-1 py-1 outline-none font-mono text-sky-700"
                                />
                                <span className="text-[10px] text-slate-500">m</span>
                            </div>
                            <button onClick={() => removeLayer(type, index)} className="text-slate-400 hover:text-red-500 px-1 transition-colors">✕</button>
                        </div>
                    ))}
                    {layers[type].length === 0 && <div className="text-[10px] text-slate-400 italic bg-slate-50 px-2 py-1 rounded">Nenhuma camada</div>}
                </div>
            </div>
        );
    };

    return (
        <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                
                Camadas do Pavimento
            </h3>
            
            {renderLayerList('revestimento', 'Revestimento')}
            {renderLayerList('base', 'Base')}
            {renderLayerList('subBase', 'Sub-base')}
        </div>
    );
};
