import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
const site = await startTestSite({ screening: 'unavailable' });
try {
  for (const [engine, width] of [
    [chromium, 1280],
    [webkit, 390],
  ]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        reducedMotion: 'reduce',
      });
      await page.goto(site.origin);
      await page.getByRole('button', { name: 'Got it', exact: true }).click();
      await page
        .getByRole('button', { name: 'Share an idea', exact: true })
        .click();
      await page
        .locator('#new-idea')
        .fill('Synthetic browser test: covered benches by the library.');
      const receipt = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/ideas') && r.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: 'Plant your idea', exact: true })
        .click();
      const saved = await (await receipt).json();
      assert.equal(saved.idea.moderationState, 'pending');
      await page
        .getByRole('heading', { name: 'Thanks—your idea is awaiting review.' })
        .waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: 'See your tree', exact: true })
          .count(),
        0,
      );
      for (const suffix of ['', '/image'])
        assert.equal(
          (
            await page.request.get(
              site.origin + '/ideas/' + saved.idea.id + suffix,
            )
          ).status(),
          404,
        );
      assert.equal(
        (
          await (
            await page.request.get(site.origin + '/api/ideas?garden=1')
          ).json()
        ).total,
        0,
      );
      await page
        .getByRole('button', { name: 'Browse the garden', exact: true })
        .click();
      console.log('PASS pending receipt and private page/image', { width });
    } finally {
      await browser.close();
    }
  }
} finally {
  await site.dispose();
}
