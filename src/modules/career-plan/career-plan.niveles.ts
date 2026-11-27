/**
 * CatNivelesSalario no tiene columna de orden. El id es el orden:
 * un id mayor es un nivel salarial mayor.
 */
export function tipoDeNiveles(
  origen: number,
  destino: number,
): 'ascenso' | 'lateral' | 'menor' {
  if (destino > origen) return 'ascenso';
  if (destino === origen) return 'lateral';
  return 'menor';
}
