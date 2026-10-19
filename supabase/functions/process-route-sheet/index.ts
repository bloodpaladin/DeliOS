/**
 * Supabase Edge Function: process-route-sheet
 *
 * Server-side OCR + structured extraction. Holds private OCR credentials
 * (Google Document AI, Azure Form Recognizer, OpenAI Vision, etc.).
 *
 * Deploy:
 *   supabase functions deploy process-route-sheet
 * Secrets:
 *   supabase secrets set OCR_PROVIDER=google_document_ai
 *   supabase secrets set GOOGLE_DOCUMENT_AI_...=...
 *
 * This file is a contract + skeleton. Wire your preferred OCR provider
 * in the TODO section. Do not return fabricated customer rows.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const { jobId, storagePaths, languageHints, countryHint } = body as {
      jobId: string;
      storagePaths: string[];
      languageHints?: string[];
      countryHint?: string;
    };

    if (!storagePaths?.length) {
      return json({ error: 'storagePaths required' }, 400);
    }

    // Download images from private bucket using the user's JWT
    const pageBuffers: Array<{ index: number; bytes: Uint8Array; path: string }> =
      [];
    for (let i = 0; i < storagePaths.length; i++) {
      const path = storagePaths[i];
      const { data, error } = await supabase.storage
        .from('route-sheets')
        .download(path);
      if (error || !data) {
        return json(
          {
            jobId,
            status: 'failed',
            pages: [],
            errorMessage: `Failed to download ${path}: ${error?.message}`,
            provider: 'edge',
            createdAt: new Date().toISOString(),
          },
          200
        );
      }
      const buf = new Uint8Array(await data.arrayBuffer());
      pageBuffers.push({ index: i, bytes: buf, path });
    }

    // ------------------------------------------------------------------
    // TODO: Call your OCR provider here with pageBuffers.
    // Example providers: Google Document AI, Azure Document Intelligence,
    // Amazon Textract, OpenAI vision models, etc.
    //
    // Parse the response into the OcrJobResult shape expected by the client
    // (see src/types/ocr.ts). Detect crossed-out rows as
    // crossedOut: 'possibly_completed' — never as definitive completion.
    // ------------------------------------------------------------------

    const ocrProvider = Deno.env.get('OCR_PROVIDER') ?? 'unconfigured';

    if (ocrProvider === 'unconfigured' || !Deno.env.get('OCR_API_KEY')) {
      return json(
        {
          jobId,
          status: 'failed',
          pages: [],
          errorMessage:
            'OCR provider is not configured on the server. Set OCR_PROVIDER and OCR_API_KEY (or provider-specific secrets) for this Edge Function, then redeploy.',
          provider: 'edge-unconfigured',
          createdAt: new Date().toISOString(),
        },
        200
      );
    }

    // Placeholder for a real integration — returns explicit failure rather
    // than invented rows so the client never treats mock data as truth.
    return json(
      {
        jobId,
        status: 'failed',
        pages: [],
        errorMessage: `OCR provider "${ocrProvider}" is selected but the extraction implementation has not been wired yet. Implement the provider call in process-route-sheet/index.ts.`,
        provider: ocrProvider,
        createdAt: new Date().toISOString(),
      },
      200
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
