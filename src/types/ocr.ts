/**
 * OCR & structured extraction types for RoutePilot Caribbean
 */

export type CrossedOutClassification =
  | 'none'
  | 'possibly_completed'
  | 'confirmed_completed'
  | 'cancelled'
  | 'unclear';

export type RowReviewDecision =
  | 'needs_delivery'
  | 'already_completed'
  | 'cancelled'
  | 'unclear_manual';

export interface ExtractedRow {
  /** Stable client-side id for this extraction row */
  id: string;
  sheetRowNumber: number | null;
  customerName: string | null;
  addressRaw: string;
  addressNormalized: string | null;
  phone: string | null;
  deliveryNotes: string | null;
  crossedOut: CrossedOutClassification;
  ocrConfidence: number; // 0–1
  warnings: string[];
  unresolvedText: string | null;
  /** Bounding box relative to page image (0–1 or pixel) for crop display */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    unit: 'relative' | 'pixel';
  };
  pageIndex: number;
}

export interface OcrPageResult {
  pageIndex: number;
  imageWidth: number;
  imageHeight: number;
  fullText: string;
  rows: ExtractedRow[];
  provider: string;
  processingMs: number;
}

export interface OcrJobResult {
  jobId: string;
  status: 'completed' | 'failed' | 'partial';
  pages: OcrPageResult[];
  errorMessage?: string;
  provider: string;
  createdAt: string;
}

export interface OcrProvider {
  readonly name: string;
  /**
   * Process one or more page images. Implementation must call a server-side
   * endpoint; never put private OCR credentials in the browser.
   */
  processPages(
    images: Array<{ blob: Blob; filename: string; pageIndex: number }>,
    options?: { languageHints?: string[]; countryHint?: string }
  ): Promise<OcrJobResult>;
}

/** Client-side review state for one extracted row */
export interface ReviewedRow extends ExtractedRow {
  decision: RowReviewDecision | null;
  userCorrectedName?: string;
  userCorrectedAddress?: string;
  userNotes?: string;
}
