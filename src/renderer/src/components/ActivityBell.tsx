import { useEffect, useState } from "react";
import type { ActivityItem } from "@shared/contracts";
import { formatWhen } from "@shared/clips";
import { Icon } from "./Icon";

function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

/** Recent recordings and exports. The list stays until newer actions replace it. */
export function ActivityBell({ onView }: { onView?: (filePath: string) => void }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);

  useEffect(() => {
    void window.lumen.activity().then(setItems).catch(() => setItems([]));
    return window.lumen.onActivity(setItems);
  }, []);

  const fresh = items.some((item) => item.at > seen);

  return (
    <div className="settings-anchor">
      <button
        type="button"
        className={open ? "hub-note-entry is-on" : "hub-note-entry"}
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setSeen(Date.now());
        }}
      >
        <Icon name="bell" />
        Notifications
        {fresh ? <i className="activity-dot" /> : null}
      </button>
      {open ? (
        <div className="menu-pop is-activity is-hub">
          {items.length === 0 ? <p className="menu-note">Nothing recorded or exported yet.</p> : (
            items.map((item) => (
              <article key={item.id} className="activity-row">
                <strong>{item.kind === "recorded" ? "Clip recorded" : "Clip exported"}</strong>
                <span title={item.path}>{fileName(item.path)}</span>
                <em>{formatWhen(item.at)}</em>
                <div>
                  {onView ? <button type="button" onClick={() => onView(item.path)}>View</button> : null}
                  <button type="button" onClick={() => void window.lumen.showItem(item.path)}>Show in folder</button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
