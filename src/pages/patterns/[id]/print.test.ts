import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Risk #7 (test-plan.md §2): the printed page must show only the grid + legend,
// never app chrome. The Astro Container API is confirmed infeasible for this
// project (see test-plan.md §6.5 / vitest.config.ts's inline note — the
// @astrojs/cloudflare adapter needs a real Worker context vitest can't
// provide), so this asserts against print.astro's source text rather than a
// rendered DOM. It is a structural/source check, not a browser-rendered one.
const source = readFileSync(new URL("./print.astro", import.meta.url), "utf-8");

describe("print.astro chrome exclusion", () => {
  it("never imports or renders AppHeader", () => {
    expect(source).not.toMatch(/AppHeader/);
  });

  it("marks the Print button print:hidden", () => {
    const printButton = source.slice(source.indexOf('id="print-button"'), source.indexOf('id="print-button"') + 200);
    expect(printButton).toMatch(/print:hidden/);
  });

  it("marks the Close link print:hidden", () => {
    const closeTextIndex = source.indexOf("Close");
    const anchorStart = source.lastIndexOf("<a", closeTextIndex);
    const closeLink = source.slice(anchorStart, closeTextIndex);
    expect(closeLink).toMatch(/print:hidden/);
  });
});

describe("print.astro @media print rules", () => {
  const mediaPrintBlock = /@media print\s*{([\s\S]*?)\n {2}}/.exec(source)?.[1] ?? "";

  it("has a non-empty @media print block", () => {
    expect(mediaPrintBlock).not.toBe("");
  });

  it("zeroes html/body margin", () => {
    expect(mediaPrintBlock).toMatch(/margin:\s*0/);
  });

  it("hides the config-missing banner", () => {
    expect(mediaPrintBlock).toMatch(/\.banner\)?\s*{\s*display:\s*none/);
  });

  it("forces exact print color adjustment", () => {
    expect(mediaPrintBlock).toMatch(/print-color-adjust:\s*exact/);
  });

  it("sets a 1cm @page margin", () => {
    expect(mediaPrintBlock).toMatch(/@page\s*{\s*margin:\s*1cm/);
  });
});
