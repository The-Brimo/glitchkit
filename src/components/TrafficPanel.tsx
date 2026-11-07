import { useEffect, useRef, useState } from 'react';
import type { PaletteName, TrafficMapping } from '../types';
import { useAppState } from '../store/AppState';
import { isTrafficDigest } from '../pipeline/traffic';
import { colors, fontMono, palettesUI } from '../theme';
import { Field, SelectField, Slider, TextField, Footnote, PrimaryButton, SecondaryButton, ToggleRow } from './controls';

const LS_BASE_URL = 'glitchkit.traffic.baseUrl';
const LS_MAC = 'glitchkit.traffic.mac';
const DEFAULT_BASE_URL = 'http://localhost:8954';

/** Same rationale as the Ollama URL field: typing must not probe per keystroke. */
const URL_EDIT_DEBOUNCE_MS = 400;

interface Device {
  mac: string;
  ip: string;
  name: string;
  active: boolean;
}

type Status =
  | { kind: 'checking' }
  | { kind: 'ready'; demo: boolean }
  | { kind: 'unavailable'; message: string }
  | { kind: 'capturing'; seconds: number }
  | { kind: 'error'; message: string };

/**
 * Talks to tvwatch's local traffic bridge (same trust model as the Ollama
 * panel: localhost only, no credentials, read-only requests). Lists the
 * router's device table, captures one device's traffic for N seconds, and
 * loads the digest as the document's source.
 */
