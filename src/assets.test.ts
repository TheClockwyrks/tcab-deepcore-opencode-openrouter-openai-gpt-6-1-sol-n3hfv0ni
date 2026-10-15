/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadImage } from "@napi-rs/canvas";
import * as C from "./constants";

const asset = (path: string) => new URL(`../assets/${path}`, import.meta.url);

describe("committed production assets", () => {
  it.each(C.MINER_STATES)(
    "%s has a complete, genuinely distinct animation cycle",
    async (state) => {
      const minimum = {
        idle: 2,
        walk: 4,
        "drill-down": 3,
        "drill-side": 3,
        jetpack: 3,
        fall: 2,
        hurt: 2,
        "fuel-out": 2,
      }[state];
      const files = (await readdir(asset(`miner/${state}/`)))
        .filter((f) => f.endsWith(".png"))
        .sort();
      expect(files.length).toBeGreaterThanOrEqual(minimum);
      const hashes = new Set<string>();
      for (const [i, file] of files.entries()) {
        expect(file).toBe(`frame${String(i).padStart(2, "0")}.png`);
        const bytes = await readFile(asset(`miner/${state}/${file}`));
        hashes.add(createHash("sha256").update(bytes).digest("hex"));
        const image = await loadImage(bytes);
        expect(image.width).toBe(C.MINER_SPRITE);
        expect(image.height).toBe(C.MINER_SPRITE);
      }
      expect(hashes.size).toBeGreaterThanOrEqual(2);
    },
  );

  it("ships non-silent PCM audio for every cue, including the score", async () => {
    for (const cue of Object.values(C.CUES)) {
      const wav = await readFile(asset(`audio/${cue}.wav`));
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
      let offset = 12,
        energy = 0,
        samples = 0;
      while (offset + 8 < wav.length) {
        const name = wav.toString("ascii", offset, offset + 4),
          length = wav.readUInt32LE(offset + 4);
        if (name === "data") {
          for (
            let p = offset + 8;
            p + 1 < Math.min(wav.length, offset + 8 + length);
            p += 2
          ) {
            energy += (wav.readInt16LE(p) / 32768) ** 2;
            samples++;
          }
          break;
        }
        offset += 8 + length + (length % 2);
      }
      expect(samples, cue).toBeGreaterThan(1000);
      expect(Math.sqrt(energy / samples), cue).toBeGreaterThan(0.0001);
    }
  });

  it("ships authored live systems with emission, curves, and color for every effect", async () => {
    const files = (await readdir(asset("fx/"))).filter((f) =>
      f.endsWith(".json"),
    );
    expect(files).toHaveLength(12);
    for (const file of files) {
      const system = JSON.parse(await readFile(asset(`fx/${file}`), "utf8"));
      expect(system.dimensions).toBe(2);
      expect(system.emitters.length).toBeGreaterThan(0);
      for (const emitter of system.emitters) {
        expect(emitter.lifetimeMs).toBeGreaterThan(0);
        expect(emitter.emission.count ?? emitter.emission.rate).toBeGreaterThan(
          0,
        );
        expect(emitter.particle.colorGradient.length).toBeGreaterThanOrEqual(2);
        expect(emitter.particle.sizeCurve).toBeDefined();
      }
    }
  });
});
