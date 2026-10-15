import * as C from "./constants";
import {
  type ReadState,
  type Rect,
  maxFuel,
  maxHull,
  slots,
  slotCap,
  loadKg,
  jet,
} from "./model";
import type { Transaction } from "./transactions";

export function menu(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: ReadState, index: number): Rect | null {
  if (index < 0 || index >= menu(s).length) return null;
  if (s.screen === "title")
    return { x: 88, y: 426 + index * 61, w: 440, h: 49 };
  if (s.screen === "how-to-play") return { x: 88, y: 628, w: 360, h: 48 };
  return { x: 140, y: 335 + index * 68, w: 460, h: 54 };
}
export type ControlName =
  Transaction | "inventory" | "pause" | "mute" | "close";
export interface Control {
  id: ControlName;
  subject: string | null;
  label: string;
  detail?: string;
  rect: Rect;
  enabled: boolean;
}
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const list: Control[] = [];
  const add = (
    id: ControlName,
    label: string,
    rect: Rect,
    enabled = true,
    subject: string | null = null,
    detail?: string,
  ) => list.push({ id, label, rect, enabled, subject, detail });
  add("inventory", "BAY [I]", { x: 1018, y: 8, w: 92, h: 39 });
  add("pause", "Ⅱ", { x: 1122, y: 8, w: 48, h: 39 });
  add("mute", s.muted ? "OFF" : "SND", { x: 1182, y: 8, w: 72, h: 39 });
  if (s.notice && s.notice.age >= C.NOTICE_DELAY)
    add("dismiss-notice", "×", { x: 335, y: 587, w: 610, h: 100 });
  const p = s.panel;
  if (!p) return list;
  add("close", "×", { x: 1030, y: 111, w: 40, h: 40 });
  if (p === "fuel-depot") {
    add(
      "buy-fuel",
      `+${C.FUEL_BUY_INCREMENT} FUEL`,
      { x: 245, y: 324, w: 250, h: 51 },
      s.miner.fuel < maxFuel(s) &&
        s.credits >=
          Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
            C.FUEL_PRICE,
    );
    add(
      "fill-fuel",
      "FILL TANK",
      { x: 245, y: 391, w: 250, h: 51 },
      s.credits > 0 && s.miner.fuel < maxFuel(s),
    );
    add(
      "buy-repair",
      `+${C.REPAIR_BUY_INCREMENT} HULL`,
      { x: 675, y: 324, w: 250, h: 51 },
      s.miner.hull < maxHull(s) &&
        s.credits >=
          Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
            C.REPAIR_PRICE,
    );
    add(
      "repair-full",
      "REPAIR FULL",
      { x: 675, y: 391, w: 250, h: 51 },
      s.credits > 0 && s.miner.hull < maxHull(s),
    );
  }
  if (p === "ore-market")
    add("sell", C.SELL, { x: 785, y: 574, w: 235, h: 50 }, slots(s) > 0);
  if (p === "upgrade-shop")
    C.TRACKS.forEach((track, i) => {
      const tier = s.tiers[track],
        max = tier === C.MAX_TIER[track],
        cost = C.UPGRADE_PRICES[tier - 1];
      add(
        "buy-upgrade",
        max ? "MAX" : `${cost.toLocaleString()} Cr`,
        { x: 820, y: 205 + i * 56, w: 200, h: 43 },
        !max && s.credits >= cost,
        track,
      );
    });
  if (p === "supply-depot")
    C.ITEMS.forEach((item, i) =>
      add(
        "buy-item",
        `${item.price.toLocaleString()} Cr`,
        { x: 820, y: 218 + i * 62, w: 200, h: 46 },
        s.credits >= item.price,
        item.id,
      ),
    );
  if (p === "launch-pad") {
    const part = C.ROCKET_COMPONENTS[s.installed];
    const material = part?.material,
      held =
        !material ||
        (material === "core-sample"
          ? s.satchel.coreSample
          : s.satchel[material] > 0);
    add(
      part ? "fabricate" : "launch",
      part ? C.FABRICATE : C.LAUNCH,
      { x: 742, y: 557, w: 278, h: 54 },
      !part || (s.credits >= part.credits && held),
    );
  }
  if (p === "inventory") {
    const held = C.MINERALS.filter((m) => (s.cargo[m.id] ?? 0) > 0);
    held.forEach((m, i) =>
      add(
        "drop-ore",
        "− DROP",
        { x: 558, y: 242 + i * 25, w: 100, h: 23 },
        true,
        m.id,
      ),
    );
    C.ITEMS.forEach((item, i) =>
      add(
        "use-item",
        C.USE,
        { x: 934, y: 237 + i * 47, w: 78, h: 33 },
        s.items[item.id] > 0,
        item.id,
      ),
    );
    if (s.satchel.coreSample)
      add("jettison", C.JETTISON, { x: 742, y: 570, w: 270, h: 46 });
  }
  return list;
}
export function controlRect(
  s: ReadState,
  id: string,
  subject: string | null,
): Rect | null {
  return (
    controls(s).find((c) => c.id === id && c.subject === subject)?.rect ?? null
  );
}
export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}
export const cargoLabel = (s: ReadState) =>
  `${slots(s)}/${slotCap(s)}  ·  ${loadKg(s)} kg${loadKg(s) >= jet(s).liftLimitKg ? "  " + C.OVERLOAD : ""}`;
export const panelTitle = (p: C.PanelId) =>
  p === "inventory" ? "CARGO & FIELD KIT" : p.toUpperCase().replace(/-/g, " ");
export function upgradeDescription(s: ReadState, track: C.TrackName): string {
  const tier = s.tiers[track],
    next = Math.min(C.MAX_TIER[track], tier + 1) - 1;
  switch (track) {
    case "fuel":
      return `${C.FUEL_TIERS[next]} fuel capacity`;
    case "hull":
      return `${C.HULL_TIERS[next]} hull integrity`;
    case "cargo":
      return `${C.CARGO_TIERS[next]} mineral slots`;
    case "drill":
      return `Power rating ${next + 1} / 5`;
    case "jetpack":
      return `${C.JETPACK_TIERS[next].liftLimitKg.toLocaleString()} kg lift · ${C.JETPACK_TIERS[next].emptyClimb} climb`;
    case "radiator":
      return `${C.RADIATOR_TIERS[next] * 100}% lava resistance`;
    case "scanner":
      return `${C.SCANNER_TIERS[next]} tile material range`;
  }
}
