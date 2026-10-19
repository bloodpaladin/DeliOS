/**
 * OCR provider abstraction.
 * All real OCR runs server-side (Supabase Edge Function or equivalent).
 * The browser never holds private OCR API keys.
 */
import type { OcrJobResult, OcrProvider } from '../../types/ocr';
import { supabase } from '../../lib/supabase';

const EDGE_FUNCTION = 'process-route-sheet';

export class SupabaseOcrProvider implements OcrProvider {
  readonly name = 'supabase-edge';

  async processPages(
    images: Array<{ blob: Blob; filename: string; pageIndex: number }>,
    options?: { languageHints?: string[]; countryHint?: string }
  ): Promise<OcrJobResult> {
    if (!images.length) {
      return {
        jobId: crypto.randomUUID(),
        status: 'failed',
        pages: [],
        errorMessage: 'No images provided',
        provider: this.name,
        createdAt: new Date().toISOString(),
      };
    }

    // Upload pages to private storage first so the Edge Function can read them
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        jobId: crypto.randomUUID(),
        status: 'failed',
        pages: [],
        errorMessage:
          'Authentication required for OCR. Sign in before importing a route sheet.',
        provider: this.name,
        createdAt: new Date().toISOString(),
      };
    }

    const jobId = crypto.randomUUID();
    const uploadedPaths: string[] = [];

    try {
      for (const img of images) {
        const path = `${user.id}/ocr-jobs/${jobId}/page-${img.pageIndex}-${img.filename}`;
        const { error: upErr } = await supabase.storage
          .from('route-sheets')
          .upload(path, img.blob, {
            contentType: img.blob.type || 'image/jpeg',
            upsert: false,
          });

        if (upErr) {
          throw new Error(`Upload failed for page ${img.pageIndex}: ${upErr.message}`);
        }
        uploadedPaths.push(path);
      }

      // Invoke Edge Function – it holds the real OCR provider credentials
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
        body: {
          jobId,
          storagePaths: uploadedPaths,
          languageHints: options?.languageHints ?? ['en'],
          countryHint: options?.countryHint ?? 'TT',
        },
      });

      if (error) {
        return {
          jobId,
          status: 'failed',
          pages: [],
          errorMessage: `OCR service error: ${error.message}. Ensure the Edge Function "${EDGE_FUNCTION}" is deployed and OCR credentials are configured as secrets.`,
          provider: this.name,
          createdAt: new Date().toISOString(),
        };
      }

      // Expect the function to return a fully structured OcrJobResult
      const result = data as OcrJobResult;
      if (!result || !Array.isArray(result.pages)) {
        return {
          jobId,
          status: 'failed',
          pages: [],
          errorMessage:
            'OCR Edge Function returned an unexpected payload. Check function logs.',
          provider: this.name,
          createdAt: new Date().toISOString(),
        };
      }

      return {
        ...result,
        jobId: result.jobId || jobId,
        provider: result.provider || this.name,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        jobId,
        status: 'failed',
        pages: [],
        errorMessage: message,
        provider: this.name,
        createdAt: new Date().toISOString(),
      };
    }
  }
}

/** Factory – swap providers without changing callers */
let activeProvider: OcrProvider = new SupabaseOcrProvider();

export function getOcrProvider(): OcrProvider {
  return activeProvider;
}

export function setOcrProvider(provider: OcrProvider): void {
  activeProvider = provider;
}
