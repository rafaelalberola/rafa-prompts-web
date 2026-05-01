#!/usr/bin/env node
/**
 * Render all rafa.prompts brand PNG assets via Playwright.
 * Mirrors render_assets.py but uses Node so it runs against the
 * existing Playwright install in the social content _renderer.
 *
 * Usage:
 *   node scripts/render_assets.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

// Explicit absolute path to avoid silent writes to a wrong location when
// the script is copied out of the project. Override with OUT_DIR env if needed.
const OUT = process.env.OUT_DIR
  || '/Users/helloimrafa/Projects/rafa-prompts-web/assets/img';
fs.mkdirSync(OUT, { recursive: true });

const FONT_HEAD = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800;900&family=IBM+Plex+Mono:wght@400;600&family=Newsreader:ital,wght@1,400&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; -webkit-font-smoothing: antialiased; }
  :root {
    --bg: #0A0A0A;
    --cream: #F2EFE7;
    --ink: #111111;
    --accent: #DA7756;
    --sans: 'Archivo', system-ui, sans-serif;
    --serif: 'Newsreader', Georgia, serif;
    --mono: 'IBM Plex Mono', 'SF Mono', Menlo, monospace;
  }
  body { font-family: var(--sans); }
  .spray { filter: url(#sprayGrain); }
</style>
`;

const SVG_FILTER = `
<svg width="0" height="0" style="position:absolute">
  <defs>
    <filter id="sprayGrain" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" result="wobbled"/>
      <feGaussianBlur in="wobbled" stdDeviation="0.9" result="blurred"/>
      <feComponentTransfer in="blurred">
        <feFuncA type="linear" slope="2.2" intercept="-0.1"/>
      </feComponentTransfer>
    </filter>
  </defs>
</svg>
`;

function ogImageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_HEAD}
<style>
  body {
    width: 1200px; height: 630px;
    background: var(--cream);
    color: var(--ink);
    display: grid;
    grid-template-rows: auto 1fr auto;
    padding: 56px 64px;
    position: relative;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--mono);
    font-size: 16px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .top .wordmark {
    font-family: var(--sans);
    font-weight: 900;
    font-size: 28px;
    letter-spacing: -0.02em;
    text-transform: lowercase;
  }
  .top .wordmark em {
    font-style: normal;
    font-weight: 800;
    color: var(--accent);
  }
  .top .meta { color: var(--accent); }
  .headline {
    align-self: center;
    font-family: var(--sans);
    font-weight: 900;
    font-size: 132px;
    line-height: 0.92;
    letter-spacing: -0.035em;
    text-transform: lowercase;
    max-width: 14ch;
  }
  .headline .serif {
    font-family: var(--serif);
    font-style: italic;
    font-weight: 400;
    color: var(--accent);
    letter-spacing: -0.02em;
    display: block;
    margin-top: 0.05em;
  }
  .bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-family: var(--mono);
    font-size: 16px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .bottom .bar {
    height: 3px;
    flex: 1;
    background: var(--accent);
    margin: 0 24px 8px;
  }
</style></head><body>${SVG_FILTER}
<div class="top">
  <div class="wordmark">rafa<em>.prompts</em></div>
</div>
<div class="headline spray">
  te enseño
  <span class="serif">claude para todo</span>
</div>
</body></html>`;
}

function metodoCoverHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_HEAD}
<style>
  body {
    width: 1280px; height: 720px;
    background: var(--bg);
    color: var(--cream);
    position: relative;
    overflow: hidden;
    padding: 72px 80px;
    display: grid;
    grid-template-rows: auto 1fr auto;
  }
  .top {
    font-family: var(--mono);
    font-size: 18px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
    display: flex; justify-content: space-between;
  }
  .stack { align-self: center; }
  .el-metodo {
    font-family: var(--sans);
    font-weight: 900;
    font-size: 112px;
    line-height: 0.9;
    letter-spacing: -0.04em;
    text-transform: uppercase;
    color: var(--cream);
  }
  .claude {
    font-family: var(--sans);
    font-weight: 900;
    font-size: 240px;
    line-height: 0.85;
    letter-spacing: -0.05em;
    text-transform: uppercase;
    color: var(--accent);
    margin-top: -4px;
    position: relative;
  }
  .grain-overlay {
    position: absolute; inset: 0;
    background-image:
      radial-gradient(rgba(10,10,10,0.22) 1px, transparent 1px),
      radial-gradient(rgba(10,10,10,0.12) 1px, transparent 1px);
    background-size: 4px 4px, 9px 9px;
    background-position: 0 0, 2px 2px;
    mix-blend-mode: multiply;
    pointer-events: none;
  }
  .bottom {
    display: flex; justify-content: space-between; align-items: flex-end;
    font-family: var(--mono);
    font-size: 18px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--cream);
    opacity: 0.82;
  }
  .wordmark {
    font-family: var(--sans);
    font-weight: 900;
    font-size: 30px;
    letter-spacing: -0.02em;
    text-transform: lowercase;
    opacity: 1;
  }
  .wordmark em {
    font-style: normal;
    font-weight: 800;
    color: var(--accent);
  }
  .rail {
    position: absolute;
    left: 80px; right: 80px;
    bottom: 160px;
    height: 2px;
    background: rgba(242,239,231,0.14);
  }
</style></head><body>${SVG_FILTER}
<div class="stack">
  <div class="el-metodo spray">El Método</div>
  <div class="claude spray">Claude<span class="grain-overlay"></span></div>
</div>
<div class="rail"></div>
<div class="bottom">
  <div class="wordmark">rafa<em>.prompts</em></div>
</div>
</body></html>`;
}

function moduloCoverHtml(number, title) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_HEAD}
<style>
  body {
    width: 800px; height: 450px;
    background: var(--bg);
    color: var(--cream);
    padding: 42px 52px 34px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: var(--mono);
    font-size: 13px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(242,239,231,0.5);
  }
  .middle {
    display: flex;
    align-items: flex-end;
    gap: 28px;
  }
  .num {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 132px;
    line-height: 0.82;
    color: var(--accent);
    letter-spacing: -0.04em;
    flex-shrink: 0;
  }
  .module-label { color: var(--accent); }
  .title {
    font-family: var(--sans);
    font-weight: 900;
    font-size: 48px;
    line-height: 0.95;
    letter-spacing: -0.025em;
    text-transform: lowercase;
    color: var(--cream);
    max-width: 14ch;
    padding-bottom: 12px;
  }
  .bottom {
    display: flex; justify-content: space-between; align-items: flex-end;
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(242,239,231,0.55);
    padding-top: 18px;
    border-top: 1px solid rgba(242,239,231,0.14);
  }
  .wordmark {
    font-family: var(--sans);
    font-weight: 900;
    font-size: 18px;
    letter-spacing: -0.02em;
    text-transform: lowercase;
    color: var(--cream);
  }
  .wordmark em {
    font-style: normal;
    font-weight: 800;
    color: var(--accent);
  }
</style></head><body>${SVG_FILTER}
<div class="middle">
  <div class="num spray">${number}</div>
  <div class="title spray">${title}</div>
</div>
<div class="bottom">
  <div class="wordmark">rafa<em>.prompts</em></div>
</div>
</body></html>`;
}

function markPngHtml(size) {
  // Simple bold mark: terracotta "/" centered on black. Scales from 16 to 512.
  const fs_ = Math.round(size * 0.78);
  return `<!doctype html><html><head><meta charset="utf-8">${FONT_HEAD}
<style>
  body {
    width: ${size}px; height: ${size}px;
    background: #0A0A0A;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .mark {
    font-family: 'Archivo', system-ui, sans-serif;
    font-weight: 900;
    font-size: ${fs_}px;
    line-height: 1;
    color: #DA7756;
    letter-spacing: -0.06em;
    transform: translateY(-2%);
  }
</style></head><body>${SVG_FILTER}
<div class="mark">/</div>
</body></html>`;
}

const JOBS = [
  { name: 'og-image.png',         w: 1200, h: 630, html: ogImageHtml() },
  { name: 'metodo-cover.png',     w: 1280, h: 720, html: metodoCoverHtml() },
  { name: 'modulo-01-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('01', 'Pensar en Claude') },
  { name: 'modulo-02-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('02', 'El CLAUDE.md') },
  { name: 'modulo-03-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('03', 'Skills y agentes') },
  { name: 'modulo-04-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('04', 'Pipelines reales') },
  { name: 'modulo-05-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('05', 'Orquestación') },
  { name: 'modulo-06-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('06', 'Iteración y medida') },
  { name: 'modulo-07-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('07', 'Claude Code: el agente que vive en tu editor') },
  { name: 'modulo-08-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('08', 'Skills nativas, subagentes y MCP') },
  { name: 'modulo-09-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('09', 'Construir tu primer sistema autónomo') },
  { name: 'modulo-10-cover.png',  w: 800,  h: 450, html: moduloCoverHtml('10', 'Vivir con un sistema de IA') },
  { name: 'favicon-16.png',       w: 16,   h: 16,  html: markPngHtml(16),  dsf: 1 },
  { name: 'favicon-32.png',       w: 32,   h: 32,  html: markPngHtml(32),  dsf: 1 },
  { name: 'favicon.png',          w: 32,   h: 32,  html: markPngHtml(32),  dsf: 1 },
  { name: 'apple-touch-icon.png', w: 180,  h: 180, html: markPngHtml(180), dsf: 1 },
];

async function main() {
  const browser = await chromium.launch();
  for (const job of JOBS) {
    const context = await browser.newContext({
      viewport: { width: job.w, height: job.h },
      deviceScaleFactor: job.dsf ?? 2,
    });
    const page = await context.newPage();
    await page.setContent(job.html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const out = path.join(OUT, job.name);
    await page.screenshot({
      path: out,
      clip: { x: 0, y: 0, width: job.w, height: job.h },
    });
    await context.close();
    console.log(`[ok] ${out}  (${job.w}x${job.h})`);
  }
  await browser.close();
}

async function buildIco() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 48, height: 48 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(markPngHtml(48), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const fav48 = path.join(OUT, 'favicon-48.png');
  await page.screenshot({ path: fav48, clip: { x: 0, y: 0, width: 48, height: 48 } });
  await browser.close();
  const ico = await pngToIco([
    path.join(OUT, 'favicon-16.png'),
    path.join(OUT, 'favicon-32.png'),
    fav48,
  ]);
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico);
  fs.unlinkSync(fav48);
  console.log('[ok] assets/img/favicon.ico  (multi 16+32+48)');
}

main().then(buildIco).catch((e) => {
  console.error(e);
  process.exit(1);
});
