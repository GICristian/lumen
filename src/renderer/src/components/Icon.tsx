type Name = "play" | "pause" | "folder" | "gear" | "full" | "volume" | "close" | "search" | "back" | "lock" | "edit" | "record" | "star" | "bell";

type ExtendedName = Name | "previous" | "next" | "loop";
const paths: Record<ExtendedName, string> = {
  previous: "M6 5v14M18 5l-9 7 9 7V5Z",
  next: "M18 5v14M6 5l9 7-9 7V5Z",
  loop: "m16 3 4 4-4 4M20 7H7a4 4 0 0 0-4 4m5 10-4-4 4-4M4 17h13a4 4 0 0 0 4-4",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
  pause: "M7 5h3.5v14H7V5Zm6.5 0H17v14h-3.5V5Z",
  folder: "M3.5 7.5h6l2 2H20.5v9.5h-17V7.5Z",
  gear: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25",
    "a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38",
    "a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51",
    "a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38",
    "a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25",
    "a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18",
    "a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08",
    "a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08",
    "a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09",
    "a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08",
    "a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  ].join(""),
  full: "M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4",
  volume: "M4 10h3.2L11 6.5v11L7.2 14H4v-4Zm9 .2a3.2 3.2 0 0 1 0 3.6",
  close: "M7 7l10 10M17 7L7 17",
  search: "M10.5 5.5a5 5 0 1 0 .01 0ZM15 15l4 4",
  back: "M14.5 6.5 8 12l6.5 5.5",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M6 10h12v10H6zM12 14v2",
  edit: "m14 5 5 5M4 20l4-.8L19 8a2.12 2.12 0 0 0-3-3L5 16z",
  record: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z",
  star: "M12 3.2 14.7 8.7 20.8 9.6 16.4 13.9 17.4 20 12 17.1 6.6 20 7.6 13.9 3.2 9.6 9.3 8.7 12 3.2Z",
  bell: "M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9M10 21a2 2 0 0 0 4 0",
};

export function Icon({ name }: { name: ExtendedName }) {
  const filled = name === "play" || name === "pause";
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={paths[name]}
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth={filled ? undefined : 1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
