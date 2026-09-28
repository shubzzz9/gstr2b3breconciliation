# Fix Option 2 based on the review of the March files

I checked every point in the review against your two actual files. Summary: points 1–4 are real and confirmed in the data; point 5 is half right (useful additions, but one part is overstated). Option 3 stays untouched.

## Point 1 — Books tax shows zero (CONFIRMED, critical)

**What I found:** your purchase file's headings are "I GST", "C GST", "S GST" (with a space). The tool only looks for "igst / cgst / sgst" written together, so it found no tax columns and read books tax as 0. That is why ~756 correct invoices say "Fig Not Matched" and Net ITC shows Books = 0. The Mismatch file disagrees because it uses a different comparison path.

**How a practitioner does it:** map the columns, then tie the register's total CGST/SGST/IGST to the ledger totals before reconciling.

**Change:**
- Ignore spaces, dots and dashes when guessing column names ("I GST", "I.G.S.T", "IGST Amt" all match).
- Add a check before running: if taxable is non-zero but total books tax is zero, stop and ask the user to fix the mapping.
- Show column totals (Taxable, IGST, CGST, SGST) for both files on the mapping screen so the user can tie them to Tally.
- Build File 2, File 3, Net ITC and on-screen counts from one single result, so they can never disagree.

## Point 2 — Split-rate bills double the taxable value (CONFIRMED)

**What I found:** your register repeats the full bill taxable on every rate line. Metalsoft 549/25-26 appears twice with Taxable 15,550 each (tax 125 at 2.5% + 949.50 at 9%). Summing gives 31,100. The real split is 5,000 @5% + 10,550 @18% = 15,550. Venkatesh 351 same: 11,625 shown twice.

(Note: Metalsoft 549/25-26 is genuinely absent from the 2B B2B sheet, so "Not in GSTR 2B" is correct — only the amount is wrong.)

**How a practitioner does it:** take the bill value once, and check the tax per rate.

**Change:** when rows of the same bill (same GSTIN + bill no + voucher no) carry the identical taxable value, count it once instead of summing. Tax is still summed. Different taxable values per line are summed as today. The Row Audit lists every bill where this rule was used.

## Point 3 — Matching is exact-only in the main sheet (CONFIRMED)

**What I found:** the main sheet only uses the exact GSTIN + invoice-number match. The amount-based and GSTIN-repair results live in side sheets and never update the main status.

**How a practitioner does it:** pass 1 exact; pass 2 same GSTIN + same amount with a slightly different bill no (typos, prefixes, "/25-26"); pass 3 same bill no + amount but GSTIN differs or is blank (wrong GSTIN in Tally / supplier filed under another branch). Each pair is reviewed.

**Change:** run three passes in order; each pair used once. Every invoice ends with one final status: Matched / Matched – Bill No differs / Matched – GSTIN differs / Fig Not Matched / Not in our data / Not in GSTR 2B, plus the confidence rating. All sheets and totals read from this.

## Point 4 — Credit notes matched on note number (CONFIRMED)

**What I found:** all 80 "DN ..." rows in your register have your own debit-note number in Entry No (SCF/JSP/DN/478) and the *original invoice* in Ref.No. The supplier's credit-note number (CN/25-26/10, 10280…) is not in your books at all. Only 2 of 42 note numbers overlap. Also, "DN SGST 9%" in the Head column was not recognised as a note — only negative amounts caught it.

**How a practitioner does it:** this is normal. The buyer raises a debit note, the supplier issues a credit note with its own number. They are matched by supplier GSTIN + amount, around the same date, and sometimes by the original invoice number.

**Change:**
- Recognise "DN" / "CN" at the start of a type or head value as a note.
- Match notes by GSTIN + tax amount (within Rs. 1.50) + date within 60 days. Note number, our voucher no (some suppliers quote it, e.g. CASTAID "SCF/JSP/DN/406") and original invoice are bonus signals that raise confidence and break ties.
- When several notes of one supplier have the same amount, pair the closest dates first.

## Point 5 — Output gaps (PARTLY RIGHT)

- **GSTR-3B table — add.** A sheet showing figures for Table 4A(5) (ITC as per 2B), 4B(2) (ITC to reverse / not claimable now) and 4D, from the final result. Useful and standard.
- **Claimable ITC total — add.** Claimable = matched + matched-with-difference (lower of books vs 2B), minus credit notes. Items only in books are "not claimable this month; carry forward".
- **Sec 16(4) age check — add, but as a warning only.** The rule is a deadline (30 Nov after the financial year end, or annual return date, whichever earlier), not an age in days. Flag old-year invoices near or past that date. Also read the portal's "ITC Availability = No" and "Reason" columns, which is the more reliable signal.
- **GSTIN typo wording — agree.** Only call it "typo in Tally" when the GSTINs differ by 1–2 characters AND supplier names are similar. Otherwise say "different supplier GSTIN – verify".

## Also found (not in the review)

- The 2B has a **B2BA (amendments)** sheet that is currently ignored. Add those rows, using the revised invoice number.
- The first 2B row has a blank supplier name and GSTIN "blank". Keep it and flag it, don't drop it.

## Keep as is
Row Audit sheet, Remarks Guide, and confidence ratings (as the review says).

## Technical details
- `gst-helpers.ts`: normalise headings (strip spaces/punctuation) before guessing; add "DN/CN" prefix note detection.
- `gst-parsers.ts` `processTally`: dedupe identical taxable within a bill group; add totals to audit; B2BA sheet classification.
- `gst-reconcile.ts`: one `reconcileAll` producing a single result (3 invoice passes + note matching on amount/date window); diagnosis, Net ITC, new 3B/claimable/16(4) builders all derive from it; name-similarity check for GSTIN pairs.
- `gst-downloads.ts`: new "GSTR-3B Summary" sheet; File 3 built from the shared result.
- `Tool.tsx` (Option 2 only): totals row on mapping screen, zero-tax guard, counts from the shared result.
- Verify by running your two March files end-to-end and checking Metalsoft, Venkatesh, the 42 credit notes and the totals in all three files agree.
