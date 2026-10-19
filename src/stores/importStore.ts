/**
 * Route-sheet import workflow state.
 * Photograph → OCR → Review → Geocode → Confirm → Persist
 */
import { create } from 'zustand';
import type { ReviewedRow, OcrJobResult, RowReviewDecision } from '../types/ocr';
import type { GeocodeResult, VerificationChoice, GeocodeCandidate } from '../types/geocoding';
import type { DirectoryMatch } from '../services/duplicates';

export type ImportStep =
  | 'capture'
  | 'preprocess'
  | 'ocr'
  | 'review_rows'
  | 'verify_addresses'
  | 'confirm_duplicates'
  | 'saving'
  | 'done'
  | 'error';

export interface PageImage {
  id: string;
  blob: Blob;
  objectUrl: string;
  filename: string;
  pageIndex: number;
  rotation: number; // degrees
  // crop in relative 0–1 coords
  crop?: { x: number; y: number; width: number; height: number };
}

export interface RowVerificationState {
  rowId: string;
  geocodeResult: GeocodeResult | null;
  selectedCandidate: GeocodeCandidate | null;
  manualPin: { lat: number; lng: number; note?: string } | null;
  directoryMatches: DirectoryMatch[];
  chosenBusinessLocationId: string | null; // reuse existing
  verificationStatus: VerificationChoice['verificationStatus'];
  verificationNotes?: string;
  loading: boolean;
  error?: string;
}

interface ImportState {
  step: ImportStep;
  runId: string | null; // delivery_runs.id once created
  importId: string | null; // route_sheet_imports.id
  pages: PageImage[];
  ocrResult: OcrJobResult | null;
  reviewedRows: ReviewedRow[];
  verifications: Record<string, RowVerificationState>;
  errorMessage: string | null;
  isProcessing: boolean;

  // actions
  reset: () => void;
  setStep: (s: ImportStep) => void;
  addPage: (file: File | Blob, filename?: string) => void;
  removePage: (id: string) => void;
  updatePage: (id: string, patch: Partial<PageImage>) => void;
  setOcrResult: (result: OcrJobResult) => void;
  setReviewedRows: (rows: ReviewedRow[]) => void;
  updateRowDecision: (rowId: string, decision: RowReviewDecision) => void;
  updateRowCorrection: (
    rowId: string,
    fields: { name?: string; address?: string; notes?: string }
  ) => void;
  setVerification: (rowId: string, state: Partial<RowVerificationState>) => void;
  setRunAndImportIds: (runId: string, importId: string) => void;
  setError: (msg: string | null) => void;
  setProcessing: (v: boolean) => void;
}

const initial = {
  step: 'capture' as ImportStep,
  runId: null,
  importId: null,
  pages: [] as PageImage[],
  ocrResult: null,
  reviewedRows: [] as ReviewedRow[],
  verifications: {} as Record<string, RowVerificationState>,
  errorMessage: null,
  isProcessing: false,
};

export const useImportStore = create<ImportState>((set, get) => ({
  ...initial,

  reset: () => {
    // revoke object URLs
    for (const p of get().pages) {
      URL.revokeObjectURL(p.objectUrl);
    }
    set({ ...initial, pages: [], reviewedRows: [], verifications: {} });
  },

  setStep: (step) => set({ step }),

  addPage: (file, filename) => {
    const id = crypto.randomUUID();
    const objectUrl = URL.createObjectURL(file);
    const pageIndex = get().pages.length;
    set({
      pages: [
        ...get().pages,
        {
          id,
          blob: file,
          objectUrl,
          filename: filename || (file instanceof File ? file.name : `page-${pageIndex + 1}.jpg`),
          pageIndex,
          rotation: 0,
        },
      ],
    });
  },

  removePage: (id) => {
    const page = get().pages.find((p) => p.id === id);
    if (page) URL.revokeObjectURL(page.objectUrl);
    set({
      pages: get()
        .pages.filter((p) => p.id !== id)
        .map((p, i) => ({ ...p, pageIndex: i })),
    });
  },

  updatePage: (id, patch) => {
    set({
      pages: get().pages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  },

  setOcrResult: (result) => {
    const reviewed: ReviewedRow[] = result.pages.flatMap((page) =>
      page.rows.map((row) => ({
        ...row,
        decision:
          row.crossedOut === 'possibly_completed' || row.crossedOut === 'unclear'
            ? null
            : row.crossedOut === 'confirmed_completed'
              ? 'already_completed'
              : row.crossedOut === 'cancelled'
                ? 'cancelled'
                : 'needs_delivery',
      }))
    );
    set({ ocrResult: result, reviewedRows: reviewed, step: 'review_rows' });
  },

  setReviewedRows: (rows) => set({ reviewedRows: rows }),

  updateRowDecision: (rowId, decision) => {
    set({
      reviewedRows: get().reviewedRows.map((r) =>
        r.id === rowId ? { ...r, decision } : r
      ),
    });
  },

  updateRowCorrection: (rowId, fields) => {
    set({
      reviewedRows: get().reviewedRows.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          userCorrectedName: fields.name ?? r.userCorrectedName,
          userCorrectedAddress: fields.address ?? r.userCorrectedAddress,
          userNotes: fields.notes ?? r.userNotes,
        };
      }),
    });
  },

  setVerification: (rowId, partial) => {
    const existing = get().verifications[rowId] ?? {
      rowId,
      geocodeResult: null,
      selectedCandidate: null,
      manualPin: null,
      directoryMatches: [],
      chosenBusinessLocationId: null,
      verificationStatus: 'unverified' as const,
      loading: false,
    };
    set({
      verifications: {
        ...get().verifications,
        [rowId]: { ...existing, ...partial },
      },
    });
  },

  setRunAndImportIds: (runId, importId) => set({ runId, importId }),
  setError: (errorMessage) => set({ errorMessage, step: errorMessage ? 'error' : get().step }),
  setProcessing: (isProcessing) => set({ isProcessing }),
}));
