# WhatsApp AI Bot Starter

> Bot de WhatsApp que responde consultas de clientes con los documentos de tu negocio. Next.js + Supabase (pgvector) + el LLM que quieras. Listo para desplegar en Vercel.

[![CI](https://github.com/alfregarrone/whatsapp-ai-bot-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/alfregarrone/whatsapp-ai-bot-starter/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Qué problema resuelve

Un negocio chico contesta veinte veces por día las mismas cinco preguntas: horarios, dirección,
formas de pago, si tienen stock, cuánto tarda el envío. Las respuestas ya están escritas en algún
lado —una FAQ, un PDF, un Google Doc— pero nadie las lee: te escriben por WhatsApp.

Este starter toma esos documentos, los indexa, y contesta por WhatsApp **solamente con lo que está
ahí**. Cuando la respuesta no está, no inventa: avisa que deriva a una persona.

## Cómo funciona

```
documentos (.md/.txt/.csv)
        │  npm run ingest
        ▼
  chunking → embeddings → Supabase (pgvector)

WhatsApp Cloud API
        │  webhook firmado (HMAC SHA-256)
        ▼
  /api/whatsapp → búsqueda por similitud → prompt con contexto → LLM
        │
        ▼
  respuesta + registro de la conversación en Postgres
```

## Correrlo local

```bash
git clone https://github.com/alfregarrone/whatsapp-ai-bot-starter.git
cd whatsapp-ai-bot-starter
cp .env.example .env.local     # completá las claves
npm install && npm run dev
```

1. Creá un proyecto en Supabase y pegá [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor.
2. Poné tus documentos en `knowledge/` y corré `npm run ingest`.
3. Abrí `http://localhost:3000` y probá el bot **sin conectar WhatsApp todavía**.
4. Cuando responda bien, conectá el webhook (abajo).

## Conectar WhatsApp

1. En [Meta for Developers](https://developers.facebook.com), creá una app de tipo *Business* y
   agregá el producto **WhatsApp**.
2. Copiá el *Phone number ID*, el token y el *App secret* al `.env.local`.
3. Elegí cualquier string como `WHATSAPP_VERIFY_TOKEN`.
4. Desplegá (Vercel) y registrá el webhook en `https://tu-dominio/api/whatsapp`, con ese mismo
   verify token. Meta hace un GET de verificación; si las variables están bien, queda suscripto.
5. Suscribite al evento `messages`.

## Decisiones y limitaciones

- **La firma del webhook se valida siempre** (`X-Hub-Signature-256`, comparación en tiempo
  constante). Sin eso, cualquiera que descubra la URL le inyecta mensajes al bot y te gasta la
  cuota del modelo.
- **Se responde 200 antes de procesar.** Meta reintenta si el webhook tarda, y un reintento sin
  deduplicación significa contestarle dos veces al cliente. La deduplicación es el `external_id`
  único sobre el id de mensaje de WhatsApp.
- **Umbral de similitud antes de llamar al modelo.** Si ningún fragmento supera `MIN_SIMILARITY`,
  se deriva a una persona sin gastar una llamada. Un bot que inventa precios es peor que no tener bot.
- **Proveedor de chat intercambiable** (Groq o Anthropic) detrás de una interfaz de dos funciones.
  Los embeddings usan OpenAI porque Groq no ofrece: es el único punto atado a ese proveedor y está
  aislado en `src/lib/llm.ts`.
- **RLS activado y sin políticas**, a propósito: todo el acceso pasa por el service role en el
  servidor. Cuando agregues un panel con login, las políticas se escriben ahí y nada más queda abierto.
- **Índice ivfflat**, no HNSW: para bases de FAQ (cientos o miles de fragmentos) alcanza y ocupa
  bastante menos.

**Limitaciones actuales:** solo mensajes de texto (ni audios ni imágenes), un único número de
WhatsApp, sin panel de administración con login, sin rate limiting por número, y el historial que se
manda al modelo son los últimos 10 mensajes sin resumir.

## Tests

```bash
npm test        # chunking, armado del prompt, firma y parseo del webhook
npm run typecheck
```

Los tests no le pegan a ninguna API: la lógica que importa (partir documentos, decidir si hay
contexto suficiente, verificar la firma) está separada de las llamadas de red justamente para eso.

## Licencia

MIT © [Alfredo Garrone](https://github.com/alfregarrone) — construido en [CORX](https://corxargentina.com).
