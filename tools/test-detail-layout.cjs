/**
 * Isolated visual regression test of the real ProductCard/Modal and stylesheet.
 * No backend, catalogue database, cart mutations, or reservations are exercised.
 * Requires project dependencies, Playwright, and Chromium:
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *   npm run test:detail-layout
 * Optional: CHROMIUM_PATH, SOLVAR_PLAYWRIGHT_MODULE, SOLVAR_LAYOUT_OUTPUT.
 */
const { strict: assert } = require("node:assert");
const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const http = require("node:http");
const { build } = require("esbuild");
const { compile } = require("@tailwindcss/node");
const { chromium } = require(process.env.SOLVAR_PLAYWRIGHT_MODULE || "playwright");

const root = resolve(__dirname, "..");
// An optional source root allows the same regression to be run on the original ZIP.
const sourceRoot = resolve(process.env.SOLVAR_LAYOUT_SOURCE_ROOT || root);
const output = resolve(process.env.SOLVAR_LAYOUT_OUTPUT || join(root, "qa-detail-layout"));
const stylesPath = join(sourceRoot, "packages/web/src/web/styles.css");
const viewports = [
  [320, 568], [390, 844], [568, 320], [768, 1024], [800, 600],
  [801, 600], [844, 390], [1024, 768], [1440, 900], [640, 450],
];
const variants = ["short", "long", "wide-image", "tall-image", "broken-image"];
const results = [];

