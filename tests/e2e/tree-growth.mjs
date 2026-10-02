import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
const site = await startTestSite();
const ideas = Array.from({ length: 30 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  title:
    i === 0
      ? 'A shared workshop where students and neighbours can build, store and create their physical projects together.'
      : `Community idea ${i + 1}`,
  description: `A welcoming outdoor place for community idea ${i + 1}.`,
  place: 'Waterloo',
  plot: i + 6,
  createdAt: i,
  waters: i === 0 ? 30 : i === 1 ? 15 : i === 2 ? 5 : 0,
  watered: false,
  example: false,
  commentCount: 0,
}));
await mkdir('outputs/tree-growth', { recursive: true });
try {
  for (const config of [
    { engine: chromium, name: 'desktop', width: 1440, height: 1000 },
    { engine: webkit, name: 'portrait', width: 390, height: 844 },
    { engine: webkit, name: 'landscape', width: 844, height: 390 },
  ]) {
    const browser = await config.engine.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: config.width, height: config.height },
        reducedMotion: 'reduce',
        isMobile: config.name !== 'desktop',
        hasTouch: config.name !== 'desktop',
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/api/ideas*', (route) =>
        route.fulfill({
          json: {
            ideas,
            total: 30,
            grovePages: [0],
            examples: [],
            examplesTotal: 0,
            nextPage: null,
          },
        }),
      );
      await page.goto(site.origin);
      await page.getByRole('button', { name: 'Got it', exact: true }).click();
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.garden-target')).reduce(
            (n, e) =>
              n +
              (e.getAttribute('aria-label')?.startsWith('Read idea:')
                ? 1
                : Number(
                    e
                      .getAttribute('aria-label')
                      ?.match(/Choose from (\d+)/)?.[1] || 0,
                  )),
            0,
          ) === 30,
      );
      assert.equal(
        await page
          .getByRole('button', { name: 'Next grove', exact: true })
          .count(),
        0,
      );
      await page
        .locator('.garden-stage')
        .screenshot({ path: `outputs/tree-growth/${config.name}.png` });
      assert.equal(await page.locator('.cluster-marker').count(), 0);
      assert.equal(await page.locator('[data-tree-target]').count(), 30);
      assert.equal(
        await page
          .locator('.tree-hit-target .marker-face')
          .first()
          .evaluate((el) => getComputedStyle(el).opacity),
        '0',
      );
      // Tooltips must escape the garden's clip, stay on screen, and dismiss.
      if (config.name === 'desktop') {
        const first = page.locator('[data-tree-target]').first();
        await page.keyboard.press('Tab');
        await first.focus();
        const tooltip = page.getByRole('tooltip');
        await tooltip.waitFor();
        assert.equal(
          await tooltip.locator('.tree-tooltip-likes').textContent(),
          '30 likes',
        );
        assert.equal(
          await tooltip.evaluate((el) => !!el.closest('.garden-stage')),
          false,
        );
        await page.screenshot({ path: 'outputs/tree-growth/hover.png' });
        for (const corner of [
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
        ]) {
          // Exercise the same portalled trigger at each screen edge.
          await first.evaluate((el, corner) => {
            const anchor = el.parentElement;
            anchor.style.transform = 'none';
            anchor.style.position = 'fixed';
            const stage = el.closest('.garden-stage').getBoundingClientRect();
            anchor.style.left = `${(corner.endsWith('right') ? innerWidth - 54 : 6) - stage.left}px`;
            anchor.style.top = `${(corner.startsWith('bottom') ? innerHeight - 54 : 6) - stage.top}px`;
          }, corner);
          await page.waitForTimeout(150);
          const box = await tooltip.boundingBox();
          assert.ok(
            box &&
              box.x >= 0 &&
              box.y >= 0 &&
              box.x + box.width <= config.width &&
              box.y + box.height <= config.height,
            `tooltip visible at ${corner}`,
          );
        }
        await page.keyboard.press('Escape');
        await tooltip.waitFor({ state: 'hidden' });
        // Restore normal projected positions before checking real tree taps.
        await page.reload();
        await page.locator('[data-tree-target]').first().waitFor();
      }
      const overlap = await page
        .locator('[data-tree-target]')
        .evaluateAll((elements) => {
          const rects = elements.map((el) => el.getBoundingClientRect());
          for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i],
                b = rects[j];
              const left = Math.max(a.left, b.left, 0),
                right = Math.min(a.right, b.right, innerWidth);
              const top = Math.max(a.top, b.top, 0),
                bottom = Math.min(a.bottom, b.bottom, innerHeight);
              if (right - left > 4 && bottom - top > 4)
                return { x: (left + right) / 2, y: (top + bottom) / 2 };
            }
          return null;
        });
      assert.ok(
        overlap,
        'dense trees retain accessible overlapping touch areas',
      );
      if (config.name === 'desktop')
        await page.mouse.click(overlap.x, overlap.y);
      else await page.touchscreen.tap(overlap.x, overlap.y);
      await page
        .getByRole('heading', { name: 'Nearby ideas', exact: true })
        .waitFor();
      assert.ok((await page.locator('.nearby-ideas button').count()) > 1);
      await page.keyboard.press('Escape');
      await page
        .getByRole('heading', { name: 'Nearby ideas', exact: true })
        .waitFor({ state: 'hidden' });
      const target = page.locator('[data-tree-target]').first();
      await target.focus();
      await target.press('Enter');
      if (config.name === 'desktop')
        await page.locator('.garden-idea-dock').waitFor();
      else
        await page
          .getByRole('button', { name: 'Back to trees', exact: true })
          .waitFor();
      assert.deepEqual(errors, []);
      console.log(
        'PASS 30 badge-free trees, ambiguous tap chooser and keyboard access',
        config.name,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await site.dispose();
}
