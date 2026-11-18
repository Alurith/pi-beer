import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const agentDir = mkdtempSync(join(tmpdir(), "pi-beer-test-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
process.on("exit", () => rmSync(agentDir, { recursive: true, force: true }));
import { mock } from "node:test";

const root = process.env.PI_PACKAGE_ROOT;
assert.ok(root, "Set PI_PACKAGE_ROOT to the installed pi-coding-agent package directory");
const requireHost = createRequire(resolve(root, "package.json"));
const { createJiti } = requireHost("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false, alias: {
  "@earendil-works/pi-coding-agent": resolve(root, "dist/index.js"),
  "@earendil-works/pi-tui": requireHost.resolve("@earendil-works/pi-tui"),
  "typebox/value": requireHost.resolve("typebox/value"),
  "typebox": requireHost.resolve("typebox"),
} });
const ui = await jiti.import("@earendil-works/pi-tui");
const host = await jiti.import("@earendil-works/pi-coding-agent");
const themeModule = await jiti.import(resolve(root, "dist/modes/interactive/theme/theme.js"));
const { KeybindingsManager } = await jiti.import(resolve(root, "dist/core/keybindings.js"));
const { EasterEgg3dAnimation: NativeAnimation } = await jiti.import(resolve(root, "dist/modes/interactive/components/easter-egg-3d.js"));
const { piLogoLines } = await jiti.import(resolve(root, "dist/modes/interactive/components/pi-logo.js"));
const { default: beer, BeerHeader, EasterEgg3dAnimation } = await jiti.import("./index.ts");
const { beerModel, beerLogoLines, VESSELS, PALETTES } = await jiti.import("./model.js");
const { DEFAULT_PREFERENCES, loadPreferences, savePreferences, parsePreferences } = await jiti.import("./preferences.ts");
const BEER_PIXELS = VESSELS.boccale;
const BEER_COLORS = PALETTES.chiara;
const defaults = { ...DEFAULT_PREFERENCES };
const keys = new KeybindingsManager();
ui.setKeybindings(keys);
host.initTheme("dark");
const themeColors = Object.fromEntries(Object.entries(themeModule.theme.colors).map(([token, color]) => [token, ui.colorToHex(color)]));
const makeTheme = (mode, light = false) => new host.Theme({
  ...themeColors, text: light ? "#202020" : "#dedede", muted: "#888888", dim: "#666666",
}, {}, mode, { appearance: light ? "light" : "dark" });
let theme = makeTheme("truecolor");
themeModule.setThemeInstance(theme);

assert.deepEqual(BEER_PIXELS, ["ccc.", "bbby", "bb.y", "bbb."]);
assert.deepEqual(BEER_COLORS, { c: [255, 250, 235], b: [234, 170, 35], y: [255, 220, 130] });
const model = beerModel(defaults, { column: 1, row: 1 });
assert.equal(model.columns, 4);
assert.equal(model.rows, 4);
assert.equal(model.cameraDistance, 10);
assert.equal(model.widthShare, 0.35);
assert.equal(model.puzzleMoves(0.39), 2);
assert.equal(model.puzzleMoves(0.4), 1);
assert.deepEqual(model.blocks, BEER_PIXELS.flatMap((row, y) => [...row].flatMap((key, x) =>
  BEER_COLORS[key] ? [{ home: [x, y, 0], color: BEER_COLORS[key] }] : [])));
for (const mode of ["truecolor", "256color"]) {
  const logo = beerLogoLines(defaults, mode);
  assert.deepEqual(logo.map(ui.stripTerminalSequences), ["▀▀▀▄", "██▄▀"]);
  assert.ok(logo.every(line => ui.visibleWidth(line) === 4));
  if (mode === "256color") assert.ok(!logo.join("").includes(";2;"));
}
assert.deepEqual(beerLogoLines(defaults, "truecolor"), [
  "\x1b[38;2;255;250;235m\x1b[48;2;234;170;35m▀▀▀\x1b[0m\x1b[38;2;255;220;130m▄\x1b[0m",
  "\x1b[38;2;234;170;35m██▄\x1b[0m\x1b[38;2;255;220;130m▀\x1b[0m",
]);

