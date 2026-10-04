import { useEffect, useState } from "react";
import type { ReplayStatus } from "@shared/contracts";
import { Icon } from "./Icon";

export function ReplayToast() {
  const [status, setStatus] = useState<ReplayStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const receive = (next: ReplayStatus): void => { if (alive) setStatus(next); };
    const off = window.lumen.onReplayStatus(receive);
    void window.lumen.replayStatus().then(receive);
    return () => { alive = false; off(); };
  }, []);
  const saving = !status || status.saving;
  const saved = !saving && status?.notice === "Saved.";
  return <main className="replay-toast" role="status">
    <button className="replay-toast-dismiss icon-btn" aria-label="Dismiss notification" onClick={() => window.lumen.replayDismiss()}>×</button>
    <span className="hub-kicker">LUMEN / INSTANT REPLAY</span>
    <div className="replay-toast-title">{saving ? <span className="loading-ring" /> : <span className="replay-toast-check">{saved ? "✓" : "!"}</span>}<strong>{saving ? "Saving your moment…" : saved ? "Replay saved" : "Replay needs attention"}</strong></div>
    <p>{saved ? status?.lastFile?.split(/[\\/]/).pop() : saving ? "Finishing the latest frames." : status?.notice}</p>
    {saved ? <div className="replay-toast-actions"><button className="export-btn" onClick={() => void window.lumen.replayOpen()}>Open in overlay <Icon name="play" /></button><button className="text-btn" onClick={() => { if (status?.lastFile) void window.lumen.showItem(status.lastFile); }}>Folder ↗</button></div> : null}
  </main>;
}
