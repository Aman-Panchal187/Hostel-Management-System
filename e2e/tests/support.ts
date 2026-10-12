import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

export const env = {
  platformEmail: process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'platform.admin@example.test',
  platformPassword: process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? '',
  demoPassword: process.env.DEMO_PASSWORD ?? '',
  apiBase: `http://localhost:${process.env.NGINX_PORT ?? '8080'}`,
};

export const DEMO = {
  hostelAdmin: 'admin.sunrise@demo.hostel.test',
  hostelAdminB: 'admin.greenvalley@demo.hostel.test',
  assistant: 'assistant1.sunrise@demo.hostel.test',
  student: 'student1.sunrise@demo.hostel.test',
  pendingStudent: 'student15.sunrise@demo.hostel.test',
  pendingHostelAdmin: 'admin.campusnest@demo.hostel.test',
};

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const NEW_PASSWORD = 'E2eTest#2026';

/** Signs in through the UI; waits out the rate limiter if a previous test exhausted the window. */
export async function uiLogin(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function loginAs(page: Page, email: string, password: string, expectedPath: RegExp) {
  await uiLogin(page, email, password);
  await expect(page).toHaveURL(expectedPath, { timeout: 15_000 });
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Direct API login (through Nginx) used to cross-check UI numbers against the backend. */
export async function apiToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${env.apiBase}/api/auth/login`, { data: { email, password } });
  expect(res.status(), `API login for ${email}`).toBe(200);
  return (await res.json()).accessToken as string;
}
