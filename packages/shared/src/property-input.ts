import { z } from "zod";

export const httpUrl = z.url({ protocol: /^https?$/ });

const nullableString = z.string().trim().min(1).nullable();
const nullableUrl = httpUrl.nullable();
const nullableNumber = z.number().finite().nonnegative().nullable();
const nullableInteger = z.number().int().nonnegative().nullable();

export const propertyInputSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    provider: z.string().trim().min(1).max(80),
    url: httpUrl,
    listingId: nullableString,
    listingKey: nullableString,
    observedAt: z.iso.datetime({ offset: true }),
    rawMetadata: z.record(z.string(), z.unknown()),
  }),
  property: z.object({
    title: z.string().trim().min(1).max(300),
    description: nullableString,
    propertyType: z.enum(["APARTMENT", "HOUSE", "LAND", "OTHER"]),
    operationType: z.literal("SALE"),
    price: z.object({
      amount: nullableNumber,
      currency: z.string().length(3).toUpperCase().nullable(),
    }),
    address: z.object({
      street: nullableString,
      exteriorNumber: nullableString,
      interiorNumber: nullableString,
      neighborhood: nullableString,
      municipality: nullableString,
      state: nullableString,
      postalCode: nullableString,
      countryCode: z.string().length(2).toUpperCase(),
      formatted: nullableString,
    }),
    coordinates: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
      })
      .nullable(),
    details: z.object({
      landAreaM2: nullableNumber,
      constructionAreaM2: nullableNumber,
      bedrooms: nullableInteger,
      bathrooms: nullableNumber,
      parkingSpaces: nullableInteger,
      parkingType: nullableString,
      serviceRoom: z.boolean().nullable(),
      propertyAgeYears: nullableInteger,
      condition: nullableString,
      orientation: nullableString,
      landUse: nullableString,
      buildingLevels: nullableInteger,
      unitFloor: nullableInteger,
      maintenanceAmount: nullableNumber,
      maintenanceCurrency: z.string().length(3).toUpperCase().nullable(),
    }),
    technicalSheetQrUrl: nullableUrl,
  }),
  images: z.array(
    z.object({
      url: httpUrl,
      alt: nullableString,
      order: z.number().int().nonnegative(),
    }),
  ),
  features: z.array(
    z.object({
      category: z.enum(["AREA", "EQUIPMENT", "OTHER"]),
      name: z.string().trim().min(1).max(120),
    }),
  ),
  contact: z.object({
    agentName: nullableString,
    agentAvatarUrl: nullableUrl,
    phones: z.array(z.string().trim().min(1).max(40)),
    email: z.email().nullable(),
    officeName: nullableString,
    sourceOfficeId: nullableString,
  }),
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export function canonicalizeListingUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  const trackingNames = new Set(["fbclid", "gclid", "msclkid", "ref", "referrer"]);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || trackingNames.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}
