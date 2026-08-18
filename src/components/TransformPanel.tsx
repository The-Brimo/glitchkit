import { useAppState } from '../store/AppState';
import { STEP_LABELS, AUDIO_LABELS } from '../pipeline/stepTypes';
import type {
  Step,
  PixelSortParams,
  DatabendParams,
  ChannelShiftParams,
  DisplaceParams,
  ByteOpsParams,
  AudioLabParams,
  JpegLoopParams,
  SliceShuffleParams,
  HalftoneParams,
  FieldParams,
  BlendMode,
} from '../types';
import { Field, SelectField, Slider, NumberField, Toggle, SectionHeader, DividerLine, Footnote, DestructiveButton } from './controls';
import { colors } from '../theme';

const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'normal' },
  { value: 'screen', label: 'screen' },
  { value: 'multiply', label: 'multiply' },
  { value: 'overlay', label: 'overlay' },
  { value: 'difference', label: 'difference' },
  { value: 'lighten', label: 'lighten' },
  { value: 'darken', label: 'darken' },
];

export function TransformPanel({ step }: { step: Step }) {
  const { dispatch, removeStep } = useAppState();

  const patchParam = (key: string, value: unknown, historyKey?: string) =>
    dispatch({ type: 'PATCH_STEP_PARAM', id: step.id, key, value, historyKey });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {STEP_LABELS[step.type]}
        </div>
        <Toggle checked={step.enabled} onChange={(v) => dispatch({ type: 'PATCH_STEP', id: step.id, patch: { enabled: v } })} />
      </div>

      {step.type === 'pixelsort' && <PixelSortControls params={step.params as PixelSortParams} patchParam={patchParam} />}
      {step.type === 'databend' && <DatabendControls params={step.params as DatabendParams} patchParam={patchParam} />}
      {step.type === 'channelshift' && <ChannelShiftControls params={step.params as ChannelShiftParams} patchParam={patchParam} />}
      {step.type === 'displace' && <DisplaceControls params={step.params as DisplaceParams} patchParam={patchParam} />}
      {step.type === 'byteops' && <ByteOpsControls params={step.params as ByteOpsParams} patchParam={patchParam} />}
      {step.type === 'audiolab' && <AudioLabControls params={step.params as AudioLabParams} patchParam={patchParam} />}
      {step.type === 'jpegloop' && <JpegLoopControls params={step.params as JpegLoopParams} patchParam={patchParam} />}
      {step.type === 'sliceshuffle' && <SliceShuffleControls params={step.params as SliceShuffleParams} patchParam={patchParam} />}
      {step.type === 'halftone' && <HalftoneControls params={step.params as HalftoneParams} patchParam={patchParam} />}
      {step.type === 'field' && <FieldControls params={step.params as FieldParams} patchParam={patchParam} />}

      <DividerLine />
      <SectionHeader>Compositing</SectionHeader>
      <Field label="Blend mode">
        <SelectField
          value={step.blend}
          onChange={(v) => dispatch({ type: 'PATCH_STEP', id: step.id, patch: { blend: v as BlendMode } })}
          options={BLEND_OPTIONS}
        />
      </Field>
      <Slider
        label="Opacity"
        value={step.opacity}
        min={0}
        max={100}
        step={1}
        unit="%"
        onChange={(v) => dispatch({ type: 'PATCH_STEP', id: step.id, patch: { opacity: v }, historyKey: `opacity-${step.id}` })}
      />

      <DestructiveButton onClick={() => removeStep(step.id)}>Remove step</DestructiveButton>
    </div>
  );
}

type Patch = (key: string, value: unknown, historyKey?: string) => void;

