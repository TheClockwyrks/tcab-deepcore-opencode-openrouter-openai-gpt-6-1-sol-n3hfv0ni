import * as C from "./constants";
import {
  type DeepcoreState,
  type ReadState,
  copy,
  initialState,
  generate,
  emptyGrid,
  maxFuel,
  maxHull,
  slotCap,
  slots,
  minerCell,
  depthFraction,
  tile,
  cell,
  note,
  effect,
  cue,
  clamp,
} from "./model";

const SAVE_KEY = "deepcore.expedition.v1";
export function saved(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}
export function clearSave(s: DeepcoreState): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Storage is optional. */
  }
  s.hasSave = false;
}
export function start(s: ReadState): DeepcoreState {
  const n = initialState();
  n.images = { ...s.images };
  n.particles = s.particles as DeepcoreState["particles"];
  n.frames = { ...s.frames };
  n.mode = s.mode;
  n.worldSize = s.worldSize;
  n.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[n.worldSize]);
  n.muted = s.muted;
  n.simTime = s.simTime;
  generate(n);
  clearSave(n);
  n.screen = "in-mine";
  note(n, "FIRST SHIFT  /  Dig down. Bring something back.");
  return n;
}
export function save(s: DeepcoreState): void {
  if (s.coreTimer !== null) {
    note(s, "SAVE REFUSED — a live Core Sample cannot be stored.");
    return;
  }
  try {
    const {
      images: _images,
      particles: _particles,
      frames: _frames,
      ...payload
    } = s;
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    s.hasSave = true;
    note(s, "EXPEDITION SAVED  /  Return here to bank your progress.");
    cue(s, C.CUES.fabricate);
  } catch {
    note(s, "Storage unavailable — expedition could not be saved.");
  }
}
export function restore(s: ReadState): DeepcoreState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return copy(s);
    const payload = JSON.parse(raw) as DeepcoreState;
    const n = {
      ...initialState(),
      ...payload,
      images: { ...s.images },
      particles: s.particles as DeepcoreState["particles"],
      frames: { ...s.frames },
    };
    n.screen = "in-mine";
    n.panel = null;
    n.menuIndex = 0;
    n.hasSave = true;
    n.simTime = s.simTime;
    n.summary = null;
    n.effects = [];
    n.pendingCues = [];
    n.miner = {
      ...n.miner,
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      drilling: null,
      state: "idle",
    };
    return n;
  } catch {
    const n = copy(s);
    note(n, "No readable expedition in the save slot.");
    return n;
  }
}
export function end(s: DeepcoreState, cause: C.DeathCause | null): void {
  if (s.screen === "game-over" || s.screen === "victory") return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.screen = cause ? "game-over" : "victory";
  s.panel = null;
  s.menuIndex = 0;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  s.miner.drilling = null;
  if (cause) {
    cue(s, C.CUES.death);
    effect(s, "death-burst");
    if (s.mode === "hardcore") clearSave(s);
  } else clearSave(s);
}
export function hurt(
  s: DeepcoreState,
  amount: number,
  hazard: C.NoticeHazard | null = null,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.miner.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, age: 0 };
  }
}
export function gasBlast(s: DeepcoreState, col: number, row: number): void {
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE,
    dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    d = Math.hypot(dx, dy);
  effect(s, "gas-explosion", x, y);
  cue(s, C.CUES.gasExplosion);
  s.shake = 1;
  if (d <= C.GAS_BLAST_TILES * C.TILE) {
    hurt(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, depthFraction(row, s.coreRow) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (d || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (d || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function collect(s: DeepcoreState, col: number, row: number): void {
  const t = tile(s, col, row),
    x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  s.grid[row][col] = cell("tunnel", t.band);
  if (t.ore) {
    if (slots(s) < slotCap(s)) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      const colors = [
        "#c5b49b",
        "#bd9e65",
        "#e28c59",
        "#bdd8d8",
        "#5e9fdf",
        "#a7d75a",
        "#c69adf",
        "#ee8651",
        "#f4ca67",
        "#b2f1e5",
        "#66e0a2",
        "#ed87c4",
        "#ffdd83",
      ];
      effect(
        s,
        "ore-sparkle",
        x,
        y,
        colors[C.MINERALS.findIndex((m) => m.id === t.ore)],
      );
      cue(s, C.CUES.orePickup);
      const ore = C.MINERALS.find((m) => m.id === t.ore)!;
      note(
        s,
        `+ ${ore.name.toUpperCase()}   /   ${ore.weightKg} kg   /   ${ore.value} Cr`,
      );
    } else note(s, "cargo full — vein left behind. Sell or drop ore.");
  }
  if (t.material) {
    s.satchel[t.material]++;
    effect(s, "material-shimmer", x, y);
    cue(s, C.CUES.materialChime);
    note(s, `${t.material.toUpperCase()} SECURED  /  Rocket material banked.`);
  }
  if (t.kind === "gas") gasBlast(s, col, row);
  if (t.kind === "lava") {
    hurt(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    effect(s, "lava-embers", x, y);
    cue(s, C.CUES.lavaSizzle);
  }
}
export function extract(s: DeepcoreState): void {
  if (s.coreTimer !== null) return;
  s.coreTimer = C.CORE_TIMER;
  s.satchel.coreSample = true;
  effect(s, "core-extract");
  cue(s, C.CUES.materialChime);
  note(s, "CORE SAMPLE EXTRACTED  /  90 seconds. Get to the launch pad.");
}
export type Transaction =
  | "drop-ore"
  | "sell"
  | "buy-fuel"
  | "fill-fuel"
  | "buy-repair"
  | "repair-full"
  | "buy-upgrade"
  | "buy-item"
  | "use-item"
  | "jettison"
  | "fabricate"
  | "launch"
  | "save"
  | "dismiss-notice";
export function transact(
  s: DeepcoreState,
  action: Transaction,
  subject: string | null = null,
): void {
  const ore = C.MINERALS.find((m) => m.id === subject),
    item = C.ITEMS.find((m) => m.id === subject);
  if (action === "drop-ore") {
    if (!ore) throw new RangeError("Unknown mineral");
    if (s.cargo[ore.id]) {
      s.cargo[ore.id]!--;
      if (!s.cargo[ore.id]) delete s.cargo[ore.id];
      note(s, `${ore.name} discarded.`);
    }
    return;
  }
  if (action === "sell") {
    const value = C.MINERALS.reduce(
      (sum, m) => sum + (s.cargo[m.id] ?? 0) * m.value,
      0,
    );
    s.credits += value;
    s.creditsEarned += value;
    s.cargo = {};
    note(
      s,
      value
        ? `SOLD  /  +${value.toLocaleString()} Credits`
        : "No cargo to sell.",
    );
    if (value) cue(s, C.CUES.fabricate);
    return;
  }
  if (["buy-fuel", "fill-fuel", "buy-repair", "repair-full"].includes(action)) {
    const fuel = action.includes("fuel"),
      key = fuel ? "fuel" : "hull",
      price = fuel ? C.FUEL_PRICE : C.REPAIR_PRICE;
    const increment =
      action === "buy-fuel"
        ? C.FUEL_BUY_INCREMENT
        : action === "buy-repair"
          ? C.REPAIR_BUY_INCREMENT
          : Infinity;
    const missing = Math.max(
      0,
      (fuel ? maxFuel(s) : maxHull(s)) - s.miner[key],
    );
    if (
      Number.isFinite(increment) &&
      s.credits < Math.min(missing, increment) * price
    ) {
      note(s, "Not enough Credits.");
      return;
    }
    const amount = Math.min(missing, increment, s.credits / price);
    if (amount > 0) {
      s.credits -= amount * price;
      s.miner[key] += amount;
      cue(s, C.CUES.fabricate);
      note(
        s,
        `${fuel ? "Fuel replenished" : "Hull repaired"}  /  ${Math.round(amount)} units`,
      );
    } else note(s, missing ? "Not enough Credits." : "Already full.");
    return;
  }
  if (action === "buy-upgrade") {
    if (!C.TRACKS.includes(subject as C.TrackName))
      throw new RangeError("Unknown upgrade track");
    const track = subject as C.TrackName,
      tier = s.tiers[track],
      cost = C.UPGRADE_PRICES[tier - 1];
    if (tier >= C.MAX_TIER[track]) {
      note(s, "Track fully upgraded.");
      return;
    }
    if (s.credits < cost) {
      note(s, "Not enough Credits.");
      return;
    }
    const fuel = maxFuel(s),
      hull = maxHull(s);
    s.credits -= cost;
    s.tiers[track]++;
    s.miner.fuel += maxFuel(s) - fuel;
    s.miner.hull += maxHull(s) - hull;
    note(s, `${track.toUpperCase()} UPGRADED  /  Tier ${tier + 1}`);
    cue(s, C.CUES.fabricate);
    return;
  }
  if (action === "buy-item") {
    if (!item) throw new RangeError("Unknown supply");
    if (s.credits < item.price) {
      note(s, "Not enough Credits.");
      return;
    }
    s.credits -= item.price;
    s.items[item.id]++;
    cue(s, C.CUES.fabricate);
    return;
  }
  if (action === "use-item") {
    if (!item) throw new RangeError("Unknown supply");
    if (!s.items[item.id]) {
      note(s, "No supply of that type held.");
      return;
    }
    const id = item.id;
    if (
      (id === "nanobots" && s.miner.hull >= maxHull(s)) ||
      (id === "emergency-fuel" && s.miner.fuel >= maxFuel(s))
    ) {
      note(s, "Already full — supply retained.");
      return;
    }
    if (id === "dynamite" || id === "plastic-explosives") {
      const p = minerCell(s),
        radius =
          id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
      let changed = false;
      for (
        let r = Math.max(1, p.row - radius);
        r <= Math.min(s.coreRow - 1, p.row + radius);
        r++
      )
        for (
          let c = Math.max(1, p.col - radius);
          c <= Math.min(C.WORLD_COLS - 2, p.col + radius);
          c++
        ) {
          const t = tile(s, c, r);
          if (["rock", "ore", "lava", "stone", "gas"].includes(t.kind)) {
            changed = true;
            s.grid[r][c] = cell("tunnel", t.band);
            if (t.kind === "gas") gasBlast(s, c, r);
          }
        }
      if (!changed) {
        note(s, "Nothing to blast — supply retained.");
        return;
      }
      effect(s, "gas-explosion");
      cue(s, C.CUES.gasExplosion);
      s.shake = 1;
    } else if (id === "quantum-teleporter" || id === "matter-transmitter") {
      const quantum = id === "quantum-teleporter";
      const height =
        s.nextTeleportHeight ??
        C.TELEPORT_HEIGHT_TILES_MIN +
          Math.random() *
            (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN);
      const speed =
        s.nextTeleportSpeed ??
        C.TELEPORT_SPEED_MIN +
          Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
      if (
        !quantum &&
        s.miner.y === C.SURFACE_Y - C.MINER_H &&
        s.miner.vy === 0
      ) {
        note(s, "Already on the surface.");
        return;
      }
      s.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
      s.miner.y = C.SURFACE_Y - C.MINER_H - (quantum ? height * C.TILE : 0);
      s.miner.vx = 0;
      s.miner.vy = quantum ? speed : 0;
      s.miner.drilling = null;
      if (quantum) {
        s.nextTeleportHeight = null;
        s.nextTeleportSpeed = null;
      }
      effect(s, "core-extract");
    } else if (id === "nanobots") {
      s.miner.hull = Math.min(maxHull(s), s.miner.hull + C.NANOBOT_HULL);
      effect(s, "material-shimmer");
    } else s.miner.fuel = Math.min(maxFuel(s), s.miner.fuel + C.EMERGENCY_FUEL);
    s.items[id]--;
    cue(s, C.CUES.fabricate);
    note(s, `${item.name} used.`);
    if (s.miner.hull <= 0) end(s, "hull-destroyed");
    return;
  }
  if (action === "jettison") {
    if (!s.satchel.coreSample) {
      note(s, "No Core Sample carried.");
      return;
    }
    s.satchel.coreSample = false;
    s.coreGround = minerCell(s);
    note(s, "CORE SAMPLE JETTISONED  /  Move at least three tiles clear.");
    return;
  }
  if (action === "fabricate") {
    const part = C.ROCKET_COMPONENTS[s.installed];
    if (!part) {
      note(s, "Rocket complete. Ready to launch.");
      return;
    }
    const held =
      !part.material || part.material === "core-sample"
        ? !part.material || s.satchel.coreSample
        : s.satchel[part.material] > 0;
    if (s.credits < part.credits || !held) {
      note(s, "Missing Credits or required material.");
      return;
    }
    s.credits -= part.credits;
    s.installed++;
    if (part.material === "core-sample") {
      s.satchel.coreSample = false;
      s.coreTimer = null;
    } else if (part.material) s.satchel[part.material]--;
    cue(s, C.CUES.fabricate);
    note(s, `${part.name.toUpperCase()} INSTALLED  /  ${s.installed}/5`);
    return;
  }
  if (action === "launch") {
    if (s.installed < C.ROCKET_COMPONENTS.length) {
      note(s, "Rocket is incomplete.");
      return;
    }
    cue(s, C.CUES.launch);
    s.launchTime = 0.001;
    const pad = buildingsLaunch();
    effect(s, "launch-exhaust", pad.x + 120, C.SURFACE_Y);
    end(s, null);
    return;
  }
  if (action === "save") {
    save(s);
    return;
  }
  s.notice = null;
}
function buildingsLaunch() {
  return { x: 120 + C.BUILDINGS.indexOf("launch-pad") * 330 };
}
export function resize(s: DeepcoreState, size: C.WorldSize): void {
  const rows = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
    old = s.coreRow,
    grid = emptyGrid(rows);
  for (let r = 1; r < Math.min(rows, old); r++) grid[r] = s.grid[r].slice();
  s.grid = grid;
  s.coreRow = rows;
  s.worldSize = size;
}
export function setTier(
  s: DeepcoreState,
  track: C.TrackName,
  tier: number,
): void {
  s.tiers[track] = tier;
  s.miner.fuel = clamp(s.miner.fuel, 0, maxFuel(s));
  s.miner.hull = clamp(s.miner.hull, 0, maxHull(s));
}
