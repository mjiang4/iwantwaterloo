import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
import { openMenu } from '../helpers/park-ui.mjs';
const site = await startTestSite();
try {
  for (const [engine, viewport] of [
    [chromium, { width: 1280, height: 900 }],
    [webkit, { width: 390, height: 844 }],
  ]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      await page.goto(site.origin + '/feedback');
      await page
        .getByLabel('Your feedback', { exact: true })
        .fill('Please make the garden navigation easier to discover.');
      let dropped = false;
      const keys = [];
      await page.route('**/api/feedback', async (route) => {
        keys.push(route.request().postDataJSON().submissionKey);
        if (!dropped) {
          dropped = true;
          await route.fetch();
          await route.abort('failed');
        } else await route.continue();
      });
      await page
        .getByRole('button', { name: 'Send feedback', exact: true })
        .click();
      await page.getByRole('alert').waitFor();
      assert.ok(
        (
          await page.getByLabel('Your feedback', { exact: true }).inputValue()
        ).includes('navigation'),
      );
      await page
        .getByRole('button', { name: 'Send feedback', exact: true })
        .click();
      await page
        .getByText('Thanks for helping improve this.', { exact: true })
        .waitFor();
      assert.equal(keys.length, 2);
      assert.equal(keys[0], keys[1]);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
      await page.getByRole('link', { name: 'Back to garden' }).click();
      await (
        await openMenu(page)
      )
        .getByRole('button', { name: 'About and privacy', exact: true })
        .click();
      await page
        .getByRole('link', { name: 'giving us feedback', exact: true })
        .click();
      await page
        .getByRole('heading', { name: 'Help improve this website' })
        .waitFor();
      console.log(
        'PASS: ' +
          engine.name() +
          ' feedback retries, mobile layout and About link',
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await site.dispose();
}
