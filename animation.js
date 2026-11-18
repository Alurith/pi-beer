// Adapted from Pi 1.5.2 easter-egg-3d.js. Upstream MIT notice is in LICENSE.
import { backgroundAnsi, foregroundAnsi, rgbColor } from "@earendil-works/pi-tui";
import { DEPTH, FLY_START, FLY_DURATION, START_SCALE, PUZZLE_START, PUZZLE_STEP, PUZZLE_STEPS, PUZZLE_RETURN, PUZZLE_CYCLE, shuffleSteps, FRAME_MS, DUST_DURATION, WAVE_SPREAD, WAVE_JITTER, DISSOLVE_END, BACKGROUND_FADE, EXIT_DURATION, STARS_START, STARS_FADE, STAR_DENSITY, STAR_TINTS, LOGO_COLOR_STEP, LIGHT_HALO_STRENGTH, STAR_ALPHA_LEVELS, STAR_FLICKER_LEVELS, HINT_FADE, DOT_BITS, BRAILLE, clamp01, smooth, easeOut, mix, hash, isLight, toRgb, glyphInk, parseScreen, spinPhase, spinAngle } from "./native-screen.js";
import { BlockRaster } from "./raster.js";
function formatKeyText(key) {
    return key.split("/").map((key) => key.split("+")
        .map((part) => process.platform === "darwin" && part.toLowerCase() === "alt" ? "option" : part)
        .join("+")).join("/");
}
export class EasterEgg3dAnimation {
    tui;
    /** The screen to dissolve, as rendered lines. */
    screen;
    model;
    foreground;
    background;
    onDone;
    startTime = performance.now();
    lastRender = performance.now();
    timer;
    exit;
    shuffle;
    screenWidth = -1;
    screenHeight = -1;
    /** Star per cell index, or undefined. */
    stars = [];
    cells = [];
    ansiCache = new Map();
    raster;
    constructor(tui, screen, model, colors, onDone, theme, keybindings) {
        this.theme = theme;
        this.keybindings = keybindings;
        this.tui = tui;
        this.screen = screen;
        this.model = model;
        this.raster = new BlockRaster(model.cameraDistance);
        this.foreground = colors.foreground;
        this.background = colors.background;
        this.onDone = onDone;
        this.timer = setInterval(() => {
            // Also stop when no longer rendered, e.g. when pi hides all overlays on exit.
            if ((this.exit && this.exitProgress() >= 1) || performance.now() - this.lastRender > 1000)
                this.finish();
            else
                this.tui.requestRender();
        }, FRAME_MS);
        this.timer.unref?.();
    }
    /** Play the exit animation. A second call skips it. */
    close() {
        if (this.exit) {
            this.finish();
            return;
        }
        const time = this.elapsed();
        const yaw = spinAngle(time);
        const turn = Math.PI * 2;
        this.exit = {
            start: performance.now(),
            time,
            yaw,
            targetYaw: Math.ceil(yaw / turn) * turn,
            offsets: this.blockOffsets(time),
        };
    }
    handleInput(data) {
        const keybindings = this.keybindings;
        if (keybindings.matches(data, "tui.select.cancel") || keybindings.matches(data, "app.clear"))
            this.close();
    }
    handleMouse(event) {
        if (event.type === "click")
            this.close();
        return { handled: true, render: false };
    }
    invalidate() {
        this.screenWidth = -1;
        this.screenHeight = -1;
        this.ansiCache.clear();
    }
    render(width) {
        const height = Math.max(1, this.tui.terminal.rows);
        const foreground = this.foreground;
        const background = this.background;
        this.lastRender = performance.now();
        if (width !== this.screenWidth || height !== this.screenHeight) {
            this.screenWidth = width;
            this.screenHeight = height;
            this.cells = this.prepareCells(width, foreground);
            this.stars = this.prepareStars(width, height);
        }
        // Dissolve time runs forward on entry and backward on exit, so the screen reassembles in reverse order.
        let dissolveTime;
        let pose;
        let hintAlpha;
        let starAlpha;
        let offsets;
        if (this.exit) {
            const progress = this.exitProgress();
            const landing = clamp01(progress / 0.8);
            const settle = 1 - smooth(landing);
            dissolveTime = Math.min(this.exit.time, DISSOLVE_END) * (1 - progress);
            pose = this.pose(width, height, this.flyProgress(this.exit.time) * settle, this.exit.time);
            pose.yaw = this.exit.yaw + (this.exit.targetYaw - this.exit.yaw) * easeOut(landing);
            pose.pitch *= settle;
            pose.roll *= settle;
            hintAlpha = this.hintAlpha(this.exit.time) * (1 - smooth(progress / 0.2));
            starAlpha = this.starAlpha(this.exit.time) * (1 - smooth(progress / 0.3));
            // Blocks are home well before the logo lands.
            const gather = 1 - smooth(progress / 0.5);
            offsets = this.exit.offsets.map(([x, y, z]) => [x * gather, y * gather, z * gather]);
        }
        else {
            const time = this.elapsed();
            dissolveTime = time;
            pose = this.pose(width, height, this.flyProgress(time), time);
            hintAlpha = this.hintAlpha(time);
            starAlpha = this.starAlpha(time);
            offsets = this.blockOffsets(time);
        }
        const { columns, rows } = this.model;
        const boxes = this.model.blocks.map((block, index) => {
            const [dx, dy, dz] = offsets[index];
            const x = block.home[0] - columns / 2 + dx;
            const y = block.home[1] - rows / 2 + dy;
            return { min: [x, y, dz - DEPTH / 2], max: [x + 1, y + 1, dz + DEPTH / 2], color: block.color };
        });
        const raster = this.raster;
        raster.render(width, height, pose, boxes, background, isLight(background) ? LIGHT_HALO_STRENGTH : 0);
        const halo = (index, base) => {
            const amount = raster.haloAmount[index];
            if (amount <= 0)
                return base;
            const color = raster.haloRgb;
            return mix(base ?? background, [color[index * 3], color[index * 3 + 1], color[index * 3 + 2]], amount);
        };
        const backgroundFade = smooth(dissolveTime / BACKGROUND_FADE);
        const textFade = smooth(dissolveTime / 0.6) * 0.3;
        // Once the screen has fully dissolved, the text layer is empty and can be skipped.
        const textActive = dissolveTime < DISSOLVE_END || backgroundFade < 1;
        const hint = this.hint(width, height, hintAlpha, background);
        const frame = Math.floor(dissolveTime * 14);
        const now = this.elapsed();
        // Star brightness is quantized, so a row only changes when one of its stars steps to another level
        // instead of on every frame.
        const starLevel = Math.round(starAlpha * STAR_ALPHA_LEVELS) / STAR_ALPHA_LEVELS;
        const starfield = (index) => {
            if (starLevel <= 0)
                return undefined;
            const star = this.stars[index];
            if (!star)
                return undefined;
            const flicker = Math.round((0.5 + 0.5 * Math.sin(now * star.speed + star.phase)) * STAR_FLICKER_LEVELS) /
                STAR_FLICKER_LEVELS;
            return {
                text: star.glyph,
                fg: mix(background, mix(foreground, star.tint, 0.5), star.strength * (0.7 + 0.3 * flicker) * starLevel),
            };
        };
        const lines = [];
        for (let row = 0; row < height; row++) {
            const cells = this.cells[row] ?? [];
            let line = "";
            let currentFg = -1;
            let currentBg = -1;
            const emit = (text, fg, bg) => {
                const fgKey = fg ? this.pack(fg) : -1;
                const bgKey = bg ? this.pack(bg) : -1;
                if (fgKey !== currentFg && text !== " ") {
                    line += fg ? this.ansi(fgKey, false) : "\x1b[39m";
                    currentFg = fgKey;
                }
                if (bgKey !== currentBg) {
                    line += bg ? this.ansi(bgKey, true) : "\x1b[49m";
                    currentBg = bgKey;
                }
                line += text;
            };
            for (let column = 0; column < width; column++) {
                const index = row * width + column;
                const cell = textActive ? cells[column] : undefined;
                const cellBg = halo(index, cell?.bg && backgroundFade < 1 ? mix(cell.bg, background, backgroundFade) : undefined);
                if (hint && row === hint.row && column >= hint.start && column < hint.start + hint.text.length) {
                    const offset = column - hint.start;
                    emit(hint.text[offset], offset < hint.keyLength ? hint.keyColor : hint.color, cellBg);
                    continue;
                }
                const dots = raster.bits[index];
                if (dots) {
                    // Quantized so neighboring cells on one face usually share a color and its escape sequence.
                    const step = LOGO_COLOR_STEP * raster.counts[index];
                    const rgb = raster.rgb;
                    const color = [
                        Math.round(rgb[index * 3] / step) * LOGO_COLOR_STEP,
                        Math.round(rgb[index * 3 + 1] / step) * LOGO_COLOR_STEP,
                        Math.round(rgb[index * 3 + 2] / step) * LOGO_COLOR_STEP,
                    ];
                    emit(BRAILLE[dots], color, cellBg);
                    continue;
                }
                if (!cell) {
                    const star = starfield(index);
                    emit(star?.text ?? " ", star?.fg, cellBg);
                    continue;
                }
                const dust = (dissolveTime - cell.delay) / DUST_DURATION;
                if (dust < 0 && cell.width === 2 && !raster.bits[index + 1]) {
                    emit(cell.text, mix(cell.fg, background, textFade), cellBg);
                    column++;
                    continue;
                }
                if (dust < 0 && cell.width === 1) {
                    emit(cell.text, mix(cell.fg, background, textFade), cellBg);
                    continue;
                }
                const dotCount = dust < 0 ? cell.ink : Math.round(cell.ink * (1 - clamp01(dust)));
                if (dotCount <= 0) {
                    const star = starfield(index);
                    emit(star?.text ?? " ", star?.fg, cellBg);
                    continue;
                }
                // Pick `dotCount` distinct dots; the choice changes a few times per second so the dust shimmers.
                let bits = 0;
                let placed = 0;
                for (let attempt = 0; placed < dotCount && attempt < 32; attempt++) {
                    const bit = DOT_BITS[Math.floor(hash(cell.seed * 7919 + frame * 131 + attempt) * 8)];
                    if (bits & bit)
                        continue;
                    bits |= bit;
                    placed++;
                }
                const fade = textFade + (1 - textFade) * clamp01(dust) ** 0.8;
                emit(BRAILLE[bits], mix(cell.fg, background, fade), cellBg);
            }
            lines.push(`${line}\x1b[0m`);
        }
        return lines;
    }
    elapsed() {
        return (performance.now() - this.startTime) / 1000;
    }
    exitProgress() {
        return this.exit ? clamp01((performance.now() - this.exit.start) / 1000 / EXIT_DURATION) : 0;
    }
    finish() {
        if (!this.timer)
            return;
        clearInterval(this.timer);
        this.timer = undefined;
        this.onDone();
    }
    dispose() {
        this.finish();
    }
    /** Each block's displacement from its place in the model at `time`, in grid units. */
    blockOffsets(time) {
        const blocks = this.model.blocks;
        const home = () => blocks.map(() => [0, 0, 0]);
        if (time < PUZZLE_START)
            return home();
        const cycle = Math.floor((time - PUZZLE_START) / PUZZLE_CYCLE);
        const local = time - PUZZLE_START - cycle * PUZZLE_CYCLE;
        if (this.shuffle?.cycle !== cycle)
            this.shuffle = { cycle, steps: shuffleSteps(this.model, cycle) };
        const steps = this.shuffle.steps;
        const offset = (position, index) => {
            const block = blocks[index].home;
            return [position[0] - block[0], position[1] - block[1], position[2] - block[2]];
        };
        const shuffleEnd = PUZZLE_STEP * PUZZLE_STEPS;
        if (local < shuffleEnd) {
            const step = Math.floor(local / PUZZLE_STEP);
            const progress = smooth((local - step * PUZZLE_STEP) / PUZZLE_STEP);
            return steps[step].map((from, index) => {
                const a = offset(from, index);
                const b = offset(steps[step + 1][index], index);
                return [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress, a[2] + (b[2] - a[2]) * progress];
            });
        }
        if (local < shuffleEnd + PUZZLE_RETURN) {
            // All blocks fly home at once. Alternating arcs in depth keep them from passing through each other.
            const u = (local - shuffleEnd) / PUZZLE_RETURN;
            const remaining = 1 - smooth(u);
            const arc = Math.sin(Math.PI * clamp01(u)) * 0.8;
            return steps[PUZZLE_STEPS].map((position, index) => {
                const [x, y, z] = offset(position, index);
                return [x * remaining, y * remaining, z * remaining + (index % 2 === 0 ? arc : -arc)];
            });
        }
        return home();
    }
    flyProgress(time) {
        return smooth((time - FLY_START) / FLY_DURATION);
    }
    starAlpha(time) {
        return smooth((time - STARS_START) / STARS_FADE);
    }
    hintAlpha(time) {
        return smooth((time - FLY_START - FLY_DURATION) / HINT_FADE);
    }
    pose(width, height, progress, time) {
        const { columns, rows, cameraDistance, radius, widthShare, origin } = this.model;
        const reach = radius * (cameraDistance / (cameraDistance - radius));
        // Lifting off, the front face must cover exactly the half-block cells (2x2 dots per pixel) despite the
        // perspective.
        const startScale = origin ? (2 * (cameraDistance - DEPTH / 2)) / cameraDistance : START_SCALE;
        const endScale = Math.max(startScale, Math.min(width * 2 * widthShare, (height * 4 - 8) * 0.48) / reach);
        const endX = width;
        const endY = height * 2 - 2;
        const startX = origin ? origin.column * 2 + columns : endX;
        const startY = origin ? origin.row * 4 + rows : endY;
        return {
            centerX: startX + (endX - startX) * progress,
            centerY: startY + (endY - startY) * progress,
            // Interpolate the zoom geometrically so it feels uniform.
            scale: startScale * (endScale / startScale) ** progress,
            yaw: spinAngle(time),
            // Tilts are zero at whole turns, so the camera looks straight at the front of the reassembled logo.
            pitch: 0.3 * Math.sin(spinPhase(time)) * progress,
            roll: 0.06 * Math.sin(2 * spinPhase(time)) * progress,
        };
    }
    hint(width, height, alpha, background) {
        if (alpha <= 0)
            return undefined;
        const key = formatKeyText(this.keybindings.getKeys("tui.select.cancel")[0] ?? "escape");
        const text = `${key} to return`;
        if (text.length > width)
            return undefined;
        return {
            row: height - 2,
            start: Math.floor((width - text.length) / 2),
            text,
            keyLength: key.length,
            keyColor: mix(background, toRgb(this.theme.colors.muted), alpha),
            color: mix(background, toRgb(this.theme.colors.dim), alpha),
        };
    }
    /** A sparse, deterministic starfield: one braille dot in about STAR_DENSITY of all cells. */
    prepareStars(width, height) {
        const stars = new Array(width * height);
        for (let index = 0; index < width * height; index++) {
            if (hash(index * 3 + 0x51ed) >= STAR_DENSITY)
                continue;
            const random = (salt) => hash(index * 7 + salt * 0x9e37);
            stars[index] = {
                glyph: BRAILLE[DOT_BITS[Math.floor(random(1) * 8)]],
                tint: STAR_TINTS[Math.floor(random(2) * STAR_TINTS.length)],
                strength: 0.1 + random(3) * 0.12,
                phase: random(4) * Math.PI * 2,
                speed: 0.4 + random(5) * 0.8,
            };
        }
        return stars;
    }
    prepareCells(width, foreground) {
        const cells = parseScreen(this.screen, width, foreground, this.background);
        const height = Math.max(1, this.tui.terminal.rows);
        const { columns, rows, origin } = this.model;
        // The dust spreads out from where the model starts.
        const centerX = origin ? origin.column + columns / 2 : width / 2;
        const centerY = origin ? origin.row + rows / 4 : height / 2;
        const farthest = Math.hypot(Math.max(centerX, width - centerX), Math.max(centerY, height - centerY) * 2);
        for (let row = 0; row < cells.length; row++) {
            const line = cells[row];
            for (let column = 0; column < line.length; column++) {
                const cell = line[column];
                // Wide graphemes share their first column's timing so both halves change together.
                const owner = cell.width === 0 ? line[column - 1] : cell;
                const seed = hash(row * 65_537 + column);
                if (cell.width !== 0) {
                    const distance = Math.hypot(column - centerX, (row - centerY) * 2) / farthest;
                    cell.delay = FLY_START + distance * WAVE_SPREAD + seed * WAVE_JITTER;
                }
                else {
                    cell.delay = owner.delay;
                }
                cell.seed = row * 65_537 + column;
                cell.ink = glyphInk(owner.text, seed);
            }
        }
        // The 3D model replaces its half-block rendering on screen.
        if (origin) {
            for (let row = origin.row; row < origin.row + Math.ceil(rows / 2); row++) {
                const line = cells[row];
                if (!line)
                    continue;
                for (let column = origin.column; column < origin.column + columns; column++) {
                    const cell = line[column];
                    if (cell) {
                        cell.text = " ";
                        cell.width = 1;
                        cell.ink = 0;
                        cell.bg = undefined;
                    }
                }
            }
        }
        return cells;
    }
    pack(color) {
        return (Math.round(color[0]) << 16) | (Math.round(color[1]) << 8) | Math.round(color[2]);
    }
    ansi(key, isBackground) {
        const cacheKey = key * 2 + (isBackground ? 1 : 0);
        let value = this.ansiCache.get(cacheKey);
        if (value === undefined) {
            const color = rgbColor((key >> 16) & 255, (key >> 8) & 255, key & 255);

            const mode = this.theme.getColorMode();
            value = isBackground ? backgroundAnsi(color, mode) : foregroundAnsi(color, mode);
            this.ansiCache.set(cacheKey, value);
        }
        return value;
    }
}