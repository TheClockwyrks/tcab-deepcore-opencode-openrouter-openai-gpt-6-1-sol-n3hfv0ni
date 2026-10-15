import type { Game, InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import "./style.css";
import * as C from "./constants";
import {
  type DeepcoreState,
  copy,
  initialState,
  depth,
  grounded,
  loadKg,
  slots,
  jet,
  maxFuel,
  maxHull,
} from "./model";
import { createDebug, type DeepcoreDebugApi } from "./debug";
import { render } from "./render";
import { advance, nearbyBuilding } from "./simulation";
import {
  transact,
  start,
  restore,
  saved,
  type Transaction,
  end,
} from "./transactions";
import { menu, menuRect, controls, contains, type Control } from "./interface";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";

export type { DeepcoreState, DeepcoreDebugApi };
export const BACKGROUND = "#0a1520";

const imageUrls = import.meta.glob<string>(
  "../assets/{miner,tiles,hazards,ore,materials,surface,rocket,icons}/**/*.png",
  { eager: true, query: "?url&no-inline", import: "default" },
);
const particleUrls = import.meta.glob<string>("../assets/fx/*.json", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
const audioUrls = import.meta.glob<string>("../assets/audio/*.wav", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
// Vite emits every imported resource beside the entry bundle under assets/.
// In development its URLs point to the authored assets/ tree instead. Both
// forms can be handed to the engine as paths below its relative asset root.
function relativeAsset(url: string): string {
  // With a relative Vite base, production imports may be materialized as
  // `new URL(file, import.meta.url).href`. Keep only the path below assets/;
  // the engine adds its document-relative root and performs every request.
  const marker = url.lastIndexOf("/assets/");
  if (marker >= 0) return url.slice(marker + "/assets/".length);
  const clean = url.replace(/^\.?\//, "");
  return clean.startsWith("assets/") ? clean.slice("assets/".length) : clean;
}
async function initialize(
  api: InitApi<DeepcoreState>,
): Promise<[DeepcoreState, DeepcoreDebugApi]> {
  const s = initialState();
  s.hasSave = saved();
  for (const action of C.ACTION_NAMES)
    api.input.register(action, { keys: [...C.ACTIONS[action]] });
  await Promise.all([
    ...Object.entries(imageUrls).map(async ([path, url]) => {
      const key = path.replace("../assets/", "");
      s.images[key] = await api.assets.loadImage(relativeAsset(url));
      if (key.startsWith("miner/")) {
        const state = key.split("/")[1];
        s.frames[state] = (s.frames[state] ?? 0) + 1;
      }
    }),
    ...Object.entries(particleUrls).map(async ([path, url]) => {
      const name = path.split("/").pop()!.replace(".json", "");
      s.particles[name] = JSON.parse(
        await (await api.assets.load(relativeAsset(url))).text(),
      ) as ParticleSystem;
    }),
    ...Object.values(C.CUES).map(async (name) => {
      const url = audioUrls[`../assets/audio/${name}.wav`];
      await api.audio.load(name, relativeAsset(url));
    }),
  ]);
  const diag: Record<
    string,
    (s: Parameters<typeof copy>[0]) => string | number | boolean
  > = {
    screen: (s) => s.screen,
    panel: (s) => s.panel ?? "none",
    mode: (s) => s.mode,
    size: (s) => s.worldSize,
    position: (s) => `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)}`,
    velocity: (s) => `${s.miner.vx.toFixed(1)}, ${s.miner.vy.toFixed(1)}`,
    animation: (s) => s.miner.state,
    facing: (s) => s.miner.facing,
    grounded,
    fuel: (s) => `${s.miner.fuel.toFixed(1)} / ${maxFuel(s)}`,
    hull: (s) => `${s.miner.hull.toFixed(1)} / ${maxHull(s)}`,
    drilling: (s) => {
      const d = debug.snapshot(s).miner.drilling;
      return d
        ? `${d.col}, ${d.row} ${d.dir} ${(d.progress * 100).toFixed(0)}%`
        : "none";
    },
    credits: (s) => s.credits,
    depth: (s) => depth(s),
    cargo: (s) => `${slots(s)} slots, ${loadKg(s)} kg`,
    overload: (s) => loadKg(s) >= jet(s).liftLimitKg,
    satchel: (s) =>
      `${s.satchel.resonite} R / ${s.satchel.cryenite} C / ${s.satchel.coreSample ? "CORE" : "—"}`,
    tiers: (s) => C.TRACKS.map((t) => `${t}:${s.tiers[t]}`).join(" "),
    core: (s) => s.coreTimer ?? "none",
    scanner: (s) => {
      const scan = debug.snapshot(s).scanner;
      return scan.locked
        ? `${scan.target} ${scan.distanceTiles?.toFixed(1)}`
        : "no lock";
    },
  };
  const debug = createDebug();
  for (const [name, read] of Object.entries(diag))
    api.diagnostics.register(name, read);
  return [s, debug];
}
function choose(s: DeepcoreState): DeepcoreState {
  const choice = menu(s)[s.menuIndex];
  const go = (screen: C.ScreenName, index = 0) => {
    s.screen = screen;
    s.menuIndex = index;
    s.panel = null;
    return s;
  };
  if (s.screen === "title") {
    if (choice === C.TITLE_ITEMS[0]) return restore(s);
    return go(choice === C.TITLE_ITEMS[1] ? "mode-select" : "how-to-play");
  }
  if (s.screen === "mode-select") {
    if (s.menuIndex === 2) return go("title", s.hasSave ? 1 : 0);
    s.mode = C.MODES[s.menuIndex];
    return go("size-select");
  }
  if (s.screen === "size-select") {
    if (s.menuIndex === 3) return go("mode-select", C.MODES.indexOf(s.mode));
    s.worldSize = C.WORLD_SIZES[s.menuIndex];
    return start(s);
  }
  if (s.screen === "how-to-play") return go("title", s.hasSave ? 2 : 1);
  if (s.screen === "paused") {
    if (s.menuIndex === 0) return go("in-mine");
    if (s.menuIndex === 1) return start(s);
    return go("title", s.hasSave ? 1 : 0);
  }
  if (s.screen === "victory" || s.screen === "game-over") {
    if (s.menuIndex === 1) return go("title", s.hasSave ? 1 : 0);
    if (s.screen === "game-over" && s.mode === "standard" && s.hasSave)
      return restore(s);
    return start(s);
  }
  return s;
}
function back(s: DeepcoreState): DeepcoreState {
  if (s.screen === "paused") {
    s.screen = "in-mine";
    s.menuIndex = 0;
  } else if (s.screen === "in-mine") {
    if (s.panel) s.panel = null;
    else {
      s.screen = "paused";
      s.menuIndex = 0;
    }
  } else if (s.screen === "size-select") {
    s.screen = "mode-select";
    s.menuIndex = C.MODES.indexOf(s.mode);
  } else if (s.screen === "mode-select") {
    s.screen = "title";
    s.menuIndex = s.hasSave ? 1 : 0;
  } else if (s.screen === "how-to-play") {
    s.screen = "title";
    s.menuIndex = s.hasSave ? 2 : 1;
  }
  return s;
}
function control(s: DeepcoreState, c: Control, api: UpdateApi): DeepcoreState {
  if (!c.enabled) return s;
  switch (c.id) {
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      s.panelIndex = 0;
      break;
    case "pause":
      return back(s);
    case "mute":
      api.audio.setMuted(!api.audio.muted());
      break;
    case "close":
      s.panel = null;
      break;
    default:
      transact(s, c.id as Transaction, c.subject);
  }
  return s;
}
function update(
  state: Parameters<typeof copy>[0],
  api: UpdateApi,
  dt: number,
): DeepcoreState {
  let s = copy(state);
  s.simTime += dt;
  const pressed = Object.fromEntries(
    C.ACTION_NAMES.map((name) => [name, api.input.pressed(name)]),
  ) as Record<C.ActionName, boolean>;
  if (pressed.mute) api.audio.setMuted(!api.audio.muted());
  if (pressed.pause) s = back(s);
  if (s.screen === "in-mine") {
    if (pressed.inventory) {
      s.panel = s.panel === "inventory" ? null : "inventory";
      s.panelIndex = 0;
    }
    if (pressed.jettison) transact(s, "jettison");
    C.ITEM_IDS.forEach((id, i) => {
      if (pressed[`supply${i + 1}` as C.ActionName])
        transact(s, "use-item", id);
    });
    if (s.panel) {
      const list = controls(s).filter(
        (c) =>
          c.enabled &&
          !["inventory", "pause", "mute", "dismiss-notice", "close"].includes(
            c.id,
          ),
      );
      if (pressed.down)
        s.panelIndex = (s.panelIndex + 1) % Math.max(1, list.length);
      if (pressed.up)
        s.panelIndex =
          (s.panelIndex - 1 + list.length) % Math.max(1, list.length);
      if (pressed.activate && list[s.panelIndex])
        s = control(s, list[s.panelIndex], api);
    } else if (pressed.activate) {
      const b = nearbyBuilding(s);
      if (b) {
        if (b.id === "save-pad") transact(s, "save");
        else {
          s.panel = b.id;
          s.panelIndex = 0;
        }
      }
    }
    if (s.miner.hull <= 0) end(s, "hull-destroyed");
  } else if (!pressed.pause) {
    const count = menu(s).length;
    if (pressed.down) s.menuIndex = (s.menuIndex + 1) % count;
    if (pressed.up) s.menuIndex = (s.menuIndex - 1 + count) % count;
    if (pressed.activate) s = choose(s);
  }
  // Every contact gets its own press origin. A release only confirms that same
  // control, including when both edges arrive in a single engine frame.
  for (const sample of api.input.pointerSamples()) {
    const menuIndex = menu(s).findIndex((_, i) => {
      const r = menuRect(s, i);
      return r && contains(r, sample.x, sample.y);
    });
    if (menuIndex >= 0) s.menuIndex = menuIndex;
    const hit = controls(s).find(
      (c) => c.enabled && contains(c.rect, sample.x, sample.y),
    );
    let key =
      menuIndex >= 0
        ? `menu:${menuIndex}`
        : hit
          ? `${hit.id}:${hit.subject ?? ""}`
          : "";
    if (!key && s.screen === "in-mine" && !s.panel) {
      const b = nearbyBuilding(s);
      if (
        b &&
        contains(
          {
            x: b.x - s.camera.x,
            y: b.y - s.camera.y + C.HUD_H,
            w: b.w,
            h: b.h,
          },
          sample.x,
          sample.y,
        )
      )
        key = "building";
    }
    if (sample.type === "down") {
      s.pointerDown[sample.id] = key;
      if (hit?.id === "dismiss-notice") transact(s, "dismiss-notice");
      if (key === "building") {
        const b = nearbyBuilding(s);
        if (b) {
          if (b.id === "save-pad") transact(s, "save");
          else s.panel = b.id;
        }
      }
    }
    if (sample.type === "up") {
      if (key && s.pointerDown[sample.id] === key) {
        if (menuIndex >= 0) s = choose(s);
        else if (hit) s = control(s, hit, api);
      }
      delete s.pointerDown[sample.id];
    }
  }
  advance(
    s,
    {
      left: api.input.value("left") > 0,
      right: api.input.value("right") > 0,
      down: api.input.value("down") > 0,
      up: api.input.value("up") > 0,
    },
    dt,
  );
  s.muted = api.audio.muted();
  api.audio.loop(C.CUES.music);
  const active = s.screen === "in-mine" && !s.panel;
  if (active && s.miner.drilling) api.audio.loop(C.CUES.drill);
  else api.audio.stop(C.CUES.drill);
  if (active && s.miner.state === "jetpack") api.audio.loop(C.CUES.thrust);
  else api.audio.stop(C.CUES.thrust);
  for (const name of s.pendingCues) api.audio.play(name);
  s.pendingCues = [];
  return s;
}
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  initialize,
  update,
  render,
};