// Only the active generator's controls are shown — the inactive set stays in
// the params so switching back and forth doesn't lose your settings.
function FieldControls({ params, patchParam }: { params: FieldParams; patchParam: Patch }) {
  return (
    <>
      <Field label="Generator">
        <SelectField
          value={params.generator}
          onChange={(v) => patchParam('generator', v)}
          options={[
            { value: 'noise', label: 'noise' },
            { value: 'reaction', label: 'reaction-diffusion' },
          ]}
        />
      </Field>

      {params.generator === 'noise' ? (
        <>
          <Slider label="Octaves" value={params.octaves} min={3} max={8} step={1} onChange={(v) => patchParam('octaves', v, 'fldoct')} />
          <Slider label="Frequency" value={params.freq} min={1} max={10} step={1} onChange={(v) => patchParam('freq', v, 'fldfreq')} />
          <Slider label="Warp" value={params.warp} min={0} max={2} step={0.1} onChange={(v) => patchParam('warp', v, 'fldwarp')} />
        </>
      ) : (
        <>
          <Field label="Pattern">
            <SelectField
              value={params.preset}
              onChange={(v) => patchParam('preset', v)}
              options={[
                { value: 'coral', label: 'coral' },
                { value: 'maze', label: 'maze' },
                { value: 'spots', label: 'spots' },
                { value: 'mitosis', label: 'mitosis' },
                { value: 'fingerprint', label: 'fingerprint' },
                { value: 'flower', label: 'flower' },
              ]}
            />
          </Field>
          <Slider label="Sim steps" value={params.steps} min={1000} max={10000} step={100} onChange={(v) => patchParam('steps', v, 'fldsteps')} />
          <Slider label="Sim resolution" value={params.sim} min={100} max={300} step={10} onChange={(v) => patchParam('sim', v, 'fldsim')} />
        </>
      )}

      <Field label="Palette">
        <SelectField
          value={params.palette}
          onChange={(v) => patchParam('palette', v)}
          options={[
            { value: 'ember', label: 'ember' },
            { value: 'ice', label: 'ice' },
            { value: 'magma', label: 'magma' },
            { value: 'acid', label: 'acid' },
            { value: 'mono', label: 'mono' },
          ]}
        />
      </Field>
      <Slider label="Gamma" value={params.gamma} min={0.5} max={2.5} step={0.1} onChange={(v) => patchParam('gamma', v, 'fldgamma')} />
      <div onClick={() => patchParam('invert', !params.invert)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>Invert</label>
        <Toggle checked={params.invert} onChange={(v) => patchParam('invert', v)} />
      </div>
      <Field label="Seed" marginBottom={0}>
        <NumberField value={params.seed} onChange={(v) => patchParam('seed', v, 'fldseed')} />
      </Field>
      <Footnote>
        generates a new field and blends it over the image — it ignores what the previous step produced, so the blend mode
        and opacity below are what make it visible. At normal / 100% it replaces the frame.
        {params.generator === 'reaction' && ' Live preview runs a shortened sim; the full render develops further.'}
      </Footnote>
    </>
  );
}

function PixelSortControls({ params, patchParam }: { params: PixelSortParams; patchParam: Patch }) {
  return (
    <>
      <Field label="Direction">
        <SelectField
          value={params.direction}
          onChange={(v) => patchParam('direction', v)}
          options={[
            { value: 'vertical', label: 'vertical' },
            { value: 'horizontal', label: 'horizontal' },
          ]}
        />
      </Field>
      <Field label="Sort by">
        <SelectField
          value={params.sortBy ?? 'brightness'}
          onChange={(v) => patchParam('sortBy', v)}
          options={[
            { value: 'brightness', label: 'brightness' },
            { value: 'hue', label: 'hue' },
            { value: 'saturation', label: 'saturation' },
            { value: 'red', label: 'red' },
            { value: 'green', label: 'green' },
            { value: 'blue', label: 'blue' },
          ]}
        />
      </Field>
      <Field label="Order">
        <SelectField
          value={params.order ?? 'ascending'}
          onChange={(v) => patchParam('order', v)}
          options={[
            { value: 'ascending', label: 'ascending' },
            { value: 'descending', label: 'descending' },
          ]}
        />
      </Field>
      <Slider label="Low threshold" value={params.low} min={0} max={255} step={1} onChange={(v) => patchParam('low', v, 'low')} />
      <Slider label="High threshold" value={params.high} min={0} max={255} step={1} onChange={(v) => patchParam('high', v, 'high')} />
      <Footnote>thresholds mask on the sort key — 0–255 whatever the key</Footnote>
    </>
  );
}

function JpegLoopControls({ params, patchParam }: { params: JpegLoopParams; patchParam: Patch }) {
  return (
    <>
      <Slider label="Iterations" value={params.iterations} min={1} max={40} step={1} onChange={(v) => patchParam('iterations', v, 'jliter')} />
      <Slider label="Quality" value={params.quality} min={1} max={60} step={1} unit="%" onChange={(v) => patchParam('quality', v, 'jlqual')} />
      <Slider label="Drive" value={params.drive} min={0} max={100} step={1} onChange={(v) => patchParam('drive', v, 'jldrive')} />
      <Footnote>re-encodes as JPEG each pass — quality loss compounds; drive adds saturation and contrast per pass for the deep-fried look</Footnote>
    </>
  );
}

function SliceShuffleControls({ params, patchParam }: { params: SliceShuffleParams; patchParam: Patch }) {
  return (
    <>
      <Field label="Axis">
        <SelectField
          value={params.axis}
          onChange={(v) => patchParam('axis', v)}
          options={[
            { value: 'rows', label: 'rows' },
            { value: 'columns', label: 'columns' },
          ]}
        />
      </Field>
      <Slider label="Slices" value={params.slices} min={2} max={64} step={1} onChange={(v) => patchParam('slices', v, 'sscount')} />
      <Slider label="Shuffle amount" value={params.amount} min={0} max={100} step={1} unit="%" onChange={(v) => patchParam('amount', v, 'ssamount')} />
      <Field label="Seed" marginBottom={0}>
        <NumberField value={params.seed} onChange={(v) => patchParam('seed', v, 'ssseed')} />
      </Field>
      <Footnote>only the selected fraction of slices is permuted — the rest stay in place</Footnote>
    </>
  );
}

function HalftoneControls({ params, patchParam }: { params: HalftoneParams; patchParam: Patch }) {
  return (
    <>
      <Field label="Mode">
        <SelectField
          value={params.mode}
          onChange={(v) => patchParam('mode', v)}
          options={[
            { value: 'bayer', label: 'ordered (bayer)' },
            { value: 'diffusion', label: 'error diffusion' },
            { value: 'dots', label: 'dot screen' },
          ]}
        />
      </Field>
      <Slider label="Levels" value={params.levels} min={2} max={8} step={1} onChange={(v) => patchParam('levels', v, 'htlevels')} />
      <Slider label="Cell size" value={params.scale} min={2} max={12} step={1} onChange={(v) => patchParam('scale', v, 'htscale')} />
      <Footnote>cell size applies to bayer and dot screen; levels apply to bayer and diffusion</Footnote>
    </>
  );
}

function DatabendControls({ params, patchParam }: { params: DatabendParams; patchParam: Patch }) {
  return (
    <>
      <Field label="Mode">
        <SelectField
          value={params.mode}
          onChange={(v) => patchParam('mode', v)}
          options={[
            { value: 'random', label: 'random' },
            { value: 'shift', label: 'shift' },
            { value: 'reverse', label: 'reverse' },
          ]}
        />
      </Field>
      <Slider label="Amount" value={params.amount} min={0} max={500} step={10} onChange={(v) => patchParam('amount', v, 'amount')} />
      <Field label="Seed" marginBottom={0}>
        <NumberField value={params.seed} onChange={(v) => patchParam('seed', v, 'bendseed')} />
      </Field>
      <Footnote>requires a JPEG — converted automatically before bending</Footnote>
    </>
  );
}

function ChannelShiftControls({ params, patchParam }: { params: ChannelShiftParams; patchParam: Patch }) {
  return (
    <>
      <Field label="Channel">
        <SelectField
          value={params.channel}
          onChange={(v) => patchParam('channel', v)}
          options={[
            { value: 'red', label: 'red' },
            { value: 'green', label: 'green' },
            { value: 'blue', label: 'blue' },
          ]}
        />
      </Field>
      <Slider label="Shift X" value={params.dx} min={-60} max={60} step={1} unit=" px" onChange={(v) => patchParam('dx', v, 'dx')} />
      <Slider label="Shift Y" value={params.dy} min={-60} max={60} step={1} unit=" px" onChange={(v) => patchParam('dy', v, 'dy')} />
    </>
  );
}

function DisplaceControls({ params, patchParam }: { params: DisplaceParams; patchParam: Patch }) {
  return (
    <>
      <Field label="Axis">
        <SelectField
          value={params.axis}
          onChange={(v) => patchParam('axis', v)}
          options={[
            { value: 'rows', label: 'rows' },
            { value: 'columns', label: 'columns' },
          ]}
        />
      </Field>
      <Slider label="Max offset" value={params.amount} min={0} max={120} step={2} unit=" px" onChange={(v) => patchParam('amount', v, 'dispamount')} />
      <Slider label="Noise scale" value={params.scale} min={1} max={20} step={1} onChange={(v) => patchParam('scale', v, 'dispscale')} />
    </>
  );
}

function ByteOpsControls({ params, patchParam }: { params: ByteOpsParams; patchParam: Patch }) {
  return (
    <>
      <Field label="Operation">
        <SelectField
          value={params.op}
          onChange={(v) => patchParam('op', v)}
          options={[
            { value: 'xor', label: 'xor' },
            { value: 'rotate', label: 'bit rotate' },
            { value: 'and', label: 'and mask' },
            { value: 'add', label: 'add' },
          ]}
        />
      </Field>
      <Slider label="Value" value={params.value} min={0} max={255} step={1} onChange={(v) => patchParam('value', v, 'byteval')} />
      <Slider label="Coverage" value={params.coverage} min={0} max={100} step={1} unit="%" onChange={(v) => patchParam('coverage', v, 'bytecov')} />
      <Footnote>header bytes are preserved — file stays openable</Footnote>
    </>
  );
}

function AudioLabControls({ params, patchParam }: { params: AudioLabParams; patchParam: Patch }) {
  const labels = AUDIO_LABELS[params.effect];
  return (
    <>
      <Field label="Effect">
        <SelectField
          value={params.effect}
          onChange={(v) => patchParam('effect', v)}
          options={[
            { value: 'echo', label: 'echo / delay' },
            { value: 'reverb', label: 'reverb' },
            { value: 'bitcrush', label: 'bitcrush' },
            { value: 'reverse', label: 'reverse' },
            { value: 'amplify', label: 'amplify + clip' },
            { value: 'phaser', label: 'phaser' },
          ]}
        />
      </Field>
      <Slider label={labels.time} value={params.time} min={0} max={100} step={1} onChange={(v) => patchParam('time', v, 'audiotime')} />
      <Slider label={labels.depth} value={params.depth} min={0} max={100} step={1} onChange={(v) => patchParam('depth', v, 'audiodepth')} />
      <Slider label="Dry / wet mix" value={params.mix} min={0} max={100} step={1} unit="%" onChange={(v) => patchParam('mix', v, 'audiomix')} />
      <div onClick={() => patchParam('lockLength', !params.lockLength)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>Lock byte length</label>
        <Toggle checked={params.lockLength} onChange={(v) => patchParam('lockLength', v)} />
      </div>
      <Footnote>pixel bytes are treated as headerless PCM, processed, then written back — no Audacity round-trip needed. Header is always preserved.</Footnote>
    </>
  );
}
