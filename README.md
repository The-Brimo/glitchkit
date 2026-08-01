# glitchkit

A glitch-art studio in the browser. Start from a procedurally generated base image
(noise or Gray–Scott reaction-diffusion) or an imported photo, then stack an ordered
chain of destructive transforms over it — pixel sorting, databending, byte-domain
"audio" DSP, and more. Every step can be bypassed, reordered, blended, and snapshotted.

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

Each step has a blend mode (normal / screen / multiply / overlay / difference /
lighten / darken) and opacity, compositing its output back over its input. Order
matters and is fully drag-reorderable in the bottom strip.

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
- Full undo/redo across parameter changes, add/remove/reorder, and restores
  (toolbar buttons ⟲ / ⟳).

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
    jpegBytes.ts          JPEG scan-data helpers (header preservation, 0xFF sanitising)
    databend.ts, byteOps.ts                   JPEG byte-domain transforms
    audioLab.ts           PCM-interpretation DSP effects
    jpegLoop.ts           Re-compression loop
    exportImage.ts        PNG/JPEG export with embedded recipe metadata
    composite.ts          Blend/opacity compositing
    rng.ts                Deterministic PRNG + hashing
  components/             Sidebar, Toolbar, Canvas, Inspector, panels, controls
```

## Known limitations

- Projects are in-memory only: reloading the page resets the document (snapshots
  included). Exported images carry the full recipe in their metadata, but there is
  no project save/load or recipe re-import yet — that's the natural next step.
- Reaction-diffusion previews run at reduced steps/sim for responsiveness; hit
  Render for the full-quality simulation.
- Byte-domain transforms depend on how the JPEG encoder distributed bytes, so their
  slider response is graduated but not pixel-precise — same as real databending.
