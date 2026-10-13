import { useEffect, useState } from "react";
import lockup from "../assets/lockup.png";
import mark from "../assets/mark.png";
import { tintLogo } from "../player/tintLogo";

type Props = { className?: string; label?: string };

function useTinted(url: string): string {
  const [src, setSrc] = useState(url);
  useEffect(() => {
    let cancel = false;
    const paint = (): void => {
      const style = getComputedStyle(document.documentElement);
      const accent = style.getPropertyValue("--accent").trim() || "#e6c18a";
      const accent2 = style.getPropertyValue("--accent-2").trim() || "#f2c779";
      void tintLogo(url, accent, accent2).then((next) => {
        if (!cancel) setSrc(next);
      });
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      cancel = true;
      observer.disconnect();
    };
  }, [url]);
  return src;
}

export function BrandMark({ className = "", label = "Lumen" }: Props) {
  const src = useTinted(mark);
  return <img className={className} src={src} alt={label} draggable={false} />;
}

export function BrandLockup({ className = "" }: { className?: string }) {
  const src = useTinted(lockup);
  return <img className={`brand-lockup ${className}`} src={src} alt="Lumen" draggable={false} />;
}
