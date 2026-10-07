/*
 * Smoke test for Live mode (watch the screen). Run it after big changes, not in CI:
 *
 *   npm run dev                      # in one terminal
 *   NODE_PATH="$(npm root -g)" node scripts/smoke-live.cjs [url] [screenshot.png]
 *
 * Needs Playwright with Chromium installed globally. Chromium's headless screen sharing delivers no frames,
 * so `getDisplayMedia` is replaced by a canvas stream that draws a fake page with a synthetic board (simple
 * piece silhouettes, no artwork). The test then checks that the app finds the board, learns the pieces from
 * the starting position, records moves, maps stepping back to undo, and keeps analysing.
 */
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:5173/';
const SHOT = process.argv[3] || 'smoke-live.png';

const POSITIONS = {
  start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
  e4: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR',
  e5: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR',
  nf3: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R',
  f3: 'rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR',
  f3e5: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR',
  f3e5g4: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR',
};

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.addInitScript((positions) => {
    localStorage.setItem('carlzen_welcome_dismissed', 'true');
    localStorage.setItem('carlzen_engine_depth', '10');
    const SHAPES = {
      p: [[0.35, 0.3, 0.65, 0.8]],
      n: [[0.25, 0.5, 0.75, 0.8], [0.25, 0.2, 0.5, 0.5]],
      b: [[0.4, 0.15, 0.6, 0.85], [0.25, 0.7, 0.75, 0.85]],
      r: [[0.25, 0.2, 0.75, 0.85]],
      q: [[0.2, 0.15, 0.8, 0.85], [0.4, 0.1, 0.6, 0.2]],
      k: [[0.3, 0.3, 0.7, 0.85], [0.45, 0.1, 0.55, 0.35], [0.35, 0.18, 0.65, 0.26]],
    };
    let placement = positions.start;
    window.__setPosition = (name) => {
      placement = positions[name];
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const g = canvas.getContext('2d');
    const S = 80;
    const draw = () => {
      g.fillStyle = '#262421';
      g.fillRect(0, 0, 1280, 720);
      g.fillStyle = '#312e2b';
      g.fillRect(820, 0, 460, 720);
      g.fillStyle = '#81b64c';
      g.fillRect(850, 620, 240, 50);
      g.fillStyle = '#6e6c68';
      for (let k = 0; k < 10; k++) g.fillRect(850, 40 + k * 55, 200 + k * 12, 28);
      placement.split('/').forEach((row, r) => {
        let c = 0;
        for (const ch of row) {
          if (/\d/.test(ch)) {
            for (let i = 0; i < Number(ch); i++, c++) square(r, c, null);
          } else {
            square(r, c++, ch);
          }
        }
      });
    };
    const square = (r, c, piece) => {
      const x = 90 + c * S;
      const y = 40 + r * S;
      g.fillStyle = (r + c) % 2 === 0 ? '#ebecd0' : '#779556';
      g.fillRect(x, y, S, S);
      if (!piece) return;
      g.fillStyle = piece === piece.toUpperCase() ? '#fafafa' : '#1e1e1e';
      for (const [x0, y0, x1, y1] of SHAPES[piece.toLowerCase()]) {
        g.fillRect(x + x0 * S, y + y0 * S, (x1 - x0) * S, (y1 - y0) * S);
      }
    };
    setInterval(draw, 100);
    navigator.mediaDevices.getDisplayMedia = async () => canvas.captureStream(15);
  }, POSITIONS);

  await page.goto(URL);
  await page.waitForSelector('text=Watch Screen');
  const sessions = () => page.evaluate(() => JSON.parse(localStorage.getItem('carlzen_sessions') || '[]'));
  const active = async () => (await sessions())[0];
  const placementOf = (fen) => fen.split(' ')[0];

  check(await page.isVisible('text=Share screen'), 'Live panel is shown');
  check((await page.$('#elo-slider')) !== null, 'Elo strength slider is shown');

  await page.click('text=Share screen');
  await page.waitForTimeout(4500);
  check(/Watching the board/.test(await page.innerText('.live-status')), 'board found and watched', await page.innerText('.live-status'));
  check(placementOf((await active()).fen) === POSITIONS.start, 'start position read');

  const play = async (name, wait = 3500) => {
    await page.evaluate((n) => window.__setPosition(n), name);
    await page.waitForTimeout(wait);
  };

  await play('e4');
  let s = await active();
  check(placementOf(s.fen) === POSITIONS.e4 && s.undoStack.map((e) => e.san).join() === 'e4', 'e4 recorded as a move');
  await play('e5');
  await play('nf3');
  s = await active();
  check(s.undoStack.map((e) => e.san).join() === 'e4,e5,Nf3', 'moves in history', s.undoStack.map((e) => e.san).join());
  check(/Evaluation/.test(await page.innerText('body')), 'engine analyses the live position');

  await play('e5');
  s = await active();
  check(placementOf(s.fen) === POSITIONS.e5 && s.redoStack.length === 1, 'stepping back is an undo', `redo=${s.redoStack.length}`);

  // a blunder: 1.f3 e5 2.g4?? allows Qh4#
  await play('start');
  await play('f3', 6000);
  await play('f3e5', 6000);
  await play('f3e5g4', 9000);
  s = await active();
  const last = s.undoStack.at(-1);
  check(s.undoStack.map((e) => e.san).join() === 'f3,e5,g4', 'second game recorded', s.undoStack.map((e) => e.san).join());
  check(last && last.review && last.review.grade === 'blunder', 'g4 is graded a blunder and the grade is stored', JSON.stringify(last && last.review));
  check(/Blunder: g4/.test(await page.innerText('.live-verdict').catch(() => '')), 'verdict shown in the Live panel');
  check(/g4\?\?/.test(await page.innerText('.move-history')), 'history is annotated with ??');

  await page.evaluate(() => {
    const slider = document.getElementById('elo-slider');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(slider, '1500');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  check((await page.evaluate(() => localStorage.getItem('carlzen_engine_elo'))) === '1500', 'Elo setting is saved');

  await page.screenshot({ path: SHOT });
  check(errors.length === 0, 'no console errors', JSON.stringify(errors));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('SMOKE FAILED', e.message);
  process.exit(1);
});
