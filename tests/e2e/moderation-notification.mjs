import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
const site = await startTestSite();
try {
  for (const { engine, width } of [
    { engine: chromium, width: 1280 },
    { engine: webkit, width: 390 },
  ]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.clock.install();
      let total = 0;
      await page.route('**/api/manage/session', (r) =>
        r.fulfill({ json: { email: 'reviewer@example.test' } }),
      );
      await page.route('**/api/manage/members', (r) =>
        r.fulfill({ json: { admins: [] } }),
      );
      await page.route('**/api/manage/ideas*', (r) =>
        r.fulfill({ json: { ideas: [], nextOffset: null } }),
      );
      await page.route('**/api/manage/review', async (r) => {
        if (r.request().method() === 'POST') {
          total--;
          await r.fulfill({ json: { ok: true } });
          return;
        }
        await r.fulfill({
          json: {
            total,
            items: total
              ? [
                  {
                    id: 'test-idea',
                    kind: 'idea',
                    body: 'A covered place to meet near the library.',
                    displayName: '',
                    reason: 'Screening unavailable — please review manually.',
                  },
                ]
              : [],
          },
        });
      });
      await page.goto(site.origin + '/admin');
      await page
        .getByText('Nothing awaiting review.', { exact: true })
        .waitFor();
      await page.getByRole('button', { name: 'Admins', exact: true }).click();
      total = 102;
      await page.clock.runFor(60000);
      await page
        .getByText('102 submissions awaiting review', { exact: true })
        .waitFor();
      await page
        .getByRole('button', { name: 'Review submissions', exact: true })
        .click();
      await page
        .getByText('Showing the oldest 1 of 102. More appear as you review.', {
          exact: true,
        })
        .waitFor();
      await mkdir('outputs/moderation-notification', { recursive: true });
      await page.screenshot({
        path: `outputs/moderation-notification/admin-${width}.png`,
      });
      await page.getByRole('button', { name: 'Approve', exact: true }).click();
      await page
        .getByText('101 submissions awaiting review', { exact: true })
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      console.log(
        'PASS auto-refresh, count, admin-tab visibility, review and mobile width',
        width,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await site.dispose();
}
