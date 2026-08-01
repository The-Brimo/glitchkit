# Handoff: glitchkit — native macOS glitch-processing app

## Overview

`glitchkit` is a macOS desktop app for making glitch art. The user starts from a **source** — either a procedurally generated base image (noise or reaction-diffusion) or an imported photo — then stacks an ordered chain of destructive **transforms** (pixel sort, databend, channel shift, displacement, byte ops, audio-domain DSP) over it. Each transform can be bypassed, reordered, given a blend mode and opacity, and the whole parameter set can be snapshotted and restored.

The design descends from an existing Python CLI kit (`basegen.py`, `pixelsort.py`, `databend.py` — see `basegen.md` in this bundle for the original tool semantics and parameter meanings). The target is a **native standalone Mac app** — a full rewrite, not a shell-out wrapper around the Python.

## About the design files

The files in this bundle are **design references created in HTML** — a prototype showing intended look and behavior, not production code to copy. The task is to **recreate this design natively in Swift** (SwiftUI for chrome + Metal for the image pipeline), using Apple platform conventions and the app's own patterns. Colors, spacing, and typography below are the source of truth; the HTML is the visual reference.

`Glitchkit App.dc.html` is a self-contained prototype: open it in a browser to click through the UI. Its previews are *simulated* (CSS overlays approximating each effect), not real image processing.

## Fidelity

**High-fidelity.** Layout, colors, type, and control affordances are final-intent. Interactions (selection, reorder, bypass, snapshot) are real in the prototype and should behave identically in the native app. The preview canvas rendering is the one deliberately fake part — natively it must show the real processed result.

---

## Screens / Views

There is one window. No modal flows, no navigation stack.

### Main window

- **Size**: 1400 × 860 pt design size; resizable, minimum ~1100 × 700. Corner radius 26 (standard macOS window). Background `#1D1E22`. Dark appearance only in this design; a light variant is out of scope for v1.
- **Font**: system font (SF Pro / `-apple-system`). Monospace accents use SF Mono.
- **Structure**: three columns plus a bottom strip.
  1. Sidebar — 220 pt fixed, translucent material
  2. Main column — flexible: toolbar (52 pt) / canvas + inspector row / pipeline strip (64 pt)
  3. Inspector — 300 pt fixed, translucent material, scrolls internally

#### 1. Sidebar (220 pt, `NSVisualEffectView` sidebar material)

Glass panel inset 8 pt from window edges, corner radius 18. Prototype approximates it with `rgba(48,52,60,0.62)` + 50 px blur + `0.5px` border `rgba(255,255,255,0.10)`; natively use `.sidebar` material.

- Traffic lights sit in the sidebar's top-left (standard 14 pt dots, 9 pt gap).
- **Section header "Pipeline"** — 11 pt / weight 700 / `rgba(255,255,255,0.45)`, padding 14/18/5.
- **Pipeline list** — one row per step, in chain order: the source step first (label "Generate" or "Source Image" depending on source mode), then each transform by name. Row: 24 pt tall, 8 pt corner radius, 10 pt side margin, 11 pt / weight 500 text `rgba(255,255,255,0.9)`, with a 14 pt leading dot — `#0A84FF` when selected, `rgba(255,255,255,0.5)` otherwise. Selected row has a `rgba(255,255,255,0.14)` fill. Bypassed steps render the whole row at 45% opacity.
- **Section header "Snapshots"**, then a wrapping grid of 52 × 40 pt thumbnails, 8 pt gap, 6 pt radius, 1 px `rgba(255,255,255,0.12)` hairline. Caption below each: 9 pt SF Mono `rgba(255,255,255,0.45)` — the seed (`s7`) or `img`. Tooltip shows the chain summary (`Pixel Sort → Channel Shift`). Empty state: 10 pt `rgba(255,255,255,0.3)` — "No snapshots yet — hit Snapshot to keep a result with its settings."

#### 2. Toolbar (52 pt)

Title "glitchkit — basegen" at 15 pt / weight 700 / `rgba(255,255,255,0.9)`, left-aligned with 16 pt lead. Right side: a 36 pt glass action button and a 140 × 36 pt search field (12 pt radius, magnifier glyph, placeholder "Search" at 13 pt `rgba(255,255,255,0.55)`). Natively this is a standard `.unifiedCompact` toolbar; the search field scopes snapshots and presets.