function decodeLogo(lines) {
  const pixels = Array.from({ length: 4 }, () => Array(4).fill(undefined));
  lines.forEach((line, row) => {
    let foreground, background, column = 0;
    for (const token of line.matchAll(/\x1b\[([\d;]*)m|([^\x1b])/gu)) {
      if (token[1] !== undefined) {
        const codes = token[1].split(";").map(Number);
        if (codes[0] === 0) { foreground = undefined; background = undefined; }
        else if (codes[0] === 38) foreground = codes.slice(2);
        else if (codes[0] === 48) background = codes.slice(2);
      } else {
        const glyph = token[2];
        pixels[row * 2][column] = glyph === "█" || glyph === "▀" ? foreground : undefined;
        pixels[row * 2 + 1][column] = glyph === "█" || glyph === "▄" ? foreground : glyph === "▀" ? background : undefined;
        column++;
      }
    }
  });
  return pixels;
}
let combinations = 0;
const aspects = [];
for (const vessel of ["boccale", "bicchiere", "alto"]) {
  const occupied = beerModel({ ...defaults, vessel }).blocks;
  aspects.push((Math.max(...occupied.map(block => block.home[0])) - Math.min(...occupied.map(block => block.home[0])) + 1) / 4);
  for (const color of ["chiara", "ambrata", "scura", "weiss"]) {
    for (const foam of [true, false]) {
      const preferences = { vessel, color, foam };
      const configured = beerModel(preferences, { column: 1, row: 2 });
      const logo = beerLogoLines(preferences, "truecolor");
      assert.equal(logo.length, 2);
      assert.ok(logo.every(line => ui.visibleWidth(line) === 4));
      const expected = VESSELS[vessel].map(row => [...row].map(key => key === "." ? undefined : PALETTES[color][key === "c" && !foam ? "b" : key]));
      assert.deepEqual(decodeLogo(logo), expected, JSON.stringify(preferences));
      const modelPixels = Array.from({ length: 4 }, () => Array(4).fill(undefined));
      for (const { home: [x, y], color } of configured.blocks) modelPixels[y][x] = color;
      assert.deepEqual(modelPixels, expected);
      assert.equal(configured.cameraDistance, model.cameraDistance);
      assert.equal(configured.radius, model.radius);
      assert.equal(configured.widthShare, model.widthShare);
      assert.deepEqual(configured.origin, { column: 1, row: 2 });
      assert.ok(beerLogoLines(preferences, "256color").every(line => ui.visibleWidth(line) === 4 && !line.includes(";2;")));
      combinations++;
    }
  }
}
assert.deepEqual(aspects, [1, 0.75, 0.5], "three distinct vessel aspect ratios");
const preferencesFile = join(agentDir, "beer-mug.json");
assert.deepEqual(loadPreferences(preferencesFile), { preferences: defaults });
assert.equal(readdirSync(agentDir).length, 0, "missing preferences are not written");
for (const invalid of [null, {}, { ...defaults, color: "#ffffff" }, { ...defaults, foam: "true" }, { ...defaults, extra: true }]) {
  assert.throws(() => parsePreferences(invalid));
}
for (const raw of ["broken json", JSON.stringify({ ...defaults, color: "custom" })]) {
  writeFileSync(preferencesFile, raw);
  const loaded = loadPreferences(preferencesFile);
  assert.deepEqual(loaded.preferences, defaults);
  assert.ok(loaded.warning);
  assert.equal(readFileSync(preferencesFile, "utf8"), raw, "invalid file is not overwritten");
}
rmSync(preferencesFile);
mkdirSync(preferencesFile);
assert.ok(loadPreferences(preferencesFile).warning, "unreadable record warns");
assert.throws(() => savePreferences(preferencesFile, defaults));
assert.deepEqual(readdirSync(agentDir), ["beer-mug.json"], "failed atomic save cleans temporary file");
rmSync(preferencesFile, { recursive: true });
const stored = { vessel: "alto", color: "weiss", foam: false };
savePreferences(preferencesFile, stored);
assert.deepEqual(loadPreferences(preferencesFile), { preferences: stored });
assert.deepEqual(JSON.parse(readFileSync(preferencesFile, "utf8")), stored);
assert.deepEqual(readdirSync(agentDir), ["beer-mug.json"]);
rmSync(preferencesFile);

const interactiveSource = readFileSync(resolve(root, "dist/modes/interactive/interactive-mode.js"), "utf8");
const nativeHelpSource = interactiveSource.slice(interactiveSource.indexOf("            const withLogo ="), interactiveSource.indexOf("            const header = new BuiltInHeader"));
const nativeHelp = new Function("theme", "keyHint", "keyText", "rawKeyHint", "piLogoLines", "showLogo", "showDetails", `${nativeHelpSource}
return [
  withLogo(compactInstructions()) + '\\n' + compactOnboarding() + '\\n\\n' + onboarding(),
  withLogo(expandedInstructions()) + '\\n\\n' + onboarding(),
];`.replaceAll("this.version", JSON.stringify(host.VERSION)));
const help = nativeHelp(theme, host.keyHint, host.keyText, host.rawKeyHint, piLogoLines, true, true);
const normalizeLogo = lines => lines.map((line, index) => index < 2
  ? ui.sliceByColumn(ui.stripTerminalSequences(line), 0, 1) + "LOGO" + ui.sliceByColumn(ui.stripTerminalSequences(line), 5)
  : ui.stripTerminalSequences(line));
let clicked;
const header = new BeerHeader(theme, origin => { clicked = origin; }, () => defaults);
for (const expanded of [false, true]) {
  header.setExpanded(expanded);
  for (const width of [20, 80, 120]) {
    assert.deepEqual(normalizeLogo(header.render(width)), normalizeLogo(new ui.Text(help[Number(expanded)], 1, 0).render(width)), `native startup help, expanded=${expanded}, width=${width}`);
  }
}
header.handleMouse({ type: "click", x: 4, y: 1, screenX: 24, screenY: 11 });
assert.deepEqual(clicked, { column: 21, row: 10 });
clicked = undefined;
for (const [x, y] of [[0, 0], [5, 0], [1, 2], [1, -1]]) header.handleMouse({ type: "click", x, y, screenX: x, screenY: y });
assert.equal(clicked, undefined);
for (const width of [8, 20, 80]) assert.ok(header.render(width).every(line => ui.visibleWidth(line) <= width));

let now = 0;
mock.method(performance, "now", () => now);
mock.timers.enable({ apis: ["setInterval"] });
let parityFrames = 0;
try {
  for (const mode of ["truecolor", "256color"]) {
    for (const light of [false, true]) {
      theme = makeTheme(mode, light);
      themeModule.setThemeInstance(theme);
      const colors = { foreground: light ? [24, 32, 40] : [220, 230, 240], background: light ? [245, 242, 233] : [12, 17, 23] };
      for (const size of [[80, 24], [42, 18]]) {
        for (const origin of [{ column: 1, row: 1 }, undefined]) {
          now = 0;
          const terminal = { rows: size[1] };
          const tui = { terminal, requestRender() {} };
          const screen = ["colored \x1b[31mred\x1b[0m and 界 and é", ...beerLogoLines(defaults, mode), "\x1b[7minverse\x1b[27m \x1b[48;2;70;80;90mbackground\x1b[0m"];
          const model = beerModel(defaults, origin);
          const native = new NativeAnimation(tui, screen, model, colors, () => {});
          const adapted = new EasterEgg3dAnimation(tui, screen, model, colors, () => {}, theme, keys);
          try {
            for (const time of [0, 0.08, 0.25, 0.65, 1.2, 1.5, 2.7, 4.5, 5.3, 7.9, 8.3, 9.2, 13.7]) {
              now = time * 1000;
              assert.deepEqual(adapted.render(size[0]), native.render(size[0]), `native frame ${mode}, light=${light}, size=${size}, origin=${Boolean(origin)}, time=${time}`);
              parityFrames++;
            }
            native.close(); adapted.close();
            for (const offset of [0, 100, 300, 600, 900, 1100]) {
              now = 13700 + offset;
              assert.deepEqual(adapted.render(size[0]), native.render(size[0]), `native return at ${offset}ms`);
              parityFrames++;
            }
            terminal.rows += 3;
            adapted.invalidate(); native.invalidate();
            assert.deepEqual(adapted.render(size[0] + 7), native.render(size[0] + 7), "native resize and invalidate");
            parityFrames++;
          } finally { adapted.dispose(); native.finish(); }
        }
      }
    }
  }

  theme = makeTheme("truecolor");
  themeModule.setThemeInstance(theme);
  now = 0;
  const remappedKeys = new KeybindingsManager({ "tui.select.cancel": "ctrl+q" });
  let finished = 0;
  const remapped = new EasterEgg3dAnimation({ terminal: { rows: 24 }, requestRender() {} }, [], beerModel(defaults),
    { foreground: [240, 240, 240], background: [0, 0, 0] }, () => { finished++; }, theme, remappedKeys);
  now = 6000;
  assert.match(ui.stripTerminalSequences(remapped.render(80)[22]), /ctrl\+q to return/);
  remapped.handleInput("\x1b"); assert.equal(remapped.exit, undefined, "cancel uses injected keybindings");
  remapped.handleInput("\x11"); assert.ok(remapped.exit);
  remapped.dispose(); remapped.dispose(); assert.equal(finished, 1, "disposal completes exactly once");
  now = 0;
  let renders = 0;
  let captures = 0;
  const tui = new ui.TuiAltScreen({ rows: 24, columns: 80, hideCursor() {} }, false);
  mock.method(tui, "requestRender", () => { renders++; });
  let capturedScreen = ["actual screen", " " + beerLogoLines(defaults, "truecolor")[0], " " + beerLogoLines(defaults, "truecolor")[1]];
  mock.method(tui, "getScreenLines", () => { assert.equal(tui.hasOverlay(), false, "capture precedes overlay"); captures++; return capturedScreen; });
  mock.method(tui, "queryTerminalColors", async () => ({ foreground: { r: 200, g: 210, b: 220 }, background: { r: 11, g: 22, b: 33 } }));
  const events = new Map();
  let command, overlay, installedHeader, customCalls = 0;
  const commands = new Map();
  const notices = [];
  const ctx = { mode: "tui", ui: {
    notify: (...args) => notices.push(args), getToolsExpanded: () => false,
    setHeader: factory => { installedHeader = factory(tui, theme); return installedHeader; },
    custom: (factory, options) => new Promise(resolve => {
      customCalls++;
      assert.deepEqual(options, { overlay: true, overlayOptions: { anchor: "top-left", width: "100%", maxHeight: "100%", margin: 0 } });
      let handle;
      const done = () => { handle?.hide(); overlay?.dispose(); resolve(); };
      overlay = factory(tui, theme, keys, done);
      handle = tui.showOverlay(overlay, options.overlayOptions);
    }),
  } };
  beer({ on: (event, handler) => events.set(event, handler), registerCommand: (name, options) => { commands.set(name, options.handler); if (name === "beer") command = options.handler; } });
  events.get("session_start")({}, ctx);
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  mock.timers.tick(100); assert.equal(renders, 0, "header has no idle animation");
  let run = command("", ctx); await flush(); await command("", ctx);
  assert.equal(customCalls, 1);
  assert.equal(captures, 1);
  assert.equal(overlay.screen, capturedScreen);
  assert.deepEqual(overlay.background, [11, 22, 33]);
  assert.deepEqual(overlay.foreground, [200, 210, 220]);
  assert.deepEqual(overlay.model.origin, { column: 1, row: 1 });
  now = 6000;
  const frame = overlay.render(80).map(ui.stripTerminalSequences);
  assert.match(frame[22], /escape to return/);
  assert.ok(!frame.join("").includes("actual screen"));
  overlay.handleInput("\x1b");
  assert.equal(tui.hasOverlay(), true, "first cancel plays native return");
  now += 1101; mock.timers.tick(34); await run;
  assert.equal(tui.hasOverlay(), false);
  const stopped = renders; mock.timers.tick(100); assert.equal(renders, stopped);
  run = command("", ctx); await flush();
  overlay.handleMouse({ type: "click" }); overlay.handleInput("\x03"); await run;
  assert.equal(tui.hasOverlay(), false, "second cancel skips native return");
  run = command("", ctx); await flush(); events.get("session_shutdown")(); await run;
  assert.equal(tui.hasOverlay(), false, "shutdown dismisses overlay");
  assert.equal(overlay.timer, undefined);
  events.get("session_start")({}, ctx);
  const competing = tui.showOverlay(new ui.Text("other", 0, 0));
  await command("", ctx); assert.equal(customCalls, 3, "competing overlay is not covered"); competing.hide();
  const custom = ctx.ui.custom;
  ctx.ui.custom = async () => { throw new Error("overlay unavailable"); };
  await command("", ctx); assert.match(notices.at(-1)[0], /overlay unavailable/);
  ctx.ui.custom = custom;
  run = command("", ctx); await flush(); overlay.finish(); await run;
  assert.equal(overlay.timer, undefined, "done disposes timer");
  run = command("", ctx); await flush(); overlay.dispose(); await run;
  assert.equal(tui.hasOverlay(), false, "external disposal resolves interaction");
  run = command("", ctx); await flush(); overlay.finish(); await run;
  assert.equal(tui.hasOverlay(), false, "external disposal does not block reopening");
  const query = tui.queryTerminalColors;
  let reportColors;
  mock.method(tui, "queryTerminalColors", () => new Promise(resolve => { reportColors = resolve; }));
  const beforeCanceledQuery = customCalls;
  run = command("", ctx);
  events.get("session_shutdown")();
  reportColors({}); await run;
  assert.equal(customCalls, beforeCanceledQuery, "shutdown during color query never mounts an overlay");
  mock.method(tui, "queryTerminalColors", query);
  events.get("session_start")({}, ctx);
  run = command("", ctx); await flush(); overlay.finish(); await run;
  await command("", { ...ctx, mode: "rpc" }); assert.match(notices.at(-1)[0], /fullscreen/);
  const configure = commands.get("beer-config");
  await configure("", { ...ctx, mode: "rpc" });
  assert.match(notices.at(-1)[0], /interactive/);
  const selections = [];
  const menus = [];
  ctx.ui.select = async (title, options) => {
    menus.push({ title, options });
    const selection = selections.shift();
    assert.ok(selection === undefined || options.includes(selection), `offered selection ${selection}`);
    return selection;
  };
  const originalHeader = installedHeader.render(120);
  await configure("", ctx);
  assert.equal(readdirSync(agentDir).length, 0, "root cancellation writes nothing");
  selections.push("Beer: Pale", undefined, "Close");
  await configure("", ctx);
  assert.equal(readdirSync(agentDir).length, 0, "submenu cancellation writes nothing");
  assert.deepEqual(installedHeader.render(120), originalHeader);
  selections.push("Beer: Pale", "Weiss", "Vessel: Classic mug", "Tall slim glass", "Foam: Yes", "No", "Close");
  await configure("", ctx);
  assert.deepEqual(loadPreferences(preferencesFile).preferences, stored);
  assert.deepEqual(menus[0], { title: "Beer settings", options: ["Beer: Pale", "Vessel: Classic mug", "Foam: Yes", "Reset to defaults", "Close"] });
  assert.ok(installedHeader.render(120)[0].includes(beerLogoLines(stored, "truecolor")[0]), "successful save refreshes header");
  installedHeader.setExpanded(true);
  selections.push("Beer: Weiss", "Dark", "Close");
  await configure("", ctx);
  assert.match(installedHeader.render(120).map(ui.stripTerminalSequences).join("\n"), /to delete to end/, "refresh preserves expanded help");
  const darkTall = { ...stored, color: "scura" };
  capturedScreen = ["actual screen", ...beerLogoLines(darkTall, "truecolor").map(line => " " + line)];
  run = command("", ctx); await flush();
  assert.deepEqual(overlay.model.blocks, beerModel(darkTall).blocks);
  assert.deepEqual(overlay.model.origin, { column: 1, row: 1 }, "command locates configured slender logo");
  const beforeOverlayMenu = menus.length;
  await configure("", ctx);
  assert.equal(menus.length, beforeOverlayMenu, "menu cannot overlap animation");
  overlay.finish(); await run;
  const select = ctx.ui.select;
  let resolveSelection;
  ctx.ui.select = (_title, _options, { signal }) => new Promise(resolve => {
    resolveSelection = resolve;
    signal.addEventListener("abort", () => resolve(undefined), { once: true });
  });
  const pendingMenu = configure("", ctx);
  const beforeMenuOverlay = customCalls;
  await command("", ctx);
  await configure("", ctx);
  assert.equal(customCalls, beforeMenuOverlay, "animation cannot overlap menu");
  resolveSelection(undefined); await pendingMenu;
  const abortedMenu = configure("", ctx);
  events.get("session_shutdown")();
  await abortedMenu;
  ctx.ui.select = select;
  savePreferences(preferencesFile, stored);
  events.get("session_start")({ reason: "reload" }, ctx);
  assert.ok(installedHeader.render(120)[0].includes(beerLogoLines(stored, "truecolor")[0]), "reload reads saved preferences");
  const beforeFailure = installedHeader.render(120);
  rmSync(preferencesFile);
  mkdirSync(preferencesFile);
  selections.push("Beer: Weiss", "Amber", "Close");
  await configure("", ctx);
  assert.match(notices.at(-1)[0], /Could not save/);
  assert.deepEqual(installedHeader.render(120), beforeFailure, "failed save does not update header");
  assert.deepEqual(readdirSync(agentDir), ["beer-mug.json"]);
  rmSync(preferencesFile, { recursive: true });
  selections.push("Reset to defaults", "Close");
  await configure("", ctx);
  assert.deepEqual(loadPreferences(preferencesFile).preferences, defaults);
  assert.deepEqual(installedHeader.render(120), originalHeader, "reset restores original header");
  writeFileSync(preferencesFile, "invalid");
  events.get("session_start")({ reason: "reload" }, ctx);
  assert.match(notices.at(-1)[0], /Could not read/);
  assert.equal(readFileSync(preferencesFile, "utf8"), "invalid");
  assert.deepEqual(installedHeader.render(120), originalHeader);
} finally { mock.timers.reset(); mock.restoreAll(); }

for (const file of readdirSync(new URL(".", import.meta.url)).filter(name => /\.(js|ts)$/.test(name))) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.ok(source.split("\n").length < 1000, `${file} stays below 1000 lines`);
  for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
    assert.ok(match[1].startsWith("./") || ["@earendil-works/pi-tui", "@earendil-works/pi-coding-agent", "typebox", "typebox/value"].includes(match[1]) || match[1].startsWith("node:"), `public production import in ${file}: ${match[1]}`);
  }
}
console.log(`Passed ${parityFrames} byte-identical native frames, ${combinations} model/static combinations, exact default mug, persistence/errors, menu/cancel/reset/reload, native help, fullscreen capture/colors, input, resize, and lifecycle checks.`);
