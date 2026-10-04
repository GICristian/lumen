export const INDICATOR_WIDTH = 36;
export const INDICATOR_HEIGHT = 28;
const TASKBAR_GAP = 8;

export function indicatorBounds(area: { x: number; y: number; width: number; height: number }) {
  return {
    x: Math.round(area.x + area.width - INDICATOR_WIDTH - 14),
    y: Math.round(area.y + area.height - INDICATOR_HEIGHT - TASKBAR_GAP),
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
  };
}

// A standalone document: no React, app bundle, fonts, images, or animated surfaces.
export const RECORDING_INDICATOR_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
body{padding:2px}button{display:grid;place-items:center;width:100%;height:100%;padding:0;cursor:pointer;
border:1px solid #b69b685c;border-radius:6px;background:#24211ded;box-shadow:inset 0 1px #ffffff0c;
transition:background 120ms,border-color 120ms;outline:none}
button:hover{background:#332e24;border-color:#d8b878}button:active{background:#1a1815}
i{display:block;width:6px;height:6px;border-radius:50%;background:#f16b59;box-shadow:0 0 0 3px #f16b5914}
@media(prefers-reduced-motion:reduce){button{transition:none}}
</style></head><body><button aria-label="Replay active. Open Lumen overlay" title="Replay active · Open overlay"><i></i></button></body></html>`;
