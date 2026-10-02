import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
import { openMenu } from '../helpers/park-ui.mjs';

const phone = {
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  reducedMotion: 'reduce',
};
const site = await startTestSite();
try {
  for (const [engine, options] of [
    [chromium, { ...phone, isMobile: true }],
    [webkit, phone],
  ]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext(options);
      await context.addInitScript(() =>
        localStorage.setItem('waterloo-park-tour-seen-v2', 'yes'),
      );
      let cityRequests = 0;
      context.on('request', (request) => {
        if (request.url().includes('/park/context.json')) cityRequests++;
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // The canvas starts at the browser's default 300px until the scene sizes it.
      const canvasWidthBetween = (min, max) =>
        page.waitForFunction(
          ([min, max]) => {
            const width = document.querySelector('canvas')?.width ?? 300;
            return width !== 300 && width >= min && width <= max;
          },
          [min, max],
          { timeout: 30000 },
        );
      const transform = page.getByRole('button', { name: 'Transform me' });
      // The park's walkers report how many are out on the canvas (tests, look-dev).
      const people = () =>
        page.evaluate(() =>
          Number(document.querySelector('canvas')?.dataset.people || 0),
        );

      // Phones open the stripped-down park: no city download, 1x resolution.
      await page.goto(site.origin);
      await transform.waitFor();
      await page.locator('canvas').waitFor();
      assert.equal(cityRequests, 0, 'the stripped-down park skips the city');
      assert.equal(await people(), 0, 'no walkers in the stripped-down park');
      await canvasWidthBetween(390, 390); // stripped-down renders at 1x

      // "Transform me" grows the full park in place and remembers the choice.
      await transform.tap();
      await page.waitForFunction(
        () => !document.querySelector('.park-transform'),
        null,
        { timeout: 30000 },
      );
      assert.equal(cityRequests, 1, 'transforming loads the city');
      await canvasWidthBetween(391, Infinity); // the full park renders sharper
      // A transformed phone gets a handful of walkers, never the laptop crowd.
      await page.waitForFunction(
        () => Number(document.querySelector('canvas')?.dataset.people) > 0,
        null,
        { timeout: 30000 },
      );
      assert.ok((await people()) <= 8, 'phones get at most eight people');
      await page.reload();
      await page.locator('canvas').waitFor();
      await page.waitForTimeout(1000);
      assert.equal(await transform.isVisible(), false, 'the choice is kept');

      // The menu switches back.
      await (
        await openMenu(page)
      )
        .getByRole('button', { name: 'Use lighter version', exact: true })
        .tap();
      await transform.waitFor();
      assert.equal(await people(), 0, 'switching back sends the people home');
      assert.deepEqual(errors, []);
      console.log(
        `PASS: ${engine.name()} phones start stripped down without people, transform to a few, remember and switch back`,
      );
    } finally {
      await browser.close();
    }
  }

  // Laptops get the full park with no transform step.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(site.origin);
    await page.locator('canvas').waitFor();
    await page.waitForTimeout(1000);
    assert.equal(
      await page.getByRole('button', { name: 'Transform me' }).isVisible(),
      false,
    );
    // Laptops get the park's people even with no ideas yet; how many depends on
    // the live time of day (most go home after dark), but never fewer than two.
    await page.waitForFunction(
      () => Number(document.querySelector('canvas')?.dataset.people) >= 2,
      null,
      { timeout: 30000 },
    );
    const menu = await openMenu(page);
    assert.equal(
      await menu.getByRole('button', { name: /lighter version/ }).count(),
      0,
    );
    console.log(
      'PASS: laptops get the full park and its people without a transform step',
    );
  } finally {
    await browser.close();
  }
} finally {
  await site.dispose();
}
