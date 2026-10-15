import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
  maxHealth: number | null;
}
export interface Point {
  col: number;
  row: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint: string | null;
}
export interface Summary {
  deepestDepthMeters: number;
  creditsEarned: number;
  elapsedSeconds: number;
  mode: C.Mode;
  componentsInstalled: number;
  deathCause: C.DeathCause | null;
}
export interface DeepcoreState {
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  grid: Cell[][];
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    fuel: number;
    hull: number;
    travel: boolean;
    drill: boolean;
    drilling: (Point & { dir: "down" | "left" | "right" }) | null;
    hitClock: number;
    hurt: number;
    animTime: number;
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  coreTimer: number | null;
  coreGround: Point | null;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  installed: number;
  camera: { x: number; y: number; lead: number };
  notice: { hazard: C.NoticeHazard; age: number } | null;
  noticesFired: Record<C.NoticeHazard, boolean>;
  summary: Summary | null;
  note: string;
  noteTime: number;
  effects: Effect[];
  shake: number;
  accumulator: number;
  effectClock: number;
  alarmClock: number;
  launchTime: number;
  pointerDown: Record<number, string>;
  panelIndex: number;
  images: Record<string, ImageBitmap>;
  particles: Record<string, ParticleSystem>;
  frames: Record<string, number>;
  pendingCues: C.CueName[];
}
export type ReadState = DeepReadonly<DeepcoreState>;
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const minable = (kind: C.TileKind) =>
  ["rock", "ore", "gas", "lava", "material"].includes(kind);
export function cell(kind: C.TileKind, band: C.BandName | null): Cell {
  const health = minable(kind) && band ? C.BAND_HEALTH[band] : null;
  return { kind, band, ore: null, material: null, health, maxHealth: health };
}
export const depthFraction = (row: number, coreRow: number) =>
  (row - 1) / (coreRow - 1);
export const bandAt = (row: number, coreRow: number): C.BandName =>
  C.BANDS[
    Math.min(3, Math.max(0, Math.floor(4 * depthFraction(row, coreRow))))
  ];
