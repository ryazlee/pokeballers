# Pokeballers

All-5 Pokémon hoops: draft a 5-starter + 2-bench roster under a **3600 BST** cap, then autobattle.

## Dev

```bash
npm install
npm run fetch-pokemon   # regenerate src/data/pokemon.json from PokeAPI
npm run dev
```

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (GitHub Pages base `/pokeballers/`)
- `npm run lint` — oxlint
- `npm run fetch-pokemon` — rebuild static Pokédex JSON

## Notes

- Held items are deferred to v2.
- Stack follows the personal Vite/React web-tool defaults (semantic CSS + Tailwind 4 tokens).
