import * as C from "./constants";
import {
  type ReadState,
  type DeepcoreState,
  copy,
  initialState,
  cell,
  tile,
  minable,
  generate,
  buildings,
  depth,
  grounded,
  minerCell,
  maxFuel,
  maxHull,
  slots,
  slotCap,
  loadKg,
  jet,
  scanner,
} from "./model";
import {
  type Transaction,
  transact,
  resize,
  setTier,
  clearSave,
} from "./transactions";
import { menu, menuRect, controlRect } from "./interface";

function number(
  v: number,
  lo = -Infinity,
  hi = Infinity,
  integer = false,
): void {
  if (
    !Number.isFinite(v) ||
    v < lo ||
    v > hi ||
    (integer && !Number.isInteger(v))
  )
    throw new RangeError(`Invalid numeric pose: ${v}`);
}
function member<T extends string>(v: T, values: readonly T[]): void {
  if (!values.includes(v)) throw new RangeError(`Unknown identifier: ${v}`);
}
function boolean(v: boolean): void {
  if (typeof v !== "boolean") throw new TypeError("Expected a boolean");
}
function pose(s: ReadState, fn: (n: DeepcoreState) => void): DeepcoreState {
  const n = copy(s);
  fn(n);
  return n;
}
function coords(s: ReadState, col: number, row: number): void {
  number(col, 0, C.WORLD_COLS - 1, true);
  number(row, 1, s.coreRow, true);
}
export function snapshot(s: ReadState) {
  const m = s.miner,
    p = minerCell(s),
    d = m.drilling,
    t = d ? tile(s, d.col, d.row) : null;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      x: m.x,
      y: m.y,
      vx: m.vx,
      vy: m.vy,
      col: p.col,
      row: p.row,
      facing: m.facing,
      state: m.state,
      grounded: grounded(s),
      travel: m.travel,
      drill: m.drill,
      fuel: m.fuel,
      maxFuel: maxFuel(s),
      hull: m.hull,
      maxHull: maxHull(s),
      overloaded: loadKg(s) >= jet(s).liftLimitKg,
      drilling: d
        ? { ...d, progress: 1 - (t?.health ?? 0) / (t?.maxHealth ?? 1) }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: slotCap(s),
      loadKg: loadKg(s),
      liftLimitKg: jet(s).liftLimitKg,
      ore: Object.fromEntries(
        Object.entries(s.cargo).filter(([, n]) => (n ?? 0) > 0),
      ),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.age >= C.NOTICE_DELAY }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export function createDebug() {
  const control = (
    s: ReadState,
    action: Transaction,
    subject: string | null = null,
  ) => pose(s, (n) => transact(n, action, subject));
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    snapshot,
    tileAt: (s: ReadState, col: number, row: number) => {
      number(col, -Infinity, Infinity, true);
      number(row, -Infinity, Infinity, true);
      return { ...tile(s, col, row) };
    },
    findTile: (s: ReadState, kind: C.TileKind) => {
      member(kind, C.TILE_KINDS);
      const p = minerCell(s);
      let best: { col: number; row: number } | null = null,
        dist = Infinity;
      for (let r = 1; r <= s.coreRow; r++)
        for (let c = 0; c < C.WORLD_COLS; c++)
          if (s.grid[r][c].kind === kind) {
            const d = Math.hypot(c - p.col, r - p.row);
            if (d < dist) {
              dist = d;
              best = { col: c, row: r };
            }
          }
      return best;
    },
    buildings: (_s: ReadState) => buildings.map((b) => ({ ...b })),
    menuItemRect: (s: ReadState, index: number) => {
      number(index, -Infinity, Infinity, true);
      return menuRect(s, index);
    },
    controlRect: (s: ReadState, id: string, subject: string | null) =>
      controlRect(s, id, subject),
    reset: (s: ReadState) => {
      const n = initialState();
      n.muted = s.muted;
      n.hasSave = s.hasSave;
      n.images = { ...s.images };
      n.particles = s.particles as DeepcoreState["particles"];
      n.frames = { ...s.frames };
      return n;
    },
    reconcile: (s: ReadState) => copy(s),
    generateMine: (s: ReadState) => pose(s, generate),
    clearMine: (s: ReadState) =>
      pose(s, (n) => {
        n.grid = n.grid.map((row, r) =>
          row.map((t, c) =>
            r > 0 &&
            r < n.coreRow &&
            c >= C.PLAYABLE_COL_MIN &&
            c <= C.PLAYABLE_COL_MAX
              ? cell("tunnel", t.band)
              : t,
          ),
        );
      }),
    clearCargo: (s: ReadState) =>
      pose(s, (n) => {
        n.cargo = {};
      }),
    clearItems: (s: ReadState) =>
      pose(s, (n) => {
        for (const id of C.ITEM_IDS) n.items[id] = 0;
      }),
    setTile: (
      s: ReadState,
      col: number,
      row: number,
      kind: Exclude<C.TileKind, "ore" | "material">,
    ) =>
      pose(s, (n) => {
        coords(s, col, row);
        member(kind, [
          "rock",
          "gas",
          "lava",
          "stone",
          "bedrock",
          "tunnel",
          "core",
        ]);
        n.grid[row][col] = cell(kind, tile(s, col, row).band);
      }),
    setOreTile: (s: ReadState, col: number, row: number, ore: C.OreId) =>
      pose(s, (n) => {
        coords(s, col, row);
        member(
          ore,
          C.MINERALS.map((m) => m.id),
        );
        n.grid[row][col] = { ...cell("ore", tile(s, col, row).band), ore };
      }),
    setMaterialTile: (
      s: ReadState,
      col: number,
      row: number,
      material: C.MaterialId,
    ) =>
      pose(s, (n) => {
        coords(s, col, row);
        member(material, C.MATERIALS);
        n.grid[row][col] = {
          ...cell("material", tile(s, col, row).band),
          material,
        };
      }),
    setTileHealth: (s: ReadState, col: number, row: number, health: number) =>
      pose(s, (n) => {
        coords(s, col, row);
        const t = tile(s, col, row);
        if (!minable(t.kind) || !t.maxHealth)
          throw new RangeError("Cell is not minable");
        number(health, Number.MIN_VALUE, t.maxHealth);
        n.grid[row][col] = { ...t, health };
      }),
    placeCoreSample: (s: ReadState, col: number, row: number) =>
      pose(s, (n) => {
        coords(s, col, row);
        if (s.coreTimer !== null || tile(s, col, row).kind !== "tunnel")
          throw new RangeError("Sample needs an open cell and no live Sample");
        n.coreGround = { col, row };
        n.coreTimer = C.CORE_TIMER;
      }),
    setMinerPosition: (s: ReadState, x: number, y: number) =>
      pose(s, (n) => {
        number(x);
        number(y);
        n.miner.x = x;
        n.miner.y = y;
      }),
    setMinerVelocity: (s: ReadState, vx: number, vy: number) =>
      pose(s, (n) => {
        number(vx);
        number(vy);
        n.miner.vx = vx;
        n.miner.vy = vy;
      }),
    setFacing: (s: ReadState, facing: C.Facing) =>
      pose(s, (n) => {
        member(facing, C.FACINGS);
        n.miner.facing = facing;
      }),
    setFuel: (s: ReadState, value: number) =>
      pose(s, (n) => {
        number(value, 0);
        n.miner.fuel = value;
      }),
    setHull: (s: ReadState, value: number) =>
      pose(s, (n) => {
        number(value, 0);
        n.miner.hull = value;
      }),
    setMinerTravel: (s: ReadState, enabled: boolean) =>
      pose(s, (n) => {
        boolean(enabled);
        n.miner.travel = enabled;
      }),
    setMinerDrill: (s: ReadState, enabled: boolean) =>
      pose(s, (n) => {
        boolean(enabled);
        n.miner.drill = enabled;
      }),
    setScreen: (s: ReadState, screen: C.ScreenName) =>
      pose(s, (n) => {
        member(screen, C.SCREENS);
        n.screen = screen;
      }),
    setPanel: (s: ReadState, panel: C.PanelId | null) =>
      pose(s, (n) => {
        if (panel !== null) member(panel, C.PANELS);
        n.panel = panel;
      }),
    setMenuIndex: (s: ReadState, index: number) =>
      pose(s, (n) => {
        number(index, 0, menu(s).length - 1, true);
        n.menuIndex = index;
      }),
    setMode: (s: ReadState, mode: C.Mode) =>
      pose(s, (n) => {
        member(mode, C.MODES);
        n.mode = mode;
      }),
    setWorldSize: (s: ReadState, size: C.WorldSize) =>
      pose(s, (n) => {
        member(size, C.WORLD_SIZES);
        resize(n, size);
      }),
    setCredits: (s: ReadState, value: number) =>
      pose(s, (n) => {
        number(value, 0);
        n.credits = value;
      }),
    setTier: (s: ReadState, track: C.TrackName, tier: number) =>
      pose(s, (n) => {
        member(track, C.TRACKS);
        number(tier, 1, C.MAX_TIER[track], true);
        setTier(n, track, tier);
      }),
    setCargo: (s: ReadState, ore: C.OreId, count: number) =>
      pose(s, (n) => {
        member(
          ore,
          C.MINERALS.map((m) => m.id),
        );
        number(count, 0, Infinity, true);
        if (count) n.cargo[ore] = count;
        else delete n.cargo[ore];
      }),
    setMaterial: (s: ReadState, material: C.MaterialId, count: number) =>
      pose(s, (n) => {
        member(material, C.MATERIALS);
        number(count, 0, Infinity, true);
        n.satchel[material] = count;
      }),
    setCoreCarried: (s: ReadState, carried: boolean) =>
      pose(s, (n) => {
        boolean(carried);
        if (carried && s.coreTimer !== null)
          throw new RangeError("A Sample is already live");
        n.satchel.coreSample = carried;
        if (carried) n.coreTimer = C.CORE_TIMER;
        else if (s.satchel.coreSample) n.coreTimer = null;
      }),
    setCoreTimer: (s: ReadState, seconds: number) =>
      pose(s, (n) => {
        number(seconds, Number.MIN_VALUE);
        if (s.coreTimer === null) throw new RangeError("No live Sample");
        n.coreTimer = seconds;
      }),
    setItemCount: (s: ReadState, item: C.ItemId, count: number) =>
      pose(s, (n) => {
        member(item, C.ITEM_IDS);
        number(count, 0, Infinity, true);
        n.items[item] = count;
      }),
    setRocketInstalled: (s: ReadState, count: number) =>
      pose(s, (n) => {
        number(count, 0, C.ROCKET_COMPONENTS.length, true);
        n.installed = count;
      }),
    setNoticeFired: (s: ReadState, hazard: C.NoticeHazard, fired: boolean) =>
      pose(s, (n) => {
        member(hazard, C.NOTICE_HAZARDS);
        boolean(fired);
        n.noticesFired[hazard] = fired;
      }),
    setCameraLead: (s: ReadState, lead: number) =>
      pose(s, (n) => {
        number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
        n.camera.lead = lead;
      }),
    setElapsed: (s: ReadState, seconds: number) =>
      pose(s, (n) => {
        number(seconds, 0);
        n.elapsedSeconds = seconds;
      }),
    clearSave: (s: ReadState) => pose(s, clearSave),
    setNextTeleportHeight: (s: ReadState, tiles: number | null) =>
      pose(s, (n) => {
        if (tiles !== null)
          number(
            tiles,
            C.TELEPORT_HEIGHT_TILES_MIN,
            C.TELEPORT_HEIGHT_TILES_MAX,
          );
        n.nextTeleportHeight = tiles;
      }),
    setNextTeleportSpeed: (s: ReadState, speed: number | null) =>
      pose(s, (n) => {
        if (speed !== null)
          number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
        n.nextTeleportSpeed = speed;
      }),
    dropOre: (s: ReadState, ore: C.OreId) => control(s, "drop-ore", ore),
    sell: (s: ReadState) => control(s, "sell"),
    buyFuel: (s: ReadState) => control(s, "buy-fuel"),
    fillFuel: (s: ReadState) => control(s, "fill-fuel"),
    buyRepair: (s: ReadState) => control(s, "buy-repair"),
    repairFull: (s: ReadState) => control(s, "repair-full"),
    buyUpgrade: (s: ReadState, track: C.TrackName) =>
      control(s, "buy-upgrade", track),
    buyItem: (s: ReadState, item: C.ItemId) => control(s, "buy-item", item),
    useItem: (s: ReadState, item: C.ItemId) => control(s, "use-item", item),
    jettison: (s: ReadState) => control(s, "jettison"),
    fabricate: (s: ReadState) => control(s, "fabricate"),
    launch: (s: ReadState) => control(s, "launch"),
    save: (s: ReadState) => control(s, "save"),
    dismissNotice: (s: ReadState) => control(s, "dismiss-notice"),
  };
}
export type DeepcoreDebugApi = ReturnType<typeof createDebug>;
