# Feature folders

Each future Daggerheart feature (characters, campaigns, dice roller, cards,
etc.) gets its own subfolder here, e.g. `features/characters/`, with its own
`components/`, `api.js`, and (if needed) its own zustand store. Features
should not import each other's internals - share code via `components/`,
`hooks/`, or `utils/` at the `src/` root instead.
