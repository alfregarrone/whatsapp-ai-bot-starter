import { describe, it, expect } from 'vitest';
import {
  buildMessages,
  buildSystemPrompt,
  shouldEscalate,
  MAX_HISTORY_MESSAGES,
  MIN_SIMILARITY,
} from '../src/lib/prompt';

const chunk = (similarity: number, content = 'Abrimos de 9 a 18.') => ({
  content,
  source: 'faq.md',
  similarity,
});

describe('buildSystemPrompt', () => {
  it('incluye el nombre del negocio y el contexto relevante', () => {
    const prompt = buildSystemPrompt({
      businessName: 'CORX',
      context: [chunk(0.8)],
      question: '¿qué horario tienen?',
    });

    expect(prompt).toContain('CORX');
    expect(prompt).toContain('Abrimos de 9 a 18.');
    expect(prompt).toContain('faq.md');
  });

  it('descarta fragmentos por debajo del umbral', () => {
    const prompt = buildSystemPrompt({
      businessName: 'CORX',
      context: [chunk(MIN_SIMILARITY - 0.01, 'ruido irrelevante')],
      question: 'hola',
    });

    expect(prompt).not.toContain('ruido irrelevante');
    expect(prompt).toContain('no se encontró información relevante');
  });

  it('suma las instrucciones del negocio cuando existen', () => {
    const prompt = buildSystemPrompt({
      businessName: 'CORX',
      context: [chunk(0.9)],
      question: 'hola',
      extraInstructions: 'No des precios por WhatsApp.',
    });

    expect(prompt).toContain('No des precios por WhatsApp.');
  });
});

describe('buildMessages', () => {
  it('arma system + historia + pregunta', () => {
    const messages = buildMessages({
      businessName: 'CORX',
      context: [chunk(0.9)],
      history: [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: '¡Hola! ¿En qué te ayudo?' },
      ],
      question: '¿qué horario tienen?',
    });

    expect(messages[0].role).toBe('system');
    expect(messages.at(-1)).toEqual({ role: 'user', content: '¿qué horario tienen?' });
    expect(messages).toHaveLength(4);
  });

  it('recorta la historia larga', () => {
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = Array.from(
      { length: 40 },
      (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `mensaje ${i}`,
      }),
    );

    const messages = buildMessages({
      businessName: 'CORX',
      context: [chunk(0.9)],
      history,
      question: 'última',
    });

    expect(messages).toHaveLength(MAX_HISTORY_MESSAGES + 2);
    expect(messages[1].content).toBe('mensaje 30');
  });
});

describe('shouldEscalate', () => {
  it('escala cuando no hay nada por encima del umbral', () => {
    expect(shouldEscalate([])).toBe(true);
    expect(shouldEscalate([chunk(0.1)])).toBe(true);
  });

  it('no escala si hay contexto bueno', () => {
    expect(shouldEscalate([chunk(0.1), chunk(0.7)])).toBe(false);
  });
});
