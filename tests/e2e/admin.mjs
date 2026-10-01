import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startTestSite } from '../helpers/test-site.mjs';
await mkdir('outputs/admin-checks', { recursive: true });
const site = await startTestSite();
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: engine === webkit ? 390 : 1280, height: 900 },
        reducedMotion: 'reduce',
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(site.origin + '/admin');
      await page
        .getByLabel('Admin email', { exact: true })
        .fill('jerry@unrepped.co');
      await page
        .getByRole('button', { name: 'Email me a sign-in link' })
        .click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'not configured' })
        .waitFor();
      await page.screenshot({
        path: `outputs/admin-checks/login-${engine.name()}.png`,
      });
      // UI fixtures only. Real authorization/deletion is covered by production-admin.mjs.
      let deleted = false,
        added = false;
      await page.route('**/api/manage/**', async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        let data;
        if (path.endsWith('/session')) data = { email: 'jerry@unrepped.co' };
        else if (path.endsWith('/ideas')) {
          if (request.method() === 'DELETE') {
            assert.equal(request.postDataJSON().confirm, true);
            deleted = true;
            data = { ok: true, removed: 1 };
          } else
            data = {
              ideas: deleted
                ? []
                : [
                    {
                      id: 'test-idea',
                      title: 'Local test idea',
                      description:
                        'A local test idea for checking the admin controls.',
                      displayName: 'Test author',
                      place: 'Waterloo',
                      likes: 2,
                      comments: 1,
                    },
                  ],
              nextOffset: null,
            };
        } else if (path.endsWith('/members')) {
          if (request.method() === 'POST') {
            assert.equal(request.postDataJSON().email, 'new@example.com');
            added = true;
            data = { ok: true };
          } else
            data = {
              admins: [
                { email: 'jerry@unrepped.co', owner: true },
                { email: 'jerry@akatos.com', owner: true },
                ...(added ? [{ email: 'new@example.com', owner: false }] : []),
              ],
            };
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data),
        });
      });
      await page.reload();
      await page
        .getByText('A local test idea for checking the admin controls.', {
          exact: true,
        })
        .waitFor();
      await page
        .getByRole('button', { name: 'Delete Local test idea' })
        .click();
      assert.equal(deleted, false);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(deleted, false);
      await page
        .getByRole('button', { name: 'Delete Local test idea' })
        .click();
      await page
        .getByRole('button', { name: 'Delete idea', exact: true })
        .click();
      await page
        .getByRole('status')
        .filter({ hasText: 'Idea deleted.' })
        .waitFor();
      assert.equal(deleted, true);
      await page.getByRole('button', { name: 'Admins', exact: true }).click();
      await page
        .getByLabel('Add an admin', { exact: true })
        .fill('new@example.com');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByText('new@example.com', { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: `outputs/admin-checks/members-${engine.name()}.png`,
      });
      assert.deepEqual(errors, []);
      console.log(
        'PASS',
        engine.name(),
        'login, confirmation/cancel, deletion feedback, add-admin UI and overflow',
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await site.dispose();
}