export function emptyGrid(coreRow: number): Cell[][] {
  return Array.from({ length: coreRow + 1 }, (_, row) =>
    Array.from({ length: C.WORLD_COLS }, (_, col) =>
      row === 0
        ? cell("tunnel", null)
        : row === coreRow
          ? cell(col === C.CORE_COL ? "core" : "bedrock", null)
          : cell(
              col === 0 || col === C.WORLD_COLS - 1 ? "bedrock" : "tunnel",
              bandAt(row, coreRow),
            ),
    ),
  );
}
export function tile(
  s: ReadState,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  return s.grid[row]?.[col] ?? cell("bedrock", null);
}
export function copy(s: ReadState): DeepcoreState {
  // Cells are shared until edited. Each transition owns its row arrays and all
  // small mutable records; immutable decoded assets are intentionally shared.
  return {
    ...s,
    grid: s.grid.map((row) => row.slice()) as Cell[][],
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    camera: { ...s.camera },
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    notice: s.notice ? { ...s.notice } : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
    effects: s.effects.map((e) => ({ ...e })),
    pointerDown: { ...s.pointerDown },
    images: { ...s.images },
    particles: s.particles as Record<string, ParticleSystem>,
    frames: { ...s.frames },
    pendingCues: [...s.pendingCues],
  };
}
export function replaceCell(
  s: DeepcoreState,
  col: number,
  row: number,
  c: Cell,
): void {
  s.grid[row][col] = c;
}
export function initialState(): DeepcoreState {
  return {
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow: C.STANDARD_ROWS,
    menuIndex: 0,
    muted: false,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave: false,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    grid: emptyGrid(C.STANDARD_ROWS),
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      travel: true,
      drill: true,
      drilling: null,
      hitClock: 0,
      hurt: 0,
      animTime: 0,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    items: Object.fromEntries(C.ITEM_IDS.map((i) => [i, 0])) as Record<
      C.ItemId,
      number
    >,
    coreTimer: null,
    coreGround: null,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    installed: 0,
    camera: { x: 0, y: -C.VIEW_H / 2 + C.SURFACE_Y - C.MINER_H / 2, lead: 0 },
    notice: null,
    noticesFired: { gas: false, lava: false },
    summary: null,
    note: "",
    noteTime: 0,
    effects: [],
    shake: 0,
    accumulator: 0,
    effectClock: 0,
    alarmClock: 0,
    launchTime: 0,
    pointerDown: {},
    panelIndex: 0,
    images: {},
    particles: {},
    frames: {},
    pendingCues: [],
  };
}
export function generate(s: DeepcoreState): void {
  s.grid = emptyGrid(s.coreRow);
  for (let r = 1; r < s.coreRow; r++)
    for (let c = 1; c < C.WORLD_COLS - 1; c++) {
      const f = depthFraction(r, s.coreRow),
        band = bandAt(r, s.coreRow),
        p = Math.random();
      const stone =
        f >= 0.25
          ? C.STONE_DENSITY_MIN +
            ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (f - 0.25)) / 0.75
          : 0;
      const gas =
        f >= 0.25
          ? C.GAS_DENSITY_MIN +
            ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (f - 0.25)) / 0.75
          : 0;
      const kind =
        p < stone
          ? "stone"
          : p < stone + gas
            ? "gas"
            : r >= C.ORE_MIN_ROW && p < stone + gas + C.ORE_DENSITY
              ? "ore"
              : "rock";
      const t = cell(kind, band);
      if (kind === "ore") {
        const weights = C.MINERALS.map(
          (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
        );
        let draw = Math.random() * weights.reduce((a, b) => a + b, 0),
          idx = 0;
        while (idx < weights.length - 1 && (draw -= weights[idx]) > 0) idx++;
        t.ore = C.MINERALS[idx].id;
      }
      s.grid[r][c] = t;
    }
  // Adjacent paired cells form pools. Their expected share follows the depth
  // curve; rock is converted, keeping ore density independent of the pools.
  for (let r = 1; r < s.coreRow; r++) {
    const f = depthFraction(r, s.coreRow);
    if (f < 0.5) continue;
    const p =
      C.LAVA_DENSITY_MIN +
      ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5;
    for (let c = 1; c < C.WORLD_COLS - 2; c += 2)
      if (Math.random() < p) {
        s.grid[r][c] = cell("lava", bandAt(r, s.coreRow));
        s.grid[r][c + 1] = cell("lava", bandAt(r, s.coreRow));
      }
  }
  for (const m of C.MATERIALS) {
    const index = C.BANDS.indexOf(C.MATERIAL_BAND[m]);
    const r =
        Math.floor(
          ((index + 0.15 + Math.random() * 0.7) * (s.coreRow - 1)) / 4,
        ) + 1,
      c = 2 + Math.floor(Math.random() * 28);
    const t = cell("material", C.MATERIAL_BAND[m]);
    t.material = m;
    s.grid[r][c] = t;
    // A narrow diggable route connects this node to the reserved descent spine.
    for (let x = Math.min(c, C.CORE_COL); x <= Math.max(c, C.CORE_COL); x++)
      if (["stone", "lava"].includes(s.grid[r][x].kind))
        s.grid[r][x] = cell("rock", bandAt(r, s.coreRow));
  }
  for (let r = 1; r < s.coreRow; r++)
    if (["stone", "lava"].includes(s.grid[r][C.CORE_COL].kind))
      s.grid[r][C.CORE_COL] = cell("rock", bandAt(r, s.coreRow));
  // Quotas remove small-sample variance (especially gas in a Quick mine).
  // Positions remain random, and weighting inside each band follows its curve.
  for (const band of C.BANDS) {
    const positions: Point[] = [];
    for (let row = 1; row < s.coreRow; row++)
      if (bandAt(row, s.coreRow) === band)
        for (let col = 1; col < C.WORLD_COLS - 1; col++)
          positions.push({ col, row });
    const lavaTarget =
      Math.round(
        positions.reduce((sum, p) => {
          const f = depthFraction(p.row, s.coreRow);
          return (
            sum +
            (f >= 0.5
              ? C.LAVA_DENSITY_MIN +
                ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5
              : 0)
          );
        }, 0) / 2,
      ) * 2;
    const molten = positions.filter(
      (p) => s.grid[p.row][p.col].kind === "lava",
    );
    while (molten.length > lavaTarget) {
      const p = molten.pop()!;
      s.grid[p.row][p.col] = cell("rock", band);
    }
    const poolSites = positions.filter(
      (p) =>
        p.col < C.WORLD_COLS - 2 &&
        p.col !== C.CORE_COL &&
        p.col + 1 !== C.CORE_COL &&
        [s.grid[p.row][p.col], s.grid[p.row][p.col + 1]].every(
          (t) => t.kind === "rock",
        ),
    );
    while (molten.length < lavaTarget && poolSites.length) {
      const i = Math.floor(Math.random() * poolSites.length),
        p = poolSites[i];
      poolSites[i] = poolSites[poolSites.length - 1];
      poolSites.pop();
      for (const col of [p.col, p.col + 1])
        if (s.grid[p.row][col].kind !== "lava") {
          s.grid[p.row][col] = cell("lava", band);
          molten.push({ col, row: p.row });
        }
    }
    for (const kind of ["stone", "gas", "ore"] as const) {
      const target = Math.round(
        positions.reduce((sum, p) => {
          const f = depthFraction(p.row, s.coreRow);
          if (kind === "ore")
            return sum + (p.row >= C.ORE_MIN_ROW ? C.ORE_DENSITY : 0);
          const lo = kind === "stone" ? C.STONE_DENSITY_MIN : C.GAS_DENSITY_MIN,
            hi = kind === "stone" ? C.STONE_DENSITY_MAX : C.GAS_DENSITY_MAX;
          return sum + (f >= 0.25 ? lo + ((hi - lo) * (f - 0.25)) / 0.75 : 0);
        }, 0),
      );
      const present = positions.filter(
        (p) => s.grid[p.row][p.col].kind === kind,
      );
      while (present.length > target) {
        const p = present.pop()!;
        s.grid[p.row][p.col] = cell("rock", band);
      }
      const candidates = positions.filter(
        (p) =>
          s.grid[p.row][p.col].kind === "rock" &&
          (kind !== "stone" || p.col !== C.CORE_COL) &&
          (kind !== "ore" || p.row >= C.ORE_MIN_ROW),
      );
      while (present.length < target && candidates.length) {
        const index = Math.floor(Math.random() * candidates.length),
          p = candidates[index];
        candidates[index] = candidates[candidates.length - 1];
        candidates.pop();
        const t = cell(kind, band);
        if (kind === "ore") {
          const f = depthFraction(p.row, s.coreRow),
            weights = C.MINERALS.map(
              (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
            );
          let draw = Math.random() * weights.reduce((a, b) => a + b, 0),
            i = 0;
          while (i < weights.length - 1 && (draw -= weights[i]) > 0) i++;
          t.ore = C.MINERALS[i].id;
        }
        s.grid[p.row][p.col] = t;
        present.push(p);
      }
    }
  }
  for (let row = 1; row < s.coreRow; row++)
    for (let col = 1; col < C.WORLD_COLS - 1; col++)
      if (s.grid[row][col].material) {
        for (
          let x = Math.min(col, C.CORE_COL);
          x <= Math.max(col, C.CORE_COL);
          x++
        )
          if (["stone", "lava"].includes(s.grid[row][x].kind))
            s.grid[row][x] = cell("rock", bandAt(row, s.coreRow));
      }
  s.grid[1][C.CAVE_MOUTH_COL] = cell("tunnel", "topsoil");
}
export const buildings = C.BUILDINGS.map((id, i) => ({
  id,
  x: 120 + i * 330,
  y: C.SURFACE_Y - 180,
  w: 240,
  h: 180,
}));
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1];
export const slotCap = (s: ReadState) => C.CARGO_TIERS[s.tiers.cargo - 1];
export const slots = (s: ReadState) =>
  Object.values(s.cargo).reduce((sum, n) => sum + (n ?? 0), 0);
