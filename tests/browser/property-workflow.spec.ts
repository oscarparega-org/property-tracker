import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const emails: string[] = [];
let propertyId = '';

test.beforeAll(async () => {
  const suffix = randomUUID();
  const property = await db.property.create({
    data: {
      ownerId: null,
      sourceProvider: 'remax.com.mx',
      sourceUrl: `https://remax.com.mx/propiedad/browser-${suffix}`,
      sourceListingId: `browser-${suffix}`,
      sourceListingKey: `RX-${suffix.slice(0, 8)}`,
      sourceObservedAt: new Date(),
      sourceMetadata: { privateFixture: true },
      title: 'Departamento luminoso en Narvarte',
      description: 'Dos recámaras, balcón y espacios bien iluminados.',
      propertyType: 'APARTMENT',
      priceAmount: 4_350_000,
      priceCurrency: 'MXN',
      street: 'Avenida Universidad',
      formattedAddress: 'Avenida Universidad, Narvarte Poniente',
      neighborhood: 'Narvarte Poniente',
      municipality: 'Benito Juárez',
      state: 'Ciudad de México',
      bedrooms: 2,
      bathrooms: 2,
      constructionAreaM2: 88,
      parkingSpaces: 1,
      publicationStatus: 'PUBLISHED',
      neighborhoodId: 'mx-cmx-benito-juarez-narvarte-poniente',
      images: { create: { url: 'https://placehold.co/1200x800/png', alt: 'Sala del departamento', sortOrder: 0 } },
      catalogListing: {
        create: {
          sourceId: 'remax-narvarte-poniente',
          sourceListingId: `browser-${suffix}`,
          sourceModifiedAt: new Date(),
          status: 'ACTIVE'
        }
      }
    }
  });
  propertyId = property.id;
});

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: emails } } });
  if (propertyId) await db.property.deleteMany({ where: { id: propertyId } });
  await db.$disconnect();
});

test('public catalog exposes geography, advanced filters, and stable URL state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Explora propiedades' })).toBeVisible();
  await expect(page.getByLabel('Estado')).toContainText('Ciudad de México');
  await expect(page.getByLabel('Alcaldía')).toContainText('Benito Juárez');
  await expect(
    page.getByRole('region', { name: 'Ubicación del catálogo' }).getByLabel('Búsqueda de destino')
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Departamento luminoso en Narvarte' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Tipo' })).toBeHidden();
  await page.screenshot({ path: 'test-results/catalog-desktop.png', fullPage: true });
  await page.getByLabel('Buscar propiedades').fill('Universidad');
  await page.getByRole('button', { name: 'Filtros' }).click();
  await expect(page.getByRole('group', { name: 'Tipo' })).toBeVisible();
  await page.getByRole('button', { name: 'Departamento', exact: true }).click();
  await page.getByLabel('Precio mínimo').fill('4000000');
  await page.getByRole('button', { name: '2', exact: true }).first().click();
  await page.getByRole('button', { name: '2', exact: true }).last().click();
  await page.getByLabel('Construcción mínimo').fill('80');
  await page.getByLabel('Ordenar').selectOption('price_desc');
  await expect(page).toHaveURL(/propertyTypes=APARTMENT/);
  await expect(page).toHaveURL(/sort=price_desc/);
});

test('sign-in handoff and personal search lifecycle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `browser-${randomUUID()}@example.com`;
  emails.push(email);

  await page.goto('/sign-up');
  await page.getByLabel('Nombre', { exact: true }).fill('Prueba House Tracker');
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Explora propiedades' })).toBeVisible();
  await page.getByRole('link', { name: 'Mis búsquedas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Crear mi primera búsqueda' }).click();
  await page.getByLabel('Nombre de la búsqueda').fill('Narvarte favorita');
  await page.getByRole('button', { name: 'Crear búsqueda' }).click();
  const searchLink = page.getByRole('link', { name: /Narvarte favorita/ });
  const searchId = String(await searchLink.getAttribute('href'))
    .split('/')
    .at(-1)!;

  await page.goto(`/searches/${searchId}/properties/new`);
  await expect(page.getByRole('navigation', { name: 'Forma de agregar propiedad' })).toContainText(
    'CatálogoDesde una URLCaptura manual'
  );
  await page.getByRole('link', { name: 'Desde una URL' }).click();
  await expect(page.getByLabel('URL de la publicación')).toBeVisible();
  await page.getByRole('link', { name: 'Captura manual' }).click();
  await expect(page.getByText('Nueva propiedad manual')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar editor' }).click();
  await expect(page).toHaveURL(`/searches/${searchId}`);

  await page.locator('details.account-menu > summary').click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/');

  await expect(page.getByRole('heading', { name: 'Departamento luminoso en Narvarte' })).toBeVisible();

  const card = page.getByRole('article').filter({ hasText: 'Departamento luminoso en Narvarte' });
  await card.getByRole('button', { name: 'Agregar a mi búsqueda' }).click();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?selected=${propertyId}`));
  await expect(page.getByLabel('Búsqueda de destino')).toHaveValue(searchId);
  await page
    .getByRole('article')
    .filter({ hasText: 'Departamento luminoso en Narvarte' })
    .getByRole('button', { name: 'Agregar a mi búsqueda' })
    .click();
  await expect(page).toHaveURL(`/searches/${searchId}/properties/${propertyId}`);
  await expect(page.getByRole('heading', { name: 'Departamento luminoso en Narvarte' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mejorar con Firecrawl + IA' })).toHaveCount(0);

  await page.getByLabel('Mis notas').fill('Preguntar por el balcón');
  await page.getByLabel('Estado').selectOption('VISITED');
  await page.getByLabel('Marcar como favorita').check();
  await page.getByRole('button', { name: 'Guardar mi decisión' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Mis notas')).toHaveValue('Preguntar por el balcón');
  await expect(page.getByLabel('Marcar como favorita')).toBeChecked();

  expect(errors).toEqual([]);
});

test('catalog advanced filters remain usable on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Departamento luminoso en Narvarte' })).toBeVisible();
  await page.getByRole('button', { name: 'Filtros' }).click();
  await expect(page.getByRole('group', { name: 'Tipo' })).toBeVisible();
  await page.screenshot({ path: 'test-results/catalog-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