#### 3. Canvas (flexible width)

- Container: fills remaining width, 18 pt radius, background `#151519`, 8 pt gap to the inspector.
- Image plate: inset 24 pt, 10 pt radius, `object-fit: cover` equivalent (aspect-fill), drop shadow `0 20px 50px rgba(0,0,0,0.5)`.
- **Top-left caption**: 11 pt SF Mono `rgba(255,255,255,0.3)` — in the prototype "preview — not final render"; natively this should become the live render status (e.g. `rendering… 1.4s`, `up to date`).
- **Bottom-left caption**: 11 pt SF Mono `rgba(255,255,255,0.55)` — the recipe line: `noise · seed 7 · ember · 1600x900 · 2 transform(s)`, or `photo.jpg · imported · 2 transform(s)`.
- **Empty state** (import mode, no file chosen): flat `#101013` plate, centered 12 pt SF Mono `rgba(255,255,255,0.4)` — "no source image — choose one in the inspector". No transform overlays draw in this state.
- The canvas should accept **drag-and-drop of an image file** to set the source (the prototype only exposes the file picker).

#### 4. Inspector (300 pt, glass, scrolls internally)

18 pt radius, `rgba(255,255,255,0.08)` fill + 40 px blur, `0.5px` `rgba(255,255,255,0.12)` border. Content padding 18 pt. Shows the **selected** pipeline step.

Shared control styling:
- Field label: 11 pt `rgba(255,255,255,0.55)`, 6 pt above its control.
- Text / number field & popup button: 30 pt tall, 8 pt radius, 1 px `rgba(255,255,255,0.14)` border, fill `rgba(255,255,255,0.07)`, text 13 pt `#F2F2F7`.
- Slider: standard, accent `#0A84FF`. Current value is written into the label (`Gamma — 1.3`).
- Toggle: 36 × 20 pt pill; on `#34C759` (or `#0A84FF` for the Invert toggle), off `rgba(120,120,128,0.32)`; 16 pt white knob, 2 pt inset.
- Segmented control: 8 pt radius, 1 px `rgba(255,255,255,0.14)`; selected segment `#0A84FF` with white text, unselected transparent with `rgba(255,255,255,0.6)` text.
- Section header: 11 pt / 700 / uppercase / letter-spacing 0.04em / `rgba(255,255,255,0.5)`.
- Divider: 1 px `rgba(255,255,255,0.1)`.
- Footnote: 11 pt italic `rgba(255,255,255,0.4)`.

**Source panel** (header "Source"):
- Segmented control: `Generate` | `Open image`.
- *Open image mode*: dashed drop zone (1 px dashed `rgba(255,255,255,0.22)`, 12 pt radius, fill `rgba(255,255,255,0.03)`, 18/14 pt padding) containing the filename or "drop an image here" (11 pt SF Mono), a "Choose image…" button (30 pt, `rgba(255,255,255,0.12)`), and a 10 pt hint: "PNG or JPEG. Pixel sort runs directly; databend converts to JPEG first."
- *Generate mode*: Generator popup (`noise`, `reaction`) · Seed number field with a 30 pt "⟳" reshuffle button beside it · Size text field (`1600x900`) · Palette row of five 32 pt swatches (10 pt radius; selected gets a 2 pt `#1D1E22` gap ring then 2 pt `#0A84FF` ring, unselected a 1 px `rgba(255,255,255,0.15)` hairline) · Gamma slider 0.5–2.5 step 0.1 · Invert toggle.
- *Noise params* (generator = noise): Octaves 3–8 step 1 · Freq 1–10 step 1 · Warp 0–2 step 0.1.
- *Reaction params* (generator = reaction): Preset popup (`coral`, `maze`, `spots`, `mitosis`, `fingerprint`, `flower`) · Steps 1000–10000 step 500 · Sim detail 100–300 step 10 · footnote "slower — real simulation, ~10–15s per render". (In the native rewrite this cost should drop dramatically; keep the footnote only if it stays true.)

