/**
 * EMBER — small inline SVG glyphs for the panels (src/ui/panels/icons.tsx).
 *
 * "Emoji-free procedural glyphs" per the task brief: hand-drawn, limited-
 * palette pixel-ish icons instead of emoji or an icon font (no new npm
 * dependency). Each is a tiny fixed-viewBox SVG that inherits color via
 * `currentColor` so callers set color with a text-* Tailwind class.
 */

import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** fuel */
export function FlameIcon(props: IconProps) {
  return (
    <Icon {...props} title={props.title ?? 'fuel'}>
      <path d="M8 1.5c1.5 2 .5 3-.2 4-1 1.3-.3 2.7 1 2.7 1.4 0 2-1.2 1.8-2.3 1.6 1.2 2.4 3 2.4 4.6a4.5 4.5 0 0 1-9 0c0-2.2 1-3.6 2.2-5.2C6.9 3.7 7.6 2.7 8 1.5Z" />
    </Icon>
  );
}

/** heat */
export function ThermometerIcon(props: IconProps) {
  return (
    <Icon {...props} title={props.title ?? 'heat'}>
      <path d="M9 2a1 1 0 0 0-2 0v6.3a2.5 2.5 0 1 0 2 0V2Z" />
      <circle cx="8" cy="11.5" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** activation */
export function BoltIcon(props: IconProps) {
  return (
    <Icon {...props} title={props.title ?? 'activation'}>
      <path d="M8.5 1.5 3 9h3.5L7 14.5 13 6.5H9.5L8.5 1.5Z" />
    </Icon>
  );
}

/** damage */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props} title={props.title ?? 'damage'}>
      <path d="M8 1.5 13 3.3v3.6c0 3.4-2.1 6.1-5 7.6-2.9-1.5-5-4.2-5-7.6V3.3L8 1.5Z" />
    </Icon>
  );
}

/** fatigue */
export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props} title={props.title ?? 'fatigue'}>
      <path d="M12.5 9.8A5 5 0 1 1 6.2 3.5a4 4 0 0 0 6.3 6.3Z" />
    </Icon>
  );
}

/** stability */
export function ScalesIcon(props: IconProps) {
  return (
    <Icon {...props} title={props.title ?? 'stability'}>
      <path d="M8 1.8v12.4M4 3.5h8M2 6l2-2.5L6 6M10 6l2-2.5L14 6M2 6a2 2 0 0 0 4 0M10 6a2 2 0 0 0 4 0M5 14.2h6" />
    </Icon>
  );
}

/** danger-ish intent (flee / shelter) — same silhouette as FlameIcon,
 *  reused so the banner glyph reads as "urgent regulation". */
export function IntentDangerIcon(props: IconProps) {
  return <FlameIcon {...props} title={props.title ?? 'danger'} />;
}

/** recuperative intent (rest / consume) */
export function IntentRestIcon(props: IconProps) {
  return <MoonIcon {...props} title={props.title ?? 'rest'} />;
}

/** purposeful-movement intent (move_to / gather) */
export function IntentMoveIcon(props: IconProps) {
  return (
    <Icon {...props} title={props.title ?? 'move'}>
      <path d="M8 2 9.4 6.6 14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4L8 2Z" />
    </Icon>
  );
}

/** neutral intent (wait / focus / unrecognized) */
export function IntentNeutralIcon(props: IconProps) {
  return (
    <Icon {...props} title={props.title ?? 'wait'}>
      <circle cx="8" cy="8" r="2.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}
