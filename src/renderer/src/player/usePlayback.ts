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
        visibleRef.current = false;
        setVisible(false);
      }, 2500);
    };

    const onMove = (): void => {
      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
      arm();
    };

    onMove();
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [playing]);

  return visible;
}
