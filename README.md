# glitchkit

A glitch-art studio in the browser. Start from a procedurally generated base image
(noise or Gray–Scott reaction-diffusion) or an imported photo, then stack an ordered
chain of transforms over it — destructive ones (pixel sorting, databending,
byte-domain "audio" DSP) and additive ones that build imagery instead of damaging
it (generated fields, feedback trails, CRT masks, terminal glyphs, contour
linework). Every step can be bypassed, reordered, blended, and snapshotted.

Built from the Claude Design handoff (`design_handoff_glitchkit`); all processing is
real — no simulated previews.

## Running it

Requires [Node.js](https://nodejs.org) (installed via Homebrew on this machine: `brew install node`).

**Development** (live reload while editing code):

```bash
npm install   # first time only
npm run dev
```

**Production** (what you'll normally use):

```bash
npm run build   # compile + bundle into dist/  (only needed after code changes)
npm start       # serve the built app at http://localhost:4173 and open the browser
```

Everything runs client-side — there is no backend, and images never leave your machine.

## The pipeline

**Sources**

| Generator | Notes |
| --- | --- |
| `noise` | Seeded fBm value noise with domain warping — octaves, frequency, warp |
| `reaction` | Gray–Scott reaction-diffusion — coral / maze / spots / mitosis / fingerprint / flower presets |

Both are seed-reproducible: same settings always give the same image. Five palettes
(`ember`, `ice`, `magma`, `acid`, `mono`) plus gamma and invert. Or open / drag-drop
any PNG or JPEG.

**Transforms**

| Transform | Domain | What it does |
| --- | --- | --- |
| Pixel Sort | pixels | Threshold-masked span sort; key = brightness / hue / saturation / R / G / B, ascending or descending |
| Databend | JPEG bytes | Corrupts the encoded JPEG stream (random / shift / reverse) — macroblock glitch |
| Channel Shift | pixels | Offsets one color channel with wraparound |
| Displace | pixels | Noise-driven per-row/column offsets |
| Byte Ops | JPEG bytes | xor / bit-rotate / and-mask / add over a coverage fraction of the stream |
| Audio Lab | pixel bytes as PCM | echo / reverb / bitcrush / reverse / amplify+clip / phaser run on the raw pixel bytes, Audacity-databending style |
| JPEG Loop | re-encoding | Generation-loss loop; "drive" adds per-pass saturation/contrast for the deep-fried look |
| Slice Shuffle | pixels | Cuts into slices along rows/columns and permutes a seeded fraction of them |
| Halftone / Dither | pixels | Ordered (Bayer) dither, Floyd–Steinberg error diffusion, or a color dot screen |

**Additive transforms** — steps that add imagery rather than damage it. The
per-step blend/opacity is what layers them in; nothing in the pipeline requires
a step to read what it was handed:

| Transform | Reads the image? | What it does |
| --- | --- | --- |
| Field | no | Runs the noise / reaction generators **mid-chain**, with their own palette, gamma and seed — fresh texture layered over (or under the effects of) everything else |
| Feedback | yes | The frame composited over itself N times under a compounding zoom / rotate / drift — droste tunnels, spirals, motion trails |
| Scan / CRT | no | Synthesised screen mask: scanlines, Trinitron-style aperture grille, or shadow-mask triads, with an optional hum bar. Created with multiply, because a mask is white where light passes |
| Glyph Spill | yes | Re-renders the image as terminal glyphs — a literal hexdump (each cell prints the high nibble of its own luma), block shading, an ASCII ramp, or binary — with seeded per-cell corruption that keeps tone intact |
| Contour Trace | yes | Lines traced along iso-luma bands (a topographic map of brightness) or Sobel edges. The one transform with no seed: fully deterministic |

Each step has a blend mode (normal / screen / multiply / overlay / difference /
lighten / darken) and opacity, compositing its output back over its input. Order
matters and is fully drag-reorderable in the bottom strip. Additive steps are
born with the compositing that makes them read as a layer (Field at overlay/70%,
Scan at multiply) — including when a generated recipe omits it.

Parameters that describe a pattern size in pixels (scan pitch, halftone cell,
glyph cell, contour line weight and smoothing) are measured at **full-render
size** and scale-corrected in the live preview, so what you see is what exports.

**Workflow**

- Live preview re-renders (debounced) on every change at reduced resolution; the
  **Render** button does a full-resolution pass.
- **Snapshot** captures the entire parameter set + thumbnail; clicking a thumbnail
  restores it (undoable). The toolbar search field filters snapshots.
- **Export** (toolbar ⤓) runs a full-resolution render and downloads it — PNG for
  lossless output, or JPEG when the chain ends in a byte-level step (Databend,
  Byte Ops, JPEG Loop). The complete parameter recipe is embedded in the file's
  metadata (PNG `tEXt` chunk / JPEG comment segment), so any output can be traced
  back to its exact settings — readable with `exiftool` or any metadata viewer.
- **Load recipe** (toolbar ⤒) reads that metadata back. Pick any image glitchkit
  exported — or a bare `.json` recipe — and the whole document is restored:
  generator, palette, and the full chain with per-step params, blend, opacity and
  bypass state. Every exported image doubles as a re-loadable project file.
  Loading is a single undo away from your previous state.
- **Generate** describes a look in plain language and gets back a chain —
  "a corrupted VHS tape", or "more aggressive, keep the sort" to revise what
  you already have. Runs against a **local model via [Ollama](https://ollama.com)**:
  no API key, no account, no network egress, no per-use cost. Applying a
  generated look is a single undo.
- Full undo/redo across parameter changes, add/remove/reorder, and restores
  (toolbar buttons ⟲ / ⟳).

### Generation setup

Install Ollama and pull any instruct model, then start it:

```bash
ollama pull qwen3.6:35b-mlx && ollama serve
```

The Generate panel lists whatever models Ollama has and remembers your choice;
switch model or point at a different host any time from the panel. If no server
is running the panel says so and the rest of the app is unaffected — generation
is strictly additive.

**Model notes.** Any instruct model works, but two things matter:

- **Speed varies enormously.** Measured on the same prompts: `qwen3.6:35b-mlx`
  ~4s, `gemma4:31b-mlx` and a Q4_K_M GGUF ~20–30s. MLX builds are much faster
  on Apple Silicon.
- **Schema enforcement is backend-dependent.** Ollama's `format` parameter is
  enforced by grammar-constrained decoding on llama.cpp/GGUF backends and
  **silently ignored on MLX**. The system prompt therefore carries a worked
  example of the output shape, which is what actually keeps MLX models on
  format — and `coerceRecipe` repairs the rest. Don't remove that example
  assuming the schema covers it.

## Code map

```
src/
  types.ts               Document / Step / Snapshot model
  theme.ts               Design tokens from the handoff
  store/
    AppState.tsx          Reducer + undo/redo history + selection state
    reducer.ts            All document actions
    RenderEngine.tsx      Debounced preview + full-res render orchestration
    defaultDocument.ts    Initial document
  pipeline/
    runner.ts             Chain execution + per-step dispatch + compositing
    noise.ts, reaction.ts Generators (seeded, deterministic)
    palette.ts            Brightness-field → color mapping
    pixelSort.ts, channelShift.ts, displace.ts,
    sliceShuffle.ts, halftone.ts              Pixel-domain transforms
    feedback.ts           Echo-trail accumulation (canvas compositing)
    scan.ts               CRT screen masks (the field step has no module — it
                          reuses noise/reaction + palette from inside runner.ts)
    glyphs.ts             Terminal-glyph re-rendering; ramps ordered and inks
                          compensated by coverage measured on the actual font
    contour.ts            Iso-luma / edge line tracing
    jpegBytes.ts          JPEG scan-data helpers (header preservation, 0xFF sanitising)
    databend.ts, byteOps.ts                   JPEG byte-domain transforms
    audioLab.ts           PCM-interpretation DSP effects
    jpegLoop.ts           Re-compression loop
    exportImage.ts        PNG/JPEG export with embedded recipe metadata
    composite.ts          Blend/opacity compositing
    rng.ts                Deterministic PRNG + hashing
  recipe/                Versioned wire format — the only door in from untrusted input
    schema.ts             Recipe type + version constant
    catalog.ts            Param ranges + perceptual descriptions per transform
    validate.ts           coerceRecipe — repairs and clamps, never rejects wholesale
    document.ts           Recipe <-> Document adapter (the only file knowing both)
    parse.ts              Extracts a recipe from PNG tEXt / JPEG COM / .json
    prompt.ts             Serialises the catalog into a system prompt + schema
    generate.ts           Local Ollama client (plain fetch, no SDK, no key)
  components/             Sidebar, Toolbar, Canvas, Inspector, panels, controls
```

### The recipe path

Anything that produces a set of parameters — an exported image's metadata, a
hand-edited JSON file, or eventually a generator — is treated as untrusted and
funnelled through one place:

```
exported image ─┐
pasted JSON    ─┼─> coerceRecipe (validate.ts) -> recipeToDocument -> APPLY_RECIPE
local model    ─┘
```

`coerceRecipe` repairs rather than rejects: unknown transforms are dropped,
out-of-range numbers are clamped, missing params take their defaults, and every
repair is reported in `warnings` so the UI can say what it changed. Nothing calls
the reducer directly.

The wire format is deliberately separate from the internal `Document`, so the
internal model can change without invalidating already-exported images. The two
representations meet only in `recipe/document.ts`. Parameter *defaults* are not
restated in the catalog — they are imported from `pipeline/stepTypes.ts`, which
stays the single typed source of truth.

## Known limitations

- Projects are in-memory only: reloading the page resets the document and clears
  snapshots. Exported images act as project files (see Load recipe above), but
  there is no session persistence or multi-recipe library yet.
- A recipe never carries the source image itself, only the settings. Loading a
  recipe that came from an imported photo restores the chain and keeps whatever
  image you currently have open.
- The slider ranges in `components/TransformPanel` are still hand-written and must
  agree with the ranges in `recipe/catalog.ts`. Having the panels read their
  min/max from the catalog would remove the last duplication.
- Reaction-diffusion previews run at reduced steps/sim for responsiveness; hit
  Render for the full-quality simulation.
- Byte-domain transforms depend on how the JPEG encoder distributed bytes, so their
  slider response is graduated but not pixel-precise — same as real databending.
- The preview scale-correction has two small, deliberate residuals, documented in
  the modules: halftone dots when the scaled cell lands near a half pixel, and
  contour edge mode at line weights above 1. Both were measured and traded
  against changing how already-exported recipes render.
