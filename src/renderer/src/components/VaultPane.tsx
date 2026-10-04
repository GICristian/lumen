import { useEffect, useState } from "react";
import type { VaultItem, VaultStatus } from "@shared/contracts";
import { BrandMark } from "./BrandMark";
import { Icon } from "./Icon";

type Props = {
  onPlay: (item: VaultItem) => void;
  onLock: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function VaultPane({ onPlay, onLock, onMinimize, onMaximize, onClose }: Props) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [move, setMove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    void window.lumen.vaultStatus().then(async (next) => {
      setStatus(next);
      if (next.open) setItems(await window.lumen.vaultList());
    });
  }, []);

  useEffect(() => {
    if (!status?.open || items.length === 0) return;
    let cancel = false;
    const list = items;
    void (async () => {
      for (const item of list) {
        if (cancel) return;
        const image = await window.lumen.vaultPoster(item.id);
        if (cancel || !image) continue;
        setPosters((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: image }));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [status?.open, items]);

  async function submit(): Promise<void> {
    if (!status || busy) return;
    setNotice(null);
    if (password.length < 6) {
      setNotice("Use at least 6 characters.");
      return;
    }
    if (!status.exists && password !== confirm) {
      setNotice("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const next = status.exists
        ? await window.lumen.vaultUnlock(password)
        : await window.lumen.vaultCreate(password);
      setItems(next);
      setStatus({ exists: true, open: true });
      setPassword("");
      setConfirm("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The vault stayed locked");
    } finally {
      setBusy(false);
    }
  }

  async function add(): Promise<void> {
    setNotice(null);
    setBusy(true);
    try {
      setItems(await window.lumen.vaultAdd(move));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The file was not stored");
      try {
        setItems(await window.lumen.vaultList());
      } catch {
        /* still locked or empty */
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      setItems(await window.lumen.vaultRemove(id));
      setPendingDelete(null);
      setPosters((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove it");
    } finally {
      setBusy(false);
    }
  }

  const open = status?.open === true;
  const library = open && items.length > 0;

  return (
    <div className="hub">
      <header className="hub-bar">
        <button type="button" className="hub-back" onClick={onLock}>
          Back
        </button>
        <div className="hub-spacer" />
        <div className="window-controls">
          <button type="button" className="win-btn" onClick={onMinimize} aria-label="Minimize">
            –
          </button>
          <button type="button" className="win-btn" onClick={onMaximize} aria-label="Maximize">
            □
          </button>
          <button type="button" className="win-btn close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </header>
      <div className={library ? "vault-screen is-library" : "vault-screen"}>
        {open ? (
          <div className="vault-stage">
            <div className="vault-head">
              <BrandMark className="vault-brand-mark" />
              <span className="hub-kicker">Vault</span>
              <h2>{items.length === 0 ? "Nothing stored yet" : "Your videos"}</h2>
              <p className="hub-note">
                Encrypted on this PC. A forgotten password cannot be recovered.
              </p>
              <div className="vault-actions">
                <label className="vault-move">
                  <input
                    type="checkbox"
                    checked={move}
                    onChange={(event) => setMove(event.target.checked)}
                  />
                  Remove the original after it is encrypted
                </label>
                <button
                  type="button"
                  className="vault-add"
                  disabled={busy}
                  onClick={() => void add()}
                >
                  {move ? "Move a video in" : "Copy a video in"}
                </button>
              </div>
              {notice ? <p className="hub-note is-warn">{notice}</p> : null}
            </div>
            {library ? (
              <div className="vault-grid">
                {items.map((item) => (
                  <article key={item.id} className="vault-card">
                    <button type="button" className="vault-open" onClick={() => onPlay(item)}>
                      <span className="vault-still">
                        {posters[item.id] ? (
                          <img src={posters[item.id]} alt="" />
                        ) : (
                          <span className="vault-shade" />
                        )}
                        <span className="vault-playmark">
                          <Icon name="play" />
                        </span>
                      </span>
                      <span className="vault-meta">
                        <strong>{item.name}</strong>
                        <span>{sizeLabel(item.bytes)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={
                        pendingDelete === item.id ? "vault-drop is-confirm" : "vault-drop"
                      }
                      onClick={() => {
                        if (pendingDelete === item.id) void remove(item.id);
                        else setPendingDelete(item.id);
                      }}
                    >
                      {pendingDelete === item.id ? "Delete" : "Remove"}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <section className="vault-gate">
            <BrandMark className="vault-brand-mark" />
            <span className="hub-kicker">Vault</span>
            <h2>{status?.exists ? "Unlock" : "Choose a password"}</h2>
            <p className="hub-note">
              {status?.exists
                ? "A forgotten password cannot be recovered."
                : "This password is the only way back in. It is not saved anywhere."}
            </p>
            <form
              className="vault-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <input
                type="password"
                autoComplete="off"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {status && !status.exists ? (
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              ) : null}
              <button type="submit" className="vault-add" disabled={busy || !status}>
                {status?.exists ? "Unlock" : "Create the vault"}
              </button>
            </form>
            {notice ? <p className="hub-note is-warn">{notice}</p> : null}
          </section>
        )}
      </div>
    </div>
  );
}
