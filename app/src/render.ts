import type { PrayerPhysics } from "./physics";
import type { PrayerPlugin } from "./physics";
import { ICON_WIDTH, ICON_HEIGHT } from "./physics";

const LABEL_MAX_CHARS = 60;

function truncate(text: string): string {
  return text.length > LABEL_MAX_CHARS ? text.slice(0, LABEL_MAX_CHARS - 1) + "…" : text;
}

export class PileRenderer {
  private canvas: HTMLCanvasElement;
  private physics: PrayerPhysics;
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.max(1, window.devicePixelRatio || 1);
  private ink = "";
  private gold = "";
  private goldGlow = "";
  private icon: HTMLImageElement;
  private iconReady = false;

  constructor(canvas: HTMLCanvasElement, physics: PrayerPhysics) {
    this.canvas = canvas;
    this.physics = physics;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;

    this.icon = new Image();
    this.icon.src = "/images/letter-icon.png";
    this.icon.onload = () => {
      this.iconReady = true;
    };

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
    this.ink = style.getPropertyValue("--ink-muted").trim();
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

    if (this.iconReady) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.shadowBlur = 0;

      for (const body of this.physics.bodies()) {
        const plugin = body.plugin as PrayerPlugin;
        this.drawNote(plugin, body.position.x, body.position.y, body.angle);
      }
    }

    requestAnimationFrame(this.tick);
  };

  private drawNote(plugin: PrayerPlugin, x: number, y: number, angle: number) {
    const { ctx } = this;

    // the icon itself tumbles with the physics body
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (plugin.answered) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.goldGlow;
    }
    ctx.drawImage(this.icon, -ICON_WIDTH / 2, -ICON_HEIGHT / 2, ICON_WIDTH, ICON_HEIGHT);
    ctx.restore();

    // the label stays level underneath, regardless of the note's tilt
    ctx.shadowBlur = 0;
    ctx.fillStyle = plugin.answered ? this.gold : this.ink;
    ctx.fillText(truncate(plugin.text), x, y + ICON_HEIGHT / 2 + 4);
  }
}
