import Matter from "matter-js";

const { Engine, World, Bodies, Body, Runner, Sleeping } = Matter;

export interface PrayerPlugin {
  isPrayer: true;
  prayerId: string;
  text: string;
  /** set once a prayer is marked answered (a later step) */
  answered?: boolean;
}

const WALL = 300;
export const ICON_WIDTH = 46;
export const ICON_HEIGHT = 35; // matches the cropped letter-icon.png aspect ratio

export class PrayerPhysics {
  engine: Matter.Engine;
  runner: Matter.Runner;
  width = 1;
  height = 1;

  private container: HTMLElement;
  private floor?: Matter.Body;
  private leftWall?: Matter.Body;
  private rightWall?: Matter.Body;
  private reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(container: HTMLElement) {
    this.container = container;
    this.engine = Engine.create({
      gravity: { x: 0, y: 1, scale: 0.0011 },
      enableSleeping: true,
      positionIterations: 8,
      velocityIterations: 8,
    });

    this.runner = Runner.create();

    this.rebuildBounds();
    if (window.ResizeObserver) {
      new ResizeObserver(() => this.rebuildBounds()).observe(container);
    } else {
      window.addEventListener("resize", () => this.rebuildBounds());
    }

    Runner.run(this.runner, this.engine);
  }

  private rebuildBounds() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;

    // floor + side walls only, no ceiling: notes drop in from above the
    // visible area and should fall freely until they land
    const next = [
      Bodies.rectangle(w / 2, h + WALL / 2, w + WALL * 2, WALL, {
        isStatic: true,
        friction: 0.7,
      }),
      Bodies.rectangle(-WALL / 2, h / 2, WALL, h + WALL * 2, { isStatic: true }),
      Bodies.rectangle(w + WALL / 2, h / 2, WALL, h + WALL * 2, { isStatic: true }),
    ];

    const old = [this.floor, this.leftWall, this.rightWall].filter(
      (b): b is Matter.Body => !!b,
    );
    if (old.length) World.remove(this.engine.world, old);
    World.add(this.engine.world, next);
    [this.floor, this.leftWall, this.rightWall] = next;

    // sleeping bodies don't get re-integrated on their own, so a resize
    // that moves the floor out from under an already-settled note would
    // otherwise leave it floating; wake everything so it re-settles
    for (const body of this.bodies()) {
      Sleeping.set(body, false);
    }
  }

  /** Drops one whole prayer note in from above the pile, tumbling under
   * gravity until it lands and settles (no upward "release" toss). */
  spawnPrayer(text: string, prayerId: string) {
    const margin = ICON_WIDTH / 2 + 4;
    const span = Math.max(this.width - margin * 2, 1);
    const x = margin + Math.random() * span;
    const y = -ICON_HEIGHT - Math.random() * 140;

    const body = Bodies.rectangle(x, y, ICON_WIDTH, ICON_HEIGHT, {
      restitution: 0.22,
      friction: 0.55,
      frictionStatic: 0.8,
      frictionAir: 0.012,
      density: 0.0016,
      chamfer: { radius: 6 },
      angle: this.reduceMotion ? 0 : Math.random() * 0.6 - 0.3,
      plugin: {
        isPrayer: true,
        prayerId,
        text,
      } satisfies PrayerPlugin,
    });
    World.add(this.engine.world, body);

    if (!this.reduceMotion) {
      Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.2, y: 0 });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.3);
    }
    return body;
  }

  bodies(): Matter.Body[] {
    return Matter.Composite.allBodies(this.engine.world).filter(
      (b) => (b.plugin as Partial<PrayerPlugin> | undefined)?.isPrayer,
    );
  }
}
