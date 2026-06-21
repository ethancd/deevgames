// Chrome icons — MINE to make (not content art). Pure inline SVG so they
// scale crisply, theme via currentColor, and ship in the bundle with zero
// network cost. Memento-mori register: skull, bone, crossed bones, scythe.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function base(props: IconProps) {
  const { title, children, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const SkullIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M12 3c-4.4 0-7 2.9-7 6.6 0 2.2 1 3.8 2.2 4.8.5.4.8 1 .8 1.7V18a1 1 0 0 0 1 1h.5" />
        <path d="M19 9.6C19 5.9 16.4 3 12 3" />
        <path d="M16.5 16.1c0-.7.3-1.3.8-1.7C18.5 13.4 19.5 11.8 19.5 9.6" />
        <path d="M9.5 19h5a1 1 0 0 0 1-1v-1.9" />
        <circle cx="9" cy="10.5" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10.5" r="1.6" fill="currentColor" stroke="none" />
        <path d="M12 13.5l-.8 1.6h1.6L12 13.5z" fill="currentColor" stroke="none" />
        <path d="M10 19v2M12 19v2M14 19v2" />
      </>
    ),
  });

export const SwordIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M14.5 3.5l6 6-7.5 7.5-3-3z" />
        <path d="M3 21l4.5-4.5" />
        <path d="M5 17l2 2" />
      </>
    ),
  });

export const ShieldIcon = (p: IconProps) =>
  base({
    ...p,
    children: <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  });

export const BuffIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M12 3v18" />
        <path d="M7 8l5-5 5 5" />
        <path d="M7 14l5-5 5 5" />
      </>
    ),
  });

export const DebuffIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M12 21V3" />
        <path d="M7 16l5 5 5-5" />
        <path d="M7 10l5 5 5-5" />
      </>
    ),
  });

export const FlameIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <path d="M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1-.5-2-.5-2 2 1 3.5 3 3.5 5.5a5 5 0 0 1-10 0C7 12 11 9 12 3z" />
    ),
  });

export const GoldIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M9.5 10h3.2a1.6 1.6 0 0 1 0 3.2H9.8M9.5 13.2h3.5" />
      </>
    ),
  });

export const HeartIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <path d="M12 20S4 14.5 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5.5-8 11-8 11z" />
    ),
  });

export const QuestionIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 1.8-2 3" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
      </>
    ),
  });

export const RestIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M5 18c2-6 5-9 7-12 0 5-2 8-4 10" />
        <path d="M5 18h14" />
        <path d="M14 10c1.5 1 3 2.5 4 4" />
      </>
    ),
  });

export const ShopIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M4 9h16l-1 11H5z" />
        <path d="M4 9l1.5-4h13L20 9" />
        <path d="M9 13a3 3 0 0 0 6 0" />
      </>
    ),
  });

// A drawn bow + arrow — the ranged/shoot telegraph for back-rank stacks.
export const ShootIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M4 20C4 12 12 4 20 4" />
        <path d="M20 4l-4 .5M20 4l-.5 4" />
        <path d="M5 19l14-14" />
        <path d="M3 21l3.5-1.2-2.3-2.3z" fill="currentColor" stroke="none" />
      </>
    ),
  });

// A creature dwelling — a tomb/portal arch from which a stack is recruited.
export const DwellingIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M5 21V9a7 7 0 0 1 14 0v12" />
        <path d="M5 21h14" />
        <path d="M10 21v-5a2 2 0 0 1 4 0v5" />
      </>
    ),
  });

// An altar — upgrade a stack to its higher form. A stepped plinth with a flame.
export const AltarIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M6 21h12" />
        <path d="M7 21v-4h10v4" />
        <path d="M9 17v-3h6v3" />
        <path d="M12 3c.8 2-1.4 2.8-1.4 4.6a1.4 1.4 0 0 0 2.8 0c0-.7-.4-1.2-.4-1.2 1.4.7 2 2 2 3.6a3 3 0 0 1-6 0c0-2.2 3-3.4 3-7z" />
      </>
    ),
  });

// A shrine — learn a spell. An open grimoire / sigil tablet.
export const ShrineIcon = (p: IconProps) =>
  base({
    ...p,
    children: (
      <>
        <path d="M4 5c2.5 0 4.5.6 6 1.6v12C14.5 17.6 12.5 17 10 17H4z" />
        <path d="M20 5c-2.5 0-4.5.6-6 1.6v12C15.5 17.6 17.5 17 20 17h0z" transform="translate(-4 0)" />
        <path d="M12 6.6V18" />
        <circle cx="16" cy="9" r="2.4" />
        <path d="M16 6.6v4.8M13.6 9h4.8" />
      </>
    ),
  });
