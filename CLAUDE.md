# glitchkit — project notes for Claude

Browser-based glitch-art studio. Public repo: https://github.com/The-Brimo/glitchkit
(local: `~/claude/glitchkit-app`). Built from a Claude Design handoff kept in
`docs/design-handoff/` (provenance only — see its NOTE.md for where the web
implementation deliberately diverges).

## Commands

- `npm run dev` — Vite on :5173. The preview-pane launch config ("glitchkit-app")
  lives in `~/claude/.claude/launch.json`, not in this repo.
- `npx tsc --noEmit -p tsconfig.app.json` — type check
- `npm run build` then `npm start` — production build served at :4173
- `npm run lint` — two fast-refresh warnings in AppState/RenderEngine are the
  accepted React-context-file pattern, not errors.

## Architecture

- `src/pipeline/` — pure processing. `runner.ts` dispatches per step type.
  Pixel-domain ops (pixelsort, channelshift, displace, sliceshuffle, halftone)
  take ImageData. Byte-domain ops (databend, byteops) encode→corrupt JPEG scan
  bytes→decode. **Audio Lab runs DSP on raw pixel bytes as PCM, NOT on the JPEG
  stream** — DSP on entropy-coded bytes just desyncs the decoder and yields
  source-independent noise. jpegloop re-encodes N times.
- `src/recipe/` — versioned wire format. **The only door from untrusted input is
  `coerceRecipe` (validate.ts) → `recipeToDocument` → APPLY_RECIPE** (one undo
  entry). Producers: exported-image metadata (PNG tEXt / JPEG COM via parse.ts),
  pasted JSON, and local Ollama generation (generate.ts). Wire opacity is 0–1
  vs internal 0–100, `on` vs `enabled` — `document.ts` is the only file that
  knows both representations. Legacy pre-recipe exports migrate in validate.ts.
- Param defaults live in `pipeline/stepTypes.ts` (STEP_DEFAULTS); `recipe/catalog.ts`
  adds ranges + `feel` strings (prompt-only, never UI). Known duplication:
  TransformPanel slider min/max are hand-written and must agree with the catalog.
- Export embeds the recipe in PNG tEXt / JPEG COM metadata; the ⤒ toolbar button
  loads it back, so every exported image is a project file.

## Hard-won invariants — do not regress

- `jpegBytes.sanitizeScanRegion` must stay **surgical**: rewrite only 0xFF bytes
  NOT followed by 0x00 (stuffing) or 0xD0–0xD7 (restart markers). A blanket
  rewrite once destroyed every image — it touched ~37 valid stuffed pairs per
  frame vs the ~11 bytes the glitch itself changes.
- Byte-domain transforms confine low-amount damage to the **tail** of the scan
  region (skip factors), so corruption cascades from a point instead of
  desyncing from byte 0. Shift mode rotates only the tail for the same reason.
- Minimum-visible-effect floors: amount/coverage 0 is a **true no-op**; any
  nonzero setting does something. Slice Shuffle selects ≥2 slices and uses
  Sattolo's algorithm (cyclic permutation, no fixed points). Byte Ops applies
  its op at least once (identity settings like xor 0 still correctly do
  nothing). Pixel Sort treats low/high as an unordered band.
- Ollama generation: the `format` JSON schema is enforced on llama.cpp/GGUF
  backends but **silently ignored on MLX** — the worked example in
  `recipe/prompt.ts` is what keeps MLX models on-shape; do not remove it on the
  assumption the schema covers it. `think: false` is required (thinking models
  otherwise burn the whole token budget and return empty content with no
  error). Default model `qwen3.6:35b-mlx` (~4s; the gemma variants take
  20–30s). Model choice + server URL persist in localStorage.
- `generate.ts` stamps `v` (RECIPE_VERSION) on model output so clean
  generations don't raise spurious "no version field" repair warnings.

## Accepted quirks — deliberately not fixed (user's decision)

- The noise generator is anisotropic (~1.66 horizontal/vertical gradient ratio
  from a double aspect correction) — kept as the app's look.
- The reaction-diffusion sim runs on a square grid stretched onto the canvas.
- Fixing either changes how every saved seed renders (recipes would still load).
- Displace uses a fixed internal seed (7), so two Displace steps in one chain
  tear in identical places.

## Working conventions

- Pipeline changes are verified **empirically in the browser pane** before and
  after: dynamic-import modules with a `?v=` cache-buster and measure (pixel
  diff fraction, luma correlation, mutated-byte counts) rather than eyeball.
- Commit messages explain the why with measured numbers; end with the
  Co-Authored-By Claude trailer. Push to `origin main` after each verified
  change.
- `dist/` and `node_modules/` are gitignored; fresh clones need
  `npm install && npm run build` before `npm start`.

## Not done / candidate next steps

- Hand-authored preset library of named looks (doubles as few-shot exemplars
  for generation).
- Session persistence — reloading the page resets the document and snapshots.
- GitHub Pages deploy via an Actions workflow (offered, never requested).
- Inspector panels reading slider ranges from the recipe catalog (removes the
  last source-of-truth duplication).