export const loadKg = (s: ReadState) =>
  C.MINERALS.reduce((sum, m) => sum + (s.cargo[m.id] ?? 0) * m.weightKg, 0);
export const jet = (s: ReadState) => C.JETPACK_TIERS[s.tiers.jetpack - 1];
export const depth = (s: ReadState) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const minerCell = (s: ReadState): Point => ({
  col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
  row: Math.max(0, Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE)),
});
export function grounded(s: ReadState): boolean {
  const drilling = s.miner.drilling;
  if (
    drilling?.dir === "down" &&
    minable(tile(s, drilling.col, drilling.row).kind)
  )
    return true;
  const feet = s.miner.y + C.MINER_H,
    r = Math.floor((feet + 0.5) / C.TILE);
  if (
    Math.abs(feet - C.SURFACE_Y) < 1 &&
    s.miner.x >= C.TILE &&
    s.miner.x + C.MINER_W <= C.WORLD_W - C.TILE
  )
    return (
      tile(s, Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE), 1).kind !==
      "tunnel"
    );
  if (feet < 0) return false;
  return [s.miner.x + 1, s.miner.x + C.MINER_W - 1].some(
    (x) =>
      tile(s, Math.floor(x / C.TILE), r).kind !== "tunnel" &&
      Math.abs(feet - r * C.TILE) < 1,
  );
}
export function scanner(s: ReadState) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1],
    p = minerCell(s);
  let best: {
    target: C.MaterialId;
    dx: number;
    dy: number;
    dist: number;
  } | null = null;
  if (range !== null)
    for (let r = 1; r < s.coreRow; r++)
      for (let c = 1; c < C.WORLD_COLS - 1; c++) {
        const t = s.grid[r][c];
        if (t.material && !s.satchel[t.material]) {
          const dx = c - p.col,
            dy = r - p.row,
            dist = Math.hypot(dx, dy);
          if (dist <= range && (!best || dist < best.dist))
            best = { target: t.material, dx, dy, dist };
        }
      }
  return best
    ? {
        locked: true,
        target: best.target,
        dirX: best.dx / (best.dist || 1),
        dirY: best.dy / (best.dist || 1),
        distanceTiles: best.dist,
      }
    : { locked: false, target: null, dirX: 0, dirY: 0, distanceTiles: null };
}
export function note(s: DeepcoreState, text: string): void {
  s.note = text;
  s.noteTime = 3.5;
}
export function effect(
  s: DeepcoreState,
  name: string,
  x = s.miner.x + C.MINER_W / 2,
  y = s.miner.y + C.MINER_H / 2,
  tint: string | null = null,
): void {
  s.effects.push({
    name,
    x,
    y,
    age: 0,
    seed: Math.floor(Math.random() * 2147483647),
    tint,
  });
}
export function cue(s: DeepcoreState, name: C.CueName): void {
  s.pendingCues.push(name);
}
