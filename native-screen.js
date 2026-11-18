// Adapted from Pi 1.5.2 easter-egg-3d.js. Upstream MIT notice is in LICENSE.
import { colorToRgb, indexedColor, visibleWidth } from "@earendil-works/pi-tui";
export const DEPTH = 0.7;
export const FLY_START = 0.1;
export const FLY_DURATION = 1.3;
/** Braille dots per pixel when a model without an origin appears, growing from a speck at the center. */
export const START_SCALE = 0.1;
// The sliding puzzle: after the model spun for a while, blocks slide into free neighboring cells, a few at a time.
// Each cycle shuffles, flies every block back home, and holds the model briefly.
export const PUZZLE_START = FLY_START + FLY_DURATION + 3;
export const PUZZLE_STEP = 0.3;
export const PUZZLE_STEPS = 12;
export const PUZZLE_RETURN = 1;
export const PUZZLE_HOLD = 0.6;
export const PUZZLE_CYCLE = PUZZLE_STEP * PUZZLE_STEPS + PUZZLE_RETURN + PUZZLE_HOLD;
export const PUZZLE_MOVES = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
];
/** Block positions after each step of one shuffle cycle, starting at home. Deterministic per cycle. */
export function shuffleSteps(model, cycle) {
    const { columns, rows } = model;
    let positions = model.blocks.map((block) => block.home);
    const steps = [positions];
    const lastMoved = new Set();
    let random = cycle * 7_919 + 1;
    const next = () => hash(random++);
    const key = ([x, y, z]) => ((z + 1) * rows + y) * columns + x;
    for (let step = 0; step < PUZZLE_STEPS; step++) {
        const occupied = new Set(positions.map(key));
        const nextPositions = [...positions];
        const moved = new Set();
        const moveCount = model.puzzleMoves(next());
        for (let move = 0; move < moveCount; move++) {
            const candidates = [];
            for (let block = 0; block < positions.length; block++) {
                if (moved.has(block))
                    continue;
                const [x, y, z] = positions[block];
                for (const [dx, dy, dz] of PUZZLE_MOVES) {
                    const target = [x + dx, y + dy, z + dz];
                    if (target[0] < 0 || target[0] >= columns || target[1] < 0 || target[1] >= rows)
                        continue;
                    if (target[2] < -1 || target[2] > 1 || occupied.has(key(target)))
                        continue;
                    candidates.push({ block, target });
                }
            }
            // Prefer blocks that did not just move, so the puzzle does not look like one block jittering.
            const fresh = candidates.filter((candidate) => !lastMoved.has(candidate.block));
            const pool = fresh.length > 0 ? fresh : candidates;
            const choice = pool[Math.floor(next() * pool.length)];
            if (!choice)
                break;
            occupied.add(key(choice.target));
            nextPositions[choice.block] = choice.target;
            moved.add(choice.block);
        }
        lastMoved.clear();
        for (const block of moved)
            lastMoved.add(block);
        positions = nextPositions;
        steps.push(positions);
    }
    return steps;
}
export const FRAME_MS = 1000 / 30;
export const DUST_DURATION = 0.35;
export const WAVE_SPREAD = 0.55;
export const WAVE_JITTER = 0.12;
export const DISSOLVE_END = FLY_START + WAVE_SPREAD + WAVE_JITTER + DUST_DURATION;
export const BACKGROUND_FADE = 0.5;
export const EXIT_DURATION = 1.1;
// A faint starfield fades in behind the logo once the screen has dissolved.
export const STARS_START = 2.5;
export const STARS_FADE = 2;
export const STAR_DENSITY = 0.018;
// Star tints: neutral, pale blue, pale gold, and pale rose, each mixed half with the terminal's foreground.
export const STAR_TINTS = [
    [255, 255, 255],
    [170, 195, 255],
    [255, 225, 170],
    [255, 190, 205],
];
export const LOGO_COLOR_STEP = 5;
// On light backgrounds most of each braille cell shows the bright background, which washes the logo out. There,
// the logo gets a halo: its colors and coverage blurred into the cell backgrounds, strongest under the logo and
// fading out over HALO_RADIUS_X columns and HALO_RADIUS_Y rows (cells are about twice as tall as wide).
export const LIGHT_HALO_STRENGTH = 0.3;
export const HALO_RADIUS_X = 6;
export const HALO_RADIUS_Y = 3;
export const HALO_LEVELS = 32;
export const STAR_ALPHA_LEVELS = 8;
export const STAR_FLICKER_LEVELS = 3;
export const HINT_FADE = 0.5;
// Braille dot bits, indexed by row * 2 + column within the 2x4 cell.
export const DOT_BITS = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];
export const BRAILLE = Array.from({ length: 256 }, (_, bits) => String.fromCharCode(0x2800 + bits));
export const LIGHT = normalize([-0.45, -0.6, 0.75]);
export const HALF_VECTOR = normalize([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
export function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / length, v[1] / length, v[2] / length];
}
export function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
}
/** Quintic smoothstep. */
export function smooth(value) {
    const t = clamp01(value);
    return t * t * t * (t * (t * 6 - 15) + 10);
}
export function easeOut(value) {
    const t = 1 - clamp01(value);
    return 1 - t * t * t;
}
export function mix(a, b, amount) {
    return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}
