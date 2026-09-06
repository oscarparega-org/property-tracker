import { z } from "zod";
import { httpUrl } from './property-input.js';
const optionalText = z.string().trim().transform((value) => value || null);
const optionalNumber = z.string().trim().transform((value, context) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    context.addIssue({ code: "custom", message: "Debe ser un número positivo." });
    return z.NEVER;
  }
  return parsed;
});
const optionalInteger = optionalNumber.pipe(z.number().int().nullable());

export const editorSchema = z.object({
  id: z.string(),
  sourceProvider: z.string().trim().min(1),
  sourceUrl: httpUrl.or(z.literal("")),
  sourceListingId: optionalText,
  sourceListingKey: optionalText,
  title: z.string().trim().min(1),
  description: optionalText,
  propertyType: z.enum(["APARTMENT", "HOUSE", "LAND", "OTHER"]),
  priceAmount: optionalNumber,
  priceCurrency: z.string().trim().toUpperCase().length(3).or(z.literal("")),
  street: optionalText,
  exteriorNumber: optionalText,
  interiorNumber: optionalText,
  neighborhood: optionalText,
  municipality: optionalText,
  state: optionalText,
  postalCode: optionalText,
  countryCode: z.string().trim().toUpperCase().length(2),
  formattedAddress: optionalText,
  latitude: z.string().trim().transform((value) => (value ? Number(value) : null)).pipe(z.number().min(-90).max(90).nullable()),
  longitude: z.string().trim().transform((value) => (value ? Number(value) : null)).pipe(z.number().min(-180).max(180).nullable()),
  landAreaM2: optionalNumber,
  constructionAreaM2: optionalNumber,
  bedrooms: optionalInteger,
  bathrooms: optionalNumber,
  parkingSpaces: optionalInteger,
  parkingType: optionalText,
  serviceRoom: z.enum(["", "true", "false"]),
  propertyAgeYears: optionalInteger,
  condition: optionalText,
  orientation: optionalText,
  landUse: optionalText,
  buildingLevels: optionalInteger,
  unitFloor: optionalInteger,
  maintenanceAmount: optionalNumber,
  maintenanceCurrency: z.string().trim().toUpperCase().length(3).or(z.literal("")),
  technicalSheetQrUrl: httpUrl.or(z.literal("")),
  agentName: optionalText,
  agentAvatarUrl: httpUrl.or(z.literal("")),
  agentPhones: z.string(),
  agentEmail: z.string().trim().email().or(z.literal("")),
  officeName: optionalText,
  sourceOfficeId: optionalText,
  decisionStatus: z.enum(["NEW", "CONTACTED", "VISIT_SCHEDULED", "VISITED", "OFFER_MADE", "REJECTED", "PURCHASED"]),
  rating: z.string().transform((value) => (value ? Number(value) : null)).pipe(z.number().int().min(1).max(5).nullable()),
  notes: optionalText,
  visitAt: z.string().transform((value) => (value ? new Date(value) : null)).pipe(z.date().nullable()),
  rejectionReason: optionalText,
  sourceMetadata: z.string().transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({ code: "custom", message: "Los metadatos deben ser JSON válido." });
      return z.NEVER;
    }
  }),
  images: z.string(),
  areaFeatures: z.string(),
  equipmentFeatures: z.string(),
  otherFeatures: z.string(),
  publicationStatus: z.enum(["DRAFT", "PUBLISHED"]),
});


export const decisionSchema = z.object({
  id: z.string().min(1),
  decisionStatus: z.enum(["NEW", "CONTACTED", "VISIT_SCHEDULED", "VISITED", "OFFER_MADE", "REJECTED", "PURCHASED"]),
  rating: z.string().transform((value) => (value ? Number(value) : null)).pipe(z.number().int().min(1).max(5).nullable()),
  visitAt: z.string().transform((value) => (value ? new Date(value) : null)).pipe(z.date().nullable()),
  notes: optionalText,
  rejectionReason: optionalText,
});
