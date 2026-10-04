import lockup from "../assets/lockup.png";
import mark from "../assets/mark.png";

type Props = { className?: string; label?: string };

export function BrandMark({ className = "", label = "Lumen" }: Props) {
  return <img className={className} src={mark} alt={label} draggable={false} />;
}

export function BrandLockup({ className = "" }: { className?: string }) {
  return <img className={`brand-lockup ${className}`} src={lockup} alt="Lumen" draggable={false} />;
}
