# Add Debit/Credit Note (CDNR) Reconciliation to Option 2

Today Option 2 matches only the B2B invoice sheet of GSTR-2B against the purchase register. Purchase returns booked as debit notes in Tally, and the supplier's credit notes sitting in the GSTR-2B "B2B-CDNR" sheet, are invisible to the tool. This adds full note handling to Option 2 only. Option 3 (Combined) is left completely untouched.

## What the user will experience

1. Upload the GSTR-2B Excel exactly as downloaded from the portal. If the workbook contains extra sheets (B2B, B2B-CDNR, B2BA, B2B-CDNRA), the tool reads them automatically and shows which sheets it found.
2. If they only have the single B2B sheet, an optional extra upload box appears: "Debit/Credit Note sheet (optional)".
3. Upload one purchase file as before. Rows that are debit/credit notes are picked up automatically — either from a Voucher Type / Type column (values containing "debit note", "credit note", "dr note", "cr note", "purchase return") or, when no such column exists, from rows with negative taxable/tax values. The mapping screen shows a "Note Type Column" dropdown so they can correct the auto-guess.
4. Results show note rows in their own section, plus a supplier-level Net ITC summary that nets invoices minus notes.

## Reconciliation logic

- Notes are matched note-to-note: GSTR-2B CDNR row vs accounts note row, keyed on GSTIN + note number, with the same tolerance (Rs. 5) and the same fuzzy fallback ("Possible Match — Note No. differs") used for invoices. Notes never match against invoices.
- Sign convention is normalised before comparison: portal CDNR values are positive with a "Note type = C/D" flag; Tally purchase returns are usually negative. Both are converted to a signed ITC-reduction value so a Rs. 1,000 credit note in the portal matches a Rs. -1,000 entry in books.
- Remarks reuse the existing vocabulary, scoped to notes: Matched, Fig Not Matched, Not in our data, Not in GSTR 2B, GSTIN Mismatch.
- Mismatch diagnosis gets note-specific reasons: "Credit note issued by supplier but no purchase return booked — reduce ITC", "Debit note booked in accounts but supplier has not filed the credit note", and the existing rounding / interstate / significant-difference reasons.

## Output files (Option 2 only)

- **File 2 – Reconciliation**: existing invoice section, then a clearly labelled "Debit / Credit Notes" section with a Document Type column (Invoice / Credit Note / Debit Note).
- **File 3 – Mismatch Diagnosis**: adds a "Note Mismatches" sheet.
- **New sheet – Net ITC Summary**: one row per supplier GSTIN showing ITC as per 2B (invoices minus credit notes), ITC as per books (invoices minus debit notes), and the net difference — this is the figure that ties to GSTR-3B.
- On-screen preview gains a Document Type column and note rows are tinted differently from invoice rows.

## Technical notes

- `src/lib/gst-parsers.ts`:
  - `scanGSTR2B` currently reads `wb.SheetNames[0]`. Add sheet classification: match sheet names against B2B / CDNR / amendment patterns, scan each relevant sheet with the existing header-detection routine, and return a list of scans plus their document type. Fall back to current single-sheet behaviour when nothing matches.
  - New CDNR column vocabulary added to the fuzzy keyword map: "Note number", "Note type", "Note date", "Note Supply type", "Note Value".
  - `processTally` gains an optional `noteType` column index and classifies each grouped row as `invoice` | `credit_note` | `debit_note`; when no column is mapped, negative net taxable flips the row to a note. Row objects carry a new `docType` field; all existing fields keep their names so Option 1/3/4 are unaffected.
  - `TALLY_SINGLE_ROWS` gains an optional `noteType` entry with guesses: voucher type, vch type, type, particulars type, nature.
- `src/lib/gst-reconcile.ts`: new `reconcileNotes(cdnrRows, ourNoteRows, extraCols)` mirroring `reconcile` but keyed on note number and sign-normalised; `diagnoseNotes(...)` mirroring `diagnoseMismatches`; new `buildNetITCSummary(invoiceOutput, noteOutput)`. Existing `reconcile` / `diagnoseMismatches` signatures unchanged.
- `src/lib/gst-downloads.ts`: extend `downloadFile2` and `downloadFile3` with optional note arguments (default empty, so nothing changes when a file has no notes); add the Net ITC Summary sheet.
- `src/pages/Tool.tsx`: only the `mode === 'full'` branches change — optional CDNR upload box, detected-sheets badge, Note Type mapping dropdown, note counts in the results summary, preview column. No changes to the `combined` branch.

## Rollout

Build in this order so each step is testable on its own: parser sheet detection → note classification in the purchase file → note reconciliation → diagnosis + Net ITC summary → downloads → UI wiring.
