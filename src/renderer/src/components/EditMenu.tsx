import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

type Props = {
  label: string;
  className: string;
  showIcon?: boolean;
  onQuick: () => void;
  onStudio: () => void;
};

/** Chooses the one-clip tools or the full timeline editor. */
export function EditMenu({ label, className, showIcon = true, onQuick, onStudio }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="edit-menu" ref={root}>
      <button
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {showIcon ? <Icon name="edit" /> : null}
        <span>{label}</span>
      </button>
      {open ? (
        <div className="menu-pop is-edit" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onQuick();
            }}
          >
            Quick edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onStudio();
            }}
          >
            Open in editor
          </button>
        </div>
      ) : null}
    </div>
  );
}
