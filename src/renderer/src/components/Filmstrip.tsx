import { useEffect, useState } from "react";
import { frameUrl, requestFrames, subscribeFrames } from "../player/filmstrip";

const SLOT = 72;

function useFilmRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeFrames(() => setRevision((value) => value + 1)), []);
  return revision;
}

export function Filmstrip({
  path,
  start,
  end,
  width,
  poster,
  viewLeft,
  viewRight,
}: {
  path: string;
  start: number;
  end: number;
  width: number;
  poster: string | null;
  viewLeft: number;
  viewRight: number;
}) {
  const revision = useFilmRevision();
  const span = Math.max(0.05, end - start);
  const count = Math.max(1, Math.ceil(width / SLOT));
  const slotW = width / count;
  const first = Math.max(0, Math.floor(viewLeft / slotW) - 1);
  const last = Math.min(count - 1, Math.ceil(viewRight / slotW) + 1);
  const times: number[] = [];
  for (let index = first; index <= last; index += 1) {
    times.push(start + ((index + 0.5) / count) * span);
  }
  const stamp = times.join("|");

  useEffect(() => {
    if (stamp.length > 0) requestFrames(path, stamp.split("|").map(Number));
  }, [path, stamp]);

  return (
    <div className="filmstrip" data-frames={revision}>
      {times.map((time, offset) => {
        const index = first + offset;
        const src = frameUrl(path, time) ?? poster;
        return src ? (
          <img
            key={index}
            src={src}
            alt=""
            style={{ left: index * slotW, width: slotW + 1 }}
          />
        ) : (
          <i key={index} style={{ left: index * slotW, width: slotW + 1 }} />
        );
      })}
    </div>
  );
}
