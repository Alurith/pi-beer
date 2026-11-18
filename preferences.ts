import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";

const preferencesSchema = Type.Object({
  vessel: Type.Union([Type.Literal("boccale"), Type.Literal("bicchiere"), Type.Literal("alto")]),
  color: Type.Union([Type.Literal("chiara"), Type.Literal("ambrata"), Type.Literal("scura"), Type.Literal("weiss")]),
  foam: Type.Boolean(),
}, { additionalProperties: false });

export type BeerPreferences = Static<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Readonly<BeerPreferences> = Object.freeze({ vessel: "boccale", color: "chiara", foam: true });

export function parsePreferences(value: unknown): BeerPreferences {
  if (!Check(preferencesSchema, value)) throw new Error("Invalid beer preferences.");
  return value;
}

export function loadPreferences(path: string): { preferences: BeerPreferences; warning?: string } {
  try {
    return { preferences: parsePreferences(JSON.parse(readFileSync(path, "utf8"))) };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { preferences: { ...DEFAULT_PREFERENCES } };
    }
    return { preferences: { ...DEFAULT_PREFERENCES }, warning: `Could not read beer preferences. ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function savePreferences(path: string, preferences: BeerPreferences): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(preferences)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
