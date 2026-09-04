import { Assembly, SubassemblyComponent, C3DPoint, C3DLink, Parameter } from "../types";
import { njProfile } from "./newJersey";

export function compileSubassemblies(components: SubassemblyComponent[]): { points: C3DPoint[], links: C3DLink[], parameters: Parameter[] } {
  const points: C3DPoint[] = [{ id: "Origin", referenceId: null, dx: "0", dy: "0" }];
  const links: C3DLink[] = [];
  const parameters: Parameter[] = [];
  
  let leftTopOuter = "Origin";
  let leftBotOuter = "Origin";
  let rightTopOuter = "Origin";
  let rightBotOuter = "Origin";
  
  let idCounter = 1;
  const getId = (prefix: string) => `C_${prefix}${idCounter++}`;

  const typeCounts = { Left: {} as Record<string, number>, Right: {} as Record<string, number> };
  const compIndices = new Map<SubassemblyComponent, number>();
  for (const comp of components) {
    if (!typeCounts[comp.side]) typeCounts[comp.side] = {};
    const key = comp.type;
    typeCounts[comp.side][key] = (typeCounts[comp.side][key] || 0) + 1;
    compIndices.set(comp, typeCounts[comp.side][key]);
  }

  const getSemanticId = (comp: SubassemblyComponent, role: string) => {
    const sideStr = comp.side === 'Left' ? 'Esq' : 'Dir';
    const num = compIndices.get(comp);
    let typeStr = comp.type.replace(/\s+/g, '_');
    if (comp.type === 'Pista') typeStr = 'Faixa'; // special case to match "Bordo Faixa"
    return `${role}_${typeStr}_${sideStr}_${num}`;
  };
  
  for (const comp of components) {
    const isLeft = comp.side === 'Left';
    const sign = isLeft ? -1 : 1;
    let anchorTop = comp.attachToPoint || (isLeft ? leftTopOuter : rightTopOuter);
    let anchorBot = isLeft ? leftBotOuter : rightBotOuter;
    
    if (comp.type === 'Pista' || comp.type === 'Acostamento' || comp.type === 'Faixa de Segurança' || comp.type === 'Canteiro Central' || comp.type === 'Refúgio') {
      let defaultW = 3.6;
      let defaultS = -2;
      
      if (comp.type === 'Acostamento') { defaultW = 2.5; defaultS = -5; }
      else if (comp.type === 'Faixa de Segurança') { defaultW = 1.0; defaultS = -2; }
      else if (comp.type === 'Canteiro Central') { defaultW = 4.0; defaultS = 0; }
      else if (comp.type === 'Refúgio') { defaultW = 1.5; defaultS = -5; }
      
      const w = comp.params.width ?? defaultW;
      const s = comp.params.slope ?? defaultS;
      const d = comp.params.depth ?? 0.2;
      
      let exprW = `${w}`;
      const sideKey = isLeft ? 'Esq' : 'Dir';
      const sideKeyEn = isLeft ? 'Left' : 'Right';
      const customParam = comp.params.paramNameW || comp.params.paramName;
      if (comp.type === 'Pista') {
         if (customParam) {
           exprW = `(typeof ${customParam} !== 'undefined' ? Math.abs(${customParam}) : ${w})`;
         } else {
           exprW = `(typeof PistaW_${sideKey} !== 'undefined' ? Math.abs(PistaW_${sideKey}) : (typeof PistaW_${sideKeyEn} !== 'undefined' ? Math.abs(PistaW_${sideKeyEn}) : (typeof PistaW !== 'undefined' ? Math.abs(PistaW) : ${w})))`;
         }
      } else if (comp.type === 'Acostamento') {
         if (customParam) {
           exprW = `(typeof ${customParam} !== 'undefined' ? Math.abs(${customParam}) : ${w})`;
         } else {
           exprW = `(typeof AcostamentoW_${sideKey} !== 'undefined' ? Math.abs(AcostamentoW_${sideKey}) : (typeof AcostamentoW_${sideKeyEn} !== 'undefined' ? Math.abs(AcostamentoW_${sideKeyEn}) : (typeof AcostamentoW !== 'undefined' ? Math.abs(AcostamentoW) : ${w})))`;
         }
      } else if (comp.type === 'Canteiro Central') {
         exprW = `(typeof CanteiroW !== 'undefined' ? Math.abs(CanteiroW) : ${w})`;
      }
      
      /* Refúgio é pista pavimentada (só isso — sem guia, sem talude), então
       * recebe as mesmas camadas de pavimento das faixas. */
      const isPistaOrAcostamento = comp.type === 'Pista' || comp.type === 'Acostamento' || comp.type === 'Refúgio';
      const pTop = isPistaOrAcostamento ? getSemanticId(comp, 'Bordo') : getSemanticId(comp, 'Bordo');
      const pBot = isPistaOrAcostamento ? getSemanticId(comp, 'Datum') : getSemanticId(comp, 'Datum');
      const pMid = isPistaOrAcostamento ? getSemanticId(comp, 'Origem_Datum') : getSemanticId(comp, 'Origem_Datum');
      
      points.push({ id: pTop, referenceId: anchorTop, dx: `${sign} * (${exprW})`, dy: `(${exprW}) * (${s} / 100)` });
      links.push({ id: getId("L"), p1: anchorTop, p2: pTop, type: comp.type });
      
      if (isPistaOrAcostamento) {
          const lConfig = comp.layers || {
              revestimento: (comp.type === 'Pista' || comp.type === 'Refúgio') ? [{ id: 'rev-1', name: 'Revestimento', thickness: 0.05 }] : [],
              base: [{ id: 'base-1', name: 'Base', thickness: 0.15 }],
              subBase: [{ id: 'sub-1', name: 'Sub-base', thickness: 0.20 }],
          };
          const allLayers = [...(lConfig.revestimento || []), ...(lConfig.base || []), ...(lConfig.subBase || [])];
          
          let prevLeft = anchorTop;
          let prevRight = pTop;
          
          if (allLayers.length === 0) {
              points.push({ id: pMid, referenceId: anchorTop, dx: "0", dy: `-${d}` });
              points.push({ id: pBot, referenceId: pTop, dx: "0", dy: `-${d}` });
              links.push({ id: getId("L"), p1: pTop, p2: pBot, type: "Base" });
              links.push({ id: getId("L"), p1: pBot, p2: pMid, type: "Base" });
              links.push({ id: getId("L"), p1: pMid, p2: anchorTop, type: "Base" });
          } else {
              for (let i = 0; i < allLayers.length; i++) {
                  const layer = allLayers[i];
                  const isLast = i === allLayers.length - 1;
                  const pLeft = isLast ? pMid : getSemanticId(comp, `Base_${layer.name.replace(/\s+/g, '_')}_Int`);
                  const pRight = isLast ? pBot : getSemanticId(comp, `Base_${layer.name.replace(/\s+/g, '_')}_Ext`);
                  
                  points.push({ id: pLeft, referenceId: prevLeft, dx: "0", dy: `-${layer.thickness}` });
                  points.push({ id: pRight, referenceId: prevRight, dx: "0", dy: `-${layer.thickness}` });
                  
                  let linkType = "Base";
                  if (layer.name.toLowerCase().includes("revestimento")) linkType = comp.type;
                  else if (layer.name.toLowerCase().includes("sub-base") || layer.name.toLowerCase().includes("subbase") || layer.name.toLowerCase().includes("sub base")) linkType = "Sub-base";
                  else if (layer.name.toLowerCase().includes("base")) linkType = "Base";
                  
                  links.push({ id: getId("L"), p1: pLeft, p2: pRight, type: linkType });
                  links.push({ id: getId("L"), p1: prevLeft, p2: pLeft, type: linkType });
                  links.push({ id: getId("L"), p1: prevRight, p2: pRight, type: linkType });
                  
                  prevLeft = pLeft;
                  prevRight = pRight;
              }
          }
      } else {
          points.push({ id: pMid, referenceId: anchorTop, dx: "0", dy: `-${d}` });
          points.push({ id: pBot, referenceId: pTop, dx: "0", dy: `-${d}` });
          links.push({ id: getId("L"), p1: pTop, p2: pBot, type: "Base" });
          links.push({ id: getId("L"), p1: pBot, p2: pMid, type: "Base" });
          links.push({ id: getId("L"), p1: pMid, p2: anchorTop, type: "Base" });
      }
      
      if (isLeft) { leftTopOuter = pTop; leftBotOuter = pBot; }
      else { rightTopOuter = pTop; rightBotOuter = pBot; }
    } else if (comp.type === 'Guia') {
      const width = comp.params.width ?? 0.15;
      const heightAbove = comp.params.heightAbove ?? 0.15;
      const heightBelow = comp.params.heightBelow ?? 0.30;
      const fund = comp.params.foundationDepth ?? 0.05;

      const x_left = isLeft ? -width : 0;
      const x_right = isLeft ? 0 : width;
      const ecx = anchorTop;

      let ptCounter = 0;
      const addP = (dx: number, dy: number, label?: string) => {
          const id = getSemanticId(comp, label ? label.replace(/\s+/g, '_') : `Pt${++ptCounter}`);
          points.push({ id, referenceId: anchorTop, dx: `${dx}`, dy: `${dy}`, label });
          return id;
      };

      const addL = (pA: string, pB: string, type: string = comp.type) => {
          if (pA !== pB) {
              links.push({ id: getId("L"), p1: pA, p2: pB, type });
          }
      };

      const p_ecx = addP(0, 0, 'ECX');
      const p_fie = addP(x_left, -heightBelow, 'FIE');
      const p_fid = addP(x_right, -heightBelow, 'FID');
      
      const p_top_left_outer = addP(x_left, heightAbove, 'TopoEsq');
      const p_top_right_outer = addP(x_right, heightAbove, 'TopoDir');

      addL(p_fie, p_fid);
      
      if (isLeft) {
          addL(p_fid, ecx);
          addL(p_top_left_outer, p_fie);
          addL(ecx, p_top_right_outer);
      } else {
          addL(p_fie, ecx);
          addL(ecx, p_top_left_outer);
          addL(p_fid, p_top_right_outer);
      }

      addL(p_top_left_outer, p_top_right_outer);

      if (fund > 0) {
          const p_fund_left = addP(x_left, -heightBelow - fund, 'FundoEsq');
          const p_fund_right = addP(x_right, -heightBelow - fund, 'FundoDir');
          addL(p_fie, p_fund_left, 'Base');
          addL(p_fund_left, p_fund_right, 'Base');
          addL(p_fund_right, p_fid, 'Base');
      }

      if (isLeft) {
          leftTopOuter = p_top_left_outer;
          leftBotOuter = p_fie;
      } else {
          rightTopOuter = p_top_right_outer;
          rightBotOuter = p_fid;
      }
} else if (comp.type === 'Sarjeta') {
      const shape = comp.params.shape || 'Triangular';
      const width = comp.params.width ?? 1.0;
      const depth = comp.params.depth ?? 0.25;
      const bottomW = comp.params.bottomWidth ?? 0.3;
      
      const p1 = getSemanticId(comp, 'Fundo');
      
      if (shape === 'Triangular') {
          const thickness = comp.params.thickness ?? 0.1;
          const p2 = getSemanticId(comp, "Topo_Ext");
          const p3 = getSemanticId(comp, "Base_Ext");
          const p4 = getSemanticId(comp, "Fundo_Base");
          const p5 = getSemanticId(comp, "Base_Int");

          // Surface
          points.push({ id: p1, referenceId: anchorTop, dx: `${sign * width}`, dy: `-${depth}` });
          points.push({ id: p2, referenceId: p1, dx: `${sign * bottomW}`, dy: `${depth}` });

          // Datum / Thickness (assuming vertical thickness for simplicity, common in Civil 3D basic models)
          points.push({ id: p3, referenceId: p2, dx: `0`, dy: `-${thickness}` });
          points.push({ id: p4, referenceId: p1, dx: `0`, dy: `-${thickness}` });
          points.push({ id: p5, referenceId: anchorTop, dx: `0`, dy: `-${thickness}` });

          links.push({ id: getId("L"), p1: anchorTop, p2: p1, type: comp.type });
          links.push({ id: getId("L"), p1: p1, p2: p2, type: comp.type });
          
          links.push({ id: getId("L"), p1: p2, p2: p3, type: "Base" });
          links.push({ id: getId("L"), p1: p3, p2: p4, type: "Base" });
          links.push({ id: getId("L"), p1: p4, p2: p5, type: "Base" });
          links.push({ id: getId("L"), p1: p5, p2: anchorTop, type: "Base" });

          const fund = comp.params.foundationDepth || 0;
          if (fund > 0) {
              const f1 = getSemanticId(comp, "Fund_Ext");
              const f2 = getSemanticId(comp, "Fund_Int");
              points.push({ id: f1, referenceId: p3, dx: `0`, dy: `-${fund}` });
              points.push({ id: f2, referenceId: p5, dx: `0`, dy: `-${fund}` });
              
              links.push({ id: getId("L"), p1: p3, p2: f1, type: "Foundation" });
              links.push({ id: getId("L"), p1: f1, p2: f2, type: "Foundation" });
              links.push({ id: getId("L"), p1: f2, p2: p5, type: "Foundation" });
          }

          if (isLeft) { leftTopOuter = p2; leftBotOuter = p3; }
          else { rightTopOuter = p2; rightBotOuter = p3; }
      } else if (shape === 'Trapezoidal') {
          const thickness = comp.params.thickness ?? 0.1;
          const fund = comp.params.foundationDepth ?? 0;
          
          const p2 = getSemanticId(comp, "Fundo_Ext");
          const p3 = getSemanticId(comp, "Topo_Ext");
          
          const sideW = (width - bottomW) / 2;
          
          // Surface
          points.push({ id: p1, referenceId: anchorTop, dx: `${sign * sideW}`, dy: `-${depth}` });
          points.push({ id: p2, referenceId: p1, dx: `${sign * bottomW}`, dy: `0` });
          points.push({ id: p3, referenceId: p2, dx: `${sign * sideW}`, dy: `${depth}` });
          
          // Thickness points
          const p4 = getSemanticId(comp, "Base_Ext");
          const p5 = getSemanticId(comp, "Fundo_Base_Ext");
          const p6 = getSemanticId(comp, "Fundo_Base_Int");
          const p7 = getSemanticId(comp, "Base_Int");
          
          points.push({ id: p4, referenceId: p3, dx: `0`, dy: `-${thickness}` });
          points.push({ id: p5, referenceId: p2, dx: `0`, dy: `-${thickness}` });
          points.push({ id: p6, referenceId: p1, dx: `0`, dy: `-${thickness}` });
          points.push({ id: p7, referenceId: anchorTop, dx: `0`, dy: `-${thickness}` });
          
          // Links for Surface
          links.push({ id: getId("L"), p1: anchorTop, p2: p1, type: comp.type });
          links.push({ id: getId("L"), p1: p1, p2: p2, type: comp.type });
          links.push({ id: getId("L"), p1: p2, p2: p3, type: comp.type });
          
          // Links for Thickness Base
          links.push({ id: getId("L"), p1: p3, p2: p4, type: "Base" });
          links.push({ id: getId("L"), p1: p4, p2: p5, type: "Base" });
          links.push({ id: getId("L"), p1: p5, p2: p6, type: "Base" });
          links.push({ id: getId("L"), p1: p6, p2: p7, type: "Base" });
          links.push({ id: getId("L"), p1: p7, p2: anchorTop, type: "Base" });
          
          // Foundation
          if (fund > 0) {
              const f1 = getSemanticId(comp, "Fund_Ext");
              const f2 = getSemanticId(comp, "Fund_Int");
              
              points.push({ id: f1, referenceId: p4, dx: `0`, dy: `-${depth + fund}` });
              points.push({ id: f2, referenceId: p7, dx: `0`, dy: `-${depth + fund}` });
              
              links.push({ id: getId("L"), p1: p4, p2: f1, type: "Foundation" });
              links.push({ id: getId("L"), p1: f1, p2: f2, type: "Foundation" });
              links.push({ id: getId("L"), p1: f2, p2: p7, type: "Foundation" });
          }
          
          if (isLeft) { leftTopOuter = p3; leftBotOuter = fund > 0 ? getId("Oculto") /* won't be used */ : p4; }
          else { rightTopOuter = p3; rightBotOuter = fund > 0 ? getId("Oculto") /* won't be used */ : p4; }
      } else if (shape === 'Simples') {
          const slope = comp.params.slope ?? 0;
          const thickness = comp.params.thickness ?? 0.1;
          const fund = comp.params.foundationDepth ?? 0;
          
          const pTopInner = anchorTop;
          const pTopOuter = getSemanticId(comp, "Topo_Ext");
          const dy1 = (width) * (slope / 100);
          points.push({ id: pTopOuter, referenceId: pTopInner, dx: `${sign * width}`, dy: `${dy1}` });
          links.push({ id: getId("L"), p1: pTopInner, p2: pTopOuter, type: comp.type });
          
          // Thickness layer
          const pBotInner = getSemanticId(comp, "Base_Int");
          const pBotOuter = getSemanticId(comp, "Base_Ext");
          points.push({ id: pBotInner, referenceId: pTopInner, dx: "0", dy: `-${thickness}` });
          points.push({ id: pBotOuter, referenceId: pTopOuter, dx: "0", dy: `-${thickness}` });
          links.push({ id: getId("L"), p1: pBotInner, p2: pBotOuter, type: comp.type });
          links.push({ id: getId("L"), p1: pTopInner, p2: pBotInner, type: comp.type });
          links.push({ id: getId("L"), p1: pTopOuter, p2: pBotOuter, type: comp.type });
          
          // Foundation layer
          if (fund > 0) {
              const pFundInner = getSemanticId(comp, "Fund_Int");
              const pFundOuter = getSemanticId(comp, "Fund_Ext");
              // The bottom of the foundation should be horizontal.
              // So pFundOuter should have the same Y as pFundInner.
              // pFundInner.y = pBotInner.y - fund
              // pFundOuter.y = pFundInner.y
              // Since dy is relative, for pFundOuter, dy from pBotOuter would be:
              // pFundOuter.y - pBotOuter.y = (pBotInner.y - fund) - pBotOuter.y
              // pBotOuter.y = pTopOuter.y - thickness = pTopInner.y + dy1 - thickness
              // pBotInner.y = pTopInner.y - thickness
              // (pTopInner.y - thickness - fund) - (pTopInner.y + dy1 - thickness) = -fund - dy1
              points.push({ id: pFundInner, referenceId: pBotInner, dx: "0", dy: `-${fund}` });
              points.push({ id: pFundOuter, referenceId: pBotOuter, dx: "0", dy: `${-fund - dy1}` });
              links.push({ id: getId("L"), p1: pFundInner, p2: pFundOuter, type: comp.type });
              links.push({ id: getId("L"), p1: pBotInner, p2: pFundInner, type: comp.type });
              links.push({ id: getId("L"), p1: pBotOuter, p2: pFundOuter, type: comp.type });
              
              if (isLeft) { leftTopOuter = pTopOuter; leftBotOuter = pFundOuter; }
              else { rightTopOuter = pTopOuter; rightBotOuter = pFundOuter; }
          } else {
              if (isLeft) { leftTopOuter = pTopOuter; leftBotOuter = pBotOuter; }
              else { rightTopOuter = pTopOuter; rightBotOuter = pBotOuter; }
          }
      } else { // Retangular
          const thickness = comp.params.thickness ?? 0.1;
          const fund = comp.params.foundationDepth ?? 0;
          
          const sideW = (width - bottomW) / 2;
          
          // Points for the U shape surface
          const p1 = getSemanticId(comp, "Topo_Int"); // inner top edge
          const p2 = getSemanticId(comp, "Fundo_Int"); // inner bottom corner
          const p3 = getSemanticId(comp, "Fundo_Ext"); // outer bottom corner
          const p4 = getSemanticId(comp, "Topo_Ext"); // outer top edge
          const p5 = getSemanticId(comp, "Bordo_Ext"); // outer top outer corner
          
          points.push({ id: p1, referenceId: anchorTop, dx: `${sign * sideW}`, dy: `0` });
          points.push({ id: p2, referenceId: p1, dx: `0`, dy: `-${depth}` });
          points.push({ id: p3, referenceId: p2, dx: `${sign * bottomW}`, dy: `0` });
          points.push({ id: p4, referenceId: p3, dx: `0`, dy: `${depth}` });
          points.push({ id: p5, referenceId: p4, dx: `${sign * sideW}`, dy: `0` });
          
          links.push({ id: getId("L"), p1: anchorTop, p2: p1, type: comp.type });
          links.push({ id: getId("L"), p1: p1, p2: p2, type: comp.type });
          links.push({ id: getId("L"), p1: p2, p2: p3, type: comp.type });
          links.push({ id: getId("L"), p1: p3, p2: p4, type: comp.type });
          links.push({ id: getId("L"), p1: p4, p2: p5, type: comp.type });
          
          // Points for the thickness (outer boundary of the U shape)
          const p6 = getSemanticId(comp, "Base_Ext"); // outer bottom of outer wall
          const p7 = getSemanticId(comp, "Base_Int"); // outer bottom of inner wall
          
          points.push({ id: p6, referenceId: p5, dx: `0`, dy: `-${depth + thickness}` });
          points.push({ id: p7, referenceId: anchorTop, dx: `0`, dy: `-${depth + thickness}` });
          
          links.push({ id: getId("L"), p1: p5, p2: p6, type: "Base" });
          links.push({ id: getId("L"), p1: p6, p2: p7, type: "Base" });
          links.push({ id: getId("L"), p1: p7, p2: anchorTop, type: "Base" });
          
          // Foundation
          if (fund > 0) {
              const f1 = getSemanticId(comp, "Fund_Ext");
              const f2 = getSemanticId(comp, "Fund_Int");
              
              points.push({ id: f1, referenceId: p6, dx: `0`, dy: `-${fund}` });
              points.push({ id: f2, referenceId: p7, dx: `0`, dy: `-${fund}` });
              
              links.push({ id: getId("L"), p1: p6, p2: f1, type: "Foundation" });
              links.push({ id: getId("L"), p1: f1, p2: f2, type: "Foundation" });
              links.push({ id: getId("L"), p1: f2, p2: p7, type: "Foundation" });
          }
          
          if (isLeft) { leftTopOuter = p5; leftBotOuter = fund > 0 ? getId("Oculto") /* won't be used */ : p6; }
          else { rightTopOuter = p5; rightBotOuter = fund > 0 ? getId("Oculto") /* won't be used */ : p6; }
      }
    } else if (comp.type === 'Passeio') {
       const width = comp.params.width ?? 1.5;
       const thickness = comp.params.thickness ?? 0.1;
       const slope = comp.params.slope ?? 2;
       
       const pTop = getSemanticId(comp, "Topo_Ext");
       const pBot = getSemanticId(comp, "Base_Ext");
       const pBotInner = getSemanticId(comp, "Base_Int");
       
       const dyTop = - (slope / 100) * width;
       
       points.push({ id: pTop, referenceId: anchorTop, dx: `${sign * width}`, dy: `${dyTop}` });
       points.push({ id: pBot, referenceId: pTop, dx: `0`, dy: `-${thickness}` });
       points.push({ id: pBotInner, referenceId: anchorTop, dx: `0`, dy: `-${thickness}` });
       
       links.push({ id: getId("L"), p1: anchorTop, p2: pTop, type: comp.type });
       links.push({ id: getId("L"), p1: pTop, p2: pBot });
       links.push({ id: getId("L"), p1: pBot, p2: pBotInner });
       links.push({ id: getId("L"), p1: pBotInner, p2: anchorTop });
       
       if (isLeft) { leftTopOuter = pTop; leftBotOuter = pBot; }
       else { rightTopOuter = pTop; rightBotOuter = pBot; }
    } else if (comp.type === 'New Jersey') {
       /* PERFIL NORMATIVO (lib/newJersey): pé, corpo defletor, barriga e pescoço.
          O primeiro ponto do perfil é a própria ancoragem no pavimento. */
       const prof = njProfile(comp.params as any);
       const ids: string[] = [anchorTop];
       prof.pts.slice(1).forEach((q) => {
         const id = getSemanticId(comp, q.code);
         ids.push(id);
         points.push({ id, referenceId: anchorTop, dx: `${sign * q.x}`, dy: `${q.y}` });
       });
       for (let i = 0; i < ids.length; i++) {
         links.push({ id: getId("L"), p1: ids[i], p2: ids[(i + 1) % ids.length], type: comp.type });
       }

       /* Lastro/berço de concreto sob a barreira — concreto que existe em obra,
          logo existe no modelo. */
       if (prof.lastro > 0) {
         const lastroInt = getSemanticId(comp, "NJ_Lastro_Int");
         const lastroExt = getSemanticId(comp, "NJ_Lastro_Ext");
         const balanco = Math.max(0, (prof.lastroWidth - prof.base) / 2);
         points.push({ id: lastroInt, referenceId: anchorTop, dx: `${sign * -balanco}`, dy: `${-prof.lastro}` });
         points.push({ id: lastroExt, referenceId: anchorTop, dx: `${sign * (prof.base + balanco)}`, dy: `${-prof.desnivel - prof.lastro}` });
         const baseExtId = ids[ids.length - 1];
         links.push({ id: getId("L"), p1: anchorTop, p2: lastroInt, type: comp.type });
         links.push({ id: getId("L"), p1: lastroInt, p2: lastroExt, type: comp.type });
         links.push({ id: getId("L"), p1: lastroExt, p2: baseExtId, type: comp.type });
       }

       const topoExtId = ids[prof.dupla ? ids.length - 3 : ids.length - 2];
       if (isLeft) { leftTopOuter = topoExtId; }
       else { rightTopOuter = topoExtId; }
    } else if (comp.type === 'Talude') {
       const cut = comp.params.cutSlope ?? 1.5;
       const fill = comp.params.fillSlope ?? 1.5;
       const maxDrop = comp.params.maxDrop ?? 5;
       const benchWidth = comp.params.benchWidth ?? 2;
       const benchSlope = comp.params.benchSlope ?? -5;
       const pEnd = getSemanticId(comp, "Pe_Talude");
       points.push({ 
         id: pEnd, 
         referenceId: anchorTop, 
         dx: `${sign} * Math.abs(EG_Z - ${anchorTop}_Y) * ((EG_Z - ${anchorTop}_Y) >= 0 ? ${cut} : ${fill})`, 
         dy: `EG_Z - ${anchorTop}_Y`,
         targetSurface: true,
         cutSlope: cut,
         fillSlope: fill,
         maxDrop: maxDrop,
         benchWidth: benchWidth,
         benchSlope: benchSlope,
         side: isLeft ? 'Left' : 'Right'
       });
       links.push({ id: getId("L"), p1: anchorTop, p2: pEnd, type: comp.type });
       
       if (isLeft) { leftTopOuter = pEnd; }
       else { rightTopOuter = pEnd; }
    }
  }
  
  return { points, links, parameters };
}
