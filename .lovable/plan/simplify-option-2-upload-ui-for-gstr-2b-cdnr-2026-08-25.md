# Simplify Option 2 Upload UI for GSTR-2B + CDNR

The current Option 2 upload screen is confusing users: it looks like only a B2B sheet should be uploaded, and the optional "Debit / Credit Note sheet" box is always visible even though it is only needed when the main GSTR-2B workbook does not already contain a B2B-CDNR sheet.

## What we will change

1. **Clarify the main GSTR-2B upload**
   - Change the label/hint so it clearly says the user should upload the **full GSTR-2B Excel workbook** downloaded from the GST portal.
   - Add a short line explaining that the tool automatically finds the B2B and B2B-CDNR (debit/credit note) sheets inside the workbook.

2. **Make the optional CDNR upload conditional**
   - As soon as a GSTR-2B file is selected, scan it immediately to detect whether it contains a B2B-CDNR sheet.
   - Only show the "Debit / Credit Note sheet (optional)" upload box when the scanned workbook has **no B2B-CDNR sheet**.
   - When a B2B-CDNR sheet is found, show a small success message like "B2B-CDNR sheet detected — no separate note file needed" instead of the upload box.

3. **Tighten wording everywhere in Option 2**
   - Remove the word "B2B Excel" from the main upload hint so users do not think they must extract only the B2B sheet.
   - Keep the existing "Recommended" badge and overall card layout untouched.

## Files to edit

- `src/pages/Tool.tsx` — Option 2 upload section, file-change handler for GSTR-2B, and conditional CDNR upload visibility.

## Out of scope

- No changes to reconciliation logic, parsers, downloads, or other options (1, 3, 4).
- No backend or database changes.
