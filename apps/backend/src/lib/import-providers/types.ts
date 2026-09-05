import type { ExtractionArtifact, DirectExtraction } from "../import-extraction.js";

export type ProviderContext = {
  fetchHtml: (url: string) => Promise<{ url: string; html: string }>;
  fetchJson: (url: string, options?: { method?: "GET" | "POST"; referer?: string }) => Promise<{ url: string; data: unknown }>;
};

export type ImportProvider = {
  key: string;
  name: string;
  version: string;
  matches: (url: URL) => boolean;
  enrich?: (artifact: ExtractionArtifact, context: ProviderContext) => Promise<ExtractionArtifact>;
  extract?: (artifact: ExtractionArtifact) => DirectExtraction | null;
};
