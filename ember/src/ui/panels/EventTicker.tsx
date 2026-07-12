/**
 * EMBER — event-log ticker (src/ui/panels/EventTicker.tsx). Pinned props in
 * src/ui/contracts.ts (`EventTickerProps`).
 *
 * Pure presentational component: `events` is newest-last (per the contract
 * doc comment); this renders newest-at-top by reversing a trailing slice.
 */

import type { SimEvent } from '../../core/types';
import type { EventTickerProps } from '../contracts';
import { EVENT_CATEGORY_CLASS, categoryForTopic, extractHeadline } from './format';

const VISIBLE_ROWS = 8;

function EventRow({ event, fadeIndex }: { event: SimEvent; fadeIndex: number }) {
  const segments = event.topic.split('.');
  const last = segments[segments.length - 1];
  const head = segments.slice(0, -1).join('.');
  const category = categoryForTopic(event.topic);
  const colorClass = EVENT_CATEGORY_CLASS[category];
  const opacity = Math.max(0.35, 1 - fadeIndex * 0.09);
  const headline = extractHeadline(event.payload);

  return (
    <li style={{ opacity }} className="truncate whitespace-pre text-slate-300">
      <span className="text-slate-500">t={event.tick}</span>{' '}
      {head && <span className="text-slate-400">{head}.</span>}
      <span className={`font-semibold ${colorClass}`}>{last}</span>
      {headline && (
        <>
          {' '}
          <span className={`font-semibold ${colorClass}`}>{headline}</span>
        </>
      )}
    </li>
  );
}

export function EventTicker({ events }: EventTickerProps) {
  const visible = events.slice(-VISIBLE_ROWS).reverse();
  return (
    <section
      aria-label="Event log"
      className="rounded-lg border border-slate-800 bg-slate-900/80 p-2 font-mono text-[11px] leading-5 text-slate-300"
    >
      {visible.length === 0 ? (
        <p role="status" className="px-1 py-3 text-center italic text-slate-500">
          no events yet
        </p>
      ) : (
        <ul role="list" aria-label="recent events" className="space-y-0.5">
          {visible.map((e, i) => (
            <EventRow key={`${e.tick}-${e.topic}-${i}`} event={e} fadeIndex={i} />
          ))}
        </ul>
      )}
    </section>
  );
}
