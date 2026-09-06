import type { PropertyInput } from '@house-tracker/shared';

export type ExtractionArtifact = {
  url: string;
  provider: string;
  strategy: 'direct' | 'firecrawl';
  html: string;
  text: string;
  metadata: Record<string, unknown>;
};

export type ExtractionResult = {
  input: PropertyInput;
  evidence: Record<string, unknown>;
  provider: string;
  strategy: string;
  inputTokens?: number;
  outputTokens?: number;
  firecrawlCredits: number;
};

export type ListingGate = 'ZERO' | 'BORDERLINE' | 'PASS';

export type DirectExtraction = {
  input: PropertyInput;
  evidence: Record<string, unknown>;
  complete: boolean;
  gate: ListingGate;
  confidenceScore: number;
};

export class ListingValidationError extends Error {
  readonly retryable = false;

  constructor(message = 'La URL no parece corresponder a una publicación de una propiedad.') {
    super(message);
  }
}

export class ProviderRequestError extends Error {
  constructor(
    public readonly providerKind: 'OPENAI' | 'FIRECRAWL',
    public readonly reason: 'AUTH' | 'UNAVAILABLE',
    public readonly diagnostic: {
      status?: number;
      requestId?: string | null;
      code?: string | null;
      type?: string | null;
      providerMessage?: string | null;
    } = {}
  ) {
    super(reason === 'AUTH' ? 'La credencial del proveedor ya no es válida.' : 'El proveedor no está disponible.');
  }
}

export type ExtractionOptions = {
  mode?: 'STANDARD' | 'DEEP';
  debug?: (stage: string, details?: Record<string, unknown>) => void;
  firecrawl?: {
    credential: string;
    onInvalidCredential: () => Promise<void>;
  };
  openai?: {
    credential: string;
    model: string;
    onInvalidCredential: () => Promise<void>;
  };
};
