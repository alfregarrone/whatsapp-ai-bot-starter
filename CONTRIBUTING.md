# Contribuir a whatsapp-ai-bot-starter

Esto es un starter: la gracia es que se entienda de punta a punta en una tarde.
Toda contribución se mide contra eso.

## Antes de escribir código

- **Bug:** abrí un issue con los pasos y, si podés, el payload del webhook (sin datos personales).
- **Función nueva:** abrí un issue primero. Un starter que hace todo deja de servir como starter.

## El flujo

```bash
git clone https://github.com/alfregarrone/whatsapp-ai-bot-starter.git
cd whatsapp-ai-bot-starter
cp .env.example .env.local
npm install
npm test
npm run dev
```

1. Rama desde `main`: `git checkout -b feat/soporte-audios`
2. La lógica pura va en `src/lib/` y se testea sin red. Los tests no le pegan a ninguna API.
3. `npm test`, `npm run typecheck` y `npm run build` tienen que pasar.
4. Commits en formato [Conventional Commits](https://www.conventionalcommits.org/es/).
5. Abrí el PR con la plantilla completa.

## Reglas de la casa

- **Nada de claves en el repo.** Si agregás una variable, va a `.env.example` vacía y documentada.
- **La lógica testeable se separa de la llamada de red.** Ese es el motivo de que
  `chunk.ts`, `prompt.ts` y `whatsapp.ts` existan como módulos aparte.
- **El bot no inventa.** Cualquier cambio que lo lleve a responder sin contexto
  suficiente va en contra del diseño.
- **Un proveedor nuevo de LLM** se agrega dentro de `src/lib/llm.ts`, detrás de la
  misma interfaz. Nada fuera de ese archivo debería enterarse.

## Lo que no entra

- Integraciones con proveedores no oficiales de WhatsApp.
- Panel de administración completo, multi-tenant, facturación. Eso ya es un producto,
  no un starter.
