import "./style.css";
import { PrayerPhysics } from "./physics";
import { PileRenderer } from "./render";
import { measureGlyphs } from "./glyphs";

const canvas = document.querySelector<HTMLCanvasElement>("#pile")!;
const typingBox = document.querySelector<HTMLDivElement>("#typingBox")!;
const hint = document.querySelector<HTMLParagraphElement>("#hint")!;
const countersEl = document.querySelector<HTMLDivElement>("#counters")!;

const physics = new PrayerPhysics(canvas);
new PileRenderer(canvas, physics);

let prayerCount = 0;
let released = false;

function updateCounters() {
  const plural = prayerCount === 1 ? "prayer" : "prayers";
  countersEl.textContent = `${prayerCount} ${plural} · 0 answered`;
}
updateCounters();

function releasePrayer() {
  const glyphs = measureGlyphs(typingBox);
  if (glyphs.length === 0) return;

  const prayerId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const canvasRect = canvas.getBoundingClientRect();
  glyphs.forEach((glyph, i) => {
    const localX = glyph.x - canvasRect.left;
    physics.spawnLetter(glyph.char, localX, glyph.width, i, prayerId);
  });

  typingBox.textContent = "";
  prayerCount += 1;
  updateCounters();

  if (!released) {
    released = true;
    hint.textContent = "Double-click a letter to revisit a prayer.";
  }
}

typingBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    releasePrayer();
  }
});

// keep focus easy to find: clicking anywhere in the compose area focuses the box
document.querySelector(".compose")?.addEventListener("click", () => {
  typingBox.focus();
});

typingBox.focus();
