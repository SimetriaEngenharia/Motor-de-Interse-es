export function formatStation(station: number): string {
  const isNegative = station < 0;
  const absStation = Math.abs(station);
  const hundreds = Math.floor(absStation / 100);
  const remainder = (absStation % 100).toFixed(2);
  const formatted = `${hundreds}+${remainder.padStart(5, '0')}m`;
  return isNegative ? `-${formatted}` : formatted;
}

export function formatSlope(slope: number): string {
  return `${slope.toFixed(2)}%`;
}
