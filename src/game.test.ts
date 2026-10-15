/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import {
  game,
  type DeepcoreState,
  type DeepcoreDebugApi,
  BACKGROUND,
} from "./game";
import * as C from "./constants";
import {
  initialState,
  copy,
  generate,
  cell,
  loadKg,
  depth,
  scanner,
  bandAt,
  depthFraction,
} from "./model";
import { createDebug } from "./debug";
import { simulate, camera } from "./simulation";
import { transact, start } from "./transactions";

const idle = { left: false, right: false, up: false, down: false };
const debug = createDebug();
const engines: Engine<DeepcoreState, DeepcoreDebugApi>[] = [];
const store = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        await readFile(
          new URL("../" + url.replace(/^\//, ""), import.meta.url),
        ),
      ),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal("ImageBitmap", Image);
  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData() {
        return Promise.resolve({ duration: 1 });
      }
    },
  );
});
afterEach(() => {
  for (const engine of engines) engine.destroy();
  engines.length = 0;
  store.clear();
});
async function harness(step = 1000 / 60) {
  const events = new EventTarget(),
    canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  function key(code: string, down = true) {
    const event = new Event(down ? "keydown" : "keyup");
    Object.assign(event, { code, repeat: false });
    events.dispatchEvent(event);
  }
  async function press(code: string) {
    key(code);
    await engine.advance(1);
    key(code, false);
  }
  return { engine, key, press, events, canvas };
}
function live() {
  const s = initialState();
  s.screen = "in-mine";
  return s;
}

