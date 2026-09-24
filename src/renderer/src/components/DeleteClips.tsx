type Props = {
  count: number;
  pending: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteClips({ count, pending, onAsk, onConfirm, onCancel }: Props) {
  if (count === 0) return null;
  if (!pending) {
    return (
      <button type="button" className="text-btn is-danger" onClick={onAsk}>
        Delete {count}
      </button>
    );
  }
  return (
    <div className="delete-bar">
      <span>
        Delete {count} {count === 1 ? "clip" : "clips"} from disk?
      </span>
      <button type="button" className="text-btn is-danger" onClick={onConfirm}>
        Delete
      </button>
      <button type="button" className="text-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
