// Startup help layout adapted from Pi 1.5.2. Upstream MIT notice is in LICENSE.
import { getAgentDir, VERSION, keyHint, keyText, rawKeyHint, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Text, TuiAltScreen, stripTerminalSequences, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { EasterEgg3dAnimation } from "./animation.js";
import { beerLogoLines, beerModel } from "./model.js";
import { toRgb } from "./native-screen.js";
import { join } from "node:path";
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type BeerPreferences } from "./preferences.ts";

export { EasterEgg3dAnimation } from "./animation.js";
export { beerModel } from "./model.js";

type Origin = { column: number; row: number };

export class BeerHeader extends Text {
  private expanded: boolean;
  private stale = true;

  constructor(private theme: Theme, private open: (origin: Origin) => void, private preferences: () => BeerPreferences, expanded = false) {
    super("", 1, 0);
    this.expanded = expanded;
  }

  setExpanded(expanded: boolean) {
    this.expanded = expanded;
    this.invalidate();
  }

  invalidate() {
    super.invalidate();
    this.stale = true;
  }

  render(width: number) {
    if (this.stale) {
      this.stale = false;
      const hint = keyHint;
      const expandedInstructions = () => [
        hint("app.interrupt", "to interrupt"),
        hint("app.clear", "to clear"),
        rawKeyHint(`${keyText("app.clear")} twice`, "to exit"),
        hint("app.exit", "to exit (empty)"),
        hint("app.suspend", "to suspend"),
        keyHint("tui.editor.deleteToLineEnd", "to delete to end"),
        hint("app.thinking.cycle", "to cycle thinking level"),
        rawKeyHint(`${keyText("app.model.cycleForward")}/${keyText("app.model.cycleBackward")}`, "to cycle models"),
        hint("app.model.select", "to select model"),
        hint("app.tools.expand", "to expand tools"),
        hint("app.thinking.toggle", "to expand thinking"),
        hint("app.editor.external", "for external editor"),
        rawKeyHint("/", "for commands"),
        rawKeyHint("!", "to run bash"),
        rawKeyHint("!!", "to run bash (no context)"),
        hint("app.message.followUp", "to queue follow-up"),
        hint("app.message.dequeue", "to edit all queued messages"),
        hint("app.clipboard.pasteImage", "to paste files on macOS, images, or text"),
        rawKeyHint("drop files", "to attach"),
      ].join("\n");
      const compactInstructions = () => [
        hint("app.interrupt", "interrupt"),
        rawKeyHint(`${keyText("app.clear")}/${keyText("app.exit")}`, "clear/exit"),
        rawKeyHint("/", "commands"),
        rawKeyHint("!", "bash"),
        hint("app.tools.expand", "more"),
      ].join(this.theme.fg("muted", " · "));
      const [top, bottom] = beerLogoLines(this.preferences(), this.theme.getColorMode());
      const instructions = this.expanded ? expandedInstructions() : compactInstructions();
      const onboarding = this.theme.fg("dim", "Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.");
      const compactOnboarding = this.theme.fg("dim", `Press ${keyText("app.tools.expand")} to show full startup help and loaded resources.`);
      this.setText(`${top} ${this.theme.fg("dim", `v${VERSION}`)}\n${bottom} ${instructions}\n${this.expanded ? "" : `${compactOnboarding}\n`}\n${onboarding}`);
    }
    return super.render(width);
  }

  handleMouse(event: TuiMouseEvent) {
    if (event.type !== "click" || event.y < 0 || event.y > 1 || event.x < 1 || event.x > 4) return;
    this.open({ column: event.screenX - event.x + 1, row: event.screenY - event.y });
    return { handled: true };
  }
}

