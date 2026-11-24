import type { Rect } from './selection';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const EDGE = 8;
const GAP = 6;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function isInViewport(rect: Rect, viewport: Size): boolean {
  return rect.bottom > 0 && rect.top < viewport.height && rect.right > 0 && rect.left < viewport.width;
}

/** Small trigger button: just past the end of the last selected line. */
export function placeButton(anchor: Rect, viewport: Size, button: Size): Point {
  let x = anchor.right + 2;
  let y = anchor.bottom + 2;
  if (y + button.height > viewport.height - EDGE) {
    y = anchor.top - button.height - 2;
  }
  x = clamp(x, EDGE, viewport.width - button.width - EDGE);
  y = clamp(y, EDGE, viewport.height - button.height - EDGE);
  return { x, y };
}

/**
 * Card: below the selection when it fits, otherwise above, otherwise on
 * whichever side has more room. Always kept inside the viewport.
 */
export function placeCard(
  anchor: Rect,
  viewport: Size,
  card: Size,
): Point & { placement: 'below' | 'above' } {
  const spaceBelow = viewport.height - anchor.bottom - GAP - EDGE;
  const spaceAbove = anchor.top - GAP - EDGE;

  let placement: 'below' | 'above';
  if (card.height <= spaceBelow) placement = 'below';
  else if (card.height <= spaceAbove) placement = 'above';
  else placement = spaceBelow >= spaceAbove ? 'below' : 'above';

  const rawY = placement === 'below' ? anchor.bottom + GAP : anchor.top - GAP - card.height;
  const y = clamp(rawY, EDGE, viewport.height - card.height - EDGE);
  const x = clamp(anchor.left, EDGE, viewport.width - card.width - EDGE);
  return { x, y, placement };
}

/** Used when there is no selection rect (e.g. context menu inside an iframe). */
export function cornerPoint(viewport: Size, card: Size): Point {
  return { x: Math.max(EDGE, viewport.width - card.width - 16), y: 16 };
}

/** Keeps a box of the given size fully inside the viewport. */
export function clampPoint(p: Point, size: Size, viewport: Size): Point {
  return {
    x: clamp(p.x, EDGE, viewport.width - size.width - EDGE),
    y: clamp(p.y, EDGE, viewport.height - size.height - EDGE),
  };
}