export function TrafficPanel() {
  const { doc, dispatch } = useAppState();

  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem(LS_BASE_URL) || DEFAULT_BASE_URL);
  const [devices, setDevices] = useState<Device[]>([]);
  const [mac, setMac] = useState(() => localStorage.getItem(LS_MAC) || '');
  const [seconds, setSeconds] = useState(30);
  const [status, setStatus] = useState<Status>({ kind: 'checking' });
  const captureRef = useRef<AbortController | null>(null);

  const initialUrl = useRef(baseUrl);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const delay = baseUrl === initialUrl.current ? 0 : URL_EDIT_DEBOUNCE_MS;

    const timer = setTimeout(() => {
      setStatus({ kind: 'checking' });
      Promise.all([
        fetch(`${baseUrl}/`, { signal: controller.signal }).then((r) => r.json()),
        fetch(`${baseUrl}/devices`, { signal: controller.signal }).then((r) => r.json()),
      ])
        .then(([info, found]) => {
          if (cancelled) return;
          if (!Array.isArray(found)) throw new Error(found?.error || 'bad /devices reply');
          setDevices(found);
          setStatus({ kind: 'ready', demo: !!info.demo });
          setMac((current) => {
            if (current && found.some((d: Device) => d.mac === current)) return current;
            const firstNamed = found.find((d: Device) => d.active && d.name) ?? found[0];
            return firstNamed?.mac ?? '';
          });
        })
        .catch((e) => {
          if (cancelled) return;
          setDevices([]);
          setStatus({
            kind: 'unavailable',
            message: e instanceof TypeError ? `No traffic bridge at ${baseUrl}.` : String(e),
          });
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [baseUrl]);

  useEffect(() => {
    if (mac) localStorage.setItem(LS_MAC, mac);
  }, [mac]);

  const loadDigest = async (url: string, label: string) => {
    captureRef.current?.abort();
    const controller = new AbortController();
    captureRef.current = controller;
    setStatus({ kind: 'capturing', seconds });
    try {
      const d = await fetch(url, { signal: controller.signal }).then((r) => r.json());
      if (d.error) throw new Error(d.error);
      if (!isTrafficDigest(d)) throw new Error('the bridge returned something that is not a digest');
      dispatch({
        type: 'PATCH',
        patch: { sourceMode: 'traffic', trafficDigest: d, trafficLabel: label },
      });
      setStatus({ kind: 'ready', demo: status.kind === 'ready' ? status.demo : false });
    } catch (e) {
      if (controller.signal.aborted) return;
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const device = devices.find((d) => d.mac === mac);
  const capture = () =>
    loadDigest(
      `${baseUrl}/digest?mac=${encodeURIComponent(mac)}&seconds=${seconds}`,
      `${device?.name || mac} · ${seconds}s`
    );
  const demoCapture = () => loadDigest(`${baseUrl}/digest?demo=1`, 'demo capture');

  const busy = status.kind === 'capturing';
  const ready = status.kind === 'ready';

  return (
    <>
      {status.kind === 'unavailable' ? (
        <>
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.22)',
              borderRadius: 12,
              padding: '14px 12px',
              background: 'rgba(255,255,255,0.03)',
              fontSize: 11,
              lineHeight: 1.6,
              color: colors.textSecondary,
            }}
          >
            {status.message}
            <div style={{ fontFamily: fontMono, fontSize: 10, marginTop: 8, color: colors.textTertiary }}>
              python3 tvwatch/traffic_server.py
            </div>
          </div>
          <Footnote>The bridge runs on this machine and reads your own router — nothing leaves your network.</Footnote>
        </>
      ) : (
        <>
          <Field label="Device">
            <SelectField
              value={mac}
              onChange={setMac}
              options={devices.map((d) => ({
                value: d.mac,
                label: `${d.active ? '●' : '○'} ${d.name || d.mac} — ${d.ip}`,
              }))}
            />
          </Field>
          <Slider label="Listen for" value={seconds} min={10} max={120} step={5} unit="s" onChange={setSeconds} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <PrimaryButton disabled={busy || !mac || status.kind === 'checking'} onClick={capture}>
              {busy ? `Capturing ~${status.kind === 'capturing' ? status.seconds : seconds}s…` : 'Capture'}
            </PrimaryButton>
            {ready && status.demo && (
              <SecondaryButton onClick={demoCapture} style={{ flex: '0 0 auto', padding: '0 12px' }}>
                Demo
              </SecondaryButton>
            )}
          </div>

          {doc.trafficDigest && (
            <div style={{ fontSize: 11, color: '#4ade80', lineHeight: 1.5, marginBottom: 10 }}>
              {doc.trafficLabel} — {doc.trafficDigest.packetCount} packets, {doc.trafficDigest.remotes.length}{' '}
              remotes, {(doc.trafficDigest.durationMs / 1000).toFixed(0)}s
            </div>
          )}
          {status.kind === 'error' && (
            <div style={{ fontSize: 11, color: colors.destructive, lineHeight: 1.5, marginBottom: 10 }}>
              {status.message}
            </div>
          )}

          <Field label="Mapping">
            <SelectField
              value={doc.traffic.mapping}
              onChange={(v) => dispatch({ type: 'PATCH_TRAFFIC', patch: { mapping: v as TrafficMapping } })}
              options={[
                { value: 'waterfall', label: 'waterfall (time × host)' },
                { value: 'raster', label: 'byte raster (payloads)' },
                { value: 'flowfield', label: 'flow field (hosts as clouds)' },
                { value: 'timing', label: 'timing (rhythm ribbon)' },
                { value: 'hilbert', label: 'hilbert (bytes on a curve)' },
              ]}
            />
          </Field>

          {doc.traffic.mapping === 'flowfield' && (
            <>
              <Field label="Palette">
                <div style={{ display: 'flex', gap: 8 }}>
                  {(Object.keys(palettesUI) as PaletteName[]).map((name) => {
                    const pal = palettesUI[name];
                    const selected = doc.palette === name;
                    return (
                      <div
                        key={name}
                        title={name}
                        onClick={() => dispatch({ type: 'PATCH', patch: { palette: name } })}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          background: `linear-gradient(135deg, ${pal.from}, ${pal.to})`,
                          cursor: 'pointer',
                          boxShadow: selected
                            ? `0 0 0 2px ${colors.windowBg}, 0 0 0 4px ${colors.accent}`
                            : '0 0 0 1px rgba(255,255,255,0.15)',
                        }}
                      />
                    );
                  })}
                </div>
              </Field>
              <Slider
                label="Gamma"
                value={doc.gamma}
                min={0.5}
                max={2.5}
                step={0.1}
                onChange={(v) => dispatch({ type: 'PATCH', patch: { gamma: v }, historyKey: 'gamma' })}
              />
              <ToggleRow
                label="Invert"
                checked={doc.invert}
                onChange={(v) => dispatch({ type: 'PATCH', patch: { invert: v } })}
                onColor={colors.accent}
              />
            </>
          )}
          <Footnote>
            captures run on your router, stay on this machine, and are never written into recipes or exports —
            the picture is the only thing that leaves. Encrypted traffic renders as noise; the legible rows are
            protocols that talk in plaintext.
          </Footnote>
        </>
      )}

      <Field label="Bridge URL" marginBottom={0}>
        <TextField value={baseUrl} onChange={setBaseUrl} onBlur={() => localStorage.setItem(LS_BASE_URL, baseUrl)} />
      </Field>
    </>
  );
}
