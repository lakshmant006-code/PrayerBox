import Matter from "matter-js";

const { Engine, World, Bodies, Body, Runner } = Matter;

export type LetterKind = "letter" | "ember";

export interface LetterPlugin {
  isLetter: true;
  char: string;
  charIndex: number;
  prayerId: string;
  kind: LetterKind;
  /** set once a prayer is marked answered (step 5 of the build order) */
  answered?: boolean;
}

const WALL = 300;

export class PrayerPhysics {
  engine: Matter.Engine;
  runner: Matter.Runner;
  width = 1;
  height = 1;

  private container: HTMLElement;
  private floor?: Matter.Body;
  private leftWall?: Matter.Body;
  private rightWall?: Matter.Body;
  private ceiling?: Matter.Body;
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

    const next = [
      Bodies.rectangle(w / 2, h + WALL / 2, w + WALL * 2, WALL, {
        isStatic: true,
        friction: 0.7,
      }),
      Bodies.rectangle(-WALL / 2, h / 2, WALL, h + WALL * 2, { isStatic: true }),
      Bodies.rectangle(w + WALL / 2, h / 2, WALL, h + WALL * 2, { isStatic: true }),
      Bodies.rectangle(w / 2, -WALL / 2, w + WALL * 2, WALL, { isStatic: true }),
    ];

    const old = [this.floor, this.leftWall, this.rightWall, this.ceiling].filter(
      (b): b is Matter.Body => !!b,
    );
    if (old.length) World.remove(this.engine.world, old);
    World.add(this.engine.world, next);
    [this.floor, this.leftWall, this.rightWall, this.ceiling] = next;
  }

  /** Spawns one letter body just below the visible pile and gives it the
   * "release" kick (spec 4.3): a soft upward toss instead of a drop. */
  spawnLetter(char: string, x: number, width: number, charIndex: number, prayerId: string) {
    const radius = (Math.max(width, 30) / 2) * 0.58;
    const body = Bodies.circle(x, this.height + 20, radius, {
      restitution: 0.2,
      friction: 0.7,
      frictionStatic: 0.9,
      density: 0.002,
      slop: 0.02,
      plugin: {
        isLetter: true,
        char,
        charIndex,
        prayerId,
        kind: "letter",
      } satisfies LetterPlugin,
    });
    World.add(this.engine.world, body);
    if (this.reduceMotion) {
      Body.setVelocity(body, { x: 0, y: 0.2 });
    } else {
      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 0.3,
        y: -1.2 - Math.random() * 0.8,
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
    }
    return body;
  }

  bodies(): Matter.Body[] {
    return Matter.Composite.allBodies(this.engine.world).filter(
      (b) => (b.plugin as Partial<LetterPlugin> | undefined)?.isLetter,
    );
  }
}
