// Loves in the garden: plant on grass, never on water; the placement tap must not
// also select a tree; "Me too" persists; loves survive a reload.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
import { plantLove } from '../helpers/park-ui.mjs';

const artifacts = 'outputs/browser-checks';
await mkdir(artifacts, { recursive: true });
const engines = (process.env.WATERLOO_TEST_BROWSERS || 'chromium,webkit')
  .split(',')
  .map((name) => ({ name, launcher: { chromium, webkit }[name] }))
  .filter((engine) => engine.launcher);
const site = await startTestSite();

/** Tap canvas points until the love composer opens; returns true on success. */
async function tapUntilComposer(page, points) {
  const canvas = await page.locator('.scene canvas').boundingBox();
  for (const [fx, fy] of points) {
    await page.mouse.click(
      canvas.x + canvas.width * fx,
      canvas.y + canvas.height * fy,
    );
    await page.waitForTimeout(350);
    if (await page.getByRole('dialog').isVisible()) return true;
  }
  return false;
}

try {
  for (const engine of engines) {
    const browser = await engine.launcher.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 860 },
    });
    await context.addInitScript(() => {
      localStorage.setItem('waterloo-park-tour-seen-v2', 'yes');
      localStorage.setItem('garden-motion', 'off');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(site.origin);
    await page.locator('.scene canvas').waitFor();
    await page.waitForTimeout(2500); // models load before the lawn can be probed

    // Water and paths are refused; placement stays active until grass is chosen.
    await plantLove(page);
    await page.getByText('Tap the grass where it is.').waitFor();
    const canvas = await page.locator('.scene canvas').boundingBox();
    await page.mouse.click(
      canvas.x + canvas.width * 0.47,
      canvas.y + canvas.height * 0.51,
    );
    await page.waitForTimeout(350);
    if (await page.getByText(/That’s a path, the lake/).isVisible())
      assert.equal(await page.getByRole('dialog').isVisible(), false);

    const opened = await tapUntilComposer(page, [
      [0.3, 0.72],
      [0.18, 0.8],
      [0.45, 0.78],
      [0.62, 0.72],
      [0.25, 0.6],
      [0.4, 0.65],
    ]);
    assert.ok(opened, 'a tap on grass opens the love composer');
    const body = `Reading by the lake after class (${engine.name}).`;
    await page.getByLabel('What you love').fill(body);
    await page.getByRole('button', { name: 'Plant this love' }).click();

    const card = page.getByLabel('Selected love');
    await card.waitFor();
    assert.match(await card.innerText(), /Reading by the lake/);
    assert.equal(
      await page.locator('.garden-idea-dock').count(),
      0,
      'the placement tap must not also select an idea tree',
    );

    const meToo = card.getByRole('button', { name: /Me too/ });
    await meToo.click();
    await page.waitForFunction(
      () =>
        document.querySelector('.love-echo')?.getAttribute('aria-pressed') ===
        'true',
    );
    const saved = await page.evaluate(() =>
      fetch('/api/loves').then((r) => r.json()),
    );
    const mine = saved.loves.find((love) => love.body === body);
    assert.ok(mine, 'the love is stored');
    assert.equal(mine.echoes, 1);
    assert.equal(mine.echoed, true);
    assert.equal(mine.owned, true);
    assert.equal('visitorId' in mine || 'submissionKey' in mine, false);
    await page.screenshot({
      path: path.join(artifacts, `${engine.name}-love.jpg`),
      quality: 70,
    });

    await page.reload();
    await page.locator('.scene canvas').waitFor();
    // Wait for the bloom rather than sleeping: models and the city load at their own pace.
    await page
      .locator('.love-caption')
      .first()
      .waitFor({ state: 'attached', timeout: 20000 })
      .catch(() => {
        throw new assert.AssertionError({
          message: 'loves bloom again after a reload',
        });
      });
    // Reporting a love is one tap with a confirmation.
    const chip = page.locator('.love-caption[data-occluded="false"]').first();
    if (await chip.count()) {
      await chip.click();
      const selected = page.getByLabel('Selected love');
      await selected
        .getByRole('button', { name: 'Report', exact: true })
        .click();
      await selected
        .getByText('Thanks. This was flagged for review.')
        .waitFor();
      await selected.getByRole('button', { name: 'Close love' }).click();
    }

    // Choosing a place: the keyboard and no-WebGL path, no canvas tap needed.
    await plantLove(page);
    await page
      .getByRole('button', { name: 'Choose a place instead', exact: true })
      .click();
    const chosen = page.getByRole('dialog');
    await chosen.getByLabel('Where is it?').selectOption('silver-lake');
    await chosen
      .getByLabel('What you love')
      .fill(`Geese on Silver Lake in spring (${engine.name}).`);
    await chosen.getByRole('button', { name: 'Plant this love' }).click();
    await page.getByLabel('Selected love').waitFor();
    assert.match(
      await page.getByLabel('Selected love').innerText(),
      /Geese on Silver Lake/,
    );
    const listed = await page.evaluate(() =>
      fetch('/api/loves').then((r) => r.json()),
    );
    assert.equal(
      listed.loves.find((l) => l.body.startsWith('Geese on Silver Lake'))
        ?.landmark,
      'silver-lake',
    );

    // A cancelled placement must not come back after visiting the list.
    await plantLove(page);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('tab', { name: /^Ideas/ }).click();
    assert.ok(
      await page.getByRole('button', { name: 'Plant: i want…' }).isVisible(),
      'the wordmark returns to "want" after leaving the garden',
    );
    // The list offers its own way to add a love, by choosing a place.
    await page.getByRole('button', { name: 'Add a love', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Where is it?').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Garden', exact: true }).click();
    await page.locator('.scene canvas').waitFor();
    await page.waitForTimeout(800);
    assert.equal(
      await page.getByText('Tap the grass where it is.').count(),
      0,
      'placement does not restart when the garden returns',
    );

    assert.deepEqual(errors, []);
    await browser.close();
    console.log(
      `PASS: ${engine.name} love placement, rejection, me too and reload`,
    );
  }
} finally {
  await site.dispose();
}
