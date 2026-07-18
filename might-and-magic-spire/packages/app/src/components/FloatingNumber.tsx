// A combat number that rises off a struck stack and fades — damage dealt or
// creatures slain. Pure CSS (floatUp keyframe in index.css); self-removes via
// an onDone callback once the animation completes.
import { useEffect } from 'react';

export type FloatKind = 'damage' | 'loss' | 'heal';

export function FloatingNumber({
  id,
  text,
  kind,
  onDone,
}: {
  id: string;
  text: string;
  kind: FloatKind;
  onDone: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDone(id), 1000);
    return () => clearTimeout(t);
  }, [id, onDone]);

  const tone =
    kind === 'heal'
      ? 'text-verd-300'
      : kind === 'loss'
        ? 'text-blood-400'
        : 'text-bone-50';

  return (
    <span
      data-testid="floating-number"
      className={`pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 select-none font-display text-base font-black tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] animate-float-up ${tone}`}
    >
      {text}
    </span>
  );
}
