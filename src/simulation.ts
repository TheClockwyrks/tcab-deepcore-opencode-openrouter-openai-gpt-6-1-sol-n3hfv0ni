import * as C from "./constants";
import {
  type DeepcoreState,
  type ReadState,
  copy,
  tile,
  minable,
  grounded,
  loadKg,
  jet,
  depth,
  clamp,
  effect,
  cue,
  maxFuel,
  buildings,
} from "./model";
import { collect, extract, hurt, end } from "./transactions";

export interface Held {
  left: boolean;
  right: boolean;
  down: boolean;
  up: boolean;
}
const STEP = 1 / 120;
function solid(s: ReadState, x: number, y: number): boolean {
  if (y < 0) return false;
  const col = Math.floor(x / C.TILE),
    row = Math.floor(y / C.TILE),
    d = s.miner.drilling;
  if (d?.dir === "down" && d.col === col && d.row === row) return false;
  return tile(s, col, row).kind !== "tunnel";
}
function move(s: DeepcoreState, dt: number): void {
  const m = s.miner;
  if (!m.travel) return;
  const nx = clamp(m.x + m.vx * dt, C.TILE, C.WORLD_W - C.TILE - C.MINER_W);
  const edge = m.vx < 0 ? nx : nx + C.MINER_W;
  if ([m.y + 2, m.y + C.MINER_H - 2].some((y) => solid(s, edge, y))) {
    m.x =
      m.vx < 0
        ? (Math.floor(edge / C.TILE) + 1) * C.TILE
        : Math.floor(edge / C.TILE) * C.TILE - C.MINER_W;
  } else m.x = nx;
  if (m.vy === 0) return;
  const ny = m.y + m.vy * dt,
    foot = m.vy < 0 ? ny : ny + C.MINER_H;
  if ([m.x + 2, m.x + C.MINER_W - 2].some((x) => solid(s, x, foot))) {
    if (m.vy > 0) {
      const damage =
        Math.max(0, m.vy - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
      m.y = Math.floor(foot / C.TILE) * C.TILE - C.MINER_H;
      if (damage > 0) {
        hurt(s, damage);
        effect(s, "impact-dust", m.x + C.MINER_W / 2, m.y + C.MINER_H);
        cue(s, C.CUES.impact);
        s.shake = Math.max(0.25, Math.min(1, damage / 35));
      }
    } else m.y = (Math.floor(foot / C.TILE) + 1) * C.TILE;
    m.vy = 0;
  } else m.y = ny;
}
function cut(s: DeepcoreState, input: Held, dt: number): void {
  const m = s.miner,
    dir = input.down
      ? "down"
      : input.left
        ? "left"
        : input.right
          ? "right"
          : null;
  let d = m.drilling;
  if (!m.drill || !dir || input.up || m.fuel < C.DRILL_HIT_FUEL) {
    m.drilling = null;
    m.hitClock = 0;
    return;
  }
  if (d && d.dir !== dir) {
    d = null;
    m.drilling = null;
  }
  if (!d && grounded(s)) {
    const col = Math.floor((m.x + C.MINER_W / 2) / C.TILE),
      row = Math.floor((m.y + C.MINER_H / 2) / C.TILE);
    if (dir === "down")
      d = { col, row: Math.floor((m.y + C.MINER_H + 0.5) / C.TILE), dir };
    else {
      const edge = dir === "left" ? m.x - 0.5 : m.x + C.MINER_W + 0.5;
      const targetCol = Math.floor(edge / C.TILE);
      if (
        targetCol !== col &&
        Math.abs(
          (dir === "left" ? m.x : m.x + C.MINER_W) -
            Math.round((dir === "left" ? m.x : m.x + C.MINER_W) / C.TILE) *
              C.TILE,
        ) < 1
      )
        d = { col: targetCol, row, dir };
    }
    if (d) {
      const t = tile(s, d.col, d.row);
      if (
        !minable(t.kind) &&
        !(dir === "down" && t.kind === "core" && s.coreTimer === null)
      )
        d = null;
    }
    m.drilling = d;
    m.hitClock = 0;
  }
  if (!d) return;
  const t = tile(s, d.col, d.row);
  if (t.kind === "tunnel") {
    m.drilling = null;
    return;
  }
  m.hitClock += dt;
  while (
    m.hitClock + 1e-9 >= C.DRILL_HIT_INTERVAL &&
    m.fuel >= C.DRILL_HIT_FUEL
  ) {
    m.hitClock -= C.DRILL_HIT_INTERVAL;
    m.fuel -= C.DRILL_HIT_FUEL;
    if (t.kind === "core") {
      extract(s);
      m.drilling = null;
      m.hitClock = 0;
      break;
    }
    const health =
      (tile(s, d.col, d.row).health ?? 0) -
      C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
    if (health <= 0) {
      const support = tile(s, d.col, d.row + 1).kind;
      collect(s, d.col, d.row);
      if (
        d.dir === "down" &&
        m.travel &&
        support !== "tunnel" &&
        support !== "lava"
      )
        m.y = (d.row + 1) * C.TILE - C.MINER_H;
      m.drilling = null;
      m.hitClock = 0;
      break;
    } else s.grid[d.row][d.col] = { ...tile(s, d.col, d.row), health };
  }
  if (m.drilling?.dir === "down" && m.travel) {
    const support = tile(s, d.col, d.row + 1).kind,
      now = tile(s, d.col, d.row);
    if (support !== "tunnel" && support !== "lava") {
      const progress = clamp(
        1 -
          (now.health ?? 0) / (now.maxHealth ?? 1) +
          ((m.hitClock / C.DRILL_HIT_INTERVAL) *
            C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
            (now.maxHealth ?? 1),
        0,
        1,
      );
      m.y = d.row * C.TILE - C.MINER_H + progress * C.TILE;
      m.vy = 0;
    }
  }
}
function step(s: DeepcoreState, input: Held, dt: number): void {
  const m = s.miner;
  if (s.coreTimer !== null) {
    s.coreTimer = Math.max(0, s.coreTimer - dt);
    if (s.coreTimer <= 0) {
      const ground = s.coreGround,
        x = ground ? (ground.col + 0.5) * C.TILE : m.x + C.MINER_W / 2,
        y = ground ? (ground.row + 0.5) * C.TILE : m.y + C.MINER_H / 2;
      effect(s, "core-detonation", x, y);
      s.shake = 2;
      cue(s, C.CUES.gasExplosion);
      const killed =
        s.satchel.coreSample ||
        Math.hypot(m.x + C.MINER_W / 2 - x, m.y + C.MINER_H / 2 - y) <=
          C.CORE_BLAST_TILES * C.TILE;
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (killed) {
        end(s, "core-detonation");
        return;
      }
    }
  }
  if (m.hull <= 0) {
    end(s, "hull-destroyed");
    return;
  }
  if (m.fuel <= 0 && m.y + C.MINER_H > C.SURFACE_Y + 0.1) {
    m.state = "fuel-out";
    end(s, "fuel-out");
    return;
  }
  s.elapsedSeconds += dt;
  if (!s.panel) {
    const onGround = grounded(s) || m.drilling?.dir === "down",
      thrust = input.up && m.fuel > 0;
    const dir = Number(input.right) - Number(input.left);
    if (dir) m.facing = dir > 0 ? "east" : "west";
    if (m.travel) {
      if (m.hurt <= 0) m.vx = dir * C.WALK_SPEED;
      else if (!dir) m.vx *= Math.exp(-dt * 5);
      const load = loadKg(s) / jet(s).liftLimitKg;
      if (thrust) {
        m.vy = Math.max(
          -jet(s).emptyClimb *
            (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
          m.vy - jet(s).emptyAccel * Math.max(0, 1 - load) * dt,
        );
      } else if (!m.drilling)
        m.vy = Math.min(
          C.FALL_TERMINAL_EMPTY +
            (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) *
              Math.min(1, load),
          m.vy + C.GRAVITY * dt,
        );
      move(s, dt);
    }
    if (thrust)
      m.fuel -=
        (C.THRUST_BURN_MAX +
          (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
            Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
        C.THRUST_BURN_SIZE_MULT[s.worldSize] *
        dt;
    if (dir && !onGround) m.fuel -= C.AIR_BURN * dt;
    cut(s, input, dt);
    // Contact is checked independently of collision resolution, including a
    // debug pose intersecting lava. A cut pays its heat once at break instead.
    const c0 = Math.floor(m.x / C.TILE),
      c1 = Math.floor((m.x + C.MINER_W) / C.TILE),
      r0 = Math.max(1, Math.floor(m.y / C.TILE)),
      r1 = Math.min(s.coreRow, Math.floor((m.y + C.MINER_H + 0.1) / C.TILE));
    let touching = false;
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (
          tile(s, c, r).kind === "lava" &&
          !(m.drilling?.col === c && m.drilling.row === r)
        )
          touching = true;
    if (touching) {
      hurt(
        s,
        C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) * dt,
        "lava",
      );
      if (s.effectClock <= 0) {
        effect(s, "lava-embers");
        cue(s, C.CUES.lavaSizzle);
      }
    }
    if (m.y + C.MINER_H > C.SURFACE_Y + 0.1) m.fuel -= C.LIFE_SUPPORT_BURN * dt;
    m.fuel = Math.max(0, m.fuel);
    const state = m.drilling
      ? m.drilling.dir === "down"
        ? "drill-down"
        : "drill-side"
      : m.hurt > 0
        ? "hurt"
        : m.fuel === 0 && depth(s) > 0
          ? "fuel-out"
          : thrust
            ? "jetpack"
            : !grounded(s)
              ? "fall"
              : dir
                ? "walk"
                : "idle";
    if (state !== m.state) m.animTime = 0;
    else m.animTime += dt;
    m.state = state;
    if (s.effectClock <= 0) {
      if (m.drilling) {
        const band = tile(s, m.drilling.col, m.drilling.row).band,
          tint = band
            ? {
                topsoil: "#bf9671",
                rockbed: "#a6b9bf",
                deepstone: "#a3a7cb",
                coreshell: "#e9a18d",
              }[band]
            : null;
        effect(
          s,
          "drill-debris",
          m.drilling.dir === "down"
            ? m.x + C.MINER_W / 2
            : m.x + (m.facing === "east" ? C.MINER_W : 0),
          m.drilling.dir === "down" ? m.y + C.MINER_H : m.y + 45,
          tint,
        );
      }
      if (thrust)
        effect(
          s,
          "jetpack-exhaust",
          m.x + (m.facing === "east" ? 7 : 49),
          m.y + 57,
        );
    }
  } else {
    m.drilling = null;
    m.state = "idle";
  }
  m.hurt = Math.max(0, m.hurt - dt);
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  if (m.hull <= 0) end(s, "hull-destroyed");
  else if (m.fuel <= 0 && depth(s) > 0) end(s, "fuel-out");
}
export function camera(s: DeepcoreState, dt: number): void {
  const vy = s.miner.vy,
    target =
      Math.abs(vy) <= C.CAM_STILL_SPEED ? 0 : Math.sign(vy) * C.CAM_LEAD_MAX;
  let lead = s.camera.lead;
  const rate =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) *
    (lead !== 0 && (target === 0 || Math.sign(target) !== Math.sign(lead))
      ? C.CAM_UNWIND_MULT
      : 1);
  lead += clamp(target - lead, -rate * dt, rate * dt);
  s.camera = {
    x: clamp(s.miner.x + C.MINER_W / 2 - C.VIEW_W / 2, 0, C.WORLD_W - C.VIEW_W),
    y: Math.min(
      s.miner.y + C.MINER_H / 2 - C.VIEW_H / 2 + lead,
      (s.coreRow + 1) * C.TILE - C.VIEW_H,
    ),
    lead,
  };
}
export function advance(s: DeepcoreState, input: Held, dt: number): void {
  const active = s.screen === "in-mine";
  if (active) {
    s.accumulator += dt;
    while (s.accumulator + 1e-10 >= STEP) {
      s.accumulator -= STEP;
      step(s, input, STEP);
      s.effectClock -= STEP;
      if (s.effectClock <= 0) s.effectClock = 0.1;
      if (s.screen !== "in-mine") {
        s.accumulator = 0;
        break;
      }
    }
    if (!s.panel) camera(s, dt);
    if (s.notice) {
      s.notice.age += dt;
      if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
    }
    // Ambient effects are only scheduled for pockets in the current viewport.
    if (
      Math.floor(s.simTime / C.GAS_SEEP_PERIOD) !==
      Math.floor((s.simTime - dt) / C.GAS_SEEP_PERIOD)
    ) {
      const c0 = Math.max(1, Math.floor(s.camera.x / C.TILE)),
        r0 = Math.max(1, Math.floor(s.camera.y / C.TILE));
      for (
        let r = r0;
        r <= Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
        r++
      )
        for (
          let c = c0;
          c <=
          Math.min(
            C.WORLD_COLS - 2,
            Math.ceil((s.camera.x + C.VIEW_W) / C.TILE),
          );
          c++
        )
          if (tile(s, c, r).kind === "gas")
            effect(s, "gas-seep", (c + 0.5) * C.TILE, (r + 0.6) * C.TILE);
    }
    s.alarmClock -= dt;
    if (s.alarmClock <= 0) {
      if (s.coreTimer !== null) {
        cue(s, C.CUES.alarmCore);
        s.alarmClock = 0.15 + Math.min(1.4, s.coreTimer / 50);
      } else if (s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION) {
        cue(s, C.CUES.alarmFuel);
        s.alarmClock = 2;
      }
    }
  }
  if (s.screen !== "paused") {
    s.effects = s.effects
      .map((e) => ({ ...e, age: e.age + dt }))
      .filter((e) => e.age < 2.2)
      .slice(-90);
    s.shake = Math.max(0, s.shake - dt);
    s.noteTime = Math.max(0, s.noteTime - dt);
    if (s.launchTime) s.launchTime += dt;
  }
}
export function nearbyBuilding(s: ReadState) {
  if (Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) > 8) return null;
  const x = s.miner.x + C.MINER_W / 2;
  return buildings.find((b) => x >= b.x - 15 && x <= b.x + b.w + 15) ?? null;
}
export function simulate(
  state: ReadState,
  input: Held,
  dt: number,
): DeepcoreState {
  const s = copy(state);
  s.simTime += dt;
  advance(s, input, dt);
  return s;
}
