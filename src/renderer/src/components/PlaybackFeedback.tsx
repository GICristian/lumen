import { Icon } from "./Icon";

export function PlaybackFeedback({ text }: { text: string }) {
  const volume = /^Volume (\d+)%$/.exec(text);
  return <div className="osd" role="status" aria-live="polite">
    {volume ? <><Icon name="volume" /><span>{volume[1]}<small>%</small></span>
      <span className="osd-meter" aria-hidden="true">{Array.from({length:16}, (_, i) => <i key={i} className={i < Number(volume[1]) / 100 * 16 ? "is-lit" : ""} />)}</span></> : <span>{text}</span>}
  </div>;
}
