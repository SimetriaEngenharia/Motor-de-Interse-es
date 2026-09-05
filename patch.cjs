const fs = require('fs');
let code = fs.readFileSync('app/src/store.ts', 'utf8');

const oldLadoAccel = `    const ladoAccel = (side: 1 | -1) => {
      const decel = (side === 1 ? papel.fwd : papel.back) === "Desaceleração";
      return {
        L: decel ? int.decelL || 50 : int.accelL || 50,
        T: decel ? int.decelT || 30 : int.accelT || 30,
        W: decel
          ? int.decelWidth ?? int.accelWidth ?? FAIXA_ADICIONAL_W
          : int.accelWidth ?? FAIXA_ADICIONAL_W,
        staTang:
          int.mainStation +
          side * (branchLaneW + ((side === 1 ? int.rightRadius : int.leftRadius) || 15)),
      };
    };`;

const newLadoAccel = `    const ladoAccel = (side: 1 | -1) => {
      const decel = (side === 1 ? papel.fwd : papel.back) === "Desaceleração";
      
      const R = (side === 1 ? int.rightRadius : int.leftRadius) || 15;
      const mDir = side === 1 ? mainUnitDir : { x: -mainUnitDir.x, y: -mainUnitDir.y };
      const dot = mDir.x * branchUnitDir.x + mDir.y * branchUnitDir.y;
      const cross = mDir.x * branchUnitDir.y - mDir.y * branchUnitDir.x;
      let angle = Math.atan2(Math.abs(cross), dot);
      if (angle < 0.1) angle = 0.1;
      if (angle > Math.PI - 0.1) angle = Math.PI - 0.1;
      
      const dist = branchLaneW / Math.abs(Math.sin(angle)) + R / Math.tan(angle / 2);
      
      return {
        L: decel ? int.decelL || 50 : int.accelL || 50,
        T: decel ? int.decelT || 30 : int.accelT || 30,
        W: decel
          ? int.decelWidth ?? int.accelWidth ?? FAIXA_ADICIONAL_W
          : int.accelWidth ?? FAIXA_ADICIONAL_W,
        staTang: int.mainStation + side * dist,
      };
    };`;

if (code.includes(oldLadoAccel)) {
  code = code.replace(oldLadoAccel, newLadoAccel);
  fs.writeFileSync('app/src/store.ts', code);
  console.log("Patched successfully!");
} else {
  console.log("Could not find the target code to patch.");
}
