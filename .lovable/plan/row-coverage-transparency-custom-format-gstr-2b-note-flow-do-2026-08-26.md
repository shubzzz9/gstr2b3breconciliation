# Row Coverage Transparency + Custom-Format GSTR-2B + Note Flow Docs

## 1. Why your output shows fewer rows than your input

Nothing is being dropped silently by mistake, but three things reduce the visible row count, and today the tool never tells you which one happened:

1. **Grouping (the main reason).** Both sides are aggregated by GSTIN + Invoice Number. A 5-line invoice in Tally (5%, 12%, 18% lines) becomes **one** row with the amounts summed. Same on the portal side — multi-rate rows of one invoice collapse to one row. So 500 register lines can legitimately become 320 invoices.
2. **Rows deliberately skipped in the purchase register:** fully blank rows, rows where the supplier/party name is blank, and rows whose party name contains "Grand Total" / "Sub Total" / "Subtotal".
3. **Rows with a blank invoice number or blank GSTIN** are kept, but grouped under a synthetic key (`__NO_INV__` / `__NO_GSTIN__` + voucher no). If two such rows share a voucher number they merge into one.

### What will be added

A **Row Coverage** panel on the results screen and a matching **Row Audit** sheet in File 2:

```text
Purchase register: 812 rows read
  - 3 blank rows skipped
  - 6 total / subtotal rows skipped
  - 11 rows skipped (no supplier name)          <- listed with row numbers
  = 792 rows used  ->  514 invoice groups + 12 note groups
GSTR-2B (B2B):     603 rows read -> 561 invoice groups
GSTR-2B (CDNR):     14 rows read ->  14 note groups
Reconciliation output: 598 lines
```

Every skipped row is listed with its Excel row number and the reason, so you can verify by eye that nothing real was lost. The audit numbers are computed from the same pass that builds the data, so they always tie.

## 2. GSTR-2B in a custom (non-portal) format

Partly there already: if "GSTIN of supplier" is not found, the tool falls back to fuzzy header detection and shows an editable mapping table plus sanity warnings. What it does not yet do:

- Look past the first sheet when the sheet names are custom (it only classifies sheets containing "b2b"/"cdnr"). A custom workbook with sheets like "Purchases 2B" and "Notes" falls back to sheet 1 and the notes sheet is ignored.
- Let you choose which sheet is the invoice sheet and which is the note sheet.
- Recognise header rows that only appear after row 20, or files where the header keywords are Hindi/short forms.

Planned changes:
- **Sheet picker** in the Option 2 mapping step: two dropdowns ("Invoice sheet", "Debit/Credit note sheet") pre-filled with the auto-detected choice, listing every sheet in the workbook with its row count. Changing them re-scans.
- Widen header detection to scan the first 30 rows and score more keywords (party, supplier, doc no, document number, taxable, tax amount).
- Add a "Note Type" row to the GSTR-2B mapping table so the C/D column can be picked manually in a custom file.
- If no note-type column exists at all, treat negative amounts as credit notes and positive ones as debit notes.

## 3. What format the credit/debit note data should be in

**Portal side:** just upload the full GSTR-2B workbook — the B2B-CDNR sheet is read automatically (Note number, Note type C/D, Note date, Note value, Taxable value, IGST/CGST/SGST/Cess). Nothing to prepare.

**Your books side:** notes can sit in the *same* purchase register file. A row is treated as a note if either:
- a voucher/document-type column says "credit note", "debit note", "purchase return", "cr note", "dr note", etc. (this column is auto-guessed and shown as a dropdown you can correct), **or**
- there is no such column and the row's taxable/tax values are negative.

The note's document number must go in the same Invoice/Bill No column you already map — that is what the match is keyed on. Sign does not matter: the tool normalises every note to an ITC reduction internally.

## 4. How notes are matched — worked example

Supplier Sharma Traders, GSTIN 27AAACS1234A1Z5.

```text
GSTR-2B B2B sheet          Purchase register            Result
INV-101  1,00,000 + 18,000 INV-101  1,00,000 + 18,000    Matched (invoice)
INV-102    50,000 +  9,000 (absent)                      Not in our data
(absent)                   INV-103  20,000 + 3,600       Not in GSTR 2B

GSTR-2B B2B-CDNR sheet     Purchase register (notes)
CN-7 (type C) 10,000+1,800 Dr Note CN-7  -10,000 -1,800  Matched (credit note)
CN-9 (type C)  5,000+  900 (absent)                      Not in our data -> ITC to be reversed
(absent)                   Dr Note DN-4  -2,000 -360     Not in GSTR 2B -> supplier hasn't filed it
```

Rules: notes only ever match notes, invoices only match invoices. Key = GSTIN + note number, tolerance Rs. 5, with the same fuzzy fallback ("Possible Match — Note No. differs") used for invoices.

**Net ITC Summary** then nets it per supplier:

```text
Supplier         ITC as per 2B      ITC as per books    Difference
Sharma Traders   18,000+9,000       18,000+3,600        -900
                 -1,800-900         -1,800-360
                 = 24,300           = 19,440            = 4,860 (explained by
                                                        INV-102, INV-103, CN-9, DN-4)
```

That "ITC as per 2B" column is the figure you carry to GSTR-3B; the difference column tells you exactly how much of your books ITC is unsupported.

## Technical notes

- `processTally` returns new counters (`rowsRead`, `blankRows`, `totalRows`, `noSupplierRows` with row indices) alongside the existing `blankGstinRows` / `blankInvoiceRows`; the return shape is additive so Options 1/3/4 keep working.
- `parseGSTR2B` returns `{ rows, rowsRead }` via a sibling function (`parseGSTR2BWithStats`) so the existing signature is untouched.
- New `buildRowAudit(...)` in `gst-reconcile.ts`; rendered as a collapsible panel in `Tool.tsx` and written as a "Row Audit" sheet by `downloadFile2`.
- `classifyGSTR2BSheets` gains user overrides; `scanGSTR2B` header search widened to 30 rows with a scored keyword list.
- Option 3 (Combined) is not touched anywhere in this work.
