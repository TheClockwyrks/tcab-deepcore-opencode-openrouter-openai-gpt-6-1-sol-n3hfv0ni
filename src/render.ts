import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type ReadState,
  type Rect,
  tile,
  depth,
  slots,
  slotCap,
  loadKg,
  jet,
  maxFuel,
  maxHull,
  scanner,
  buildings,
  clamp,
} from "./model";
import {
  menu,
  menuRect,
  controls,
  cargoLabel,
  panelTitle,
  upgradeDescription,
} from "./interface";
import { nearbyBuilding } from "./simulation";

const P = {
  ink: "#0a1520",
  panel: "#112330",
  line: "#304650",
  white: "#e9e7d6",
  muted: "#90a6ab",
  gold: "#efbe7d",
  mint: "#82dbc4",
  danger: "#ef8d77",
};
const FONT = '"Trebuchet MS", sans-serif',
  MONO = '"Courier New", monospace';
type Ctx = CanvasRenderingContext2D;
function text(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  size = 16,
  color = P.white,
  weight = 400,
  font = FONT,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
}
function label(
  ctx: Ctx,
  str: string,
  x: number,
  y: number,
  color = P.muted,
  size = 11,
): void {
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.fillStyle = color;
  let xx = x;
  for (const char of str) {
    ctx.fillText(char, xx, y);
    xx += ctx.measureText(char).width + 1.4;
  }
}
function line(ctx: Ctx, x: number, y: number, w: number, color = P.line): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function box(ctx: Ctx, r: Rect, fill = P.panel, stroke = P.line): void {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
function sprite(
  s: ReadState,
  ctx: Ctx,
  path: string,
  x: number,
  y: number,
  w = 80,
  h = 80,
): void {
  const image = s.images[path];
  if (!image) throw new Error(`Deepcore sprite is missing: ${path}`);
  ctx.drawImage(image, x, y, w, h);
}
function miner(
  s: ReadState,
  ctx: Ctx,
  x: number,
  y: number,
  state = s.miner.state,
  scale = 1,
): void {
  const count = s.frames[state] ?? 2;
  const f =
    state === "hurt"
      ? Math.min(count - 1, Math.floor(s.miner.animTime * C.ANIM_FPS))
      : Math.floor(s.miner.animTime * C.ANIM_FPS) % count;
  ctx.save();
  ctx.translate(x + (C.MINER_W * scale) / 2, y);
  if (s.miner.facing === "west") ctx.scale(-1, 1);
  sprite(
    s,
    ctx,
    `miner/${state}/frame${String(f).padStart(2, "0")}.png`,
    -40 * scale,
    -4 * scale,
    C.MINER_SPRITE * scale,
    C.MINER_SPRITE * scale,
  );
  ctx.restore();
}
function grainTile(s: ReadState, ctx: Ctx, col: number, row: number): void {
  const t = tile(s, col, row),
    band = t.band ?? "coreshell",
    x = col * C.TILE,
    y = row * C.TILE;
  if (t.kind === "bedrock" || t.kind === "core")
    sprite(s, ctx, "tiles/bedrock.png", x, y);
  else
    sprite(
      s,
      ctx,
      `tiles/${band}-${Math.abs(col * 7 + row * 13) % C.TILE_VARIANTS}.png`,
      x,
      y,
    );
  if (t.kind === "tunnel" || t.kind === "lava") {
    const same = (c: number, r: number) => tile(s, c, r).kind === t.kind;
    const l = same(col - 1, row),
      r = same(col + 1, row),
      up = same(col, row - 1) || (row === 1 && t.kind === "tunnel"),
      down = same(col, row + 1);
    const inset = 7;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(
      x + (l ? 0 : inset),
      y + (up ? 0 : inset),
      C.TILE - (l ? 0 : inset) - (r ? 0 : inset),
      C.TILE - (up ? 0 : inset) - (down ? 0 : inset),
      12,
    );
    ctx.clip();
    sprite(
      s,
      ctx,
      t.kind === "lava"
        ? `hazards/lava/frame${String(Math.floor(s.elapsedSeconds * 5) % 4).padStart(2, "0")}.png`
        : "tiles/tunnel.png",
      x,
      y,
    );
    ctx.restore();
    // Fill the connection strips; corners that touch only diagonally never join.
    const fill = (xx: number, yy: number, w: number, h: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(xx, yy, w, h);
      ctx.clip();
      sprite(
        s,
        ctx,
        t.kind === "lava"
          ? `hazards/lava/frame${String(Math.floor(s.elapsedSeconds * 5) % 4).padStart(2, "0")}.png`
          : "tiles/tunnel.png",
        x,
        y,
      );
      ctx.restore();
    };
    if (l || r)
      fill(
        x + (l ? 0 : inset),
        y + 18,
        80 - (l ? 0 : inset) - (r ? 0 : inset),
        44,
      );
    if (up)
      fill(x + (l ? 0 : inset), y, 80 - (l ? 0 : inset) - (r ? 0 : inset), 20);
    if (down)
      fill(
        x + (l ? 0 : inset),
        y + 60,
        80 - (l ? 0 : inset) - (r ? 0 : inset),
        20,
      );
    if (l)
      fill(
        x,
        y + (up ? 0 : inset),
        20,
        80 - (up ? 0 : inset) - (down ? 0 : inset),
      );
    if (r)
      fill(
        x + 60,
        y + (up ? 0 : inset),
        20,
        80 - (up ? 0 : inset) - (down ? 0 : inset),
      );
    // Convex dirt nubs at inside bends retain the wall's rounded lip.
    for (const [sx, sy, adj] of [
      [0, 0, l && up && !same(col - 1, row - 1)],
      [1, 0, r && up && !same(col + 1, row - 1)],
      [0, 1, l && down && !same(col - 1, row + 1)],
      [1, 1, r && down && !same(col + 1, row + 1)],
    ] as const) {
      if (adj) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + sx * 80, y + sy * 80, 9, 0, Math.PI * 2);
        ctx.clip();
        sprite(s, ctx, `tiles/${band}-0.png`, x, y);
        ctx.restore();
      }
    }
  }
  if (t.ore) sprite(s, ctx, `ore/${t.ore}.png`, x, y);
  if (t.material) sprite(s, ctx, `materials/${t.material}.png`, x, y);
  if (t.kind === "stone")
    sprite(s, ctx, `tiles/stone-${(col + row) % 2}.png`, x, y);
  if (t.kind === "core") sprite(s, ctx, "materials/core.png", x, y);
  if (t.health !== null && t.maxHealth && t.health < t.maxHealth)
    sprite(
      s,
      ctx,
      `tiles/crack/frame${String(Math.min(C.CRACK_FRAMES - 1, Math.floor((1 - t.health / t.maxHealth) * C.CRACK_FRAMES))).padStart(2, "0")}.png`,
      x,
      y,
    );
  ctx.strokeStyle = "#080e191f";
  ctx.strokeRect(x + 0.5, y + 0.5, 79, 79);
}
function particles(s: ReadState, ctx: Ctx): void {
  for (const fx of s.effects) {
    const source = s.particles[fx.name];
    if (!source) continue;
    const system = fx.tint
      ? {
          ...source,
          emitters: source.emitters.map((e) => ({
            ...e,
            particle: {
              ...e.particle,
              colorGradient: [
                { color: fx.tint!, at: 0 },
                { color: "#f0f5e3", at: 1 },
              ],
            },
          })),
        }
      : source;
    ctx.save();
    ctx.translate(fx.x - 200, fx.y - 200);
    // The binding fits its field to the engine canvas; compensate in our world
    // transform so the authored 400-unit field retains its logical dimensions.
    ctx.scale(400 / ctx.canvas.width, 400 / ctx.canvas.height);
    // Reconstruct the seeded event at its authoritative age. The binding's
    // constructor paints time zero, so suppress that initial paint; only the
    // requested frame is composited. Simulation remains outside render state.
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = 0;
    const player = new ParticleCanvasPlayer(system as ParticleSystem, ctx, {
      seed: fx.seed,
      clear: false,
      pixelRadius: 1,
      composite: ["gas-seep", "drill-debris", "impact-dust"].includes(fx.name)
        ? "source-over"
        : "lighter",
    });
    const steps = Math.floor(fx.age * 60);
    for (let i = 0; i < steps; i++) player.simulator.step(1000 / 60);
    ctx.globalAlpha = alpha;
    player.update(fx.age - steps / 60);
    ctx.restore();
  }
}
function world(s: ReadState, ctx: Ctx): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  const shake = s.shake > 0 ? Math.max(2, Math.min(12, s.shake * 12)) : 0;
  ctx.translate(
    -s.camera.x + Math.sin(s.elapsedSeconds * 87) * shake,
    C.HUD_H - s.camera.y + Math.cos(s.elapsedSeconds * 103) * shake,
  );
  const top = s.camera.y,
    bottom = top + C.VIEW_H;
  if (top < C.SURFACE_Y) {
    sprite(
      s,
      ctx,
      "surface/sky.png",
      s.camera.x,
      Math.min(-480, top),
      1280,
      Math.max(560, C.SURFACE_Y - top),
    );
    for (const b of buildings) {
      sprite(s, ctx, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      if (b.id === "launch-pad")
        sprite(
          s,
          ctx,
          `rocket/stage${s.installed}.png`,
          b.x + 68,
          C.SURFACE_Y -
            238 -
            (s.launchTime ? s.launchTime * s.launchTime * 85 : 0),
          160,
          240,
        );
      label(
        ctx,
        b.id.replace(/-/g, " ").toUpperCase(),
        b.x + 10,
        C.SURFACE_Y - 190,
        b.id === "save-pad" ? P.mint : P.muted,
        10,
      );
    }
    sprite(
      s,
      ctx,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE - 70,
      C.SURFACE_Y - 115,
      220,
      140,
    );
  }
  const c0 = Math.max(0, Math.floor(s.camera.x / C.TILE)),
    c1 = Math.min(
      C.WORLD_COLS - 1,
      Math.ceil((s.camera.x + C.VIEW_W) / C.TILE),
    );
  for (
    let r = Math.max(1, Math.floor(top / C.TILE));
    r <= Math.min(s.coreRow, Math.ceil(bottom / C.TILE));
    r++
  )
    for (let c = c0; c <= c1; c++) grainTile(s, ctx, c, r);
  if (top < C.SURFACE_Y + 20) {
    for (
      let x = Math.floor(s.camera.x / 320) * 320;
      x < s.camera.x + C.VIEW_W;
      x += 320
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, C.SURFACE_Y, 320, 9);
      ctx.clip();
      sprite(s, ctx, "surface/ground.png", x, C.SURFACE_Y, 320, 80);
      ctx.restore();
    }
  }
  if (s.coreGround) {
    const p = s.coreGround;
    sprite(s, ctx, "materials/core-sample.png", p.col * C.TILE, p.row * C.TILE);
    text(
      ctx,
      `${s.coreTimer?.toFixed(1)} s`,
      p.col * C.TILE,
      p.row * C.TILE - 7,
      19,
      P.gold,
      700,
      MONO,
    );
  }
  if (!s.launchTime) miner(s, ctx, s.miner.x, s.miner.y);
  particles(s, ctx);
  ctx.restore();
  if (depth(s) > 5) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
    ctx.clip();
    const x = s.miner.x + C.MINER_W / 2 - s.camera.x,
      y = s.miner.y + C.MINER_H / 2 - s.camera.y + C.HUD_H;
    const light = ctx.createRadialGradient(x, y, 120, x, y, 750);
    light.addColorStop(0, "#06122000");
    light.addColorStop(1, "#050e1b9a");
    ctx.fillStyle = light;
    ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
    ctx.restore();
  }
}
function gauge(
  s: ReadState,
  ctx: Ctx,
  name: string,
  x: number,
  value: number,
  max: number,
  color: string,
): void {
  sprite(s, ctx, `icons/${name}.png`, x, 16, C.ICON_SIZE, C.ICON_SIZE);
  label(ctx, name.toUpperCase(), x + 31, 19, P.muted, 9);
  text(ctx, `${Math.ceil(value)}`, x + 31, 40, 19, color, 700, MONO);
  text(ctx, `/ ${max}`, x + 72, 40, 12, P.muted, 400, MONO);
  ctx.fillStyle = P.line;
  ctx.fillRect(x + 31, 45, 112, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x + 31, 45, 112 * clamp(value / max, 0, 1), 3);
}
function hud(s: ReadState, ctx: Ctx): void {
  ctx.fillStyle = "#0b1924";
  ctx.fillRect(0, 0, C.STAGE_W, C.HUD_H);
  line(ctx, 0, C.HUD_H - 1, C.STAGE_W);
  gauge(
    s,
    ctx,
    "fuel",
    20,
    s.miner.fuel,
    maxFuel(s),
    s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION ? P.danger : P.gold,
  );
  gauge(
    s,
    ctx,
    "hull",
    190,
    s.miner.hull,
    maxHull(s),
    s.miner.hull < maxHull(s) * C.LOW_HULL_FRACTION ? P.danger : P.mint,
  );
  sprite(s, ctx, "icons/cargo.png", 360, 17, 24, 24);
  label(ctx, "CARGO", 393, 19, P.muted, 9);
  text(
    ctx,
    `${slots(s)} / ${slotCap(s)}`,
    393,
    40,
    18,
    slots(s) >= slotCap(s) ? P.danger : P.white,
    700,
    MONO,
  );
  text(
    ctx,
    loadKg(s) >= jet(s).liftLimitKg ? C.OVERLOAD : `${loadKg(s)} kg`,
    486,
    38,
    12,
    loadKg(s) >= jet(s).liftLimitKg ? P.danger : P.muted,
    700,
    MONO,
  );
  sprite(s, ctx, "icons/credits.png", 588, 17, 24, 24);
  label(ctx, "CREDITS", 620, 19, P.muted, 9);
  text(
    ctx,
    Math.floor(s.credits).toLocaleString(),
    620,
    40,
    18,
    P.gold,
    700,
    MONO,
  );
  sprite(s, ctx, "icons/depth.png", 745, 17, 24, 24);
  label(ctx, "DEPTH", 777, 19, P.muted, 9);
  text(
    ctx,
    `${Math.floor(depth(s)).toLocaleString()} m`,
    777,
    40,
    18,
    P.white,
    700,
    MONO,
  );
  for (const [i, m] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[m] > 0.0 ? 1 : 0.25;
    sprite(s, ctx, `icons/${m}.png`, 921 + i * 37, 17, 24, 24);
  }
  ctx.globalAlpha = 1;
  for (const control of controls(s).filter((c) =>
    ["inventory", "pause", "mute"].includes(c.id),
  )) {
    box(ctx, control.rect, "#132632");
    text(
      ctx,
      control.label,
      control.rect.x + 12,
      control.rect.y + 25,
      12,
      P.muted,
      700,
      MONO,
    );
  }
}
function button(
  ctx: Ctx,
  r: Rect,
  title: string,
  active: boolean,
  enabled = true,
): void {
  box(
    ctx,
    r,
    active ? "#e7bd83" : enabled ? "#162d3b" : "#14232d",
    active ? P.gold : enabled ? "#405d67" : "#283944",
  );
  text(
    ctx,
    title,
    r.x + 19,
    r.y + r.h / 2 + 6,
    15,
    active ? P.ink : enabled ? P.white : "#5e757e",
    700,
    MONO,
  );
  if (active) text(ctx, "↗", r.x + r.w - 34, r.y + r.h / 2 + 7, 20, P.ink, 700);
}
function supplyIcon(ctx: Ctx, id: C.ItemId, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = P.mint;
  ctx.fillStyle = P.gold;
  if (id === "dynamite") {
    ctx.fillStyle = P.danger;
    for (let i = 0; i < 3; i++) ctx.fillRect(3 + i * 7, 8, 5, 19);
    ctx.fillStyle = P.gold;
    ctx.fillRect(2, 14, 21, 4);
    ctx.beginPath();
    ctx.moveTo(13, 9);
    ctx.lineTo(13, 3);
    ctx.lineTo(21, 1);
    ctx.stroke();
  } else if (id === "plastic-explosives") {
    ctx.fillRect(2, 8, 24, 19);
    ctx.fillStyle = P.panel;
    ctx.fillRect(7, 11, 14, 8);
    ctx.fillStyle = P.danger;
    ctx.fillRect(9, 13, 10, 4);
    ctx.beginPath();
    ctx.moveTo(21, 10);
    ctx.lineTo(25, 2);
    ctx.lineTo(12, 2);
    ctx.lineTo(12, 8);
    ctx.stroke();
  } else if (id === "quantum-teleporter") {
    for (const r of [6, 12]) {
      ctx.beginPath();
      ctx.arc(14, 15, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillRect(12, 13, 4, 4);
  } else if (id === "matter-transmitter") {
    ctx.strokeRect(2, 3, 24, 25);
    ctx.beginPath();
    ctx.moveTo(6, 17);
    ctx.lineTo(22, 17);
    ctx.lineTo(15, 10);
    ctx.moveTo(22, 17);
    ctx.lineTo(15, 24);
    ctx.stroke();
  } else if (id === "nanobots") {
    ctx.fillStyle = P.mint;
    ctx.fillRect(10, 5, 7, 23);
    ctx.fillRect(2, 13, 23, 7);
    ctx.fillStyle = P.gold;
    for (const [xx, yy] of [
      [2, 3],
      [24, 3],
      [3, 28],
      [25, 27],
    ])
      ctx.fillRect(xx, yy, 2, 2);
  } else {
    ctx.strokeStyle = P.gold;
    ctx.strokeRect(3, 8, 21, 20);
    ctx.strokeRect(8, 2, 11, 6);
    ctx.fillRect(11, 13, 5, 10);
  }
  ctx.restore();
}
function panel(s: ReadState, ctx: Ctx): void {
  if (!s.panel) return;
  ctx.fillStyle = "#06121cba";
  ctx.fillRect(0, C.HUD_H, 1280, 664);
  box(ctx, { x: 200, y: 99, w: 880, h: 553 }, "#102330", "#4a6268");
  label(
    ctx,
    "SURFACE SYSTEMS  /  " +
      (s.panel === "inventory" ? "PERSONAL STORAGE" : "CAMP TERMINAL"),
    234,
    132,
    P.gold,
    10,
  );
  text(ctx, panelTitle(s.panel), 234, 172, 29, P.white, 800);
  line(ctx, 234, 188, 812);
  const p = s.panel;
  if (p === "fuel-depot") {
    text(ctx, "JETPACK FUEL", 245, 248, 22, P.gold, 700);
    text(
      ctx,
      `${Math.ceil(s.miner.fuel)} / ${maxFuel(s)} units`,
      245,
      280,
      17,
      P.muted,
      400,
      MONO,
    );
    text(ctx, `${C.FUEL_PRICE} Credit per unit`, 245, 307, 13, P.muted);
    text(ctx, "HULL REPAIR", 675, 248, 22, P.mint, 700);
    text(
      ctx,
      `${Math.ceil(s.miner.hull)} / ${maxHull(s)} integrity`,
      675,
      280,
      17,
      P.muted,
      400,
      MONO,
    );
    text(ctx, `${C.REPAIR_PRICE} Credits per point`, 675, 307, 13, P.muted);
    text(
      ctx,
      "Your return is only as good as your reserves.",
      245,
      508,
      17,
      P.muted,
    );
    text(
      ctx,
      `${Math.floor(s.credits).toLocaleString()} Cr available`,
      245,
      548,
      22,
      P.gold,
      700,
      MONO,
    );
  }
  if (p === "upgrade-shop")
    C.TRACKS.forEach((track, i) => {
      const y = 229 + i * 56;
      label(ctx, track.toUpperCase(), 236, y, P.white, 13);
      text(ctx, `T${s.tiers[track]}`, 403, y, 16, P.gold, 700, MONO);
      text(ctx, upgradeDescription(s, track), 465, y, 14, P.muted);
      if (i < 6) line(ctx, 236, y + 20, 784, "#243b47");
    });
  if (p === "supply-depot")
    C.ITEMS.forEach((item, i) => {
      const y = 246 + i * 62;
      box(ctx, { x: 234, y: y - 27, w: 34, h: 34 }, "#263c46");
      supplyIcon(ctx, item.id, 237, y - 25);
      text(ctx, item.name, 284, y - 4, 17, P.white, 700);
      text(
        ctx,
        `HELD  ${s.items[item.id]}`,
        650,
        y - 4,
        12,
        P.muted,
        700,
        MONO,
      );
    });
  if (p === "ore-market" || p === "inventory") {
    text(
      ctx,
      cargoLabel(s),
      236,
      218,
      16,
      loadKg(s) >= jet(s).liftLimitKg ? P.danger : P.gold,
      700,
      MONO,
    );
    const held = C.MINERALS.filter((m) => (s.cargo[m.id] ?? 0) > 0);
    let total = 0;
    held.forEach((m, i) => {
      const y = 256 + i * 25,
        count = s.cargo[m.id] ?? 0;
      total += count * m.value;
      sprite(s, ctx, `ore/${m.id}.png`, 234, y - 19, 27, 27);
      text(ctx, m.name, 271, y, 14, P.white);
      text(ctx, `×${count}`, 410, y, 14, P.muted, 400, MONO);
      if (p === "ore-market")
        text(
          ctx,
          `${(count * m.value).toLocaleString()} Cr`,
          700,
          y,
          14,
          P.gold,
          400,
          MONO,
        );
      else
        text(ctx, `${count * m.weightKg} kg`, 462, y, 13, P.muted, 400, MONO);
    });
    if (!held.length)
      text(
        ctx,
        "Your cargo bay is empty. The mine is waiting.",
        236,
        280,
        16,
        P.muted,
      );
    if (p === "ore-market") {
      line(ctx, 236, 548, 784);
      text(ctx, "TOTAL VALUE", 236, 605, 13, P.muted, 700, MONO);
      text(
        ctx,
        `${total.toLocaleString()} Cr`,
        425,
        606,
        26,
        P.gold,
        700,
        MONO,
      );
    } else {
      line(ctx, 695, 213, 1);
      label(ctx, "FIELD SUPPLIES", 729, 215, P.muted, 10);
      C.ITEMS.forEach((item, i) => {
        text(
          ctx,
          `${i + 1}  ${item.name}`,
          729,
          258 + i * 47,
          12,
          s.items[item.id] ? P.white : P.muted,
        );
        text(
          ctx,
          `×${s.items[item.id]}`,
          897,
          258 + i * 47,
          13,
          P.gold,
          700,
          MONO,
        );
      });
      label(ctx, "MATERIAL SATCHEL", 236, 589, P.muted, 10);
      C.MATERIALS.forEach((m, i) => {
        sprite(s, ctx, `icons/${m}.png`, 236 + i * 210, 602, 24, 24);
        text(
          ctx,
          `${m} ×${s.satchel[m]}`,
          269 + i * 210,
          619,
          13,
          P.white,
          400,
          MONO,
        );
      });
    }
  }
  if (p === "launch-pad") {
    sprite(s, ctx, `rocket/stage${s.installed}.png`, 260, 260, 210, 315);
    C.ROCKET_COMPONENTS.forEach((part, i) => {
      const y = 238 + i * 58,
        done = i < s.installed;
      label(
        ctx,
        done ? "✓" : String(i + 1).padStart(2, "0"),
        514,
        y,
        done ? P.mint : P.muted,
        14,
      );
      text(
        ctx,
        part.name,
        558,
        y,
        19,
        done ? P.mint : i === s.installed ? P.white : P.muted,
        700,
      );
      text(
        ctx,
        done
          ? "INSTALLED"
          : `${part.credits.toLocaleString()} Cr${part.material ? " + " + part.material : ""}`,
        558,
        y + 23,
        13,
        P.muted,
        400,
        MONO,
      );
    });
    label(
      ctx,
      `${s.installed} / ${C.ROCKET_COMPONENTS.length} SYSTEMS ONLINE`,
      242,
      610,
      P.gold,
      10,
    );
  }
  const panelControls = controls(s).filter(
    (c) => !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
  );
  const enabled = panelControls.filter((c) => c.enabled && c.id !== "close");
  panelControls.forEach((c) => {
    if (c.id === "close")
      text(ctx, "×", c.rect.x + 12, c.rect.y + 29, 27, P.muted);
    else
      button(
        ctx,
        c.rect,
        c.label,
        enabled.indexOf(c) === s.panelIndex,
        c.enabled,
      );
  });
}
function overWorld(s: ReadState, ctx: Ctx): void {
  const scan = scanner(s);
  if (scan.locked && !s.panel) {
    box(ctx, { x: 975, y: 83, w: 277, h: 66 }, "#102d35e0");
    label(ctx, "MATERIAL SIGNAL", 994, 104, P.mint, 10);
    text(
      ctx,
      `${scan.target?.toUpperCase()}  ${scan.distanceTiles?.toFixed(1)} tiles`,
      994,
      133,
      14,
      P.white,
      700,
      MONO,
    );
    const angle = Math.atan2(scan.dirY, scan.dirX);
    ctx.save();
    ctx.translate(958, 116);
    ctx.rotate(angle);
    ctx.strokeStyle = P.mint;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.lineTo(5, -6);
    ctx.moveTo(12, 0);
    ctx.lineTo(5, 6);
    ctx.stroke();
    ctx.restore();
  }
  if (s.satchel.coreSample) {
    box(ctx, { x: 437, y: 79, w: 406, h: 63 }, "#392a2be8", P.gold);
    label(ctx, "CORE INSTABILITY", 456, 101, P.gold, 10);
    text(ctx, `${s.coreTimer?.toFixed(1)}s`, 456, 130, 26, P.gold, 700, MONO);
    text(
      ctx,
      "RETURN TO LAUNCH PAD  /  J: JETTISON",
      566,
      126,
      11,
      P.white,
      700,
      MONO,
    );
  }
  const b = nearbyBuilding(s);
  if (b && !s.panel) {
    box(ctx, { x: 429, y: 602, w: 422, h: 49 }, "#0b202bed");
    text(
      ctx,
      `[E]  ${b.id.replace(/-/g, " ").toUpperCase()}`,
      451,
      634,
      16,
      P.gold,
      700,
      MONO,
    );
  }
  if (!s.panel && !b) {
    const band =
      depth(s) === 0
        ? "SURFACE CAMP"
        : (tile(
            s,
            Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
            Math.max(1, Math.floor((s.miner.y + C.MINER_H) / C.TILE)),
          ).band?.toUpperCase() ?? "CORE CHAMBER");
    label(ctx, `STRATUM  /  ${band}`, 27, 91, P.muted, 10);
  }
  if (s.notice && s.notice.age >= C.NOTICE_DELAY) {
    box(ctx, { x: 335, y: 587, w: 610, h: 100 }, "#172b34f5", P.gold);
    label(
      ctx,
      s.notice.hazard === "gas"
        ? "VOLATILE GAS  /  INCIDENT REPORT"
        : "LAVA CONTACT  /  INCIDENT REPORT",
      355,
      614,
      P.gold,
      11,
    );
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "Watch for a pale seep. Hull absorbs the blast."
        : "Molten seams burn hull. Upgrade your radiator or go around.",
      355,
      642,
      15,
      P.white,
    );
    text(ctx, "Click to dismiss", 355, 668, 11, P.muted, 400, MONO);
  }
  if (s.noteTime > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, s.noteTime);
    ctx.font = `700 13px ${MONO}`;
    const w = Math.min(1020, ctx.measureText(s.note).width + 44);
    box(ctx, { x: 640 - w / 2, y: 665, w, h: 34 }, "#102c38ee");
    text(ctx, s.note, 662 - w / 2, 687, 13, P.gold, 700, MONO);
    ctx.restore();
  }
  if (!s.panel) {
    label(ctx, "A D  MOVE     S  DRILL     SPACE  THRUST", 27, 696, P.muted, 9);
    label(ctx, "I  CARGO     E  INTERACT", 1000, 696, P.muted, 9);
  }
}
function titleArt(s: ReadState, ctx: Ctx): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(672, 0, 608, 720);
  ctx.clip();
  sprite(s, ctx, "surface/sky.png", 0, -48, 1280, 560);
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 8; c++) {
      const x = 672 + c * 80,
        y = 300 + r * 80,
        band = C.BANDS[Math.min(3, Math.floor(r / 1.5))];
      sprite(s, ctx, `tiles/${band}-${(c + r) % 3}.png`, x, y);
      const shaft =
        c === 3 || (r === 2 && c >= 3 && c < 7) || (r === 4 && c > 0 && c <= 3);
      if (shaft) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x + 5, y, 70, 80, 8);
        ctx.clip();
        sprite(s, ctx, "tiles/tunnel.png", x, y);
        ctx.restore();
      } else if ((c * 3 + r * 7) % 5 === 0)
        sprite(s, ctx, `ore/${C.ORE_IDS[Math.min(9, r * 2)]}.png`, x, y);
    }
  sprite(s, ctx, "surface/upgrade-shop.png", 713, 123, 250, 187);
  sprite(s, ctx, "rocket/stage5.png", 1086, 91, 150, 225);
  miner(s, ctx, 923, 398, "drill-down", 1.4);
  sprite(s, ctx, "materials/resonite.png", 1090, 478);
  const grad = ctx.createLinearGradient(660, 0, 865, 0);
  grad.addColorStop(0, P.ink);
  grad.addColorStop(1, "#0a152000");
  ctx.fillStyle = grad;
  ctx.fillRect(660, 0, 240, 720);
  ctx.fillStyle = "#07131b35";
  ctx.fillRect(672, 0, 608, 720);
  ctx.restore();
}
function menuScreen(s: ReadState, ctx: Ctx): void {
  if (
    s.screen === "title" ||
    s.screen === "mode-select" ||
    s.screen === "size-select" ||
    s.screen === "how-to-play"
  ) {
    ctx.fillStyle = P.ink;
    ctx.fillRect(0, 0, 1280, 720);
    titleArt(s, ctx);
  } else {
    ctx.fillStyle = "#07131bdc";
    ctx.fillRect(0, 56, 1280, 664);
  }
  if (s.screen === "title") {
    label(ctx, "A SUBTERRANEAN SURVIVAL EXPEDITION", 91, 139, P.mint, 11);
    text(ctx, C.TITLE_TEXT, 81, 253, 102, P.white, 900);
    ctx.fillStyle = P.gold;
    ctx.fillRect(90, 279, 57, 4);
    text(ctx, "Depth is cheap.", 90, 330, 28, P.white, 400);
    text(ctx, "The way back costs everything.", 90, 366, 24, P.muted);
    label(ctx, "DIG  /  HAUL  /  BUILD YOUR WAY HOME", 90, 406, P.gold, 10);
    label(ctx, "SECTOR 09  ·  NO SIGNAL  ·  ONE WAY OUT", 90, 675, P.muted, 10);
    label(ctx, "01 / DEEPCORE", 1067, 686, P.gold, 10);
  } else if (s.screen === "how-to-play") {
    ctx.fillStyle = "#0a1520ee";
    ctx.fillRect(0, 0, 1280, 720);
    label(ctx, "FIELD MANUAL  /  READ BEFORE DESCENT", 88, 75, P.gold);
    text(ctx, "THE WAY HOME IS UP.", 88, 131, 45, P.white, 900);
    const sections = [
      [
        "01  CUT A PATH",
        "A / D move and cut walls. S drills down. Never up.",
        "Space / W fires your jetpack. Gravity does the rest.",
      ],
      [
        "02  MAKE THE ROUND TRIP",
        "Mine ore, return to the market, sell, refuel, upgrade.",
        "Fuel never regenerates. Leave enough for the climb.",
      ],
      [
        "03  WEIGHT IS THE ENEMY",
        "Slots limit cargo; kilograms limit lift. Heavy loads fall faster.",
        "I opens your cargo. Drop ore to escape an overload.",
      ],
      [
        "04  LISTEN TO THE ROCK",
        "Pale wisps betray gas. Lava burns. Brake before landing.",
        "Buy hull and radiator upgrades before going deeper.",
      ],
      [
        "05  BUILD AN EXIT",
        "Find Resonite and Cryenite. A scanner points to them.",
        "Install five rocket systems. Race the Core Sample home.",
      ],
      [
        "06  BANK YOUR PROGRESS",
        "E activates buildings. The Save Pad is your only save.",
        "Standard restores a save; Hardcore death deletes it.",
      ],
    ];
    sections.forEach(([head, a, b], i) => {
      const x = 88 + (i % 2) * 610,
        y = 211 + Math.floor(i / 2) * 134;
      label(ctx, head, x, y, P.mint, 11);
      text(ctx, a, x, y + 30, 15, P.white);
      text(ctx, b, x, y + 55, 14, P.muted);
    });
    text(
      ctx,
      "1–6 use supplies  ·  J jettisons the Core Sample  ·  P / Esc pauses  ·  M mutes",
      88,
      612,
      13,
      P.muted,
      400,
      MONO,
    );
  } else if (s.screen === "mode-select" || s.screen === "size-select") {
    label(
      ctx,
      s.screen === "mode-select"
        ? "EXPEDITION SETUP  /  01"
        : "EXPEDITION SETUP  /  02",
      140,
      124,
      P.mint,
    );
    text(
      ctx,
      s.screen === "mode-select" ? "CHOOSE YOUR STAKES." : "CHOOSE YOUR DEPTH.",
      136,
      203,
      48,
      P.white,
      900,
    );
    text(
      ctx,
      s.screen === "mode-select"
        ? "Same mine. Different consequences."
        : "The deeper the world, the longer the journey.",
      140,
      244,
      18,
      P.muted,
    );
    const descriptions =
      s.screen === "mode-select"
        ? [
            "Death lets you restore your last Save Pad checkpoint.",
            "Death deletes your save and ends the expedition.",
            "Return to the main menu.",
          ]
        : C.WORLD_SIZES.map(
            (size) =>
              `${Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]) * C.METERS_PER_ROW} m to the Core`,
          ).concat("Return to mode selection.");
    text(ctx, descriptions[s.menuIndex], 140, 653, 15, P.gold);
  } else {
    label(
      ctx,
      s.screen === "paused" ? "SYSTEMS ON HOLD" : "EXPEDITION COMPLETE",
      140,
      128,
      P.gold,
    );
    text(
      ctx,
      s.screen === "paused"
        ? "TAKE A BREATH."
        : s.screen === "victory"
          ? "YOU MADE IT HOME."
          : "THE MINE KEEPS IT.",
      136,
      205,
      48,
      P.white,
      900,
    );
    text(
      ctx,
      s.screen === "paused"
        ? "The rock can wait."
        : s.screen === "victory"
          ? "A light disappears into the cold sky."
          : `CAUSE  /  ${s.summary?.deathCause?.replace(/-/g, " ").toUpperCase() ?? "UNKNOWN"}`,
      140,
      253,
      17,
      P.muted,
    );
    if (s.summary) {
      const sum = s.summary;
      box(ctx, { x: 720, y: 302, w: 420, h: 291 }, "#10232d");
      label(ctx, "SHIFT REPORT", 748, 338, P.gold, 11);
      const rows = [
        ["DEEPEST", `${Math.floor(sum.deepestDepthMeters).toLocaleString()} m`],
        ["EARNED", `${sum.creditsEarned.toLocaleString()} Cr`],
        [
          "TIME",
          `${Math.floor(sum.elapsedSeconds / 60)}m ${Math.floor(sum.elapsedSeconds % 60)}s`,
        ],
        ["MODE", sum.mode.toUpperCase()],
        ["ROCKET", `${sum.componentsInstalled} / 5`],
      ];
      rows.forEach(([k, v], i) => {
        label(ctx, k, 748, 382 + i * 40, P.muted, 10);
        text(ctx, v, 951, 382 + i * 40, 19, P.white, 700, MONO);
      });
    }
  }
  menu(s).forEach((item, i) => {
    const r = menuRect(s, i);
    if (r) button(ctx, r, item, i === s.menuIndex);
  });
  if (s.screen !== "title" && s.screen !== "how-to-play")
    label(ctx, "↑ ↓ SELECT    ENTER CONFIRM    ESC BACK", 140, 698, P.muted, 9);
}
export function render(s: ReadState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (["in-mine", "paused", "victory", "game-over"].includes(s.screen)) {
    world(s, ctx);
    hud(s, ctx);
  }
  if (s.screen === "in-mine") {
    overWorld(s, ctx);
    panel(s, ctx);
  } else menuScreen(s, ctx);
}