export function hash(value) {
    let x = Math.imul(value ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 0x100000000;
}
/** Whether a background is light, by relative luminance. */
export function isLight([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
}
export function toRgb(color) {
    const { r, g, b } = colorToRgb(color);
    return [r, g, b];
}
/** Braille dots a glyph turns into, a rough measure of how much ink it has. */
export function glyphInk(text, seed) {
    if (text.trim() === "")
        return 0;
    if (/^[.,:;'`\-_·]$/.test(text))
        return 2;
    if (/^[\u2500-\u257f]$/.test(text))
        return 3;
    return 4 + Math.floor(seed * 3);
}
export const segmenter = new Intl.Segmenter();
/** Parse rendered lines into cells with resolved colors. Other escape sequences (OSC, APC, cursor) are skipped. */
export function parseScreen(lines, width, foreground, background) {
    const palette = (index) => toRgb(indexedColor(index));
    return lines.map((line) => {
        const cells = [];
        let fg;
        let bg;
        let dim = false;
        let inverse = false;
        const applySgr = (params) => {
            const codes = params === "" ? ["0"] : params.split(";");
            for (let i = 0; i < codes.length; i++) {
                const parts = codes[i].split(":").map((part) => Number.parseInt(part, 10));
                const code = parts[0] ?? 0;
                if (code === 38 || code === 48) {
                    // Extended color, either as `38;5;n` / `38;2;r;g;b` or colon sub-parameters.
                    let args;
                    if (parts.length > 1) {
                        args = parts.slice(1).filter((part) => !Number.isNaN(part));
                        // `38:2::r:g:b` has an empty color space id, dropped above.
                    }
                    else {
                        const kind = Number.parseInt(codes[i + 1] ?? "", 10);
                        const count = kind === 5 ? 2 : kind === 2 ? 4 : 1;
                        args = codes.slice(i + 1, i + 1 + count).map((part) => Number.parseInt(part, 10));
                        i += count;
                    }
                    let color;
                    if (args[0] === 5 && args[1] !== undefined)
                        color = palette(args[1]);
                    else if (args[0] === 2 && args.length >= 4)
                        color = [args[1], args[2], args[3]];
                    if (color) {
                        if (code === 38)
                            fg = color;
                        else
                            bg = color;
                    }
                }
                else if (code === 0) {
                    fg = undefined;
                    bg = undefined;
                    dim = false;
                    inverse = false;
                }
                else if (code === 2)
                    dim = true;
                else if (code === 22)
                    dim = false;
                else if (code === 7)
                    inverse = true;
                else if (code === 27)
                    inverse = false;
                else if (code >= 30 && code <= 37)
                    fg = palette(code - 30);
                else if (code >= 90 && code <= 97)
                    fg = palette(code - 90 + 8);
                else if (code === 39)
                    fg = undefined;
                else if (code >= 40 && code <= 47)
                    bg = palette(code - 40);
                else if (code >= 100 && code <= 107)
                    bg = palette(code - 100 + 8);
                else if (code === 49)
                    bg = undefined;
            }
        };
        const pushText = (text) => {
            for (const { segment } of segmenter.segment(text)) {
                const glyphWidth = visibleWidth(segment);
                if (glyphWidth === 0 || cells.length + glyphWidth > width)
                    continue;
                let cellFg = fg ?? foreground;
                let cellBg = bg;
                if (inverse) {
                    cellFg = bg ?? background;
                    cellBg = fg ?? foreground;
                }
                if (dim)
                    cellFg = mix(cellFg, cellBg ?? background, 0.4);
                const cell = { text: segment, width: glyphWidth, fg: cellFg, bg: cellBg, delay: 0, ink: 0, seed: 0 };
                cells.push(cell);
                if (glyphWidth === 2)
                    cells.push({ ...cell, text: "", width: 0 });
            }
        };
        let i = 0;
        while (i < line.length) {
            const sequenceStart = line.indexOf("\x1b", i);
            if (sequenceStart === -1) {
                pushText(line.slice(i));
                break;
            }
            if (sequenceStart > i)
                pushText(line.slice(i, sequenceStart));
            const kind = line[sequenceStart + 1];
            if (kind === "[") {
                let end = sequenceStart + 2;
                while (end < line.length && (line.charCodeAt(end) < 0x40 || line.charCodeAt(end) > 0x7e))
                    end++;
                if (line[end] === "m")
                    applySgr(line.slice(sequenceStart + 2, end));
                i = end + 1;
            }
            else if (kind === "]" || kind === "_" || kind === "P" || kind === "^") {
                // String sequences end at BEL or ST (ESC \).
                const bell = line.indexOf("\x07", sequenceStart + 2);
                const st = line.indexOf("\x1b\\", sequenceStart + 2);
                if (bell === -1 && st === -1)
                    break;
                i = bell !== -1 && (st === -1 || bell < st) ? bell + 1 : st + 2;
            }
            else {
                i = sequenceStart + 2;
            }
        }
        return cells;
    });
}
/** Row-major 3x3 rotation matrix for yaw (y), then pitch (x), then roll (z). */
export function rotation(yaw, pitch, roll) {
    const [sy, cy, sx, cx, sz, cz] = [
        Math.sin(yaw),
        Math.cos(yaw),
        Math.sin(pitch),
        Math.cos(pitch),
        Math.sin(roll),
        Math.cos(roll),
    ];
    // Rz * Rx * Ry
    const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
    const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
    const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
    return multiply(rz, multiply(rx, ry));
}
export function multiply(a, b) {
    const result = new Array(9);
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
            result[row * 3 + column] =
                a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column];
        }
    }
    return result;
}
// The spin is locked to the puzzle: one turn per cycle, facing the camera in the middle of each hold.
export const SPIN_RAMP = 1.4;
export const SPIN_SPEED = (Math.PI * 2) / PUZZLE_CYCLE;
// How much the spin slows down while facing the camera (and speeds up while facing away), from 0 to 1.
export const SPIN_LINGER = 0.6;
export const FIRST_FRONT_VIEW = PUZZLE_START + PUZZLE_STEP * PUZZLE_STEPS + PUZZLE_RETURN + PUZZLE_HOLD / 2;
/** Uniform spin that accelerates from rest over SPIN_RAMP, then turns at SPIN_SPEED. */
export function baseSpinPhase(time) {
    const elapsed = time - FLY_START;
    if (elapsed <= 0)
        return 0;
    const u = elapsed / SPIN_RAMP;
    // Integral of the quintic smoothstep ramp.
    if (u < 1)
        return SPIN_SPEED * SPIN_RAMP * (u ** 6 - 3 * u ** 5 + 2.5 * u ** 4);
    return SPIN_SPEED * (SPIN_RAMP * 0.5 + elapsed - SPIN_RAMP);
}
// Extra rotation added during the flight, so the phase is a whole number of turns at every assembled front view.
export const SPIN_ALIGNMENT = Math.PI * 2 - (baseSpinPhase(FIRST_FRONT_VIEW) % (Math.PI * 2));
/** Spin phase: whole turns exactly when the reassembled logo faces the camera. */
export function spinPhase(time) {
    return baseSpinPhase(time) + SPIN_ALIGNMENT * smooth((time - FLY_START) / FLY_DURATION);
}
/** Yaw of the logo. It matches the phase at whole turns but lingers there, so the logo reads from the front. */
export function spinAngle(time) {
    const phase = spinPhase(time);
    return phase - SPIN_LINGER * Math.sin(phase);
}
