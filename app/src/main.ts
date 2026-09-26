import "./style.css";
import { PrayerPhysics } from "./physics";
import { PileRenderer } from "./render";

const canvas = document.querySelector<HTMLCanvasElement>("#pile")!;
const createBtn = document.querySelector<HTMLButtonElement>("#createBtn")!;
const cancelBtn = document.querySelector<HTMLButtonElement>("#cancelBtn")!;
const prayerForm = document.querySelector<HTMLFormElement>("#prayerForm")!;
const typingBox = document.querySelector<HTMLDivElement>("#typingBox")!;
const countersEl = document.querySelector<HTMLDivElement>("#counters")!;

const physics = new PrayerPhysics(canvas);
new PileRenderer(canvas, physics);

let prayerCount = 0;

function updateCounters() {
  const plural = prayerCount === 1 ? "prayer" : "prayers";
  countersEl.textContent = `${prayerCount} ${plural} · 0 answered`;
}
updateCounters();

const googleBtn = document.querySelector<HTMLButtonElement>("#googleBtn")!;
const authNote = document.querySelector<HTMLParagraphElement>("#authNote")!;
let authNoteTimer: number | undefined;

// Google sign-in needs a Supabase project + Google OAuth client, which
// don't exist yet, so say so instead of leaving the button dead
googleBtn.addEventListener("click", () => {
  authNote.textContent = "Google sign-in isn't connected yet.";
  authNote.hidden = false;
  window.clearTimeout(authNoteTimer);
  authNoteTimer = window.setTimeout(() => {
    authNote.hidden = true;
  }, 4000);
});

function openForm() {
  createBtn.hidden = true;
  prayerForm.hidden = false;
  typingBox.focus();
}

function closeForm() {
  typingBox.textContent = "";
  prayerForm.hidden = true;
  createBtn.hidden = false;
  createBtn.focus();
}

function releasePrayer() {
  const text = (typingBox.textContent ?? "").trim();
  if (!text) return;

  const prayerId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  physics.spawnPrayer(text, prayerId);

  prayerCount += 1;
  updateCounters();
  closeForm();
}

createBtn.addEventListener("click", openForm);
cancelBtn.addEventListener("click", closeForm);

prayerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  releasePrayer();
});

typingBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    releasePrayer();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    closeForm();
  }
});
