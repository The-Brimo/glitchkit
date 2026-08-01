# About these files

This folder is the original **Claude Design handoff** that the application in this
repository was built from. It is kept as provenance — a record of the design intent —
not as living documentation.

- `README.md` — the design spec: layout, design tokens, state model, per-transform
  control tables, and native-architecture notes.
- `basegen.md` — guide to the original Python CLI (`basegen.py`, `pixelsort.py`,
  `databend.py`) whose semantics the generators and glitch parameters follow.
- `Glitchkit App.dc.html` — the interactive design prototype. Its previews are
  *simulated* (CSS overlays approximating each effect), not real image processing.
- `macos-window.jsx`, `support.js` — helpers the prototype needs to run.
- `screenshots/` — reference renders of the intended UI.

## Where the implementation diverges

The handoff targets a **native macOS app** (SwiftUI + Metal). This repository is a
**web implementation** of the same design, so:

- Glass panels are approximated with CSS `backdrop-filter` rather than
  `NSVisualEffectView` materials.
- Processing runs on Canvas/JS instead of Metal compute kernels, so the spec's
  sub-16ms preview target does not apply — previews are debounced and rendered at
  reduced resolution instead.
- Audio Lab runs its DSP on **raw pixel bytes**, not the encoded JPEG stream. Running
  it on entropy-coded bytes only desyncs the decoder and produces the same noise
  regardless of the source image; the design's own "headerless PCM" description
  implies uncompressed data.
- Four transforms not in the original spec were added later: JPEG Loop, Slice Shuffle,
  Halftone / Dither, and sort-key/order variations on Pixel Sort.

See the repository's top-level `README.md` for what the app actually does today.
