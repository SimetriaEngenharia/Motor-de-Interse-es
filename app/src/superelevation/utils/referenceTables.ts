export const FATOR_DE_ATRITO: Record<string, Record<number, number>> = {
  DEFAULT: {
    30: 0.20,
    40: 0.18,
    50: 0.16,
    60: 0.15,
    70: 0.15,
    80: 0.14,
    90: 0.14,
    100: 0.13,
    110: 0.12,
    120: 0.11,
  },
  'DNIT - Interseções': {
    20: 0.32,
    25: 0.32,
    30: 0.28,
    40: 0.23,
    50: 0.19,
    60: 0.17,
    70: 0.15,
  }
};

export const RAMPA_MAXIMA: Record<string, Record<number, number>> = {
  DEFAULT: {
    30: 0.73,
    40: 0.73,
    50: 0.65,
    60: 0.59,
    70: 0.54,
    80: 0.50,
    90: 0.47,
    100: 0.43,
    110: 0.43,
    120: 0.43
  },
  'DNIT - Interseções': {
    20: 0.80,
    30: 0.75,
    40: 0.70,
    50: 0.65,
    60: 0.60,
    70: 0.55,
    80: 0.50,
    90: 0.47,
    100: 0.44,
    110: 0.41,
    120: 0.38
  }
};

export const getFmax = (v: number, norm?: string) => {
    const table = (norm === 'DNIT - Interseções') ? FATOR_DE_ATRITO['DNIT - Interseções'] : FATOR_DE_ATRITO.DEFAULT;
    return table[v] || (norm === 'DNIT - Interseções' ? 0.15 : 0.14); 
};

export const getRmax = (v: number, norm?: string) => {
    const table = (norm === 'DNIT - Interseções') ? RAMPA_MAXIMA['DNIT - Interseções'] : RAMPA_MAXIMA.DEFAULT;
    return table[v] || (norm === 'DNIT - Interseções' ? 0.50 : 0.43);
};

export const SUPERELEVATION_DISPENSABLE = {
  DNIT: {
    30: 450,
    40: 800,
    50: 1250,
    60: 1800,
    70: 2450,
    80: 3200,
    90: 4050,
    100: 5000,
    110: 5000,
    120: 5000,
    130: 5000
  },
  DER: {
    30: 450,
    40: 800,
    50: 1100,
    60: 1530,
    70: 2020,
    80: 2500,
    90: 3030,
    100: 3700,
    110: 4270,
    120: 4990,
    130: 5450
  }
};

export const TRANSITION_DISPENSABLE = {
  // Raios acima dos quais podem ser dispensadas curvas de transicao
  DNIT: {
    30: 170,
    40: 300,
    50: 500,
    60: 700,
    70: 950,
    80: 1200,
    90: 1550,
    100: 1900,
    110: 2300,
    120: 2800
  },
  DER: {
    // Estimations / rules: usually same as AASHTO or similar to DNIT.
    // The user didn't provide exactly the radii values for DER in the image (it is cut off or doesn't show radii).
    // Let me leave them as DNIT for now or extrapolate if possible. Wait, "tabela 10.7 temos tambem DER (ashtoo) e DNIT (dner)" is for superelevation.
    // For transition, the user provided "DerSp.png" but the image shows:
    // "VALORES DOS RAIOS ACIMA DOS QUAIS PODEM SER DISPENSADAS CURVAS DE TRANSIÇÃO - DER/SP" -> it only shows speed 20..130 but row is "Comprimento Minimo Transicao" and then another line below that. Wait! I can't read the radii from that image.
    // I should create the structure. I'll use the DNIT ones as fallback for DER for now, or just leave it empty.
    // Let me try to see what's in the image from the user: the image is cut off.
    30: 170,
    40: 300,
    50: 500,
    60: 700,
    70: 950,
    80: 1200,
    90: 1550,
    100: 1900,
    110: 2300,
    120: 2800
  }
};

export const getSuperelevationDispensableRadius = (v: number, norm: string) => {
  const tableNorm = (norm === 'DNIT - Interseções' || !(norm in SUPERELEVATION_DISPENSABLE)) ? 'DNIT' : norm as 'DNIT' | 'DER';
  const table = SUPERELEVATION_DISPENSABLE[tableNorm];
  const speeds = Object.keys(table).map(Number).sort((a,b) => a - b);
  // find closest speed or exact
  let closestSpeed = speeds[0];
  for (const speed of speeds) {
    if (v >= speed) closestSpeed = speed;
  }
  return table[closestSpeed as keyof typeof table];
};

export const getTransitionDispensableRadius = (v: number, norm: string) => {
  const tableNorm = (norm === 'DNIT - Interseções' || !(norm in TRANSITION_DISPENSABLE)) ? 'DNIT' : norm as 'DNIT' | 'DER';
  const table = TRANSITION_DISPENSABLE[tableNorm];
  const speeds = Object.keys(table).map(Number).sort((a,b) => a - b);
  let closestSpeed = speeds[0];
  for (const speed of speeds) {
    if (v >= speed) closestSpeed = speed;
  }
  return table[closestSpeed as keyof typeof table];
};
