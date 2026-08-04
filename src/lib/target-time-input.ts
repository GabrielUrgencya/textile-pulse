export const targetTimeFields = ["shiftStart", "shiftEnd", "lunchStart", "lunchEnd"] as const;

export type TargetTimeField = (typeof targetTimeFields)[number];

type TargetTimeValues = Record<TargetTimeField, string>;

/**
 * Produz o próximo estado dos horários a partir do valor emitido pelo input.
 * `input` é disparado enquanto controles de hora nativos são preenchidos por
 * automação ou pelo seletor segmentado do navegador.
 */
export function withTargetTimeValue<T extends TargetTimeValues>(
  current: T,
  field: TargetTimeField,
  value: string,
): T {
  return { ...current, [field]: value } as T;
}
