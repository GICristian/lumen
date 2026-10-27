import { useEffect, useState } from "react";
import { wheelIndex, type SoundClip } from "@shared/plugins";
import {
  playSoundboard,
  stopSoundboardVoice,
  syncSoundboardVoice,
} from "../player/soundboardAudio";

const CX = 210;
const CY = 210;
const OUTER = 176;
const INNER = 64;
const LABEL_R = 120;

function point(radius: number, angle: number): string {
  const x = CX + Math.cos(angle) * radius;
  const y = CY + Math.sin(angle) * radius;
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function wedge(index: number, count: number): string {
  if (count <= 1) {
    return [
      `M ${point(OUTER, 0)}`,
      `A ${OUTER} ${OUTER} 0 1 1 ${point(OUTER, Math.PI)}`,
      `A ${OUTER} ${OUTER} 0 1 1 ${point(OUTER, 0)}`,
      `L ${point(INNER, 0)}`,
      `A ${INNER} ${INNER} 0 1 0 ${point(INNER, Math.PI)}`,
      `A ${INNER} ${INNER} 0 1 0 ${point(INNER, 0)}`,
      "Z",
    ].join(" ");
  }
  const sweep = (Math.PI * 2) / count;
  const pad = 0.018;
  const start = -Math.PI / 2 + index * sweep + pad;
  const end = -Math.PI / 2 + (index + 1) * sweep - pad;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${point(OUTER, start)}`,
    `A ${OUTER} ${OUTER} 0 ${large} 1 ${point(OUTER, end)}`,
    `L ${point(INNER, end)}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${point(INNER, start)}`,
    "Z",
  ].join(" ");
}

function labelAt(index: number, count: number): { x: number; y: number } {
  const sweep = (Math.PI * 2) / Math.max(count, 1);
  const mid = -Math.PI / 2 + (index + 0.5) * sweep;
  return {
    x: CX + Math.cos(mid) * LABEL_R,
    y: CY + Math.sin(mid) * LABEL_R,
  };
}

function shortName(name: string): string {
  const clean = name.replace(/[_-]+/g, " ").trim();
  return clean.length > 12 ? `${clean.slice(0, 11)}…` : clean;
}

export function SoundboardWheel() {
  const [sounds, setSounds] = useState<SoundClip[]>([]);
  const [aim, setAim] = useState({ dx: 0, dy: 0 });
  const [open, setOpen] = useState(false);
  const active = wheelIndex(aim.dx, aim.dy, sounds.length);

  useEffect(() => {
    const stopOpen = window.lumen.onSoundboardOpen((payload) => {
      setSounds(payload.sounds);
      setAim({ dx: 0, dy: 0 });
      setOpen(true);
    });
    const stopAim = window.lumen.onSoundboardAim(setAim);
    const stopPlay = window.lumen.onSoundboardPlay((payload) => {
      playSoundboard(payload.path, payload.volume);
    });
    const stopHide = window.lumen.onSoundboardHide(() => setOpen(false));
    const applyVoice = (): void => {
      void window.lumen.getSettings().then((settings) => syncSoundboardVoice(settings));
    };
    applyVoice();
    const stopTheme = window.lumen.onTheme(() => applyVoice());
    const onDevices = (): void => applyVoice();
    navigator.mediaDevices.addEventListener("devicechange", onDevices);
    return () => {
      stopOpen();
      stopAim();
      stopPlay();
      stopHide();
      stopTheme();
      navigator.mediaDevices.removeEventListener("devicechange", onDevices);
      stopSoundboardVoice();
    };
  }, []);

  if (!open) return null;
  const title = sounds.length === 0
    ? "No sounds yet"
    : active === null ? "Release to cancel" : sounds[active]?.name ?? "";
  return (
    <div className="sb-wheel">
      <svg className="sb-disc" viewBox="0 0 420 420" aria-hidden="true">
        <circle className="sb-halo" cx={CX} cy={CY} r={188} />
        {sounds.map((sound, index) => {
          const spot = labelAt(index, sounds.length);
          const hot = index === active;
          return (
            <g key={sound.path}>
              <path
                className={hot ? "sb-wedge is-hot" : "sb-wedge"}
                d={wedge(index, sounds.length)}
              />
              <text
                className={hot ? "sb-label is-hot" : "sb-label"}
                x={spot.x}
                y={spot.y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {shortName(sound.name)}
              </text>
            </g>
          );
        })}
        {sounds.length === 0 ? <circle className="sb-wedge" cx={CX} cy={CY} r={OUTER} /> : null}
      </svg>
      <div className={active === null ? "sb-core" : "sb-core is-hot"}>
        <span>Sound</span>
        <strong>{title}</strong>
      </div>
    </div>
  );
}
