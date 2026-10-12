import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { apiToken, DEMO, env, loginAs, NEW_PASSWORD, signOut, uniq } from './support';

test.describe.configure({ mode: 'serial' });

const run = uniq();
const hostelName = `E2E Hostel ${run}`;
const adminEmail = `e2e.admin.${run}@e2e.test`;
const studentEmail = `e2e.student.${run}@e2e.test`;
const assistantEmail = `e2e.assistant.${run}@e2e.test`;
const assistantName = `Ava Assistant ${run.slice(0, 4)}`;
const issueTitle = `E2E leaking tap ${run}`;
let issueUrl = '';

async function approve(page: Page, email: string) {
  const row = page.getByTestId('approval-row').filter({ hasText: email });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^Approve/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Request approved' })).toBeVisible();
}

async function registerMember(page: Page, kind: 'Student' | 'Assistant', email: string, name: string) {
  await page.goto('/register/join');
  if (kind === 'Assistant') await page.getByRole('tab', { name: /assistant/i }).click();
  await page.getByRole('combobox', { name: 'Hostel' }).fill(hostelName);
  await page.getByRole('option', { name: new RegExp(hostelName) }).click();
  if (kind === 'Student') await page.getByLabel('Room').selectOption('101');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Request access' }).click();
  await expect(page.getByTestId('pending-state')).toBeVisible();
}

test('Scenario 1: hostel onboarding (register -> pending -> platform approval -> dashboard)', async ({ page }) => {
  await page.goto('/register/hostel');
  await page.getByLabel('Hostel name').fill(hostelName);
  await page.getByLabel('Address').fill('21 Lake View Road, Kothrud');
  await page.getByLabel('City', { exact: true }).fill('Pune');
  await page.getByLabel('Contact phone').fill('+91 98765 00000');
  await page.getByLabel('Contact email').fill(`office.${run}@e2e.test`);
  await page.getByLabel('Your name').fill('E2E Warden');
  await page.getByLabel('Login email').fill(adminEmail);
  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByTestId('pending-state')).toBeVisible();

  // Pending admin cannot sign in
  await page.goto('/login');
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('pending-state')).toBeVisible();

  await loginAs(page, env.platformEmail, env.platformPassword, /\/platform$/);
  await page.goto('/platform/approvals');
  await approve(page, adminEmail);
  await signOut(page);

  await loginAs(page, adminEmail, NEW_PASSWORD, /\/hostel$/);
  await expect(page.getByRole('heading', { name: hostelName })).toBeVisible();
  await expect(page.getByTestId('kpi-total-value')).toHaveText('0');

  // Add a room so students can register
  await page.goto('/hostel/rooms');
  await page.getByRole('button', { name: 'Add room' }).click();
  await page.getByRole('dialog').getByLabel('Room number').fill('101');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: '101', exact: true })).toBeVisible();
});

test('Scenario 2: student onboarding', async ({ page }) => {
  await registerMember(page, 'Student', studentEmail, 'Sam Student');
  await loginAs(page, adminEmail, NEW_PASSWORD, /\/hostel$/);
  await page.goto('/hostel/approvals');
  await approve(page, studentEmail);
  await signOut(page);
  await loginAs(page, studentEmail, NEW_PASSWORD, /\/student$/);
  await expect(page.getByRole('heading', { name: /Hello, Sam/ })).toBeVisible();
});

test('Scenario 3: assistant onboarding', async ({ page }) => {
  await registerMember(page, 'Assistant', assistantEmail, assistantName);
  await loginAs(page, adminEmail, NEW_PASSWORD, /\/hostel$/);
  await page.goto('/hostel/approvals');
  await approve(page, assistantEmail);
  await signOut(page);
  await loginAs(page, assistantEmail, NEW_PASSWORD, /\/assistant$/);
  await expect(page.getByRole('heading', { name: /Hello, Ava/ })).toBeVisible();
});

test('Scenario 4: complete issue lifecycle', async ({ page, request }) => {
  // 1-2. Student creates an issue with reference media
  await loginAs(page, studentEmail, NEW_PASSWORD, /\/student$/);
  await page.getByRole('link', { name: 'Report an issue' }).first().click();
  await page.getByLabel('Title').fill(issueTitle);
  await page.getByLabel('Category', { exact: true }).selectOption('PLUMBING');
  await page.getByLabel('Priority').selectOption('HIGH');
  await page.getByLabel('Description').fill('The kitchen tap leaks all day and floods the floor.');
  await page.getByLabel('Media URL').fill('https://picsum.photos/seed/e2e-leak/800/600');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Submit issue' }).click();
  await expect(page).toHaveURL(/\/issues\/[0-9a-f-]{36}$/);
  issueUrl = new URL(page.url()).pathname;
  await expect(page.getByTestId('issue-title')).toHaveText(issueTitle);
  await expect(page.getByTestId('history-entry')).toHaveCount(1);
  await signOut(page);

  // 3-4. Hostel admin sees it and assigns it
  await loginAs(page, adminEmail, NEW_PASSWORD, /\/hostel$/);
  await page.goto('/hostel/issues');
  const row = page.getByRole('row').filter({ hasText: issueTitle });
  await expect(row).toBeVisible();
  await row.getByLabel('Assign issue').selectOption({ label: assistantName });
  await expect(page.getByRole('status').filter({ hasText: 'Issue assigned' })).toBeVisible();
  await signOut(page);

  // 5-9. Assistant works the issue
  await loginAs(page, assistantEmail, NEW_PASSWORD, /\/assistant$/);
  await page.goto('/assistant/issues');
  await page.getByRole('link', { name: issueTitle }).click();
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start work' }).click();
  await expect(page.getByText('In progress').first()).toBeVisible();

  // Completing without evidence is blocked
  await page.getByLabel('Resolution notes').fill('Replaced the washer and tightened the valve.');
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'at least one photo or video' })).toBeVisible();

  await page.getByLabel('Evidence URL').fill('https://picsum.photos/seed/e2e-fixed/800/600');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByTestId('resolution-notes')).toHaveText('Replaced the washer and tightened the valve.');
  await signOut(page);

  // 10. Student sees the resolved issue
  await loginAs(page, studentEmail, NEW_PASSWORD, /\/student$/);
  await page.goto(issueUrl);
  await expect(page.getByTestId('resolution-notes')).toBeVisible();
  await expect(page.getByText('Done').first()).toBeVisible();
  // 12. Verify history: created -> in progress -> done
  await expect(page.getByTestId('history-entry')).toHaveCount(3);
  await expect(page.getByTestId('history-entry').nth(1)).toContainText('In progress');
  await expect(page.getByTestId('history-entry').nth(2)).toContainText('Done');
  await signOut(page);

  // 11. Hostel admin dashboard reflects the change (UI == API)
  await loginAs(page, adminEmail, NEW_PASSWORD, /\/hostel$/);
  await expect(page.getByTestId('kpi-total-value')).toHaveText('1');
  await expect(page.getByTestId('kpi-done-value')).toHaveText('1');
  const token = await apiToken(request, adminEmail, NEW_PASSWORD);
  const api = await (await request.get(`${env.apiBase}/api/analytics/hostel`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(api.kpis).toMatchObject({ total: 1, done: 1, inProgress: 0, yetToStart: 0, completionRate: 100 });
});

