let playing = false;

export function macroIsPlaying(): boolean {
  return playing;
}

export function setMacroPlaying(value: boolean): void {
  playing = value;
}
