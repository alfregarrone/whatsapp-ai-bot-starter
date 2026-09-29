import { describe, it, expect } from 'vitest';
import { searchDemoChunks, isDemoMode } from '../src/lib/demo';
import { MIN_SIMILARITY, shouldEscalate } from '../src/lib/prompt';

describe('searchDemoChunks', () => {
  it('encuentra el fragmento correcto para consultas típicas', () => {
    const casos: Array<[string, string]> = [
      ['¿cuál es el horario de atención?', 'lunes a viernes'],
      ['¿hacen envíos al interior?', 'envíos'],
      ['¿puedo pagar con tarjeta?', 'crédito'],
      ['¿cuánto dura la garantía?', 'garantía'],
      ['¿dónde quedan?', 'Siempreviva'],
    ];

    for (const [pregunta, esperado] of casos) {
      const resultados = searchDemoChunks(pregunta);
      expect(resultados.length, pregunta).toBeGreaterThan(0);
      expect(resultados[0].content.toLowerCase(), pregunta).toContain(esperado.toLowerCase());
    }
  });

  it('supera el umbral de similitud en consultas que sí están cubiertas', () => {
    const resultados = searchDemoChunks('¿cuál es el horario de atención?');
    expect(resultados[0].similarity).toBeGreaterThanOrEqual(MIN_SIMILARITY);
    expect(shouldEscalate(resultados)).toBe(false);
  });

  it('deriva a un humano cuando la consulta no está cubierta', () => {
    const resultados = searchDemoChunks('quiero contratar un desarrollador senior de Kubernetes');
    expect(shouldEscalate(resultados)).toBe(true);
  });

  it('ignora tildes, mayúsculas y puntuación', () => {
    const conTildes = searchDemoChunks('¿Cuál es el HORARIO?');
    const sinTildes = searchDemoChunks('cual es el horario');
    expect(conTildes[0].content).toBe(sinTildes[0].content);
  });

  it('devuelve vacío con consultas sin términos útiles', () => {
    expect(searchDemoChunks('y el de la')).toEqual([]);
    expect(searchDemoChunks('')).toEqual([]);
  });

  it('respeta el límite y ordena por similitud', () => {
    const resultados = searchDemoChunks('envío pago garantía horario', 2);
    expect(resultados.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < resultados.length; i += 1) {
      expect(resultados[i - 1].similarity).toBeGreaterThanOrEqual(resultados[i].similarity);
    }
  });

  it('marca la fuente como modo demo', () => {
    expect(searchDemoChunks('horario')[0].source).toContain('demo');
  });
});

describe('isDemoMode', () => {
  it('sigue la variable de entorno', () => {
    const original = process.env.DEMO_MODE;

    process.env.DEMO_MODE = 'true';
    expect(isDemoMode()).toBe(true);

    process.env.DEMO_MODE = 'false';
    expect(isDemoMode()).toBe(false);

    delete process.env.DEMO_MODE;
    expect(isDemoMode()).toBe(false);

    if (original !== undefined) process.env.DEMO_MODE = original;
  });
});
