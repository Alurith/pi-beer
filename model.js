// Adapted from Pi 1.5.2 easter-egg-3d.js. Upstream MIT notice is in LICENSE.
import { backgroundAnsi, foregroundAnsi, rgbColor } from "@earendil-works/pi-tui";
import { DEPTH } from "./native-screen.js";

export const VESSELS = {
    boccale: ["ccc.", "bbby", "bb.y", "bbb."],
    bicchiere: ["ccc.", "bbb.", "bbb.", ".bb."],
    alto: [".cc.", ".bb.", ".bb.", ".bb."],
};
export const PALETTES = {
    chiara: { c: [255, 250, 235], b: [234, 170, 35], y: [255, 220, 130] },
    ambrata: { c: [255, 243, 218], b: [192, 105, 34], y: [235, 180, 105] },
    scura: { c: [238, 220, 186], b: [112, 70, 45], y: [188, 140, 90] },
    weiss: { c: [255, 248, 220], b: [224, 200, 112], y: [246, 226, 165] },
};

/** @param {import("./preferences.ts").BeerPreferences} preferences */
export function beerPixels(preferences) {
    const palette = PALETTES[preferences.color];
    return VESSELS[preferences.vessel].map(row => [...row].map(key =>
        key === "." ? undefined : palette[key === "c" && !preferences.foam ? "b" : key]));
}

export function createModel(columns, rows, pixel, options) {
    const blocks = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const color = pixel(column, row);
            if (color)
                blocks.push({ home: [column, row, 0], color });
        }
    }
    return {
        columns,
        rows,
        blocks,
        cameraDistance: options.cameraDistance,
        radius: Math.hypot(columns / 2, rows / 2, 1 + DEPTH / 2),
        widthShare: options.widthShare,
        puzzleMoves: (random) => options.puzzleMoves(random, blocks.length),
        origin: options.origin,
    };
}

/** @param {import("./preferences.ts").BeerPreferences} preferences */
export function beerModel(preferences, origin) {
    const pixels = beerPixels(preferences);
    return createModel(4, 4, (column, row) => pixels[row][column], {
        cameraDistance: 10,
        widthShare: 0.35,
        puzzleMoves: (random) => (random < 0.4 ? 2 : 1),
        origin,
    });
}

/** @param {import("./preferences.ts").BeerPreferences} preferences */
export function beerLogoLines(preferences, mode) {
    const pixels = beerPixels(preferences);
    const reset = "\x1b[0m";
    return [0, 2].map(row => {
        let line = "";
        let style;
        for (let column = 0; column < 4; column++) {
            const top = pixels[row][column];
            const bottom = pixels[row + 1][column];
            const foreground = top ?? bottom;
            const background = top && bottom && top !== bottom ? bottom : undefined;
            const nextStyle = (foreground ? foregroundAnsi(rgbColor(...foreground), mode) : "")
                + (background ? backgroundAnsi(rgbColor(...background), mode) : "");
            if (nextStyle !== style) {
                if (style !== undefined) line += reset;
                line += nextStyle;
                style = nextStyle;
            }
            line += top ? (bottom ? (top === bottom ? "█" : "▀") : "▀") : (bottom ? "▄" : " ");
        }
        return line + reset;
    });
}
