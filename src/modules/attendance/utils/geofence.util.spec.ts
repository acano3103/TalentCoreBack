import {
  distanciaAlPoligono,
  distanciaMetros,
  puntoEnPoligono,
  type Punto,
} from './geofence.util';

describe('geofence.util', () => {
  const cuadrado: Punto[] = [
    { lat: 19.43, lng: -99.14 },
    { lat: 19.43, lng: -99.13 },
    { lat: 19.44, lng: -99.13 },
    { lat: 19.44, lng: -99.14 },
  ];

  it('dos puntos idénticos distan 0 m', () => {
    const p: Punto = { lat: 19.4326, lng: -99.1332 };
    expect(distanciaMetros(p, p)).toBe(0);
  });

  it('calcula una distancia conocida con tolerancia de ±5 m', () => {
    const a: Punto = { lat: 19.4326, lng: -99.1332 };
    const b: Punto = { lat: 19.4326, lng: -99.1232 };

    expect(distanciaMetros(a, b)).toBeGreaterThanOrEqual(1044);
    expect(distanciaMetros(a, b)).toBeLessThanOrEqual(1054);
  });

  it('detecta un punto dentro de un cuadrado simple', () => {
    expect(puntoEnPoligono({ lat: 19.435, lng: -99.135 }, cuadrado)).toBe(true);
  });

  it('detecta un punto fuera de un cuadrado simple', () => {
    expect(puntoEnPoligono({ lat: 19.45, lng: -99.15 }, cuadrado)).toBe(false);
  });

  it('un punto exactamente sobre un vértice está dentro', () => {
    expect(puntoEnPoligono(cuadrado[0], cuadrado)).toBe(true);
    expect(distanciaAlPoligono(cuadrado[0], cuadrado)).toBe(0);
  });

  it('cierra el anillo aunque el primer y último vértice no se repitan', () => {
    const abierto = cuadrado;
    const cerrado = [...cuadrado, cuadrado[0]];
    const dentro: Punto = { lat: 19.435, lng: -99.135 };

    expect(puntoEnPoligono(dentro, abierto)).toBe(true);
    expect(puntoEnPoligono(dentro, cerrado)).toBe(true);
  });
});
