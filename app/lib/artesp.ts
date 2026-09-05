export const ACCEL_LENGTHS: Record<number, Record<number, number>> = {
  // Main Speed: { Branch Speed: Length }
  60: { 0: 95, 20: 80, 30: 65, 40: 45 },
  70: { 0: 150, 20: 130, 30: 110, 40: 90, 50: 65 },
  80: { 0: 200, 20: 180, 30: 165, 40: 145, 50: 115, 60: 65 },
  90: { 0: 260, 20: 245, 30: 225, 40: 205, 50: 175, 60: 125, 70: 35 },
  100: { 0: 345, 20: 325, 30: 305, 40: 285, 50: 255, 60: 205, 70: 110, 80: 40 },
  110: { 0: 430, 20: 410, 30: 390, 40: 370, 50: 340, 60: 290, 70: 200, 80: 125 },
  120: { 0: 545, 20: 530, 30: 515, 40: 490, 50: 460, 60: 410, 70: 325, 80: 245 }
};

export const DECEL_LENGTHS: Record<number, Record<number, number>> = {
  // Main Speed: { Branch Speed: Length }
  60: { 0: 95, 20: 90, 30: 80, 40: 65, 50: 55 },
  70: { 0: 110, 20: 105, 30: 95, 40: 85, 50: 70, 60: 55 },
  80: { 0: 130, 20: 125, 30: 115, 40: 100, 50: 90, 60: 80, 70: 55 },
  90: { 0: 145, 20: 140, 30: 135, 40: 120, 50: 110, 60: 100, 70: 75, 80: 60 },
  100: { 0: 170, 20: 165, 30: 155, 40: 145, 50: 135, 60: 120, 70: 100, 80: 85 },
  110: { 0: 180, 20: 180, 30: 170, 40: 160, 50: 150, 60: 140, 70: 120, 80: 105 },
  120: { 0: 200, 20: 195, 30: 185, 40: 175, 50: 170, 60: 155, 70: 140, 80: 120 }
};

export const ACCEL_ADJUST_GRADE_ASC_3_4: Record<number, number> = { 60: 1.3, 70: 1.3, 80: 1.4, 90: 1.4, 100: 1.5, 110: 1.5, 120: 1.5 };
export const ACCEL_ADJUST_GRADE_ASC_5_6: Record<number, number> = { 60: 1.4, 70: 1.4, 80: 1.4, 90: 1.5, 100: 1.6, 110: 1.9, 120: 2.0 };
// Descending grade factor is 0.70 for 60, 0.65 for 70, etc.
export const ACCEL_ADJUST_GRADE_DESC_3_4: Record<number, number> = { 60: 0.7, 70: 0.65, 80: 0.65, 90: 0.6, 100: 0.6, 110: 0.6, 120: 0.6 };
export const ACCEL_ADJUST_GRADE_DESC_5_6: Record<number, number> = { 60: 0.6, 70: 0.6, 80: 0.55, 90: 0.55, 100: 0.5, 110: 0.5, 120: 0.5 };

export function calculateARTESP(
  type: "accel" | "decel",
  mainSpeed: number,
  branchSpeed: number,
  mainGrade: number,
  accessType: "standard" | "comercial" | "nao_comercial_polo" | "residencial" = "standard"
) {
  if (accessType === "residencial") {
    return { L: 15, T: 15 };
  }
  if (accessType === "comercial" || accessType === "nao_comercial_polo") {
    const isDecel = type === "decel";
    let L = isDecel ? 100 : 120;
    let T = 75;
    
    // Adjust by grade
    if (Math.abs(mainGrade) >= 3) {
      const f = getGradeFactor(type, mainSpeed, mainGrade);
      L = L * f;
    }
    return { L: Math.ceil(L), T };
  }

  // Standard type
  const table = type === "accel" ? ACCEL_LENGTHS : DECEL_LENGTHS;
  // find closest main speed
  const mainSpeeds = Object.keys(table).map(Number).sort((a, b) => a - b);
  let vMain = mainSpeeds[0];
  for (let s of mainSpeeds) if (mainSpeed >= s) vMain = s;

  // find closest branch speed
  const branchSpeeds = Object.keys(table[vMain]).map(Number).sort((a, b) => a - b);
  let vBranch = branchSpeeds[0];
  for (let s of branchSpeeds) if (branchSpeed >= s) vBranch = s;

  let L = table[vMain][vBranch] || 50;

  // Grade adjust
  if (Math.abs(mainGrade) >= 3) {
    const f = getGradeFactor(type, vMain, mainGrade);
    L = L * f;
  }

  return { L: Math.ceil(L), T: 90 };
}

function getGradeFactor(type: "accel" | "decel", mainSpeed: number, mainGrade: number): number {
  if (type === "decel") {
    if (mainGrade >= 5) return 0.8;
    if (mainGrade >= 3) return 0.9;
    if (mainGrade <= -5) return 1.35;
    if (mainGrade <= -3) return 1.2;
    return 1.0;
  } else {
    // accel
    const speeds = [60, 70, 80, 90, 100, 110, 120];
    let vMain = 60;
    for (let s of speeds) if (mainSpeed >= s) vMain = s;

    if (mainGrade >= 5) return ACCEL_ADJUST_GRADE_ASC_5_6[vMain] || 1.0;
    if (mainGrade >= 3) return ACCEL_ADJUST_GRADE_ASC_3_4[vMain] || 1.0;
    if (mainGrade <= -5) return ACCEL_ADJUST_GRADE_DESC_5_6[vMain] || 1.0;
    if (mainGrade <= -3) return ACCEL_ADJUST_GRADE_DESC_3_4[vMain] || 1.0;
    return 1.0;
  }
}
