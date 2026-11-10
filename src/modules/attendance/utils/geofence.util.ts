export type Punto = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function anilloCerrado(vertices: Punto[]): Punto[] {
  if (vertices.length === 0) {
    return [];
  }

  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (first.lat === last.lat && first.lng === last.lng) {
    return vertices;
  }

  return [...vertices, first];
}

function mismoPunto(a: Punto, b: Punto): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

function puntoEnSegmento(punto: Punto, a: Punto, b: Punto): boolean {
  const cross =
    (punto.lat - a.lat) * (b.lng - a.lng) -
    (punto.lng - a.lng) * (b.lat - a.lat);
  if (cross !== 0) {
    return false;
  }

  const dot =
    (punto.lng - a.lng) * (b.lng - a.lng) +
    (punto.lat - a.lat) * (b.lat - a.lat);
  if (dot < 0) {
    return false;
  }

  const len2 =
    (b.lng - a.lng) * (b.lng - a.lng) + (b.lat - a.lat) * (b.lat - a.lat);
  return dot <= len2;
}

function aMetrosLocales(punto: Punto, origen: Punto): { x: number; y: number } {
  const lat0 = toRadians(origen.lat);
  return {
    x: toRadians(punto.lng - origen.lng) * Math.cos(lat0) * EARTH_RADIUS_M,
    y: toRadians(punto.lat - origen.lat) * EARTH_RADIUS_M,
  };
}

function distanciaPuntoASegmento(punto: Punto, a: Punto, b: Punto): number {
  if (mismoPunto(a, b)) {
    return distanciaMetros(punto, a);
  }

  const p = aMetrosLocales(punto, a);
  const q = aMetrosLocales(b, a);
  const len2 = q.x * q.x + q.y * q.y;
  let t = (p.x * q.x + p.y * q.y) / len2;
  t = Math.max(0, Math.min(1, t));

  const closest: Punto = {
    lat: a.lat + t * (b.lat - a.lat),
    lng: a.lng + t * (b.lng - a.lng),
  };
  return distanciaMetros(punto, closest);
}

/** Distancia en metros entre dos puntos (haversine, radio 6371000 m) */
export function distanciaMetros(a: Punto, b: Punto): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const hav =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));

  return EARTH_RADIUS_M * c;
}

/** Punto dentro de polígono por ray casting. Cierra el anillo automáticamente */
export function puntoEnPoligono(punto: Punto, vertices: Punto[]): boolean {
  if (vertices.length < 3) {
    return false;
  }

  if (vertices.some((v) => mismoPunto(punto, v))) {
    return true;
  }

  const ring = anilloCerrado(vertices);
  for (let i = 0; i < ring.length - 1; i++) {
    if (puntoEnSegmento(punto, ring[i], ring[i + 1])) {
      return true;
    }
  }

  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    const cruzaLat = vi.lat > punto.lat !== vj.lat > punto.lat;
    if (cruzaLat) {
      const lngInterseccion =
        ((vj.lng - vi.lng) * (punto.lat - vi.lat)) / (vj.lat - vi.lat) +
        vi.lng;
      if (punto.lng < lngInterseccion) {
        inside = !inside;
      }
    }
    j = i;
  }

  return inside;
}

/** Distancia mínima del punto al borde del polígono, en metros */
export function distanciaAlPoligono(punto: Punto, vertices: Punto[]): number {
  if (vertices.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (vertices.length === 1) {
    return distanciaMetros(punto, vertices[0]);
  }

  const ring = anilloCerrado(vertices);
  let minima = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length - 1; i++) {
    const d = distanciaPuntoASegmento(punto, ring[i], ring[i + 1]);
    if (d < minima) {
      minima = d;
    }
  }
  return minima;
}