export default function beer(pi: ExtensionAPI) {
  let headerUI: { tui: TUI; theme: Theme } | undefined;
  let active: AbortController | undefined;
  let preferences: BeerPreferences = { ...DEFAULT_PREFERENCES };
  let header: BeerHeader | undefined;
  const preferencesPath = join(getAgentDir(), "beer-mug.json");
  const beers = [
    { value: "chiara", label: "Pale" }, { value: "ambrata", label: "Amber" },
    { value: "scura", label: "Dark" }, { value: "weiss", label: "Weiss" },
  ] satisfies { value: BeerPreferences["color"]; label: string }[];
  const vessels = [
    { value: "boccale", label: "Classic mug" }, { value: "bicchiere", label: "Handleless glass" },
    { value: "alto", label: "Tall slim glass" },
  ] satisfies { value: BeerPreferences["vessel"]; label: string }[];

  async function configure(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("/beer-config requires interactive terminal mode.", "warning");
      return;
    }
    if (active || headerUI?.tui.hasOverlay()) return;
    const controller = new AbortController();
    active = controller;
    const select = (title: string, options: string[]) => ctx.ui.select(title, options, { signal: controller.signal });
    try {
      while (!controller.signal.aborted) {
        const categories = [
          `Beer: ${beers.find(beer => beer.value === preferences.color)?.label}`,
          `Vessel: ${vessels.find(vessel => vessel.value === preferences.vessel)?.label}`,
          `Foam: ${preferences.foam ? "Yes" : "No"}`,
          "Reset to defaults", "Close",
        ];
        const category = await select("Beer settings", categories);
        if (controller.signal.aborted || category === undefined || category === "Close") break;
        let next: BeerPreferences | undefined;
        if (category === categories[0]) {
          const selected = await select("Beer", beers.map(beer => beer.label));
          const choice = beers.find(beer => beer.label === selected);
          if (choice) next = { ...preferences, color: choice.value };
        } else if (category === categories[1]) {
          const selected = await select("Vessel", vessels.map(vessel => vessel.label));
          const choice = vessels.find(vessel => vessel.label === selected);
          if (choice) next = { ...preferences, vessel: choice.value };
        } else if (category === categories[2]) {
          const selected = await select("Foam", ["Yes", "No"]);
          if (selected !== undefined) next = { ...preferences, foam: selected === "Yes" };
        } else if (category === "Reset to defaults") {
          next = { ...DEFAULT_PREFERENCES };
        }
        if (!next || controller.signal.aborted) continue;
        try {
          savePreferences(preferencesPath, next);
          preferences = next;
          header?.invalidate();
          headerUI?.tui.requestRender();
        } catch (error) {
          ctx.ui.notify(`Could not save beer preferences. ${error instanceof Error ? error.message : String(error)}`, "error");
        }
      }
    } finally {
      if (active === controller) active = undefined;
    }
  }

  async function open(ctx: ExtensionContext, clickedOrigin?: Origin) {
    if (ctx.mode !== "tui" || !headerUI || !(headerUI.tui instanceof TuiAltScreen)) {
      ctx.ui.notify("Beer needs Pi's fullscreen terminal mode.", "warning");
      return;
    }
    const { tui, theme } = headerUI;
    if (active || tui.hasOverlay()) return;
    const controller = new AbortController();
    active = controller;
    const screen = tui.getScreenLines();
    const logo = beerLogoLines(preferences, theme.getColorMode()).map(stripTerminalSequences);
    const logoRow = screen.findIndex((line, row) => stripTerminalSequences(line).startsWith(` ${logo[0]}`)
      && stripTerminalSequences(screen[row + 1] ?? "").startsWith(` ${logo[1]}`));
    const origin = clickedOrigin ?? (logoRow < 0 ? undefined : { column: 1, row: logoRow });
    let animation: EasterEgg3dAnimation | undefined;
    let finish: (() => void) | undefined;
    const abort = () => { animation?.dispose(); finish?.(); };
    controller.signal.addEventListener("abort", abort, { once: true });
    try {
      const reported = await tui.queryTerminalColors({ timeoutMs: 100 });
      if (controller.signal.aborted || tui.hasOverlay()) return;
      const colors = {
        foreground: reported.foreground ? [reported.foreground.r, reported.foreground.g, reported.foreground.b] : toRgb(theme.colors.text),
        background: reported.background ? [reported.background.r, reported.background.g, reported.background.b] : theme.appearance === "dark" ? [0, 0, 0] : [255, 255, 255],
      };
      await ctx.ui.custom<void>((overlayTui, overlayTheme, keybindings, done) => {
        finish = done;
        if (controller.signal.aborted || overlayTui.hasOverlay()) {
          done();
          return new Text("", 0, 0);
        }
        animation = new EasterEgg3dAnimation(overlayTui, screen, beerModel(preferences, origin), colors, done, overlayTheme, keybindings);
        return animation;
      }, { overlay: true, overlayOptions: { anchor: "top-left", width: "100%", maxHeight: "100%", margin: 0 } });
    } catch (error) {
      ctx.ui.notify(`Beer failed. ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      animation?.dispose();
      controller.signal.removeEventListener("abort", abort);
      if (active === controller) active = undefined;
    }
  }

  pi.on("session_start", (_event, ctx) => {
    active?.abort();
    headerUI = undefined;
    header = undefined;
    const loaded = loadPreferences(preferencesPath);
    preferences = loaded.preferences;
    if (loaded.warning) ctx.ui.notify(loaded.warning, "warning");
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((tui, theme) => {
      headerUI = { tui, theme };
      header = new BeerHeader(theme, origin => { void open(ctx, origin); }, () => preferences, ctx.ui.getToolsExpanded());
      return header;
    });
  });
  pi.on("session_shutdown", () => { active?.abort(); headerUI = undefined; header = undefined; });
  pi.registerCommand("beer-config", { description: "Configure beer, glass and foam", handler: async (_args, ctx) => { await configure(ctx); } });
  pi.registerCommand("beer", { description: "Play the fullscreen beer logo animation", handler: async (_args, ctx) => { await open(ctx); } });
}