async function main() {
  mkdirSync(output, { recursive: true });
  const css = (await compile(readFileSync(stylesPath, "utf8"), {
    base: join(sourceRoot, "packages/web/src/web"),
    onDependency() {},
  })).build([]);
  const bundled = await build({
    stdin: {
      sourcefile: "detail-layout-fixture.tsx",
      resolveDir: sourceRoot,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { ProductCard } from "./packages/web/src/web/components/product-card";
        import { Modal } from "./packages/web/src/web/components/modal";
        const variant = new URLSearchParams(location.search).get("variant") || "short";
        const long = variant === "long";
        const svg = (width, height) => "data:image/svg+xml," + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
          '" viewBox="0 0 ' + width + ' ' + height + '"><rect width="100%" height="100%" fill="#c7cfca"/>' +
          '<circle cx="' + width / 2 + '" cy="' + height / 2 + '" r="' + Math.min(width, height) / 3 +
          '" fill="#788b80"/></svg>');
        const p = {
          id: "layout-sample", name: long ? "Длинноеназвание".repeat(12) : "Образец карточки",
          section: "accessories", price: 100, oldPrice: null, active: true,
          availability: "unknown", brand: "Образец", weight: "120 × 80 мм",
          country: "Тестовые данные", sub: "Нейтральный образец для проверки вёрстки.",
          description: long ? ("Длинное описание. ".repeat(250) + "X".repeat(800)) : "Краткое описание образца.",
          ingredients: long ? "Материал".repeat(350) : "",
          allergens: long ? "Характеристики образца. ".repeat(35) : "",
          storage: "", shelfLife: "", contents: [], extras: "", featured: false, badge: "",
          image: variant === "wide-image" ? svg(6000, 2400) :
                 variant === "tall-image" ? svg(2400, 6000) :
                 variant === "broken-image" ? "/missing-fixture-image.png" : "",
        };
        function Fixture() {
          const [ordinary, setOrdinary] = React.useState(false);
          return <main style={{padding: 24, minHeight: "180vh"}}>
            <div style={{maxWidth: 320}}><ProductCard p={p}/></div>
            <button onClick={() => setOrdinary(true)}>Открыть обычное окно</button>
            {ordinary && <Modal label="Обычное окно" onClose={() => setOrdinary(false)}>
              <div className="modal-panel" style={{padding: 24}}>
                <h2>Проверка общего диалога</h2>
                <p>{"Нейтральное содержимое. ".repeat(200)}</p>
                <button onClick={() => setOrdinary(false)}>Готово</button>
              </div>
            </Modal>}
          </main>;
        }
        createRoot(document.getElementById("root")).render(<Fixture/>);
      `,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    nodePaths: [join(root, "node_modules")],
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{
      name: "no-commerce-or-network",
      setup(b) {
        b.onResolve({ filter: /^\.\/cart-context$|^\.\.\/queries\/shop$/ }, ({ path }) => ({
          path, namespace: "layout-stubs",
        }));
        b.onLoad({ filter: /.*/, namespace: "layout-stubs" }, ({ path }) => ({
          contents: path.includes("cart-context")
            ? 'export const useCart = () => ({ add() { throw new Error("Commerce must not run in visual tests"); } });'
            : "export const useShop = () => ({ data: undefined });",
          loader: "js",
        }));
      },
    }],
  });
  const html = '<!doctype html><html lang="ru"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Проверка отображения карточки</title><link rel="stylesheet" href="/styles.css">' +
    '<body><div id="root"></div><script src="/fixture.js"></script></body></html>';
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/styles.css") {
      response.setHeader("Content-Type", "text/css"); response.end(css);
    } else if (url.pathname === "/fixture.js") {
      response.setHeader("Content-Type", "text/javascript"); response.end(bundled.outputFiles[0].contents);
    } else if (/^\/fonts\/[a-z0-9-]+\.woff$/.test(url.pathname)) {
      response.setHeader("Content-Type", "font/woff");
      response.end(readFileSync(join(sourceRoot, "packages/web/public", url.pathname)));
    } else if (url.pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html);
    } else { response.statusCode = 404; response.end(); }
  });
  let browser;
  try {
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      headless: true, args: ["--no-sandbox"],
    });
    for (const [width, height] of viewports) {
      for (const variant of variants) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        // All assets are local or inline. No production services are contacted.
        await page.route("**/*", route => route.request().url().startsWith(origin)
          ? route.continue() : route.abort());
        try {
          await page.goto(`${origin}/?variant=${variant}`);
          const trigger = page.getByRole("button", { name: /^Подробнее:/ });
          await trigger.click();
          await page.locator("dialog[open]").waitFor();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.querySelectorAll("dialog img")].map(img =>
              img.complete ? null : new Promise(r => {
                img.addEventListener("load", r, { once: true });
                img.addEventListener("error", r, { once: true });
              })));
          });
          const measurements = await page.evaluate(() => {
            const dialog = document.querySelector("dialog");
            const panel = document.querySelector(".product-detail-panel");
            const scroller = document.querySelector(".product-detail-content") || panel;
            const copy = document.querySelector(".product-detail-copy");
            const image = document.querySelector(".product-detail-image");
            const bounds = el => {
              const { x, y, width, height } = el.getBoundingClientRect();
              return { x, y, width, height };
            };
            return {
              panel: bounds(panel), image: bounds(image), copy: bounds(copy),
              dialogOverflowX: dialog.scrollWidth - dialog.clientWidth,
              dialogOverflowY: dialog.scrollHeight - dialog.clientHeight,
              contentOverflowX: scroller.scrollWidth - scroller.clientWidth,
              copyOverflowX: copy.scrollWidth - copy.clientWidth,
              pageOverflowX: document.documentElement.scrollWidth - innerWidth,
              bodyLocked: document.body.style.overflow === "hidden",
              verticalScrollers: [dialog, panel, ...panel.querySelectorAll("*")].filter(el =>
                /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1
              ).length,
              needsVerticalScroll: scroller.scrollHeight > scroller.clientHeight + 1,
              imageLoaded: !image.querySelector("img") || image.querySelector("img").naturalWidth > 0,
            };
          });
          const label = `${width}x${height} ${variant}`;
          assert(measurements.panel.x >= 8 && measurements.panel.y >= 8, `${label}: panel has screen margins`);
          assert(measurements.panel.x + measurements.panel.width <= width - 8, `${label}: panel within screen width`);
          assert(measurements.panel.y + measurements.panel.height <= height - 8, `${label}: panel within screen height`);
          for (const key of ["dialogOverflowX", "dialogOverflowY", "contentOverflowX", "copyOverflowX", "pageOverflowX"])
            assert(measurements[key] <= 1, `${label}: ${key}=${measurements[key]}`);
          assert(measurements.bodyLocked && measurements.imageLoaded, `${label}: body locked; image or fallback present`);
          assert(measurements.verticalScrollers <= 1, `${label}: no nested scrolling`);
          if (width <= 800) assert(measurements.copy.y >= measurements.image.y + measurements.image.height - 1,
            `${label}: mobile image above text`);
          if (width === 1440 && variant === "short") assert(!measurements.needsVerticalScroll, "short desktop card needs no scroll");
          if (variant === "long") assert(measurements.needsVerticalScroll, `${label}: long content remains accessible`);
          if (width === 390 && variant === "short" || width === 1440 && variant === "wide-image")
            await page.screenshot({ path: join(output, `${width}-${variant}.png`) });
          // An image/text click must not act as a backdrop click.
          await page.locator(".product-detail-image").click();
          assert.equal(await page.locator("dialog[open]").count(), 1);
          await page.locator(".product-detail-content").evaluate(el => { el.scrollTop = el.scrollHeight; });
          const link = page.locator(".detail-page-link");
          const linkBox = await link.boundingBox();
          assert(linkBox && linkBox.y >= 0 && linkBox.y + linkBox.height <= height, `${label}: last content is reachable`);
          const close = page.getByRole("button", { name: "Закрыть", exact: true });
          const closeBox = await close.boundingBox();
          assert(closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height <= height, `${label}: close stays visible after scrolling`);
          if (width === 390 && variant === "long" || width === 1440 && variant === "short")
            await page.screenshot({ path: join(output, `${width}-${variant}.png`) });
          await close.click();
          assert.equal(await page.locator("dialog[open]").count(), 0);
          assert.equal(await page.evaluate(() => document.body.style.overflow), "");
          assert.equal(await trigger.evaluate(el => el === document.activeElement), true, `${label}: focus restored`);
          await trigger.click(); await page.keyboard.press("Escape");
          assert.equal(await page.locator("dialog[open]").count(), 0);
          await trigger.click(); await page.mouse.click(2, 2);
          assert.equal(await page.locator("dialog[open]").count(), 0);
          assert.deepEqual(errors, []);
          results.push({ viewport: `${width}x${height}`, variant, status: "PASS", ...measurements });
          console.log(`PASS ${label}`);
        } finally { await page.close(); }
      }
    }
    // The shared Modal is also used by ordinary admin forms. Padding must not
    // clip such a form on a short landscape viewport.
    for (const [width, height] of [[320, 568], [568, 320], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      try {
        await page.goto(origin);
        await page.getByRole("button", { name: "Открыть обычное окно", exact: true }).click();
        const panel = page.locator("dialog[open] .modal-panel");
        const box = await panel.boundingBox();
        assert(box && box.x >= 8 && box.y >= 8 && box.x + box.width <= width - 8 &&
          box.y + box.height <= height - 8, "ordinary dialog fits viewport");
        assert(await page.locator("dialog").evaluate(el => el.scrollHeight <= el.clientHeight + 1));
        await panel.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.getByRole("button", { name: "Готово", exact: true }).click();
        assert.equal(await page.locator("dialog[open]").count(), 0);
        results.push({ viewport: `${width}x${height}`, variant: "ordinary-dialog", status: "PASS" });
        console.log(`PASS ${width}x${height} ordinary-dialog`);
      } finally { await page.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
    writeFileSync(join(output, "results.json"), JSON.stringify(results, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });