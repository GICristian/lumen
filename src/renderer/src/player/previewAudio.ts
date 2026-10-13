import { useEffect, useState } from "react";

let enabled = false;
const listeners = new Set<(value: boolean) => void>();

function publish(value: boolean): void {
  enabled = value;
  for (const listener of listeners) listener(value);
}

export function bindPreviewAudio(): void {
  void window.lumen.getSettings().then((settings) => publish(settings.previewAudio));
  window.lumen.onTheme((settings) => publish(settings.previewAudio));
}

export function usePreviewAudio(): [boolean, (value: boolean) => void] {
  const [audio, setAudio] = useState(enabled);
  useEffect(() => {
    const listener = (value: boolean): void => setAudio(value);
    listeners.add(listener);
    setAudio(enabled);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const change = (value: boolean): void => {
    publish(value);
    void window.lumen.setSettings({ previewAudio: value });
  };
  return [audio, change];
}
