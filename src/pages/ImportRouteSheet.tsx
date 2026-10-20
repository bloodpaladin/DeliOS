/**
 * Multi-step route-sheet import: capture → OCR → review → verify → save
 */
import { useCallback, useRef, useState } from 'react';
import { useImportStore } from '../stores/importStore';
import { getOcrProvider } from '../services/ocr/provider';
import { getGeocodingProvider } from '../services/geocoding/google';
import { findDirectoryMatches } from '../services/duplicates';
import { persistImport } from '../services/importPersistence';
import type { RowReviewDecision } from '../types/ocr';
import { LogoutButton } from '../components/LogoutButton';
import { ThemeToggle } from '../components/ThemeToggle';
import { BackButton } from '../components/BackButton';

export function ImportRouteSheet() {
  const store = useImportStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((f) => store.addPage(f));
    },
    [store]
  );

  const runOcr = async () => {
    if (!store.pages.length) {
      store.setError('Add at least one photograph first.');
      return;
    }
    store.setProcessing(true);
    store.setError(null);
    store.setStep('ocr');
    setStatusMsg('Uploading pages and running OCR…');

    try {
      const provider = getOcrProvider();
      const result = await provider.processPages(
        store.pages.map((p) => ({
          blob: p.blob,
          filename: p.filename,
          pageIndex: p.pageIndex,
        })),
        { languageHints: ['en'], countryHint: 'TT' }
      );

      if (result.status === 'failed') {
        store.setError(result.errorMessage || 'OCR failed');
        store.setProcessing(false);
        return;
      }

      store.setOcrResult(result);
      setStatusMsg(null);
    } catch (e) {
      store.setError(e instanceof Error ? e.message : String(e));
    } finally {
      store.setProcessing(false);
    }
  };

  const runGeocodeForActiveRows = async () => {
    const active = store.reviewedRows.filter((r) => r.decision === 'needs_delivery');
    if (!active.length) {
      store.setError('No rows marked for delivery.');
      return;
    }
    store.setStep('verify_addresses');
    store.setProcessing(true);
    const geocoder = getGeocodingProvider();

    for (const row of active) {
      store.setVerification(row.id, { loading: true, error: undefined });
      const address =
        row.userCorrectedAddress?.trim() ||
        row.addressNormalized?.trim() ||
        row.addressRaw;
      const name = row.userCorrectedName?.trim() || row.customerName;

      try {
        const geo = await geocoder.search({
          addressRaw: row.addressRaw,
          addressNormalized: address,
          businessName: name,
          country: 'TT',
        });

        const topPlaceId = geo.candidates[0]?.placeId ?? null;
        const directoryMatches = await findDirectoryMatches({
          addressRaw: row.addressRaw,
          addressNormalized: address,
          businessName: name,
          placeId: topPlaceId,
        });

        store.setVerification(row.id, {
          loading: false,
          geocodeResult: geo,
          selectedCandidate: geo.candidates[0] ?? null,
          directoryMatches,
          verificationStatus: geo.candidates[0]
            ? geo.candidates[0].isApproximate
              ? 'approximate'
              : 'unverified'
            : 'unverified',
          error: geo.errorMessage,
        });
      } catch (e) {
        store.setVerification(row.id, {
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    store.setProcessing(false);
  };

  const saveAll = async () => {
    store.setStep('saving');
    store.setProcessing(true);
    try {
      const result = await persistImport({
        runId: store.runId,
        importId: store.importId,
        pages: store.pages.map((p) => ({
          blob: p.blob,
          filename: p.filename,
          pageIndex: p.pageIndex,
        })),
        ocrJobId: store.ocrResult?.jobId ?? crypto.randomUUID(),
        ocrProvider: store.ocrResult?.provider ?? 'unknown',
        extractedData: store.ocrResult,
        rows: store.reviewedRows,
        verifications: store.verifications,
      });
      store.setRunAndImportIds(result.runId, result.importId);
      if (result.errors.length) {
        setStatusMsg(
          `Saved with warnings: ${result.errors.slice(0, 3).join('; ')}`
        );
      }
      store.setStep('done');
    } catch (e) {
      store.setError(e instanceof Error ? e.message : String(e));
    } finally {
      store.setProcessing(false);
    }
  };

  return (
    <div className="rp-page">
      <header className="rp-topbar">
        <div className="flex items-center gap-3 min-w-0">
          <BackButton fallback="/" />
          <div className="min-w-0">
            <h1 className="rp-topbar-title">Import route sheet</h1>
            <p className="rp-topbar-sub">
              Step: <strong style={{ color: '#6ee7b7' }}>{store.step}</strong>
            </p>
          </div>
        </div>
        <ThemeToggle />
        <LogoutButton compact />
      </header>

      {(store.errorMessage || statusMsg) && (
        <div
          className={`mx-4 mt-3 rounded-lg px-3 py-2 text-sm ${
            store.errorMessage
              ? 'bg-red-950/80 text-red-200 border border-red-800'
              : 'bg-slate-800 text-slate-200'
          }`}
        >
          {store.errorMessage || statusMsg}
        </div>
      )}

      {/* CAPTURE */}
      {(store.step === 'capture' || store.step === 'preprocess') && (
        <section className="p-4 space-y-4">
          <p className="text-sm text-slate-300">
            Photograph or upload your printed delivery list. Multiple pages are
            supported. Crossed-out rows will be flagged for confirmation — never
            auto-completed.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              className="rp-btn rp-btn-primary" style={{ flex: 1 }}
              onClick={() => cameraRef.current?.click()}
            >
              Take photo
            </button>
            <button
              type="button"
              className="rp-btn rp-btn-secondary" style={{ flex: 1 }}
              onClick={() => fileRef.current?.click()}
            >
              Upload
            </button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />

          {store.pages.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-slate-400">
                Pages ({store.pages.length})
              </h2>
              {store.pages.map((p) => (
                <div
                  key={p.id}
                  className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900"
                >
                  <img
                    src={p.objectUrl}
                    alt={p.filename}
                    className="w-full max-h-64 object-contain bg-black"
                    style={{ transform: `rotate(${p.rotation}deg)` }}
                  />
                  <div className="flex gap-2 p-2 bg-slate-900/90">
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-700"
                      onClick={() =>
                        store.updatePage(p.id, {
                          rotation: (p.rotation + 90) % 360,
                        })
                      }
                    >
                      Rotate
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-900/80"
                      onClick={() => store.removePage(p.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                disabled={store.isProcessing}
                className="rp-btn rp-btn-primary rp-btn-lg rp-btn-block"
                onClick={runOcr}
              >
                {store.isProcessing ? 'Processing…' : 'Extract customers (OCR)'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* OCR in progress */}
      {store.step === 'ocr' && (
        <div className="p-8 text-center text-slate-300">
          <div className="animate-pulse text-emerald-400 mb-2">Reading sheet…</div>
          <p className="text-sm">
            Server-side OCR is running. This may take a few seconds per page.
          </p>
        </div>
      )}

      {/* REVIEW ROWS */}
      {store.step === 'review_rows' && (
        <section className="p-4 space-y-4">
          <p className="text-sm text-slate-300">
            Confirm every row. Crossed-out or low-confidence lines need your
            decision before they are dropped or kept.
          </p>

          {store.reviewedRows.map((row) => (
            <RowReviewCard
              key={row.id}
              row={row}
              pageUrl={
                store.pages.find((p) => p.pageIndex === row.pageIndex)?.objectUrl
              }
              onDecision={(d) => store.updateRowDecision(row.id, d)}
              onCorrect={(fields) => store.updateRowCorrection(row.id, fields)}
            />
          ))}

          <button
            type="button"
            className="rp-btn rp-btn-primary rp-btn-lg rp-btn-block"
            onClick={runGeocodeForActiveRows}
          >
            Verify addresses on map
          </button>
        </section>
      )}

      {/* VERIFY */}
      {store.step === 'verify_addresses' && (
        <section className="p-4 space-y-4">
          <p className="text-sm text-slate-300">
            Address is primary. Coordinates from the provider are candidates only —
            confirm or move the pin yourself.
          </p>

          {store.reviewedRows
            .filter((r) => r.decision === 'needs_delivery')
            .map((row) => {
              const v = store.verifications[row.id];
              return (
                <VerificationCard
                  key={row.id}
                  row={row}
                  state={v}
                  onSelectCandidate={(c) =>
                    store.setVerification(row.id, {
                      selectedCandidate: c,
                      verificationStatus: c.isApproximate
                        ? 'approximate'
                        : 'confirmed',
                    })
                  }
                  onReuseBusiness={(id) =>
                    store.setVerification(row.id, {
                      chosenBusinessLocationId: id,
                      verificationStatus: 'confirmed',
                    })
                  }
                  onConfirm={() =>
                    store.setVerification(row.id, {
                      verificationStatus: 'confirmed',
                    })
                  }
                />
              );
            })}

          <button
            type="button"
            disabled={store.isProcessing}
            className="rp-btn rp-btn-primary rp-btn-lg rp-btn-block"
            onClick={saveAll}
          >
            {store.isProcessing ? 'Saving…' : 'Save run & locations'}
          </button>
        </section>
      )}

      {/* DONE */}
      {store.step === 'done' && (
        <section className="p-6 text-center space-y-4">
          <div className="text-emerald-400 text-xl font-semibold">Run saved</div>
          <p className="text-sm text-slate-300">
            Confirmed businesses are in your directory. Delivery stops are ready
            for route optimization.
          </p>
          {store.runId && (
            <a
              href={`/run/${store.runId}`}
              className="block w-full rounded-xl bg-emerald-600 py-4 text-base font-semibold"
            >
              Open active delivery
            </a>
          )}
          <button
            type="button"
            className="rounded-xl bg-slate-700 px-6 py-3"
            onClick={() => store.reset()}
          >
            Import another sheet
          </button>
        </section>
      )}

      {store.step === 'error' && (
        <section className="p-6 space-y-3">
          <p className="text-red-300">{store.errorMessage}</p>
          <button
            type="button"
            className="rounded-xl bg-slate-700 px-4 py-2"
            onClick={() => {
              store.setError(null);
              store.setStep('capture');
            }}
          >
            Back to capture
          </button>
        </section>
      )}
    </div>
  );
}

function RowReviewCard({
  row,
  pageUrl,
  onDecision,
  onCorrect,
}: {
  row: import('../types/ocr').ReviewedRow;
  pageUrl?: string;
  onDecision: (d: RowReviewDecision) => void;
  onCorrect: (f: { name?: string; address?: string; notes?: string }) => void;
}) {
  const needsConfirm =
    row.crossedOut === 'possibly_completed' ||
    row.crossedOut === 'unclear' ||
    row.ocrConfidence < 0.55;

  return (
    <article
      className={`rounded-xl border p-3 space-y-2 ${
        needsConfirm
          ? 'border-amber-700/80 bg-amber-950/30'
          : 'border-slate-700 bg-slate-900'
      }`}
    >
      <div className="flex justify-between text-xs text-slate-400">
        <span>Row {row.sheetRowNumber ?? '—'}</span>
        <span>OCR {(row.ocrConfidence * 100).toFixed(0)}%</span>
      </div>

      {pageUrl && row.boundingBox && (
        <div className="h-16 overflow-hidden rounded-lg bg-black/50 text-[10px] text-slate-500 flex items-center justify-center">
          Image crop available (bbox present)
        </div>
      )}

      <input
        className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
        defaultValue={row.userCorrectedName ?? row.customerName ?? ''}
        placeholder="Business name"
        onBlur={(e) => onCorrect({ name: e.target.value })}
      />
      <textarea
        className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm min-h-[60px]"
        defaultValue={row.userCorrectedAddress ?? row.addressRaw}
        placeholder="Address"
        onBlur={(e) => onCorrect({ address: e.target.value })}
      />

      {row.warnings.length > 0 && (
        <ul className="text-xs text-amber-300/90 list-disc pl-4">
          {row.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        {(
          [
            ['needs_delivery', 'Needs delivery'],
            ['already_completed', 'Already done'],
            ['cancelled', 'Cancelled'],
            ['unclear_manual', 'Unclear'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => onDecision(val)}
            className={`rounded-lg py-2 text-xs font-medium ${
              row.decision === val
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </article>
  );
}

function VerificationCard({
  row,
  state,
  onSelectCandidate,
  onReuseBusiness,
  onConfirm,
}: {
  row: import('../types/ocr').ReviewedRow;
  state?: import('../stores/importStore').RowVerificationState;
  onSelectCandidate: (c: import('../types/geocoding').GeocodeCandidate) => void;
  onReuseBusiness: (id: string) => void;
  onConfirm: () => void;
}) {
  const name = row.userCorrectedName || row.customerName || '—';
  const addr = row.userCorrectedAddress || row.addressRaw;

  return (
    <article className="rounded-xl border border-slate-700 bg-slate-900 p-3 space-y-2">
      <div className="font-medium text-sm">{name}</div>
      <div className="text-xs text-slate-400">{addr}</div>

      {state?.loading && (
        <div className="text-xs text-emerald-400 animate-pulse">Searching…</div>
      )}
      {state?.error && (
        <div className="text-xs text-amber-300">{state.error}</div>
      )}

      {state?.directoryMatches && state.directoryMatches.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-slate-400">
            Possible existing locations
          </div>
          {state.directoryMatches.slice(0, 3).map((m) => (
            <button
              key={m.business.id}
              type="button"
              className="w-full text-left text-xs rounded-lg bg-slate-800 px-2 py-2 border border-slate-600"
              onClick={() => onReuseBusiness(m.business.id)}
            >
              <span className="text-emerald-400">{m.business.canonical_business_name}</span>
              <br />
              <span className="text-slate-500">
                {m.note} ({(m.score * 100).toFixed(0)}%)
              </span>
            </button>
          ))}
        </div>
      )}

      {state?.geocodeResult?.candidates?.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelectCandidate(c)}
          className={`w-full text-left text-xs rounded-lg px-2 py-2 border ${
            state.selectedCandidate?.id === c.id
              ? 'border-emerald-500 bg-emerald-950/40'
              : 'border-slate-600 bg-slate-800'
          }`}
        >
          <div className="flex justify-between gap-2">
            <span className="text-slate-200 line-clamp-2">{c.formattedAddress}</span>
            <span className="shrink-0 text-slate-500">
              {(c.confidence * 100).toFixed(0)}%
            </span>
          </div>
          {c.isApproximate && (
            <span className="text-amber-400">Approximate — confirm pin</span>
          )}
        </button>
      ))}

      {state?.selectedCandidate && (
        <div className="text-xs text-slate-400">
          {state.selectedCandidate.latitude.toFixed(5)},{' '}
          {state.selectedCandidate.longitude.toFixed(5)} · {state.selectedCandidate.provider}
        </div>
      )}

      <button
        type="button"
        className="w-full rounded-lg bg-slate-700 py-2 text-xs font-medium"
        onClick={onConfirm}
      >
        Confirm this location
      </button>
    </article>
  );
}

export default ImportRouteSheet;