**Transform panel** (header = transform name, with an enable/bypass toggle on the same row):

| Transform | Controls |
| --- | --- |
| Pixel Sort | Direction popup (`vertical`, `horizontal`) · Low threshold 0–255 · High threshold 0–255 |
| Databend | Mode popup (`random`, `shift`, `reverse`) · Amount 0–500 step 10 · Seed number field · footnote "requires a JPEG — converted automatically before bending" |
| Channel Shift | Channel popup (`red`, `green`, `blue`) · Shift X −60…60 px · Shift Y −60…60 px |
| Displace | Axis popup (`rows`, `columns`) · Max offset 0–120 px step 2 · Noise scale 1–20 |
| Byte Ops | Operation popup (`xor`, `bit rotate`, `and mask`, `add`) · Value 0–255 · Coverage 0–100 % · footnote "header bytes are preserved — file stays openable" |
| Audio Lab | Effect popup (`echo / delay`, `reverb`, `bitcrush`, `reverse`, `amplify + clip`, `phaser`) · two context-labelled 0–100 sliders · Dry/wet mix 0–100 % · "Lock byte length" toggle · footnote "pixel bytes are treated as headerless PCM, processed, then written back — no Audacity round-trip needed. Header is always preserved." |

Audio Lab slider labels change with the effect:

| Effect | Slider 1 | Slider 2 |
| --- | --- | --- |
| echo | Delay | Feedback |
| reverb | Room size | Decay |
| bitcrush | Bit depth | Sample crush |
| reverse | Segment size | Segments affected |
| amplify | Gain | Clipping |
| phaser | Rate | Sweep depth |

Below the type-specific controls, every transform panel ends with:
- **Compositing** section — Blend mode popup (`normal`, `screen`, `multiply`, `overlay`, `difference`, `lighten`, `darken`) and Opacity 0–100 %.
- **Remove step** button — 32 pt, 8 pt radius, 1 px `rgba(255,69,58,0.4)` border, text `#FF6961`, transparent fill.

Panel footer (always visible, after a divider): **Snapshot** (flex 1, `rgba(255,255,255,0.12)` fill, `#F2F2F7` text) and **Render** (flex 1, `#0A84FF` fill, white text), both 38 pt tall, 10 pt radius, 13 pt / weight 600, 8 pt gap.

#### 5. Pipeline strip (64 pt, bottom of main column)

Horizontal, 24 pt side padding, 10 pt gap, scrolls horizontally when the chain is long.

- **Chip**: 8/12 pt padding, 12 pt radius. Unselected fill `rgba(255,255,255,0.06)` + 1 px `rgba(255,255,255,0.1)`; selected fill `rgba(10,132,255,0.16)` + 1 px `rgba(10,132,255,0.5)`. Bypassed chips draw at 45 % opacity. Contents left→right: 7 pt status dot (`#19C332` enabled / `rgba(255,255,255,0.3)` bypassed), the step name at 12 pt weight 600 `rgba(255,255,255,0.85)`, a 26 × 15 pt bypass toggle, and a 16 pt "×" remove button `rgba(255,255,255,0.4)`.
- The **source chip is pinned first**: not draggable, no toggle, no remove.
- **"→" separator** between chips: 14 pt `rgba(255,255,255,0.28)`.
- **"+ Add transform"** popup at the end: 34 pt tall, 12 pt radius, 1 px *dashed* `rgba(255,255,255,0.25)`, fill `rgba(255,255,255,0.04)`, text 12 pt `rgba(255,255,255,0.7)`. Options: Pixel Sort, Databend, Channel Shift, Row / Column Displace, Byte Ops, Audio Lab. Choosing one appends the step (with type defaults) and selects it.

---

## Interactions & behavior

