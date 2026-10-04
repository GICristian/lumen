import { useCallback, useEffect, useRef, useState } from "react";
import { seekStep } from "@shared/seek";

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const padded = String(secs).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${padded}`;
  return `${minutes}:${padded}`;
}

export function mediaUrl(filePath: string): string {
  return `lumen://media/?path=${encodeURIComponent(filePath)}`;
}

export function fileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

export function seekLabel(duration: number, direction: -1 | 1, fine: boolean): string {
  if (fine) return `${direction < 0 ? "−" : "+"}1s`;
  const step = seekStep(duration);
  const percent = duration * 0.05;
  const amount = step !== null && Math.abs(step - percent) < 0.001 ? "5%" : "0.5s";
  return `${direction < 0 ? "−" : "+"}${amount}`;
}

export function useOsd(): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const show = useCallback((next: string) => {
    setText(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), 800);
  }, []);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  return [text, show];
}

export function useChromeFade(playing: boolean): boolean {
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const arm = (): void => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (!playing) {
        visibleRef.current = true;
        setVisible(true);
        return;
      }
      timer.current = window.setTimeout(() => {
        const keyboardFocus = document.activeElement?.matches(":focus-visible") && document.activeElement.closest(".player-chrome, .titlebar, .zoom-controls");
        if (keyboardFocus || document.querySelector(".player-chrome:hover, .zoom-controls:hover")) {
          arm();
          return;
        }
        visibleRef.current = false;
        setVisible(false);
      }, 1800);
    };

    const reveal = (): void => {
      visibleRef.current = true;
      setVisible(true);
      arm();
    };

    const last = { x: Number.NaN, y: Number.NaN };
    const onMove = (event: MouseEvent): void => {
      if (!Number.isFinite(last.x)) {
        last.x = event.clientX;
        last.y = event.clientY;
        arm();
        return;
      }
      const moved =
        Math.abs(event.clientX - last.x) >= 8 || Math.abs(event.clientY - last.y) >= 8;
      if (!moved) return;
      last.x = event.clientX;
      last.y = event.clientY;
      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
      arm();
    };

    arm();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", reveal);
    window.addEventListener("focusin", reveal);
    window.addEventListener("pointerdown", reveal);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", reveal);
      window.removeEventListener("focusin", reveal);
      window.removeEventListener("pointerdown", reveal);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [playing]);

  return visible;
}
