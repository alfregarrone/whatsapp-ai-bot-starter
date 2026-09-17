import { describe, it, expect } from 'vitest';
import { chunkText, normalizeText } from '../src/lib/chunk';

const parrafo = (n: number) => `Párrafo ${n}. ${'contenido '.repeat(20)}`.trim();

describe('normalizeText', () => {
  it('unifica saltos y espacios sin romper párrafos', () => {
    expect(normalizeText('a\r\n\r\n\r\n\r\nb')).toBe('a\n\nb');
    expect(normalizeText('  hola    mundo  ')).toBe('hola mundo');
  });
});

describe('chunkText', () => {
  it('devuelve un solo fragmento si el texto entra', () => {
    expect(chunkText('texto corto')).toEqual(['texto corto']);
  });

  it('devuelve vacío con texto vacío', () => {
    expect(chunkText('   ')).toEqual([]);
  });

  it('respeta aproximadamente el tamaño objetivo', () => {
    const texto = Array.from({ length: 12 }, (_, i) => parrafo(i)).join('\n\n');
    const chunks = chunkText(texto, { size: 500, overlap: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(700);
    }
  });

  it('corta por las bravas cuando una unidad es más larga que el chunk', () => {
    const largo = 'x'.repeat(2000);
    const chunks = chunkText(largo, { size: 300, overlap: 0 });

    expect(chunks.length).toBeGreaterThanOrEqual(7);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(300);
  });

  it('no pierde contenido', () => {
    const texto = Array.from({ length: 6 }, (_, i) => parrafo(i)).join('\n\n');
    const chunks = chunkText(texto, { size: 400, overlap: 0 });

    for (let i = 0; i < 6; i += 1) {
      expect(chunks.some((c) => c.includes(`Párrafo ${i}.`))).toBe(true);
    }
  });

  it('valida los parámetros', () => {
    expect(() => chunkText('hola', { size: 0 })).toThrow();
    expect(() => chunkText('hola', { size: 100, overlap: 100 })).toThrow();
    expect(() => chunkText('hola', { size: 100, overlap: -1 })).toThrow();
  });
});
