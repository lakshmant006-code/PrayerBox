export interface Glyph {
  char: string;
  x: number;
  width: number;
}

/**
 * Walks the text nodes of `el` and measures each non-whitespace character's
 * horizontal center via the Range API. Whitespace is skipped (nothing falls
 * for a space). Coordinates are viewport-relative (getBoundingClientRect).
 */
export function measureGlyphs(el: HTMLElement): Glyph[] {
  const glyphs: Glyph[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const content = node.textContent ?? "";
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (ch.trim() === "") continue;

      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      glyphs.push({
        char: ch,
        x: rect.left + rect.width / 2,
        width: rect.width || 16,
      });
    }
  }

  return glyphs;
}
