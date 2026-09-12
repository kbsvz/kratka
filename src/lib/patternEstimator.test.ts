import { describe, expect, it } from "vitest";
import { estimatePattern, formatDuration } from "@/lib/patternEstimator";

// Fixed business-logic constants
const MM_PER_STITCH = 7;
const STITCHES_PER_HOUR = 150;

describe("estimatePattern", () => {
  it("computes per-color thread length and total time from a known grid", () => {
    // 3 colors, 10x10-shaped grid flattened: color 1 x4 cells, color 2 x2 cells, color 3 unused, rest empty (0).
    const palette = ["#ff0000", "#00ff00", "#0000ff"];
    const grid = [1, 1, 0, 2, 1, 0, 2, 1, 0, 0];

    const result = estimatePattern(grid, palette);

    // Hand-computed, not derived from running the function:
    // color 1: 4 cells -> 4*7mm = 28mm = 2.8cm
    // color 2: 2 cells -> 2*7mm = 14mm = 1.4cm
    // color 3: 0 cells -> filtered out entirely
    expect(result.colors).toEqual([
      { hex: "#ff0000", cellCount: 4, threadCm: (4 * MM_PER_STITCH) / 10 },
      { hex: "#00ff00", cellCount: 2, threadCm: (2 * MM_PER_STITCH) / 10 },
    ]);
    expect(result.totalFilledCells).toBe(6);
    expect(result.totalHours).toBe(6 / STITCHES_PER_HOUR);
  });

  it("treats a never-saved empty grid as all-empty, not an error", () => {
    const palette = ["#ff0000", "#00ff00"];

    const result = estimatePattern([], palette);

    expect(result.colors).toEqual([]);
    expect(result.totalFilledCells).toBe(0);
    expect(result.totalHours).toBe(0);
  });

  it("attributes a grid value at the highest legal palette index correctly", () => {
    const palette = ["#111111", "#222222", "#333333"];
    // value 3 == palette.length, the highest valid 1-based index (last color).
    const grid = [3, 3, 3];

    const result = estimatePattern(grid, palette);

    expect(result.colors).toEqual([{ hex: "#333333", cellCount: 3, threadCm: (3 * MM_PER_STITCH) / 10 }]);
    expect(result.totalFilledCells).toBe(3);
  });
});

describe("formatDuration", () => {
  it("formats zero hours as 0min", () => {
    expect(formatDuration(0)).toBe("0min");
  });

  it("formats a sub-hour duration in minutes only", () => {
    // 0.991h * 60 = 59.46min -> rounds to 59min, stays under the 1h boundary.
    expect(formatDuration(0.991)).toBe("59min");
  });

  it("rounds a near-hour duration up to a clean hour, not '0h 60min'", () => {
    // 0.999h * 60 = 59.94min -> rounds to 60min -> h=1, m=0 -> "1h", not "0h 60min".
    expect(formatDuration(0.999)).toBe("1h");
  });

  it("formats a duration with both hours and minutes", () => {
    // 1.25h * 60 = 75min -> h=1, m=15
    expect(formatDuration(1.25)).toBe("1h 15min");
  });
});