describe("engine integration", () => {
  it("loads all produced assets through the engine and starts from keyboard menus", async () => {
    const { engine, press } = await harness();
    expect(engine.debug.version).toBe(C.DEEPCORE_DEBUG_VERSION);
    expect(Object.keys(engine.state.images).length).toBeGreaterThan(90);
    expect(Object.keys(engine.state.particles)).toHaveLength(12);
    await press("Enter");
    expect(engine.state.screen).toBe("mode-select");
    await press("Enter");
    expect(engine.state.screen).toBe("size-select");
    await press("Enter");
    expect(engine.state.worldSize).toBe("quick");
    expect(engine.state.screen).toBe("in-mine");
    expect(engine.state.coreRow).toBe(250);
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
  });
  it("drills a posed ore with the real held input, spends fuel and emits audio", async () => {
    const { engine, key } = await harness();
    const d = engine.debug;
    engine.apply((s) => d.setScreen(s, "in-mine"));
    engine.apply((s) => d.setOreTile(s, C.SPAWN_COL, 1, "ferron"));
    engine.apply((s) => d.setTile(s, C.SPAWN_COL, 2, "rock"));
    const before = engine.state;
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    key("KeyS");
    await engine.advance(30);
    key("KeyS", false);
    expect(d.tileAt(engine.state, C.SPAWN_COL, 1).kind).toBe("tunnel");
    expect(d.snapshot(engine.state).cargo.ore.ferron).toBe(1);
    expect(engine.state.miner.fuel).toBeCloseTo(98.8, 1);
    expect(cues).toContain(C.CUES.orePickup);
    expect(before.grid[1][C.SPAWN_COL].kind).toBe("ore");
    expect(engine.state.miner.y).toBeCloseTo(88, 0);
  });
  it("holds the Core timer in pause but not inventory", async () => {
    const { engine, press } = await harness();
    const d = engine.debug;
    engine.apply((s) => d.setScreen(s, "in-mine"));
    engine.apply((s) => d.setCoreCarried(s, true));
    await press("KeyI");
    const time = engine.state.coreTimer!;
    await engine.advance(60);
    expect(engine.state.coreTimer).toBeCloseTo(time - 1, 6);
    await press("Escape");
    await press("KeyP");
    const paused = engine.state.coreTimer;
    await engine.advance(60);
    expect(engine.state.coreTimer).toBe(paused);
    expect(engine.state.screen).toBe("paused");
    await press("Escape");
    expect(engine.state.screen).toBe("in-mine");
  });
  it("requires pointer press and release in the same menu region", async () => {
    const { engine, events } = await harness();
    const a = engine.debug.menuItemRect(engine.state, 0)!,
      b = engine.debug.menuItemRect(engine.state, 1)!;
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type);
      Object.assign(event, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
      events.dispatchEvent(event);
    };
    pointer("pointerdown", a.x + 10, a.y + 10);
    pointer("pointerup", b.x + 10, b.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    pointer("pointerdown", a.x + 10, a.y + 10);
    pointer("pointerup", a.x + 10, a.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("mode-select");
  });
  it("records actual sprite rendering into an engine replay", async () => {
    const { engine } = await harness();
    engine.apply((s) => engine.debug.setScreen(s, "in-mine"));
    engine.startRecording();
    await engine.advance(3);
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(3);
    expect(recording.images.length).toBeGreaterThan(0);
    expect(recording.frames.some((f) => f.truncated)).toBe(false);
  });
  it("draws each terminal and exposes operable hit regions for its transactions", async () => {
    const { engine, events } = await harness();
    const d = engine.debug;
    engine.apply((s) => d.setScreen(s, "in-mine"));
    engine.apply((s) => d.setCredits(s, 50000));
    engine.apply((s) => d.setCargo(s, "verdite", 2));
    engine.apply((s) => d.setFuel(s, 20));
    const click = async (id: string, subject: string | null = null) => {
      const r = d.controlRect(engine.state, id, subject);
      expect(r).not.toBe(null);
      for (const type of ["pointerdown", "pointerup"]) {
        const e = new Event(type);
        Object.assign(e, {
          clientX: r!.x + 15,
          clientY: r!.y + 15,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerdown" ? 1 : 0,
        });
        events.dispatchEvent(e);
      }
      await engine.advance(1);
    };
    engine.apply((s) => d.setPanel(s, "fuel-depot"));
    await engine.advance(1);
    await click("buy-fuel");
    expect(engine.state.miner.fuel).toBe(45);
    engine.apply((s) => d.setPanel(s, "upgrade-shop"));
    await engine.advance(1);
    await click("buy-upgrade", "drill");
    expect(engine.state.tiers.drill).toBe(2);
    engine.apply((s) => d.setPanel(s, "supply-depot"));
    await engine.advance(1);
    await click("buy-item", "nanobots");
    expect(engine.state.items.nanobots).toBe(1);
    engine.apply((s) => d.setPanel(s, "inventory"));
    await engine.advance(1);
    await click("drop-ore", "verdite");
    expect(engine.state.cargo.verdite).toBe(1);
    engine.apply((s) => d.setPanel(s, "ore-market"));
    await engine.advance(1);
    await click("sell");
    expect(engine.state.cargo).toEqual({});
    engine.apply((s) => d.setPanel(s, "launch-pad"));
    await engine.advance(1);
    await click("fabricate");
    expect(engine.state.installed).toBe(1);
  });
});

describe("simulation and load physics", () => {
  it("integrates identical elapsed time under different frame divisions", () => {
    let a = live(),
      b = live();
    a.miner.y = -600;
    b.miner.y = -600;
    for (let i = 0; i < 60; i++) a = simulate(a, { ...idle, up: true }, 1 / 60);
    for (let i = 0; i < 20; i++) b = simulate(b, { ...idle, up: true }, 1 / 20);
    expect(a.miner.y).toBeCloseTo(b.miner.y, 8);
    expect(a.miner.fuel).toBeCloseTo(b.miner.fuel, 8);
    expect(a.elapsedSeconds).toBeCloseTo(1, 8);
  });
  it("allows an unbounded sky and pays thrust above the surface", () => {
    const s = live();
    s.miner.y = -1000;
    const next = simulate(s, { ...idle, up: true }, 1);
    expect(next.miner.y).toBeLessThan(-1000);
    expect(next.miner.fuel).toBeLessThan(s.miner.fuel);
    expect(next.screen).toBe("in-mine");
  });
  it("does not lift an overloaded cargo bay and dropping ore restores lift", () => {
    let s = live();
    s.cargo.adamite = 5;
    s.grid[1][4] = cell("rock", "topsoil");
    expect(loadKg(s)).toBe(420);
    let next = simulate(s, { ...idle, up: true }, 1);
    expect(next.miner.y).toBe(s.miner.y);
    s = debug.dropOre(s, "adamite");
    next = simulate(s, { ...idle, up: true }, 1);
    expect(next.miner.y).toBeLessThan(s.miner.y);
  });
  it("falling has no thrust cost and hard landings damage hull", () => {
    const s = live();
    s.miner.y = -1500;
    for (let c = 1; c < 31; c++) s.grid[1][c] = cell("rock", "topsoil");
    const next = simulate(s, idle, 3);
    expect(next.miner.hull).toBeCloseTo(75, 5);
    expect(next.miner.fuel).toBe(100);
    expect(next.shake).toBeGreaterThanOrEqual(0);
  });
  it("travel and drill faculties independently gate movement and fuel hits", () => {
    let s = live();
    s.grid[1][4] = cell("rock", "topsoil");
    s.miner.travel = false;
    const next = simulate(s, { ...idle, down: true }, 0.5);
    expect(next.miner.y).toBe(s.miner.y);
    expect(next.grid[1][4].kind).toBe("tunnel");
    expect(next.miner.fuel).toBeCloseTo(99, 5);
    s = debug.setMinerDrill(s, false);
    expect(simulate(s, { ...idle, down: true }, 1).grid[1][4].health).toBe(4);
  });
  it("persists partial drill health when a cut is released", () => {
    const s = live();
    s.grid[1][4] = cell("ore", "topsoil");
    s.grid[1][4].ore = "marlite";
    s.miner.travel = false;
    const a = simulate(s, { ...idle, down: true }, 0.25);
    expect(a.grid[1][4].health).toBe(2);
    const b = simulate(a, idle, 0.25);
    expect(b.grid[1][4].health).toBe(2);
    const c = simulate(b, { ...idle, down: true }, 0.25);
    expect(c.cargo.marlite).toBe(1);
  });
  it("checks hull continuously with an overlay open", () => {
    const s = live();
    s.panel = "inventory";
    s.miner.hull = 0;
    expect(simulate(s, idle, 1 / 60).screen).toBe("game-over");
  });
  it("builds and unwinds camera lead by time", () => {
    const s = live();
    s.miner.vy = 500;
    camera(s, 2);
    expect(s.camera.lead).toBe(C.CAM_LEAD_MAX);
    s.miner.vy = 0;
    camera(s, 0.5);
    expect(s.camera.lead).toBe(0);
    s.miner.y = -400;
    camera(s, 0);
    expect(s.camera.y).toBeLessThan(0);
  });
  it("scanner reports only needed nodes within its tier range", () => {
    let s = live();
    s = debug.setMaterialTile(s, 8, 3, "resonite");
    expect(scanner(s).locked).toBe(false);
    s = debug.setTier(s, "scanner", 2);
    expect(scanner(s).target).toBe("resonite");
    s = debug.setMaterial(s, "resonite", 1);
    expect(scanner(s).locked).toBe(false);
  });
});

describe("hazards and field supplies", () => {
  it("gas damage scales with depth and raises a delayed one-time notice", () => {
    let s = live();
    s = debug.setTile(s, 4, 130, "gas");
    s = debug.setMinerPosition(s, 332, 130 * C.TILE - C.MINER_H);
    s.miner.travel = false;
    s.miner.hull = 1000;
    s.miner.fuel = 500;
    const next = simulate(s, { ...idle, down: true }, 1);
    expect(next.miner.hull).toBeLessThan(940);
    expect(next.noticesFired.gas).toBe(true);
    expect(next.notice?.age).toBeLessThan(C.NOTICE_DELAY);
    expect(next.effects.some((e) => e.name === "gas-explosion")).toBe(true);
  });
  it("radiator reduces only lava damage", () => {
    let s = live();
    s = debug.setTile(s, 4, 260, "lava");
    s = debug.setMinerPosition(s, 332, 260 * C.TILE);
    s.miner.travel = false;
    s.miner.drill = false;
    const a = simulate(s, idle, 1);
    s.tiers.radiator = 5;
    const b = simulate(s, idle, 1);
    expect(100 - a.miner.hull).toBeCloseTo(C.LAVA_CONTACT_DPS, 5);
    expect(100 - b.miner.hull).toBeCloseTo(C.LAVA_CONTACT_DPS * 0.2, 5);
  });
  it("a carried Core expiry kills and destroys the Sample", () => {
    let s = live();
    s = debug.setCoreCarried(s, true);
    s = debug.setCoreTimer(s, 0.1);
    const next = simulate(s, idle, 0.2);
    expect(next.summary?.deathCause).toBe("core-detonation");
    expect(next.coreTimer).toBe(null);
    expect(next.satchel.coreSample).toBe(false);
  });
  it("a jettisoned Core kills only within its blast radius", () => {
    let s = live();
    s = debug.placeCoreSample(s, 20, 1);
    s = debug.setCoreTimer(s, 0.1);
    expect(simulate(s, idle, 0.2).screen).toBe("in-mine");
    s = debug.setMinerPosition(s, 20 * C.TILE, 80);
    s.miner.travel = false;
    expect(simulate(s, idle, 0.2).screen).toBe("game-over");
  });
  it("explosives remove boulders and ore without banking and preserve materials", () => {
    let s = live();
    s = debug.setMinerPosition(s, 4 * C.TILE, 2 * C.TILE);
    s = debug.setTile(s, 4, 2, "stone");
    s = debug.setOreTile(s, 3, 2, "ferron");
    s = debug.setMaterialTile(s, 5, 2, "resonite");
    s = debug.setItemCount(s, "dynamite", 1);
    s = debug.useItem(s, "dynamite");
    expect(s.grid[2][4].kind).toBe("tunnel");
    expect(s.grid[2][3].kind).toBe("tunnel");
    expect(s.grid[2][5].kind).toBe("material");
    expect(s.cargo).toEqual({});
    expect(s.items.dynamite).toBe(0);
  });
  it("consumes posed teleporter outcomes once, then exposes null", () => {
    let s = live();
    s = debug.setItemCount(s, "quantum-teleporter", 1);
    s = debug.setNextTeleportHeight(s, 8);
    s = debug.setNextTeleportSpeed(s, 700);
    s = debug.useItem(s, "quantum-teleporter");
    expect(s.miner.y + C.MINER_H).toBe(C.SURFACE_Y - 8 * C.TILE);
    expect(s.miner.vy).toBe(700);
    expect(s.nextTeleportHeight).toBe(null);
    expect(s.nextTeleportSpeed).toBe(null);
  });
  it("retains restorative items that would do nothing", () => {
    const s = live();
    s.items.nanobots = 1;
    s.items["emergency-fuel"] = 1;
    transact(s, "use-item", "nanobots");
    transact(s, "use-item", "emergency-fuel");
    expect(s.items.nanobots).toBe(1);
    expect(s.items["emergency-fuel"]).toBe(1);
  });
});

describe("economy, saves, and progression", () => {
  it("sells by the mineral table and buys only affordable fuel", () => {
    const s = live();
    s.cargo.ferron = 2;
    s.cargo.aurite = 1;
    transact(s, "sell");
    expect(s.credits).toBe(2516);
    expect(s.cargo).toEqual({});
    s.credits = 8;
    s.miner.fuel = 50;
    transact(s, "fill-fuel");
    expect(s.miner.fuel).toBe(58);
    expect(s.credits).toBe(0);
  });
  it("tank upgrades add only the capacity delta and max-tier purchases do nothing", () => {
    const s = live();
    s.credits = 10000;
    s.miner.fuel = 30;
    transact(s, "buy-upgrade", "fuel");
    expect(s.miner.fuel).toBe(105);
    expect(s.credits).toBe(9700);
    s.tiers.fuel = 5;
    transact(s, "buy-upgrade", "fuel");
    expect(s.credits).toBe(9700);
  });
  it("fabricates in order, consumes materials, and launching is the only victory", () => {
    let s = live();
    s.credits = C.ROCKET_TOTAL_CREDITS;
    s.satchel.resonite = 1;
    s.satchel.cryenite = 1;
    s = debug.setCoreCarried(s, true);
    for (let i = 0; i < 5; i++) transact(s, "fabricate");
    expect(s.installed).toBe(5);
    expect(s.credits).toBe(0);
    expect(s.coreTimer).toBe(null);
    expect(s.satchel.resonite).toBe(0);
    expect(s.screen).toBe("in-mine");
    transact(s, "launch");
    expect(s.screen).toBe("victory");
    expect(s.launchTime).toBeGreaterThan(0);
  });
  it("refuses missing rocket materials and keeps installed components after death", () => {
    const s = live();
    s.credits = 10000;
    s.installed = 2;
    transact(s, "fabricate");
    expect(s.installed).toBe(2);
    s.miner.hull = 0;
    expect(simulate(s, idle, 0.1).installed).toBe(2);
  });
  it("saves the mine and restores its holdings on the surface", async () => {
    const { engine, press } = await harness();
    const d = engine.debug;
    engine.apply((s) => d.setScreen(s, "in-mine"));
    engine.apply((s) => d.setTile(s, C.SPAWN_COL, 1, "rock"));
    engine.apply((s) => d.setCredits(s, 987));
    engine.apply((s) => d.setOreTile(s, 5, 9, "voltite"));
    engine.apply((s) => d.save(s));
    expect(engine.state.hasSave).toBe(true);
    engine.apply((s) => d.setCredits(s, 0));
    engine.apply((s) => d.setScreen(s, "title"));
    engine.apply((s) => d.setMenuIndex(s, 0));
    await press("Enter");
    expect(engine.state.credits).toBe(987);
    expect(d.tileAt(engine.state, 5, 9).ore).toBe("voltite");
    expect(depth(engine.state)).toBe(0);
  });
  it("refuses saving a live Sample and Hardcore death deletes its slot", () => {
    let s = live();
    transact(s, "save");
    expect(s.hasSave).toBe(true);
    s = debug.setCoreCarried(s, true);
    transact(s, "save");
    expect(s.note).toContain("REFUSED");
    s.mode = "hardcore";
    s.miner.hull = 0;
    s = simulate(s, idle, 0.1);
    expect(s.hasSave).toBe(false);
    expect(store.size).toBe(0);
  });
});

describe("generation and debug contracts", () => {
  it.each(C.WORLD_SIZES)(
    "generates %s with distinct bands, nodes, borders, and ore shares",
    (size) => {
      const s = initialState();
      s.worldSize = size;
      s.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]);
      generate(s);
      for (const m of C.MATERIALS)
        expect(s.grid.flat().filter((t) => t.material === m)).toHaveLength(1);
      expect(s.grid[s.coreRow][C.CORE_COL].kind).toBe("core");
      expect(s.grid[1][C.CAVE_MOUTH_COL].kind).toBe("tunnel");
      for (let r = 1; r < s.coreRow; r++) {
        expect(s.grid[r][0].kind).toBe("bedrock");
        expect(s.grid[r][C.CORE_COL].kind).not.toBe("stone");
        expect(s.grid[r][C.CORE_COL].kind).not.toBe("lava");
      }
      for (const band of C.BANDS) {
        const cells = s.grid
          .flat()
          .filter((t) => t.band === band && t.kind !== "bedrock");
        const ores =
          cells.filter((t) => t.kind === "ore").length / cells.length;
        expect(ores).toBeGreaterThan(0.14 * 0.75);
        expect(ores).toBeLessThan(0.14 * 1.25);
        for (const kind of ["stone", "gas", "lava"] as const) {
          const expected = s.grid.reduce(
            (sum, _row, r) =>
              sum +
              (r > 0 && r < s.coreRow && bandAt(r, s.coreRow) === band
                ? 30 *
                  (kind === "lava"
                    ? depthFraction(r, s.coreRow) >= 0.5
                      ? C.LAVA_DENSITY_MIN +
                        ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) *
                          (depthFraction(r, s.coreRow) - 0.5)) /
                          0.5
                      : 0
                    : depthFraction(r, s.coreRow) >= 0.25
                      ? (kind === "gas"
                          ? C.GAS_DENSITY_MIN
                          : C.STONE_DENSITY_MIN) +
                        (((kind === "gas"
                          ? C.GAS_DENSITY_MAX
                          : C.STONE_DENSITY_MAX) -
                          (kind === "gas"
                            ? C.GAS_DENSITY_MIN
                            : C.STONE_DENSITY_MIN)) *
                          (depthFraction(r, s.coreRow) - 0.25)) /
                          0.75
                      : 0)
                : 0),
            0,
          );
          const actual = cells.filter((t) => t.kind === kind).length;
          if (expected > 0)
            expect(Math.abs(actual - expected) / expected).toBeLessThan(
              C.DENSITY_TOLERANCE,
            );
          else expect(actual).toBe(0);
        }
      }
      expect(s.grid[3].every((t) => !t.ore)).toBe(true);
    },
  );
  it("resizes by preserving shared cell bands and moving only the Core chamber", () => {
    let s = initialState();
    s = debug.setOreTile(s, 5, 200, "adamite");
    s = debug.setTileHealth(s, 5, 200, 7);
    const before = debug.tileAt(s, 5, 200);
    s = debug.setWorldSize(s, "quick");
    expect(debug.tileAt(s, 5, 200)).toEqual(before);
    expect(debug.tileAt(s, 16, 250).kind).toBe("core");
    s = debug.setWorldSize(s, "marathon");
    expect(debug.tileAt(s, 16, 250).kind).toBe("tunnel");
    expect(debug.tileAt(s, 5, 200)).toEqual(before);
    expect(debug.tileAt(s, 5, 600).band).toBe(bandAt(600, 1000));
  });
  it("poses without side effects and reconcile is idempotent", () => {
    let s = live();
    const before = copy(s);
    s = debug.setMinerPosition(s, 400, 4000);
    s = debug.setFuel(s, 400);
    const snap = debug.snapshot(s);
    expect(s.deepestDepthMeters).toBe(0);
    expect(s.miner.fuel).toBe(400);
    expect(snap.depthMeters).toBeGreaterThan(0);
    expect(before.miner.y).toBe(8);
    expect(debug.reconcile(debug.reconcile(s))).toEqual(debug.reconcile(s));
  });
  it("fails loudly on invalid poses instead of clamping or guessing", () => {
    const s = live();
    expect(() => debug.setTier(s, "drill", 9)).toThrow();
    expect(() => debug.setTile(s, 32, 1, "rock")).toThrow();
    expect(() => debug.setFuel(s, NaN)).toThrow();
    expect(() => debug.setCoreTimer(s, 1)).toThrow();
    expect(() => debug.setCargo(s, "ferron", -1)).toThrow();
  });
  it("a fresh expedition resets holdings but keeps the selected mode and size", () => {
    const s = live();
    s.mode = "hardcore";
    s.worldSize = "quick";
    s.credits = 3000;
    s.installed = 3;
    const n = start(s);
    expect(n.mode).toBe("hardcore");
    expect(n.coreRow).toBe(250);
    expect(n.credits).toBe(0);
    expect(n.installed).toBe(0);
    expect(n.elapsedSeconds).toBe(0);
  });
});
