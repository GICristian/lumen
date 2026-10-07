import { useEffect, useId, useRef, useState } from "react";
import type { ReplayScreen, ReplayStatus, Settings } from "@shared/contracts";
import { acceleratorFromEvent } from "@shared/shortcut";
import { replayBudget, replayBuffer, replayBitrate } from "@shared/replay";
import { Icon } from "./Icon";
import { BrandMark } from "./BrandMark";
import { formatBytes } from "@shared/clips";
import { audioLimiter, humFilter, microphoneConstraints } from "../player/replayAudio";

type Config = Pick<Settings, "replayAutoStart" | "replaySeconds" | "replayFps" | "replayHeight" | "replayMic" | "replayMicDeviceId" | "replayMicGain" | "replaySystemAudio" | "replaySystemGain" | "replayNoiseSuppression" | "replayEchoCancellation" | "replayMicHum" | "replayBitrateKbps" | "replayDisplayId">;
function configOf(status: ReplayStatus): Config {
  return { replayAutoStart: status.autoStart, replaySeconds: status.seconds, replayFps: status.fps, replayHeight: status.height, replayMic: status.mic,
    replayMicDeviceId: status.micDeviceId, replayMicGain: status.micGain, replaySystemAudio: status.systemAudio,
    replaySystemGain: status.systemGain, replayNoiseSuppression: status.noiseSuppression,
    replayEchoCancellation: status.echoCancellation, replayMicHum: status.micHum, replayBitrateKbps: status.bitrateKbps,
    replayDisplayId: status.displayId };
}
function screenOption(screen: ReplayScreen, screens: ReplayScreen[]): string {
  const xs = screens.map((item) => item.x);
  const spread = screens.length > 1 && Math.min(...xs) !== Math.max(...xs);
  const place = screen.x === Math.min(...xs) ? "left" : screen.x === Math.max(...xs) ? "right" : "";
  const side = spread && place ? ` · ${place}` : "";
  const size = screen.width > 0 ? ` · ${screen.width}×${screen.height}` : "";
  return `${screen.name}${size}${screen.primary ? " · primary" : ""}${side}`;
}
function durationLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function ReplayPanel({ compact = false }: { compact?: boolean }) {
  const panelId = useId();
  const [tab, setTab] = useState<"capture" | "audio" | "save">("capture");
  const paneRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const [status, setStatus] = useState<ReplayStatus | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const dirty = useRef(false);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [bind, setBind] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [testStarting, setTestStarting] = useState(false);
  const [level, setLevel] = useState(0);
  const [peakDb, setPeakDb] = useState(-60);
  const testGain = useRef<GainNode | null>(null);
  const testCleanup = useRef<() => void>(() => undefined);
  const testGeneration = useRef(0);
  const [enumerating, setEnumerating] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const update = (): void => setMoreBelow(pane.scrollTop + pane.clientHeight < pane.scrollHeight - 8);
    const observer = new ResizeObserver(update); observer.observe(pane);
    if (pane.firstElementChild) observer.observe(pane.firstElementChild);
    pane.addEventListener("scroll", update, { passive: true }); update();
    return () => { observer.disconnect(); pane.removeEventListener("scroll", update); };
  }, [tab, Boolean(draft), compact]);

  useEffect(() => {
    let alive = true;
    const receive = (next: ReplayStatus): void => {
      if (!alive) return;
      setStatus(next);
      if (!dirty.current) setDraft(configOf(next));
    };
    void window.lumen.replayStatus().then(receive).catch((error: unknown) => { if (alive) setLocal(String(error)); });
    void window.lumen.getSettings().then((settings) => { if (alive) setLaunchAtLogin(settings.launchOnStartup); }).catch(() => undefined);
    const off = window.lumen.onReplayStatus(receive);
    const refresh = (): void => {
      void navigator.mediaDevices.enumerateDevices().then((items) => { if (alive) setDevices(items.filter((item) => item.kind === "audioinput")); }).catch(() => undefined);
    };
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => { alive = false; off(); navigator.mediaDevices.removeEventListener("devicechange", refresh); testGeneration.current++; testCleanup.current(); };
  }, []);

  async function action(task: () => Promise<ReplayStatus>): Promise<void> {
    if (busy) return;
    setBusy(true); setLocal(null);
    try { setStatus(await task()); }
    catch (error) { setLocal(error instanceof Error ? error.message : "Replay could not complete this action."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!bind) return;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Escape") { setBind(false); return; }
      const next = acceleratorFromEvent(event);
      if (!next) return;
      setBind(false);
      void action(() => window.lumen.replayShortcut(next));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [bind]);

  function stopTest(): void {
    testGeneration.current++; testCleanup.current(); testCleanup.current = () => undefined;
    testGain.current = null; setTesting(false); setTestStarting(false); setLevel(0); setPeakDb(-60);
  }
  useEffect(() => {
    const hidden = (): void => { if (document.hidden) stopTest(); };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  function edit(patch: Partial<Config>): void {
    if (draft && Object.entries(patch).every(([key, value]) => draft[key as keyof Config] === value)) return;
    const voiceKeys = ["replayMic", "replayMicDeviceId", "replayNoiseSuppression", "replayEchoCancellation", "replayMicHum"];
    if (voiceKeys.some((key) => key in patch)) stopTest();
    if (patch.replayMicGain !== undefined && testGain.current) {
      testGain.current.gain.setTargetAtTime(patch.replayMicGain, testGain.current.context.currentTime, .015);
    }
    if (!draft || !status) return;
    const next = { ...draft, ...patch };
    const saved = configOf(status);
    dirty.current = Object.keys(next).some(key => next[key as keyof Config] !== saved[key as keyof Config]);
    setChanged(dirty.current); setLocal(null); setDraft(next);
  }
  async function refreshDevices(): Promise<void> {
    setEnumerating(true); setLocal(null);
    try {
      // Device labels become available after permission; release this stream immediately.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      try { setDevices((await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "audioinput")); }
      finally { stream.getTracks().forEach((track) => track.stop()); }
    } catch (error) { setLocal(error instanceof Error ? error.message : "Microphones could not be listed."); }
    finally { setEnumerating(false); }
  }
  async function testMic(): Promise<void> {
    if (testing) { stopTest(); return; }
    if (!draft) return;
    const token = ++testGeneration.current;
    setTesting(true); setTestStarting(true); setLocal(null);
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(
        draft.replayMicDeviceId, draft.replayNoiseSuppression, draft.replayEchoCancellation,
      ), video: false });
      if (token !== testGeneration.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      context = new AudioContext({ latencyHint: "interactive" });
      const analyser = context.createAnalyser(); analyser.fftSize = 2048;
      const gain = context.createGain(); gain.gain.value = draft.replayMicGain;
      testGain.current = gain;
      let voice: AudioNode = context.createMediaStreamSource(stream);
      if (draft.replayMicHum) voice = humFilter(context, voice);
      voice.connect(gain).connect(analyser);
      // Audition through the same limiter as capture; headphones avoid acoustic feedback.
      analyser.connect(audioLimiter(context)).connect(context.destination);
      let tick = 0;
      const ended = (): void => { if (token === testGeneration.current) { stopTest(); setLocal('Microphone disconnected. Choose a device and start the test again.'); } };
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', ended));
      const close = (): void => {
        window.clearInterval(tick);
        stream?.getTracks().forEach(track => { track.removeEventListener('ended', ended); track.stop(); });
        if (context && context.state !== 'closed') void context.close().catch(() => undefined);
      };
      testCleanup.current = close;
      await context.resume();
      if (token !== testGeneration.current) { close(); return; }
      setTestStarting(false);
      const samples = new Float32Array(analyser.fftSize);
      tick = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        setLevel(Math.min(1, Math.max(0, (20 * Math.log10(Math.max(.001, rms)) + 60) / 60)));
        const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
        setPeakDb(Math.max(-60, 20 * Math.log10(Math.max(.001, peak))));
      }, 100);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== 'closed') void context.close().catch(() => undefined);
      if (token === testGeneration.current) { stopTest(); setLocal(error instanceof Error ? error.message : "Microphone test failed."); }
    }
  }
  async function apply(): Promise<void> {
    if (!draft) return;
    if (!changed) { setLocal('Settings are up to date.'); return; }
    stopTest();
    setApplying(true);
    await action(async () => {
      const next = await window.lumen.replayUpdate({ ...draft, replaySeconds: replayBuffer(draft.replaySeconds), replayBitrateKbps: replayBitrate(draft.replayBitrateKbps) });
      dirty.current = false; setChanged(false); setDraft(configOf(next)); return next;
    });
    setApplying(false);
  }
  const disabled = busy || Boolean(status?.saving);
  const tabs = [{ id: 'capture', label: 'Capture', icon: 'record' }, { id: 'audio', label: 'Audio', icon: 'volume' }, { id: 'save', label: 'Save & startup', icon: 'folder' }] as const;
  const activeState = !status ? 'Connecting' : status.armed ? status.ready ? 'Buffer live' : 'Starting' : 'Standby';
  const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const body = <div className={`replay-panel replay-console${compact ? ' is-compact' : ''}`}>
    <header className="replay-heading"><div><span className="hub-kicker">LUMEN / CAPTURE SYSTEM</span><h2>Instant replay<span>.</span></h2></div><BrandMark className="replay-brand" /></header>
    <div className="replay-workspace">
      <aside className={`replay-monitor${status?.armed ? ' is-live' : ''}`}>
        <div className="replay-monitor-top"><span className="replay-state"><i />{activeState}</span><span className="replay-monitor-code">LOCAL</span></div>
        <div className="replay-monitor-clock"><strong>{clock(status?.bufferedSeconds ?? 0)}</strong><span>OF {clock(status?.seconds ?? 60)} RETAINED</span></div>
        <div className="replay-buffer-leds" role="progressbar" aria-label="Replay buffer filled" aria-valuemin={0} aria-valuemax={status?.seconds ?? 60} aria-valuenow={Math.round(status?.bufferedSeconds ?? 0)}>{Array.from({ length: 32 }, (_, index) => <i key={index} className={index / 32 < (status?.bufferedSeconds ?? 0) / (status?.seconds || 60) ? 'is-filled' : ''} />)}</div>
        <div className="replay-monitor-spec"><span>{status?.captureWidth ? `${status.captureWidth} × ${status.captureHeight}` : `${status?.height ?? 1080}p target`}<small>{status?.fps ?? 30} FPS · {status?.encoder ?? 'H.264'}</small></span><span>{formatBytes(status?.bufferBytes ?? 0)}<small>ROLLING BUFFER</small></span></div>
        <div className="replay-actions"><button type="button" className="replay-save" disabled={!status?.armed || !status.ready || disabled} onClick={() => void action(() => window.lumen.replaySave())}><Icon name="record" />{status?.saving ? 'Saving…' : 'Save replay'}<span>↗</span></button><button type="button" className={status?.armed ? 'replay-arm is-on' : 'replay-arm'} disabled={!status || disabled || (!status.armed && changed)} aria-pressed={status?.armed ?? false} onClick={() => { stopTest(); void action(() => window.lumen.replayArm(!status?.armed)); }}><i />{status?.armed ? 'Stop replay' : 'Start replay'}</button></div>
        <kbd className="replay-shortcut-hint">{status?.shortcut ?? 'Ctrl+Alt+Shift+R'}</kbd>
        <p className="replay-monitor-note">Your last moments, ready to keep.<br />Save ends at the instant you press it.</p>
        {status?.lastFile ? <button type="button" className="replay-recent" onClick={() => void action(async () => { await window.lumen.replayOpen(); return window.lumen.replayStatus(); })}><span>LAST REPLAY</span><strong>Open in overlay <span>↗</span></strong><small>{status.lastFile.split(/[\\/]/).pop()}</small></button> : null}
      </aside>
      <section className="replay-config">
        <nav className="replay-tabs" role="tablist" aria-label="Replay settings">{tabs.map((item, index) => <button type="button" key={item.id} role="tab" id={`${panelId}-${item.id}`} aria-controls={`${panelId}-pane`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => { stopTest(); setBind(false); setTab(item.id); }} onKeyDown={(event) => {
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
          stopTest(); setBind(false); setTab(tabs[next].id); document.getElementById(`${panelId}-${tabs[next].id}`)?.focus();
        }}><Icon name={item.icon} />{item.label}</button>)}</nav>
        <div className="replay-pane" ref={paneRef} id={`${panelId}-pane`} role="tabpanel" aria-labelledby={`${panelId}-${tab}`} tabIndex={0} key={tab}>
          {draft ? <>
            {tab === 'capture' ? <fieldset className="replay-fields" disabled={disabled}>
              <div className="replay-section-caption"><span>01 / PICTURE & BUFFER</span><span>Local capture</span></div>
              <div className="replay-duration-card"><label htmlFor="replay-duration">Keep the last<small>Choose any duration from 10 seconds to 15 minutes.</small></label><div className="replay-duration-input"><input id="replay-duration" type="number" min={10} max={900} step={1} value={draft.replaySeconds} onChange={(event) => edit({ replaySeconds: Number(event.target.value) })} onBlur={() => edit({ replaySeconds: replayBuffer(draft.replaySeconds) })} /><span>sec</span></div></div>
              <div className="replay-duration-presets">{[30,60,120,300].map(seconds => <button type="button" key={seconds} aria-pressed={draft.replaySeconds === seconds} onClick={() => edit({ replaySeconds: seconds })}>{durationLabel(seconds)}</button>)}</div>
              <label className="replay-screen" htmlFor="replay-screen"><span>Screen</span><select id="replay-screen" value={draft.replayDisplayId} onChange={(event) => edit({ replayDisplayId: event.target.value })}><option value="">Screen under the cursor</option>{(status?.displays ?? []).map((screen) => <option key={screen.id} value={screen.id}>{screenOption(screen, status?.displays ?? [])}</option>)}{draft.replayDisplayId && !(status?.displays ?? []).some((screen) => screen.id === draft.replayDisplayId) ? <option value={draft.replayDisplayId}>Selected screen · unavailable</option> : null}</select></label>
              <div className="replay-picture-grid"><label htmlFor="replay-resolution"><span>Resolution</span><select id="replay-resolution" value={draft.replayHeight} onChange={(event) => edit({ replayHeight: Number(event.target.value) as 720 | 1080 })}><option value={720}>720p HD</option><option value={1080}>1080p Full HD</option></select></label><label htmlFor="replay-framerate"><span>Frame rate</span><select id="replay-framerate" value={draft.replayFps} onChange={(event) => edit({ replayFps: Number(event.target.value) as 30 | 60 })}><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label><label htmlFor="replay-bitrate"><span>Bitrate · Mbps</span><input id="replay-bitrate" type="number" min={2} max={30} step={.5} value={draft.replayBitrateKbps / 1000} onChange={(event) => edit({ replayBitrateKbps: Number(event.target.value) * 1000 })} onBlur={() => edit({ replayBitrateKbps: replayBitrate(draft.replayBitrateKbps) })} /></label></div>
              <div className="replay-section-caption"><span>QUALITY PROFILE</span><span>Video bitrate target</span></div>
              <div className="replay-quality-grid">{[{ label: 'Efficient', note: 'Smaller files', factor: .6 }, { label: 'Balanced', note: 'Everyday capture', factor: 1 }, { label: 'High detail', note: 'Fast action', factor: 1.5 }].map(({ label, note, factor }) => { const kbps = replayBitrate((draft.replayHeight === 720 ? 8000 : 12000) * (draft.replayFps === 60 ? 1.5 : 1) * factor); return <button type="button" key={label} aria-pressed={draft.replayBitrateKbps === kbps} onClick={() => edit({ replayBitrateKbps: kbps })}><span className="replay-quality-check">{draft.replayBitrateKbps === kbps ? '✓' : '○'}</span><strong>{label}</strong><small>{note}</small><span>{kbps / 1000} <small>Mbps</small></span></button>; })}</div>
              <div className="replay-storage"><Icon name="folder" /><div><span>Estimated buffer footprint</span><strong>{formatBytes(replayBudget(replayBuffer(draft.replaySeconds), replayBitrate(draft.replayBitrateKbps)))}</strong></div></div>
              <p className="replay-footnote">The whole screen keeps its original proportions. Higher frame rates and bitrate use more resources. Fast saves may include a few extra seconds at the beginning, never a later recording segment at the end.</p>
            </fieldset> : null}
            {tab === 'audio' ? <fieldset className="replay-fields" disabled={disabled}>
              <div className="replay-section-caption"><span>02 / AUDIO MIXER</span><span>Limiter protected</span></div>
              <section className="replay-channel"><label className="replay-toggle"><span>System audio<small>Stereo, as it plays. Voice is added only when the clip is saved.</small></span><input type="checkbox" checked={draft.replaySystemAudio} onChange={(event) => edit({ replaySystemAudio: event.target.checked })} /></label><label className="replay-gain"><span>System level</span><input type="range" min={0} max={2} step={.05} value={draft.replaySystemGain} disabled={!draft.replaySystemAudio} onChange={(event) => edit({ replaySystemGain: Number(event.target.value) })} /><output>{Math.round(draft.replaySystemGain * 100)}%</output></label></section>
              <section className="replay-channel"><label className="replay-toggle"><span>Microphone<small>Your voice, mixed into the clip.</small></span><input type="checkbox" checked={draft.replayMic} onChange={(event) => edit({ replayMic: event.target.checked })} /></label><div className="replay-device"><select aria-label="Microphone device" disabled={!draft.replayMic} value={draft.replayMicDeviceId} onChange={(event) => edit({ replayMicDeviceId: event.target.value })}><option value="">System default microphone</option>{devices.filter(device => device.deviceId && device.deviceId !== 'default').map((device,index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}{draft.replayMicDeviceId && !devices.some(device => device.deviceId === draft.replayMicDeviceId) ? <option value={draft.replayMicDeviceId}>Selected microphone · unavailable</option> : null}</select><button type="button" className="text-btn" disabled={enumerating} onClick={() => void refreshDevices()}>{enumerating ? 'Refreshing…' : 'Refresh'}</button></div><label className="replay-gain"><span>Mic level</span><input aria-label="Microphone level" type="range" min={0} max={2} step={.05} value={draft.replayMicGain} disabled={!draft.replayMic} onChange={(event) => edit({ replayMicGain: Number(event.target.value) })} /><output>{Math.round(draft.replayMicGain * 100)}%</output></label><div className={`replay-mic-test${testing ? ' is-testing' : ''}`}>
                <div className="replay-mic-test-header"><span>LIVE MIC MONITOR</span><button type="button" className="replay-test-button" disabled={!draft.replayMic} aria-pressed={testing} onClick={() => void testMic()}><i />{testing ? 'Stop test' : 'Start test'}</button></div>
                <div className={`replay-mic-meter${testing && peakDb > -3 ? ' is-hot' : ''}`}><meter min={0} max={1} value={level} aria-label="Microphone signal level" /><output>{testing && !testStarting ? peakDb <= -60 ? '-inf dB' : `${Math.round(peakDb)} dB` : '-- dB'}</output></div>
                <div className="replay-mic-scale" aria-hidden="true"><span>-60</span><span>-30</span><span>-12</span><span>0 dB</span></div>
                <p role="status">{testStarting ? 'Connecting microphone...' : testing ? peakDb > -3 ? 'Input too loud - lower Mic level' : level < .08 ? 'No signal - speak into your microphone' : 'Live - your voice is playing through your audio output' : 'Hear your voice and adjust the level before recording.'}</p>
                <small>Use headphones to avoid echo. Stop ends monitoring immediately.{status?.armed && draft.replaySystemAudio ? ' Live monitoring is also picked up by system-audio capture.' : ''}</small>
              </div></section>
              <div className="replay-section-caption"><span>VOICE PROCESSING</span><span>Optional</span></div>
              <label className="replay-toggle replay-processing"><span>Noise suppression<small>Microphone only. Steady noise, not desktop audio.</small></span><input type="checkbox" checked={draft.replayNoiseSuppression} disabled={!draft.replayMic} onChange={(event) => edit({ replayNoiseSuppression: event.target.checked })} /></label>
              <label className="replay-toggle replay-processing"><span>Hum reduction<small>Microphone only. Cuts electrical buzz.</small></span><input type="checkbox" checked={draft.replayMicHum} disabled={!draft.replayMic} onChange={(event) => edit({ replayMicHum: event.target.checked })} /></label>
              <label className="replay-toggle replay-processing"><span>Echo cancellation<small>Microphone only. For speakers instead of headphones.</small></span><input type="checkbox" checked={draft.replayEchoCancellation} disabled={!draft.replayMic} onChange={(event) => edit({ replayEchoCancellation: event.target.checked })} /></label>
              <p className="replay-footnote">Desktop audio is recorded clean. These options touch the microphone only. 100% keeps the original level. Up to 200% boosts a quiet mic.</p>
            </fieldset> : null}
            {tab === 'save' ? <fieldset className="replay-fields" disabled={disabled}>
              <div className="replay-section-caption"><span>03 / SAVE & ACCESS</span><span>Ready when you are</span></div>
              <label className="replay-toggle replay-processing"><span>Start replay with Lumen<small>Begin buffering as soon as the app starts.</small></span><input type="checkbox" checked={draft.replayAutoStart} onChange={(event) => edit({ replayAutoStart: event.target.checked })} /></label><label className="replay-toggle replay-processing"><span>Launch at Windows sign-in<small>Open Lumen quietly in the tray.</small></span><input type="checkbox" checked={launchAtLogin} onChange={(event) => { const enabled = event.target.checked; void action(async () => { const settings = await window.lumen.setLaunchOnStartup(enabled); setLaunchAtLogin(settings.launchOnStartup); return window.lumen.replayStatus(); }); }} /></label>
              <button type="button" className="replay-access-row" onClick={() => { setLocal(null); setBind(true); }}><Icon name="record" /><span>Save shortcut<strong>{bind ? 'Press keys · Esc cancels' : status?.shortcut ?? 'Ctrl+Alt+Shift+R'}</strong></span><span>Change</span></button>
              <button type="button" className="replay-access-row" title={status?.directory} onClick={() => void action(() => window.lumen.replayFolder())}><Icon name="folder" /><span>Save folder<strong>{status?.directory.split(/[\\/]/).filter(Boolean).pop() ?? 'Videos'}</strong></span><span>Browse ↗</span></button>
              {status?.lastFile ? <div className="replay-last-save"><span className="hub-kicker">LAST SAVED CLIP</span><strong>{status.lastFile.split(/[\\/]/).pop()}</strong><button type="button" className="replay-open-last" onClick={() => void action(async () => { await window.lumen.replayOpen(); return window.lumen.replayStatus(); })}>Open last replay in overlay ↗</button><button type="button" className="text-btn" onClick={() => { if (status.lastFile) void window.lumen.showItem(status.lastFile); }}>Show in folder</button></div> : null}
              <p className="replay-footnote">Saving shows a notification above the active app. Open in overlay is always the first action. Temporary capture files rotate automatically; saved clips stay in your folder.</p>
            </fieldset> : null}
          </> : <p role="status">{local ?? 'Connecting to capture…'}</p>}
        </div>
        {moreBelow ? <div className="replay-scroll-hint" aria-hidden="true">SCROLL FOR MORE ↓</div> : null}
        {local || status?.notice ? <p className="replay-notice" role="status">{local ?? status?.notice}</p> : null}
        <footer className={`replay-apply${changed ? ' has-changes' : ''}`}><span role="status"><i />{changed ? status?.armed ? 'Picture or audio changes restart the buffer.' : 'Unsaved settings' : 'All settings saved'}</span><button type="button" className={`export-btn${!changed ? " is-saved" : ""}`} disabled={!draft || disabled} onClick={() => void apply()}>{applying ? 'Saving...' : changed ? 'Apply settings' : 'Settings saved'}</button></footer>
      </section>
    </div>
  </div>;
  return compact ? body : <div className="hub-panel replay-page"><section className="hub-sheet">{body}</section></div>;
}
