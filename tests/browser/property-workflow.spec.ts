import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const emails: string[] = [];
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

test('fresh signup, URL extraction, draft review, publication and personal decision', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `browser-${randomUUID()}@example.com`;
  emails.push(email);
  await page.goto('/sign-up');
  await page.getByLabel('Nombre', { exact: true }).fill('Prueba House Tracker');
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('link', { name: 'House Tracker, propiedades' })).toBeVisible();
  await page.locator('details.account-menu > summary').click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await expect(page.locator('.property-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Configuración e integraciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Integraciones personales' })).toBeVisible();
  await expect(page.locator('details.account-menu')).not.toHaveAttribute('open', '');
  const openAiCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'OpenAI', exact: true }) });
  await openAiCard.getByLabel('API key de OpenAI').fill('sk-browser-owner-secret');
  await openAiCard.getByLabel('Usar OpenAI en mis importaciones').check();
  await openAiCard.getByRole('button', { name: 'Guardar y validar' }).click();
  await expect(openAiCard.getByText('Activa', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(openAiCard.getByText(/••••cret/)).toBeVisible();
  await openAiCard.getByRole('button', { name: 'Probar conexión' }).click();
  await expect(openAiCard.getByText('La conexión es válida.')).toBeVisible();
  const firecrawlCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Firecrawl', exact: true }) });
  await firecrawlCard.getByLabel('API key de Firecrawl').fill('fc-browser-owner-secret');
  await firecrawlCard.getByLabel('Usar Firecrawl en mis importaciones').check();
  await firecrawlCard.getByRole('button', { name: 'Guardar y validar' }).click();
  await expect(firecrawlCard.getByText('Activa', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Volver a propiedades' }).click();
  await page.getByRole('button', { name: 'Crear mi primera búsqueda' }).click();
  await page.getByLabel('Nombre de la búsqueda').fill('Roma y Condesa');
  await page.getByRole('button', { name: 'Crear búsqueda' }).click();
  await page.screenshot({ path: 'test-results/search-overview-desktop.png', fullPage: true });
  const firstSearchLink = page.getByRole('link', { name: /Roma y Condesa/ });
  const firstSearchId = String(await firstSearchLink.getAttribute('href'))
    .split('/')
    .at(-1)!;
  await firstSearchLink.click();
  await page.getByRole('link', { name: 'Agregar', exact: true }).click();
  await page.getByRole('textbox', { name: 'URL de la publicación' }).fill('https://example.com/house-tracker-fixture');
  await page.getByRole('button', { name: 'Importar y crear borrador' }).click();
  await expect(page).toHaveURL(/\/properties\/[^/]+\/review/, { timeout: 30_000 });
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Casa de prueba');
  await expect(page.getByLabel('Precio', { exact: true })).toHaveValue('2500000');
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page).toHaveURL(/\/properties\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Casa de prueba', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mejorar con Firecrawl + IA' }).click();
  await expect(page.getByRole('heading', { name: 'Información nueva encontrada' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/1 imágenes nuevas/)).toBeVisible();
  await page.getByRole('button', { name: 'Aplicar información nueva' }).click();
  await expect(page.getByText('La información nueva fue aplicada.')).toBeVisible();
  await expect(page.locator('.gallery-preview img')).toHaveCount(1);
  await page.getByLabel('Mis notas').fill('Agendar visita el sábado');
  await page.getByLabel('Estado').selectOption('VISITED');
  await page.getByRole('combobox', { name: /^Calificación/ }).selectOption('4');
  await page.getByLabel('Marcar como favorita').check();
  await page.getByRole('button', { name: 'Guardar mi decisión' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Mis notas')).toHaveValue('Agendar visita el sábado');
  await expect(page.getByLabel('Marcar como favorita')).toBeChecked();

  await page.getByRole('link', { name: 'Propiedades', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva búsqueda' }).click();
  await page.getByLabel('Nombre de la búsqueda').fill('Polanco');
  await page.getByRole('button', { name: 'Crear búsqueda' }).click();
  const secondSearchLink = page.getByRole('link', { name: /Polanco/ });
  const secondSearchId = String(await secondSearchLink.getAttribute('href'))
    .split('/')
    .at(-1)!;
  await page.getByRole('link', { name: /Roma y Condesa/ }).click();
  await page.getByRole('link', { name: 'Ver Casa de prueba' }).click();
  await page.getByLabel('Polanco').check();
  await page.getByRole('button', { name: 'Guardar búsquedas' }).click();
  await expect(page.getByText('Búsquedas actualizadas.')).toBeVisible();
  await page.getByRole('link', { name: 'Volver al mapa y la lista' }).click();
  await expect(page.locator('.property-card')).toHaveCount(1);
  await page.getByLabel('Cambiar búsqueda').selectOption(secondSearchId);
  await page.goto(`/searches/${secondSearchId}?view=process`);
  const visibleStageControl = () => page.getByLabel('Etapa de Casa de prueba').filter({ visible: true });
  await expect(visibleStageControl()).toHaveValue('NEW');
  await visibleStageControl().selectOption('REJECTED');
  await expect(visibleStageControl()).toHaveValue('REJECTED');
  await page.getByLabel('Cambiar búsqueda').selectOption(firstSearchId);
  await page.goto(`/searches/${firstSearchId}?view=process`);
  await expect(visibleStageControl()).toHaveValue('VISITED');
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.kanban-board')).toBeHidden();
  await expect(page.locator('.mobile-process-list')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await page.getByRole('link', { name: 'Propiedades', exact: true }).click();
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filtrar propiedades' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar filtros' }).click();
  expect(await page.locator('.filterbar').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('.property-card .card-select').click();
  await expect(page).toHaveURL(new RegExp(`/searches/${firstSearchId}/properties/[^/]+$`));
  await expect(page.getByRole('button', { name: 'Actualizar mi decisión' })).toBeVisible();
  await page.locator('details.account-menu > summary').click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/sign-in');
  expect(errors).toEqual([]);
});
