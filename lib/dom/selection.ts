import { MAX_TEXT_LENGTH } from '../messaging/protocol';

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type SelectionResult =
  | { ok: true; text: string; range: Range; rect: Rect }
  | { ok: false; reason: 'empty' | 'editable' | 'own-ui' | 'too-long' | 'no-rect'; text?: string };

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function toElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

export function isEditableNode(node: Node | null): boolean {
  const el = toElement(node);
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  return el.closest(EDITABLE_SELECTOR) !== null;
}

/**
 * Chrome reports a selection inside <input>/<textarea> with the anchor on an
 * ancestor of the field, so check whether the focused field sits under it.
 */
function isInFocusedField(doc: Document, anchor: Node | null): boolean {
  const active = doc.activeElement;
  if (!active || !anchor) return false;
  const tag = active.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
  return anchor === active || anchor.contains(active);
}

/** Collapses runs of whitespace the way the page would render them. */
export function normalizeText(raw: string): string {
  return raw.replace(/[ \t\f\v ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function checkLength(text: string): 'empty' | 'too-long' | null {
  if (text.length === 0) return 'empty';
  if (text.length > MAX_TEXT_LENGTH) return 'too-long';
  return null;
}

function rectFromDom(r: DOMRect): Rect {
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

/**
 * Rect used to anchor the UI: the last visible line of the selection, so the
 * button sits where the mouse usually ends up.
 */
export function anchorRect(range: Range): Rect | null {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
  const last = rects[rects.length - 1];
  if (last) return rectFromDom(last);
  const box = range.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return rectFromDom(box);
}

/** Bounding box of the whole selection, used to place the card. */
export function boundingRect(range: Range): Rect | null {
  const box = range.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return rectFromDom(box);
}

export function readSelection(
  win: Window,
  options: { ownHost?: Element | null; allowEditable?: boolean } = {},
): SelectionResult {
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return { ok: false, reason: 'empty' };

  const { anchorNode, focusNode } = sel;
  const host = options.ownHost;
  if (host && ((anchorNode && host.contains(anchorNode)) || anchorNode === host)) {
    return { ok: false, reason: 'own-ui' };
  }

  if (!options.allowEditable) {
    if (isEditableNode(anchorNode) || isEditableNode(focusNode) || isInFocusedField(win.document, anchorNode)) {
      return { ok: false, reason: 'editable' };
    }
  }

  const text = normalizeText(sel.toString());
  const lengthIssue = checkLength(text);
  if (lengthIssue) return { ok: false, reason: lengthIssue, text };

  const range = sel.getRangeAt(0).cloneRange();
  const rect = anchorRect(range);
  if (!rect) return { ok: false, reason: 'no-rect' };

  return { ok: true, text, range, rect };
}
