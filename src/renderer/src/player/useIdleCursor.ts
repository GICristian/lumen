import { useEffect, useState } from "react";

const idleAfterMs = 2200;

export function useIdleCursor(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = 0;
    const wake = (): void => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), idleAfterMs);
    };
    wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake, true);
    };
  }, []);
  return idle;
}
