# Improve note matching and blank-GSTIN repair (Option 2)

I checked both audit points against your March files before planning. Neither is fully right, so this plan corrects them where the data disagrees.

## What the data shows

**Credit notes (audit partly right)**
- The portal B2B-CDNR sheet has 42 notes and your books have 79 debit notes. Today only 4 pair up.
- As you said, the portal sheet has **no original invoice number column**. It only has the supplier's own note number. So "original invoice" can't be used, and pairing has to rely on GSTIN + amount.
- **18 of the 42 portal notes belong to suppliers with no debit note in your books at all** (e.g. Akshay Traders, HMT Engraving x8, Chintu Logistics, Victor Shell). No matching rule can link these. They are real "credit note received, not booked" items, and the tool should say so clearly.
- Matching one to one by GSTIN + tax amount (within Rs 1.50) raises matches from 4 to about 7–8: Laxmi, Pneumax, Riya, Vibhuti, Viraj 441 / 85,365.
- The date window doesn't matter for these files: 30, 45, 60 or unlimited days give the same result. 60 days is used, matching your earlier plan.
- **Something the audit missed:** Shreeji Traders has 4 portal credit notes and 12 debit notes in your books. The supplier grouped several of your debit notes into one credit note. A rule that checks whether 2–4 debit notes add up to one credit note is needed to catch this.

**Blank GSTIN (audit's example is wrong, but the idea is useful)**
- "Shri Ganesh Tractor" is one bill of Rs 1,680 taxable, not Rs 6.5 lakh. It is genuinely absent from the 2B. Nothing to repair.
- Your books have 11 rows with a blank or malformed GSTIN. 7 of them clearly exist in the 2B under a similar supplier name with the same amount: Biniwale, Mankeshwar, Feedchem, Aquila, Essar (GSTIN missing one character), Tara, and a Tara debit note. Some already match through the existing "Matched – GSTIN differs" pass (which needs the same bill number). The rest are missed because the bill number is also written differently, e.g. Mankeshwar "20226" vs "2026".

## Changes

1. **Notes, pass 1:** keep today's note-number match.
2. **Notes, pass 2 (one to one):** for leftover notes, pair when the GSTIN is the same, the tax amount is within Rs 1.50 and the dates are within 60 days. When several are equal, the closest date wins. Remark: "Possible Match — matched by amount, verify note number".
3. **Notes, pass 3 (grouped):** for leftover portal credit notes, check whether 2–4 leftover debit notes of the same supplier add up to it (within Rs 1.50). Remark: "Possible Match — credit note covers N debit notes". Each debit note used once.
4. **Clearer "not booked" wording:** when the supplier has no debit note in your books at all, the remark says "Credit note issued by supplier — no debit note booked; reduce ITC".
5. **Blank or malformed GSTIN repair (invoices and notes):** runs before the other passes. For each books row whose GSTIN is blank or not a valid 15-character GSTIN, look in the 2B for rows with:
   - a supplier name similarity of at least 85% (after removing Pvt / Ltd / brackets), and
   - the same taxable and tax, within Rs 1.50.

   If exactly one candidate fits, mark the row "Matched — GSTIN missing/invalid in your books, use <2B GSTIN>". If there are none, or more than one, leave the row unchanged.
6. **GSTR-3B Summary and Net ITC:** use the improved note results, so credit notes that are now paired no longer show as unmatched. Figures still come from the 2B side, which is what goes into 3B. Pairing changes the explanation and the "Info" line, not the portal totals.
7. **Test with the March files:** confirm about 7–8 one-to-one note matches plus the Shreeji groups, the 7 GSTIN repairs, Shri Ganesh left as "Not in GSTR 2B", and matching totals across all three files.

## Not changing
- Option 3.
- The claimable ITC total, which stays on hold.
- The Rs 5 tolerance for invoices. Rs 1.50 applies only to the new amount-based passes.

## Technical details
- `gst-reconcile.ts`:
  - Extend `reconcileNotes` with pass 2 (amount/date, greedy by nearest date) and pass 3 (bounded subset-sum, 2–4 items, same GSTIN, max 15 candidates per supplier).
  - Add `repairBlankGSTIN(gstrRows, ourRows)` that runs before `reconcile`. It fills `gstin` on a unique match and tags `_gstinRepaired` for the new remark.
  - `buildGSTR3BSummary` and `buildNetITCSummary` read the new remarks.
- `gst-helpers.ts`: add `isValidGSTIN`. `nameSimilarity` also strips brackets.
- `gst-downloads.ts`: add the new remarks to the Remarks Guide.
- `Tool.tsx` (Option 2 only): call the repair step before reconciling and add the new remarks to the counts.
- Update `march-e2e.test.ts` with the expected counts.
