import { fetchWithFirecrawl } from './firecrawl-client.js';
import { extractDeterministic } from './generic-property-extractor.js';
import { assessAndNormalizeWithOpenAI } from './openai-extractor.js';
import { fetchDirect } from './safe-http-transport.js';
import type { ExtractionOptions, ExtractionResult } from './import-types.js';
import { ListingValidationError, ProviderRequestError } from './import-types.js';

export { assertSafePublicUrl } from './public-url.js';
export { extractDeterministic } from './generic-property-extractor.js';
export { aiListingAssessmentSchema, aiPropertyInputSchema, openAiStructuredSchema } from './openai-extractor.js';
export type {
  DirectExtraction,
  ExtractionArtifact,
  ExtractionOptions,
  ExtractionResult,
  ListingGate
} from './import-types.js';
export { ListingValidationError, ProviderRequestError } from './import-types.js';

export async function extractProperty(value: string, options: ExtractionOptions): Promise<ExtractionResult> {
  const mode = options.mode ?? 'STANDARD';
  let artifact;
  let firecrawlCredits = 0;

  if (mode === 'DEEP') {
    options.debug?.('firecrawl.required', { mode });
    if (!options.firecrawl || !options.openai) {
      throw new Error('La mejora profunda requiere Firecrawl y OpenAI activos.');
    }
    options.debug?.('firecrawl.request.started');
    try {
      artifact = await fetchWithFirecrawl(value, options.firecrawl.credential);
    } catch (error) {
      options.debug?.('firecrawl.request.failed', { error });
      if (error instanceof ProviderRequestError && error.reason === 'AUTH') {
        await options.firecrawl.onInvalidCredential();
      }
      throw error;
    }
    firecrawlCredits = 1;
    options.debug?.('firecrawl.request.completed', {
      provider: artifact.provider,
      htmlCharacters: artifact.html.length,
      textCharacters: artifact.text.length,
      metadataKeys: Object.keys(artifact.metadata).length
    });
  } else {
    options.debug?.('direct.request.started', { method: 'GET' });
    try {
      artifact = await fetchDirect(value);
    } catch (error) {
      options.debug?.('direct.request.failed', { error });
      throw error;
    }
    options.debug?.('direct.request.completed', {
      provider: artifact.provider,
      htmlCharacters: artifact.html.length,
      textCharacters: artifact.text.length,
      metadataKeys: Object.keys(artifact.metadata).length
    });
  }

  const deterministic = extractDeterministic(artifact);
  options.debug?.('validation.gate', {
    gate: deterministic.gate,
    confidenceScore: deterministic.confidenceScore,
    evidence: deterministic.evidence
  });
  if (mode === 'STANDARD' && deterministic.gate === 'PASS') {
    options.debug?.('validation.accepted', { validator: 'deterministic' });
    return {
      input: deterministic.input,
      evidence: deterministic.evidence,
      provider: artifact.provider,
      strategy: artifact.strategy,
      firecrawlCredits
    };
  }
  if (mode === 'STANDARD' && deterministic.gate === 'ZERO') {
    options.debug?.('validation.rejected', { validator: 'deterministic', reason: 'zero-evidence' });
    throw new ListingValidationError();
  }
  if (!options.openai) {
    options.debug?.('validation.rejected', { validator: 'deterministic', reason: 'borderline-without-model' });
    throw new ListingValidationError(
      'La extracción directa no encontró evidencia suficiente de una publicación de propiedad.'
    );
  }

  options.debug?.('openai.request.started', {
    model: options.openai.model,
    purpose: mode === 'DEEP' ? 'deep-enhancement' : 'borderline-validation'
  });
  try {
    const ai = await assessAndNormalizeWithOpenAI(
      artifact,
      deterministic.input,
      options.openai.credential,
      options.openai.model
    );
    options.debug?.('openai.request.completed', {
      model: options.openai.model,
      isPropertyListing: ai.assessment.isPropertyListing,
      confidence: ai.assessment.confidence,
      evidenceCount: ai.assessment.evidence.length,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens
    });
    return {
      input: ai.input,
      evidence: {
        ...deterministic.evidence,
        aiValidated: true,
        aiConfidence: ai.assessment.confidence,
        aiEvidence: ai.assessment.evidence
      },
      provider: artifact.provider,
      strategy: `${artifact.strategy}+openai`,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens,
      firecrawlCredits
    };
  } catch (error) {
    options.debug?.('openai.request.failed', { model: options.openai.model, error });
    if (error instanceof ProviderRequestError && error.reason === 'AUTH') {
      await options.openai.onInvalidCredential();
    }
    throw error;
  }
}
