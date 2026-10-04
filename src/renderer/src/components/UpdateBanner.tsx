import { useEffect, useState } from "react";
import type { UpdateState } from "@shared/contracts";
import { idleUpdate, updateLabel, updateTitle, updateVisible } from "@shared/update";

/** Offers the newest GitHub release and installs it when chosen. */
export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>(idleUpdate);
  useEffect(() => {
    let alive = true;
    void window.lumen.updateState().then((next) => {
      if (alive) setState(next);
    }).catch(() => undefined);
    const off = window.lumen.onUpdateState((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  if (!updateVisible(state)) return null;
  const busy = state.phase === "downloading" || state.phase === "ready";
  return (
    <div className="update-banner" role="status">
      <strong>{updateTitle(state)}</strong>
      <button
        type="button"
        className="export-btn"
        disabled={busy}
        onClick={() => { void window.lumen.installUpdate(); }}
      >
        {updateLabel(state)}
      </button>
    </div>
  );
}
