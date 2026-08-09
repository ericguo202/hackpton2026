/**
 * Pin Puppeteer's Chromium download inside the project.
 *
 * By default Puppeteer caches the browser in `~/.cache/puppeteer`. On Vercel
 * the home directory is not carried from the install step into the build step,
 * so `npm run build` would fail to launch Chromium and take the whole deploy
 * with it (the prerenderer fails loud by design). Keeping the cache in the
 * project directory — the documented workaround — means the browser fetched
 * during `npm install` is still there when `scripts/prerender.mjs` runs.
 *
 * `.cjs` is required: package.json declares `"type": "module"`.
 */

const { join } = require('path');

/** @type {import('puppeteer').Configuration} */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
