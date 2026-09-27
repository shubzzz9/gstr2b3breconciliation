# Fix GSTR-2B header detection

## Changes
- Separate header rows from data rows using GSTIN, date, numeric-density, and repeated-row evidence instead of header keywords alone.
- Explicitly reject any row containing transaction-like values as a header candidate.
- Support headers spread across multiple rows, headers on one row, blank spacer rows, and custom column names.
- Keep manual column mapping available when a field remains uncertain.

## Verification
- Test standard B2B, B2B-CDNR, multi-row merged headers, custom one-row headers, and files where the first transaction immediately follows the header.
- Confirm the first transaction remains in the reconciliation data and never appears as a column heading.
