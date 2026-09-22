import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startTestSite } from '../helpers/test-site.mjs';
const artifacts = path.resolve('outputs/browser-checks');
await mkdir(artifacts, { recursive: true });
const site = await startTestSite({ preview: true });
let desktop, mobile;
const errors = [];
try {
  desktop = await chromium.launch();
  mobile = await webkit.launch();
  const authorContext = await desktop.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const author = await authorContext.newPage();
  author.setDefaultTimeout(15000);
  author.on('pageerror', (e) => errors.push(e.message));
  await author.goto(site.origin);
  await author
    .getByRole('button', { name: 'Skip introduction', exact: true })
    .click();
  await author
    .getByRole('button', { name: 'Plant an idea', exact: true })
    .click();
  await author
    .locator('#new-idea')
    .fill('A night market with student makers and food near Waterloo Park.');
  await author.locator('#idea-signature').fill('Alex, 19, student');
  await author.getByText('Ask people a question', { exact: true }).click();
  await author
    .locator('#idea-question')
    .fill('Where could we try the first one?');
  const posted = author.waitForResponse(
    (r) => r.url().endsWith('/api/ideas') && r.request().method() === 'POST',
  );
  await author.getByRole('button', { name: 'Post idea', exact: true }).click();
  const { idea } = await (await posted).json();
  assert.ok(idea?.id);
  await author.locator('.plant-receipt').waitFor();
  assert.match(
    await author.locator('.plant-receipt').innerText(),
    /Where could we try the first one/,
  );
  const shareUrl = site.origin + `/ideas/${idea.id}?via=share`;
  const mobileContext = await mobile.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const helper = await mobileContext.newPage();
  helper.setDefaultTimeout(15000);
  helper.on('pageerror', (e) => errors.push(e.message));
  await helper.goto(shareUrl);
  await helper
    .getByRole('heading', {
      name: 'Where could we try the first one?',
      exact: true,
    })
    .waitFor();
  assert.equal(
    await helper
      .getByRole('button', { name: 'Update your idea', exact: true })
      .count(),
    0,
  );
  await helper.getByRole('button', { name: 'A place', exact: true }).click();
  await helper
    .getByRole('textbox', { name: 'Your reply', exact: true })
    .fill(
      'Try the promenade by Silver Lake; movable stalls would leave the path open.',
    );
  await helper
    .getByRole('textbox', {
      name: 'About you (optional, shown with your reply)',
      exact: true,
    })
    .fill('Jamie, 37, lifelong resident');
  await helper
    .getByRole('button', { name: 'Add contribution', exact: true })
    .click();
  await helper
    .getByText('Your contribution is part of this idea.', { exact: true })
    .waitFor();
  await helper.screenshot({
    path: path.join(artifacts, 'participation-mobile.jpg'),
    quality: 70,
    fullPage: true,
  });
  assert.ok(
    await helper.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.ok(
    (await helper.locator('.reply-footer input').boundingBox()).height <= 52,
    'mobile attribution stays one line',
  );
  const comments = await (
    await authorContext.request.get(
      site.origin + '/api/comments?ideaId=' + idea.id,
    )
  ).json();
  assert.equal(comments.comments.length, 1);
  await author.goto(shareUrl);
  await author
    .getByRole('button', { name: 'Use in an update', exact: true })
    .click();
  await author
    .locator('#update-proposal')
    .fill(
      'Try a small night market on the Silver Lake promenade, with student makers and movable stalls that leave the path open.',
    );
  await author
    .locator('#update-question')
    .fill('Who could help run a one-evening trial?');
  await author
    .locator('#update-note')
    .fill('Added Jamie’s promenade location and movable stalls.');
  let dropped = false;
  const keys = [];
  await author.route('**/api/activity', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().postDataJSON().submissionKey);
    if (!dropped) {
      dropped = true;
      await route.fetch();
      return route.abort('failed');
    }
    return route.continue();
  });
  await author
    .getByRole('button', { name: 'Publish update', exact: true })
    .click();
  await author
    .locator('.idea-update-form [role="alert"]')
    .filter({ hasText: /Couldn’t connect|connection timed out/ })
    .waitFor({ timeout: 22000 });
  assert.equal(
    await author.locator('#update-note').inputValue(),
    'Added Jamie’s promenade location and movable stalls.',
  );
  await author
    .getByRole('button', { name: 'Publish update', exact: true })
    .click();
  await author
    .getByText('Updated. Your idea is taking shape.', { exact: true })
    .waitFor();
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  await author.locator('.idea-history > summary').click();
  await author.getByText('Included in this update', { exact: true }).waitFor();
  await author.getByText('Original idea', { exact: true }).click();
  await author.screenshot({
    path: path.join(artifacts, 'participation-desktop.jpg'),
    quality: 70,
    fullPage: true,
  });
  await helper.reload();
  await helper
    .getByRole('heading', {
      name: 'Who could help run a one-evening trial?',
      exact: true,
    })
    .waitFor();
  await helper.getByText('Included in an update', { exact: true }).waitFor();
  await helper.setViewportSize({ width: 844, height: 390 });
  assert.ok(
    await helper.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await helper.screenshot({
    path: path.join(artifacts, 'participation-landscape.jpg'),
    quality: 65,
    fullPage: true,
  });
  // Authenticate only to this disposable preview; never use the user's key or database.
  const login = await authorContext.request.post(
    site.origin + '/api/admin/session',
    { headers: { Origin: site.origin }, data: { key: site.adminSecret } },
  );
  assert.equal(login.status(), 200);
  await author.goto(site.origin + '/organizer');
  await author.locator('.review-queue-item').first().click();
  await author.locator('#review-status').selectOption('needs-help');
  await author
    .locator('#review-body')
    .fill('I will ask nearby groups who could help run a small evening trial.');
  await author
    .getByRole('button', { name: 'Publish response', exact: true })
    .click();
  await author
    .getByText(
      'Response published. It is now visible on the idea and Updates.',
      { exact: true },
    )
    .waitFor();
  await author.screenshot({
    path: path.join(artifacts, 'organizer-desktop.jpg'),
    quality: 70,
    fullPage: true,
  });
  await helper.goto(site.origin + '/updates');
  await helper
    .getByText(
      'I will ask nearby groups who could help run a small evening trial.',
      { exact: true },
    )
    .waitFor();
  await author.goto(site.origin);
  await author
    .getByRole('button', { name: 'Find an idea', exact: true })
    .click();
  await author.locator('.garden-idea-dock').waitFor();
  await author.locator('.garden-target.selected').waitFor();
  await author.waitForTimeout(600); // Let the bounded camera framing settle before the visual artifact.
  assert.match(
    await author.locator('.garden-idea-dock').innerText(),
    /Build on this/,
  );
  await author.screenshot({
    path: path.join(artifacts, 'participation-park.jpg'),
    quality: 70,
    fullPage: true,
  });
  await helper.goto(site.origin);
  await helper
    .getByRole('button', { name: 'Skip introduction', exact: true })
    .click();
  await helper
    .getByRole('button', { name: 'Find an idea', exact: true })
    .click();
  await helper.locator('.garden-target.selected').waitFor();
  const dock = await helper.locator('.garden-idea-dock').boundingBox();
  const theme = await helper.locator('.park-themes').boundingBox();
  const navigation = await helper.locator('.explore-toolbar').boundingBox();
  assert.ok(
    dock.y >= theme.y + theme.height,
    'landscape card must not cover theme/quality controls',
  );
  assert.ok(
    dock.y + dock.height <= navigation.y,
    'landscape card must stay above bottom navigation',
  );
  await helper.screenshot({
    path: path.join(artifacts, 'participation-park-landscape.jpg'),
    quality: 70,
    fullPage: true,
  });
  await helper.setViewportSize({ width: 390, height: 844 });
  await helper.screenshot({
    path: path.join(artifacts, 'participation-park-mobile.jpg'),
    quality: 70,
    fullPage: true,
  });
  const h = await (
    await authorContext.request.get(
      site.origin + '/api/activity?ideaId=' + idea.id,
    )
  ).json();
  assert.equal(h.activities.length, 2);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: question → shared mobile contribution → credited author revision → organizer response → public updates; lost-response retries; portrait/landscape overflow; no browser errors',
  );
} finally {
  await desktop?.close();
  await mobile?.close();
  await site.dispose();
}
