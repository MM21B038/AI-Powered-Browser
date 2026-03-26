import { useMemo, type ReactElement } from "react";
import { SPOTLIGHT_ICON_SVGS } from "../shared/spotlightIconSvgs";

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type LoadingIconCarouselProps = {
  compact?: boolean;
  caption?: string;
  showCaption?: boolean;
  ariaLabel?: string;
};

export function LoadingIconCarousel({
  compact = false,
  caption = "Loading…",
  showCaption = false,
  ariaLabel = "Loading",
}: LoadingIconCarouselProps): ReactElement {
  const rootClass = compact
    ? "loading-spotlight loading-spotlight--compact"
    : "loading-spotlight";
  const skyClass = compact
    ? "loading-spotlight-sky loading-spotlight-sky--compact"
    : "loading-spotlight-sky";
  const gridClass = compact
    ? "loading-spotlight-grid loading-spotlight-grid--compact"
    : "loading-spotlight-grid";
  const veilClass = compact
    ? "loading-spotlight-veil loading-spotlight-veil--compact"
    : "loading-spotlight-veil";
  const icons = useMemo(() => shuffled(SPOTLIGHT_ICON_SVGS), []);

  return (
    <>
      <div className={skyClass} aria-hidden />
      <div className={gridClass} aria-hidden />
      <div className={veilClass} aria-hidden />
      <div className={rootClass} aria-label={ariaLabel} role="status">
        <div className="loading-spotlight-glow" aria-hidden />
        <div className="loading-spotlight-stage">
          {icons.map((svg, i) => (
            <div key={i} className="loading-spotlight-beat">
              <span className="loading-spotlight-inner">
                <span
                  className="loading-spotlight-icon-wrap"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </span>
            </div>
          ))}
        </div>
        {showCaption ? (
          <p className="loading-spotlight-caption">{caption}</p>
        ) : null}
      </div>
    </>
  );
}
