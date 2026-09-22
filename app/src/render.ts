import type { PrayerPhysics } from "./physics";
import type { LetterPlugin } from "./physics";

export class PileRenderer {
  private canvas: HTMLCanvasElement;
  private physics: PrayerPhysics;
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.max(1, window.devicePixelRatio || 1);
  private inkLetters = "";
  private gold = "";
  private goldGlow = "";

  constructor(canvas: HTMLCanvasElement, physics: PrayerPhysics) {
    this.canvas = canvas;
    this.physics = physics;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;

    this.readTokens();
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => this.readTokens());

    if (window.ResizeObserver) {
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
    this.resize();

    requestAnimationFrame(this.tick);
  }

  private readTokens() {
    const style = getComputedStyle(document.documentElement);
    this.inkLetters = style.getPropertyValue("--ink-letters").trim();
    this.gold = style.getPropertyValue("--gold").trim();
    this.goldGlow = style.getPropertyValue("--gold-glow").trim();
  }

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  private tick = () => {
    const { ctx, canvas, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = '30px "Cormorant Garamond", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const bodies = this.physics.bodies();

    // pass 1: plain ink letters, no shadow (cheap)
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.inkLetters;
    for (const body of bodies) {
      const plugin = body.plugin as LetterPlugin;
      if (plugin.kind !== "letter" || plugin.answered) continue;
      this.drawGlyph(plugin.char, body.position.x, body.position.y, body.angle);
    }

    // pass 2: answered letters, gold with a shared shadow setting
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.goldGlow;
    ctx.fillStyle = this.gold;
    for (const body of bodies) {
      const plugin = body.plugin as LetterPlugin;
      if (plugin.kind !== "letter" || !plugin.answered) continue;
      this.drawGlyph(plugin.char, body.position.x, body.position.y, body.angle);
    }

    requestAnimationFrame(this.tick);
  };

  private drawGlyph(char: string, x: number, y: number, angle: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }
}