- **Selection** — clicking a sidebar row or a pipeline chip selects that step; the inspector swaps to its panel. Selection is single; the source step is the default selection.
- **Reordering** — transform chips are drag-reorderable within the strip. Dropping chip A on chip B moves A to B's index. The source chip cannot move and nothing can be dropped before it. Order is semantically significant (sort→bend ≠ bend→sort) and must drive the actual processing order.
- **Bypass** — the chip toggle and the inspector toggle both flip `enabled`. A bypassed step stays in the chain and keeps its parameters but contributes nothing to the render.
- **Remove** — the chip "×" or the inspector "Remove step". If the removed step was selected, selection falls back to the source step.
- **Add** — appends at the end of the chain and selects the new step.
- **Source mode switch** — switching to "Open image" hides all generator controls; switching back restores the previous generator settings (they are not discarded). The sidebar row and source chip relabel between "Generate" and "Source Image".
- **File import** — via the picker or drag-and-drop onto the canvas. Store a security-scoped bookmark so the source survives relaunch.
- **Snapshot** — captures the full parameter set (source mode, generator settings, whole chain with per-step params/blend/opacity/enabled) plus a thumbnail. Newest first, cap 12 in the prototype — natively this should be unbounded and persisted with the document.
- **Restore** — clicking a snapshot thumbnail restores that entire parameter set. It must not clobber the snapshot list itself. Make it undoable.
- **Render** — recomputes the output. Natively: debounce parameter changes into a live low-resolution preview (target < 16 ms per frame at preview size), and reserve the explicit Render button for a full-resolution pass with a progress indicator.
- **Undo/redo** — every parameter change, add, remove, reorder, and restore should be a single undoable action.

## State model

```
Document
  sourceMode:  .generate | .imported
  imageURL / imageBookmark, imageName        // imported
  generator:   .noise | .reaction            // generated
  seed: Int, size: Size, palette: Palette,
  gamma: Double, invert: Bool
  noise:    { octaves: Int, freq: Int, warp: Double }
  reaction: { preset: Preset, steps: Int, sim: Int }
  chain: [Step]
  snapshots: [Snapshot]

Step
  id: UUID
  type: .pixelSort | .databend | .channelShift | .displace | .byteOps | .audioLab
  enabled: Bool
  blend: BlendMode      // normal, screen, multiply, overlay, difference, lighten, darken
  opacity: Double       // 0…1
  params: type-specific struct (see the control table above for ranges and defaults)

UI state (not persisted)
  selection: .source | .step(UUID)
  dragging: UUID?
  renderState: .idle | .rendering(progress) | .failed(Error)
```

Defaults on insert: Pixel Sort `{vertical, 25, 140}` · Databend `{random, 250, seed 7}` · Channel Shift `{red, dx 12, dy 0}` · Displace `{rows, 24, 5}` · Byte Ops `{xor, 85, 40 %}` · Audio Lab `{echo, mix 60, time 35, depth 50, lockLength true}`. New steps are `enabled`, `normal` blend, 100 % opacity.

## Native architecture notes

