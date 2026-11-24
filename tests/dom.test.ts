// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { checkLength, isEditableNode, normalizeText } from '../lib/dom/selection';
import { isInViewport, placeButton, placeCard } from '../lib/dom/position';
import { guessLanguage } from '../lib/languages';

const vp = { width: 1000, height: 800 };
const rect = (top: number, left: number, width = 100, height = 20) => ({
  top, left, width, height, right: left + width, bottom: top + height,
});

describe('selection helpers', () => {
  it('detects editable areas', () => {
    document.body.innerHTML = `
      <p id="plain">text</p>
      <textarea id="ta">x</textarea>
      <div contenteditable="true"><span id="inner">y</span></div>
      <div contenteditable="false"><span id="off">z</span></div>`;
    expect(isEditableNode(document.getElementById('plain')!.firstChild)).toBe(false);
    expect(isEditableNode(document.getElementById('ta'))).toBe(true);
    expect(isEditableNode(document.getElementById('inner')!.firstChild)).toBe(true);
    expect(isEditableNode(document.getElementById('off'))).toBe(false);
  });

  it('normalizes whitespace and checks length', () => {
    expect(normalizeText('  a   b \n\n  c  ')).toBe('a b\nc');
    expect(checkLength('')).toBe('empty');
    expect(checkLength('a'.repeat(1000))).toBeNull();
    expect(checkLength('a'.repeat(1001))).toBe('too-long');
  });

  it('guesses CJK languages only', () => {
    expect(guessLanguage('这是中文')).toBe('zh');
    expect(guessLanguage('これは日本語です')).toBe('ja');
    expect(guessLanguage('한국어 문장')).toBe('ko');
    expect(guessLanguage('Bonjour tout le monde')).toBeUndefined();
  });
});

describe('positioning', () => {
  it('puts the button after the selection and inside the viewport', () => {
    expect(placeButton(rect(100, 100), vp, { width: 28, height: 28 })).toEqual({ x: 202, y: 122 });
    const edge = placeButton(rect(780, 980, 20, 18), vp, { width: 28, height: 28 });
    expect(edge.x).toBeLessThanOrEqual(1000 - 28 - 8);
    expect(edge.y).toBeLessThanOrEqual(800 - 28 - 8);
  });

  it('places the card below, or above when there is no room', () => {
    const card = { width: 360, height: 200 };
    expect(placeCard(rect(100, 50), vp, card)).toMatchObject({ placement: 'below', y: 126 });
    const above = placeCard(rect(700, 50), vp, card);
    expect(above.placement).toBe('above');
    expect(above.y + card.height).toBeLessThanOrEqual(700);
  });

  it('keeps the card inside the right edge', () => {
    const p = placeCard(rect(100, 900), vp, { width: 360, height: 100 });
    expect(p.x).toBe(1000 - 360 - 8);
  });

  it('knows when the selection scrolled away', () => {
    expect(isInViewport(rect(100, 100), vp)).toBe(true);
    expect(isInViewport(rect(-50, 100), vp)).toBe(false);
  });
});