test('Scenario 5: cross-tenant isolation', async ({ page, request }) => {
  // Hostel B (demo Green Valley) issue id, fetched with B's own credentials
  const tokenB = await apiToken(request, DEMO.hostelAdminB, env.demoPassword);
  const listB = await (await request.get(`${env.apiBase}/api/issues?pageSize=1`, { headers: { Authorization: `Bearer ${tokenB}` } })).json();
  const foreignId = listB.data[0].id as string;
  const foreignTitle = listB.data[0].title as string;

  const tokenA = await apiToken(request, adminEmail, NEW_PASSWORD);
  const headersA = { Authorization: `Bearer ${tokenA}` };
  const direct = await request.get(`${env.apiBase}/api/issues/${foreignId}`, { headers: headersA });
  expect(direct.status()).toBe(404);
  expect(await direct.text()).not.toContain(foreignTitle);
  const assign = await request.post(`${env.apiBase}/api/issues/${foreignId}/assign`, { headers: headersA, data: { assigneeId: foreignId } });
  expect([400, 404]).toContain(assign.status());
  const listA = await (await request.get(`${env.apiBase}/api/issues?pageSize=100`, { headers: headersA })).json();
  expect(listA.data.map((i: { id: string }) => i.id)).not.toContain(foreignId);
  expect((await request.get(`${env.apiBase}/api/analytics/platform`, { headers: headersA })).status()).toBe(403);

  // Same through the UI
  await loginAs(page, adminEmail, NEW_PASSWORD, /\/hostel$/);
  await page.goto(`/issues/${foreignId}`);
  await expect(page.getByText('Issue not found')).toBeVisible();
  await expect(page.getByText(foreignTitle)).toHaveCount(0);
  // role guard: hostel admin cannot open the platform area
  await page.goto('/platform');
  await expect(page).toHaveURL(/\/hostel$/);
});

test('Scenario 6: analytics filters and PDF export', async ({ page, request }) => {
  await loginAs(page, DEMO.hostelAdmin, env.demoPassword, /\/hostel$/);
  await page.goto('/hostel/analytics');
  const token = await apiToken(request, DEMO.hostelAdmin, env.demoPassword);
  const authHeaders = { Authorization: `Bearer ${token}` };
  const from = new Date(Date.now() - 90 * 86_400_000);
  from.setHours(0, 0, 0, 0);

  await expect(page.getByTestId('kpi-total-value')).not.toHaveText('');
  const apiAll = await (await request.get(`${env.apiBase}/api/analytics/hostel`, { headers: authHeaders, params: { from: from.toISOString() } })).json();
  await expect(page.getByTestId('kpi-total-value')).toHaveText(String(apiAll.kpis.total));
  await expect(page.getByTestId('kpi-done-value')).toHaveText(String(apiAll.kpis.done));
  expect(apiAll.kpis.total).toBeGreaterThanOrEqual(40);

  // Change a filter -> numbers follow the API
  await page.getByLabel('Status', { exact: true }).selectOption('DONE');
  await expect(page.getByTestId('kpi-total-value')).toHaveText(String(apiAll.kpis.done));
  await page.getByLabel('Category', { exact: true }).selectOption('PLUMBING');
  const apiFiltered = await (await request.get(`${env.apiBase}/api/analytics/hostel`, { headers: authHeaders, params: { from: from.toISOString(), status: 'DONE', category: 'PLUMBING' } })).json();
  await expect(page.getByTestId('kpi-total-value')).toHaveText(String(apiFiltered.kpis.total));
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await page.getByLabel('Category', { exact: true }).selectOption('');
  await expect(page.getByTestId('kpi-total-value')).toHaveText(String(apiAll.kpis.total));

  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: 'Export PDF' }).click()]);
  const file = await download.path();
  const bytes = fs.readFileSync(file);
  expect(download.suggestedFilename()).toMatch(/^hostel-report-.*\.pdf$/);
  expect(bytes.length).toBeGreaterThan(20_000);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  fs.mkdirSync('.artifacts', { recursive: true });
  fs.copyFileSync(file, '.artifacts/hostel-report-sample.pdf');
});
