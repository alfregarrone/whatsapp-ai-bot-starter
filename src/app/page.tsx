'use client';

import { useState } from 'react';

interface Answer {
  answer: string;
  escalated: boolean;
  sources: string[];
  demo?: boolean;
}

export default function Home() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Array<{ question: string; result: Answer }>>([]);
  const [demo, setDemo] = useState(false);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Error desconocido');

      setTurns((prev) => [...prev, { question: trimmed, result: data as Answer }]);
      if ((data as Answer).demo) setDemo(true);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <header>
        <h1>WhatsApp AI Bot Starter</h1>
        <p className="lede">
          Probá el bot sin conectar WhatsApp: responde con los documentos que hayas ingerido
          en la base de conocimiento.
        </p>
      </header>

      {demo && (
        <p className="demo-note">
          Corriendo en <strong>modo demo</strong>: la base de conocimiento es un FAQ de
          ejemplo y la búsqueda es léxica, sin embeddings. En modo normal indexa tus
          documentos en Supabase con pgvector.
        </p>
      )}

      <section className="log" aria-live="polite">
        {turns.length === 0 && !loading && (
          <p className="empty">
            Probá con algo del estilo <em>&ldquo;¿cuál es el horario de atención?&rdquo;</em>
          </p>
        )}

        {turns.map((turn, index) => (
          <article key={index} className="turn">
            <p className="q">{turn.question}</p>
            <div className={`a${turn.result.escalated ? ' escalated' : ''}`}>
              <p>{turn.result.answer}</p>
              {turn.result.sources.length > 0 && (
                <p className="sources">Fuentes: {turn.result.sources.join(', ')}</p>
              )}
            </div>
          </article>
        ))}

        {loading && <p className="empty">Pensando…</p>}
      </section>

      {error && <p className="error">{error}</p>}

      <form onSubmit={ask}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Escribí una consulta…"
          aria-label="Consulta"
          maxLength={1000}
        />
        <button type="submit" disabled={loading || question.trim().length === 0}>
          Preguntar
        </button>
      </form>

      <footer>
        <a href="https://github.com/alfregarrone/whatsapp-ai-bot-starter">Código en GitHub</a>
      </footer>
    </main>
  );
}