- **Shell**: SwiftUI, `NavigationSplitView` (sidebar + detail) or a plain `HSplitView`; `.ultraThinMaterial` / `.sidebar` materials for the glass. Document-based (`ReferenceFileDocument`) so a project — source settings + chain + snapshots — saves as one file; the source image is referenced by security-scoped bookmark, not embedded.
- **Pipeline**: model the chain as an array of GPU passes. Each transform is a Metal compute kernel taking the previous pass's texture and writing a new one; blend mode + opacity compose the pass output back over its input. Cache per-step output textures so editing step *n* only re-runs *n…end*.
- **Two resolutions**: a preview chain at fit-to-view size for live scrubbing, and a full-resolution chain on Render. Same kernels, different textures.
- **Generators**: `noise` is fBm with domain warping — straightforward Metal kernel. `reaction` is Gray–Scott; run it as an iterative compute kernel with ping-pong textures. Both must be **exactly seed-reproducible**: use an explicit counter-based RNG (e.g. PCG or Philox seeded per-pixel from `seed`), never platform RNG.
- **Pixel sort**: threshold-masked span sort along rows or columns. A bitonic sort per span in a compute kernel, or a CPU fallback with `DispatchQueue.concurrentPerform` per row — profile before committing.
- **Byte-level transforms** (Databend, Byte Ops, Audio Lab) operate on the **encoded file bytes**, not the pixel buffer. Path: encode the current texture to JPEG in memory → mutate the byte range after the header → decode back to a texture. Always preserve the header; keep the byte count fixed unless the effect deliberately changes it (Audio Lab's "Lock byte length"). Decode failures are expected occasionally — catch them and surface a non-fatal "bend produced an unreadable file, try a lower amount" rather than crashing.
- **Audio Lab**: reinterpret the post-header bytes as headerless 16-bit PCM and run the effect. Reach for `AVAudioEngine` / `AudioUnit` effects if you want authentic Audacity-like DSP, or hand-roll the six effects (they are all simple: delay line, Schroeder reverb, quantiser, buffer reverse, gain+clip, all-pass phaser). Hand-rolling avoids fighting AVFoundation's format plumbing and is probably the faster route.
- **Export**: PNG for lossless output, JPEG when the chain ends in a byte-level step. Include the parameter recipe in the file's metadata so any output can be traced back to its settings.
- **Performance targets**: preview updates under 16 ms for everything except reaction-diffusion; full-resolution render on a 4K source under 2 s for a typical three-step chain.

## Design tokens

**Colors**
| Token | Value |
| --- | --- |
| Window background | `#1D1E22` |
| Canvas well | `#151519` |
| Canvas empty plate | `#101013` |
| Desktop backdrop | radial `#23262F` → `#0B0C10` |
| Sidebar glass | `rgba(48,52,60,0.62)`, blur 50 |
| Panel glass | `rgba(255,255,255,0.08)`, blur 40 |
| Hairline | `rgba(255,255,255,0.10–0.14)` |
| Text primary | `rgba(255,255,255,0.90)` |
| Text secondary | `rgba(255,255,255,0.55)` |
| Text tertiary | `rgba(255,255,255,0.40)` |
| Text quaternary | `rgba(255,255,255,0.30)` |
| Accent / selection | `#0A84FF` |
| Enabled state | `#34C759` / dot `#19C332` |
| Destructive | `#FF6961`, border `rgba(255,69,58,0.4)` |
| Control fill | `rgba(255,255,255,0.07)` |
| Secondary button fill | `rgba(255,255,255,0.12)` |
| Traffic lights | `#FF736A` `#FEBC2E` `#19C332` |

**Palettes** (generator colour ramps, dark → bright)
`ember` `#0F6B66` → `#FF8A3D` · `ice` `#0A2A5E` → `#EEF6FF` · `magma` `#3B0764` → `#FACC15` · `acid` `#14532D` → `#A3E635` · `mono` `#111111` → `#F5F5F5`

**Spacing** 2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 24 pt

**Radii** 6 (thumbnail) · 8 (control) · 10 (button, canvas plate) · 12 (chip) · 18 (panel) · 26 (window)

**Type** — system font. 9 pt mono caption · 10 pt hint · 11 pt label / mono caption / section header (700, uppercase, +0.04em) · 12 pt chip & button · 13 pt field & primary button (600) · 15 pt window title (700)

**Shadows** — window `0 30px 80px rgba(0,0,0,0.55)` + `0 0 0 1px rgba(0,0,0,0.23)` · panel `0 8px 40px rgba(0,0,0,0.35)` · canvas plate `0 20px 50px rgba(0,0,0,0.5)` · toggle knob `0 1px 3px rgba(0,0,0,0.3)`

## Assets

None. No bitmaps, no icon files — every element is drawn from colors, shapes, and system glyphs. The only glyphs used are "⟳" (reshuffle), "×" (remove), and "→" (chain separator); replace these with SF Symbols (`arrow.triangle.2.circlepath`, `xmark`, `arrow.right`) natively. The user supplies their own source images.

## Files in this bundle

| File | What it is |
| --- | --- |
| `Glitchkit App.dc.html` | The interactive design prototype — open in a browser |
| `macos-window.jsx` | Window-chrome helper used by the prototype (sidebar, toolbar, glass primitives). Reference only; SwiftUI provides all of this natively |
| `support.js` | Runtime for the prototype file. Not part of the design |
| `basegen.md` | The original Python CLI guide — authoritative for generator and glitch parameter semantics |
| `screenshots/01-source-generate.png` | Full window, source step selected, generate mode — sidebar, canvas, inspector, pipeline strip |
| `screenshots/02-audio-lab.png` | Full window with an Audio Lab step added and selected — transform panel + Compositing section |
