/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  cleanString, normalise, numVal, safeVal, safeNum,
  excelSerialToDate, invSimilarity, GSTR_STD_COLS, AUDIT_FIELDS
} from './gst-helpers';

// ═══════════════════════════════════════════════════════════
// FIND POSSIBLE MATCHES
// ═══════════════════════════════════════════════════════════

function findPossibleMatches(outputRows: any[]) {
  function withinPct(a: any, b: any, pct: number) {
    const av = numVal(a), bv = numVal(b);
    if (av === 0 && bv === 0) return true;
    if (av === 0 || bv === 0) return Math.abs(av - bv) <= 1;
    return Math.abs(av - bv) / Math.max(Math.abs(av), Math.abs(bv)) * 100 <= pct;
  }
  const TOL = 5;
  const gstrUnmatched = outputRows.filter(r => r['DATA'] === 'GSTR 2B' && r['Remarks'] === 'Not in our data');
  const ourUnmatched = outputRows.filter(r => r['DATA'] === 'Our Data' && r['Remarks'] === 'Not in GSTR 2B');
  const usedOur = new Set<number>();
  const pairs: any[] = [];

  gstrUnmatched.forEach(gRow => {
    const gstin = cleanString(gRow['GSTIN of supplier'] || '');
    if (!gstin) return;
    let bestScore = 0, bestMatch: any = null;
    ourUnmatched.forEach((oRow, oi) => {
      if (usedOur.has(oi)) return;
      if (cleanString(oRow['GSTIN of supplier'] || '') !== gstin) return;
      if (!withinPct(gRow['Taxable Value (₹)'], oRow['Taxable Value (₹)'], TOL)) return;
      if (!withinPct(gRow['Integrated Tax(₹)'], oRow['Integrated Tax(₹)'], TOL)) return;
      if (!withinPct(gRow['Central Tax(₹)'], oRow['Central Tax(₹)'], TOL)) return;
      if (!withinPct(gRow['State/UT Tax(₹)'], oRow['State/UT Tax(₹)'], TOL)) return;
      const sim = invSimilarity(gRow['Invoice number'], oRow['Invoice number']);
      if (sim.score >= 60 && sim.score > bestScore) {
        bestScore = sim.score;
        bestMatch = { oi, oRow, sim };
      }
    });
    if (bestMatch) {
      usedOur.add(bestMatch.oi);
      pairs.push({ gRow, oRow: bestMatch.oRow, sim: bestMatch.sim });
    }
  });
  return pairs;
}

// ═══════════════════════════════════════════════════════════
// RECONCILE
// ═══════════════════════════════════════════════════════════

const TAX_TOL = 5;

function buildGSTRRow(g: any, remark: string, extraCols: any[]) {
  const row: Record<string, any> = {};
  ['GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type',
   'Place of supply', 'Supply Attract Reverse Charge'].forEach(c => { row[c] = safeVal(g[c]); });
  row['Invoice Date'] = excelSerialToDate(g['Invoice Date']) || safeVal(g['Invoice Date']);
  ['Invoice Value(₹)', 'Taxable Value (₹)', 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)']
    .forEach(c => { row[c] = safeNum(g[c]); });
  extraCols.filter(ec => ec.include).forEach(ec => { row[ec.gstrCol] = safeVal(g[ec.gstrCol]); });
  row['DATA'] = 'GSTR 2B'; row['Remarks'] = remark;
  return row;
}

function buildOurRow(r: any, remark: string, extraCols: any[]) {
  const row: Record<string, any> = {};
  GSTR_STD_COLS.forEach(c => { row[c] = ''; });
  row['GSTIN of supplier'] = safeVal(r.gstin);
  row['Trade/Legal name'] = safeVal(r.tradeName);
  row['Invoice number'] = safeVal(r.invoiceNum);
  row['Invoice Date'] = safeVal(r.invoiceDate);
  row['Taxable Value (₹)'] = safeNum(r.taxable);
  row['Integrated Tax(₹)'] = safeNum(r.igst);
  row['Central Tax(₹)'] = safeNum(r.cgst);
  row['State/UT Tax(₹)'] = safeNum(r.sgst);
  row['Cess(₹)'] = safeNum(r.cess);
  extraCols.filter(ec => ec.include).forEach(ec => { row[ec.gstrCol] = ''; });
  row['DATA'] = 'Our Data'; row['Remarks'] = remark;
  return row;
}

export function reconcile(gstrRows: any[], ourRows: any[], extraCols: any[] = []) {
  const ourDict: Record<string, { gi: number; row: any }[]> = {};
  ourRows.forEach((row: any, gi: number) => {
    const g = cleanString(normalise(String(row.gstin || '')));
    const inv = row.invoiceNum === '(blank)' ? '' : (row.invoiceNum || '');
    const key = g + '|' + cleanString(inv);
    if (!ourDict[key]) ourDict[key] = [];
    ourDict[key].push({ gi, row });
  });

  const output: any[] = [];
  const used = new Set<number>();

  gstrRows.forEach((gRow: any) => {
    const gstin = String(gRow['GSTIN of supplier'] || '');
    const invoice = String(gRow['Invoice number'] || '');
    const key = cleanString(gstin) + '|' + cleanString(invoice);
    const cands = (ourDict[key] || []).filter(e => !used.has(e.gi));

    let remark: string;
    if (cands.length > 0) {
      const gT = numVal(gRow['Taxable Value (₹)']), gI = numVal(gRow['Integrated Tax(₹)']);
      const gC = numVal(gRow['Central Tax(₹)']), gS = numVal(gRow['State/UT Tax(₹)']);
      const gCe = numVal(gRow['Cess(₹)']);
      const sT = cands.reduce((s, e) => s + e.row.taxable, 0);
      const sI = cands.reduce((s, e) => s + e.row.igst, 0);
      const sC = cands.reduce((s, e) => s + e.row.cgst, 0);
      const sS = cands.reduce((s, e) => s + e.row.sgst, 0);
      const sCe = cands.reduce((s, e) => s + e.row.cess, 0);
      const fig = Math.abs(gT - sT) <= TAX_TOL && Math.abs(gI - sI) <= TAX_TOL &&
                  Math.abs(gC - sC) <= TAX_TOL && Math.abs(gS - sS) <= TAX_TOL && Math.abs(gCe - sCe) <= TAX_TOL;
      remark = fig ? (cands.length === 1 ? 'Matched' : `Matched - Multi-line (${cands.length} entries)`) : 'Fig Not Matched';
      output.push(buildGSTRRow(gRow, remark, extraCols));
      cands.forEach(e => { used.add(e.gi); output.push(buildOurRow(e.row, fig ? remark : 'Fig Not Matched', extraCols)); });
    } else {
      remark = !invoice ? 'Invoice number not mentioned in GSTR 2B'
              : !gstin ? 'GSTIN not mentioned in GSTR 2B'
              : 'Not in our data';
      output.push(buildGSTRRow(gRow, remark, extraCols));
    }
  });

  Object.values(ourDict).forEach(entries => {
    entries.forEach(e => {
      if (!used.has(e.gi)) {
        const inv = e.row.invoiceNum === '(blank)' ? '' : (e.row.invoiceNum || '');
        const gst = normalise(String(e.row.gstin || ''));
        const rem = !inv ? 'Invoice number not mentioned in Our data'
                   : !gst ? 'GSTIN not mentioned in Our data'
                   : 'Not in GSTR 2B';
        output.push(buildOurRow(e.row, rem, extraCols));
      }
    });
  });

  // Possible match detection
  const possibleMatchPairs = findPossibleMatches(output);
  if (possibleMatchPairs.length > 0) {
    const pairedGSTR = new Set(possibleMatchPairs.map((p: any) => p.gRow));
    const pairedOur = new Set(possibleMatchPairs.map((p: any) => p.oRow));
    possibleMatchPairs.forEach((p: any) => {
      p.gRow['Remarks'] = 'Possible Match — Invoice No. differs';
      p.oRow['Remarks'] = 'Possible Match — Invoice No. differs';
    });
    const nonPaired = output.filter(r => !pairedGSTR.has(r) && !pairedOur.has(r));
    const pairedSection: any[] = [];
    possibleMatchPairs.forEach((p: any) => { pairedSection.push(p.gRow); pairedSection.push(p.oRow); });
    output.length = 0;
    nonPaired.forEach(r => output.push(r));
    pairedSection.forEach(r => output.push(r));
  }

  return output;
}

// ═══════════════════════════════════════════════════════════
// MISMATCH DIAGNOSIS
// ═══════════════════════════════════════════════════════════

export function diagnoseMismatches(recoRows: any[]) {
  const notInOurData: any[] = [];
  const notInGSTR2B: any[] = [];
  const figNotMatched: any[] = [];

  recoRows.forEach(row => {
    const remark = row['Remarks'] || '';
    if (remark === 'Not in our data') {
      notInOurData.push({
        'GSTIN (GSTR-2B)': row['GSTIN of supplier'],
        'Supplier': row['Trade/Legal name'],
        'Invoice Number': row['Invoice number'],
        'Invoice Date': row['Invoice Date'],
        'Taxable Value': safeNum(row['Taxable Value (₹)']),
        'IGST': safeNum(row['Integrated Tax(₹)']),
        'CGST': safeNum(row['Central Tax(₹)']),
        'SGST': safeNum(row['State/UT Tax(₹)']),
        'Diagnosis': 'Invoice exists in GSTR-2B but not found in your data. Check if bill was physically received.',
      });
    } else if (remark === 'Not in GSTR 2B') {
      notInGSTR2B.push({
        'GSTIN (Tally)': row['GSTIN of supplier'],
        'Supplier': row['Trade/Legal name'],
        'Invoice Number': row['Invoice number'],
        'Invoice Date': row['Invoice Date'],
        'Taxable Value': safeNum(row['Taxable Value (₹)']),
        'IGST': safeNum(row['Integrated Tax(₹)']),
        'CGST': safeNum(row['Central Tax(₹)']),
        'SGST': safeNum(row['State/UT Tax(₹)']),
        'Diagnosis': 'Invoice in your data but NOT in GSTR-2B. Supplier may not have filed GSTR-1. ITC at risk.',
      });
    } else if (remark === 'Fig Not Matched') {
      figNotMatched.push({
        'GSTIN': row['GSTIN of supplier'],
        'Supplier': row['Trade/Legal name'],
        'Invoice Number': row['Invoice number'],
        'DATA Source': row['DATA'],
        'Taxable Value': safeNum(row['Taxable Value (₹)']),
        'IGST': safeNum(row['Integrated Tax(₹)']),
        'CGST': safeNum(row['Central Tax(₹)']),
        'SGST': safeNum(row['State/UT Tax(₹)']),
        'Diagnosis': 'Figures differ between GSTR-2B and your data. Check for rounding or data entry errors.',
      });
    }
  });

  // GSTIN mismatch detection
  const gstrUnmatched = recoRows.filter(r => r['Remarks'] === 'Not in our data');
  const ourUnmatched = recoRows.filter(r => r['Remarks'] === 'Not in GSTR 2B');
  const gstinMismatches: any[] = [];

  gstrUnmatched.forEach(gRow => {
    const gInv = cleanString(gRow['Invoice number'] || '');
    if (!gInv) return;
    ourUnmatched.forEach(oRow => {
      const oInv = cleanString(oRow['Invoice number'] || '');
      if (gInv === oInv) {
        const gGstin = String(gRow['GSTIN of supplier'] || '');
        const oGstin = String(oRow['GSTIN of supplier'] || '');
        if (cleanString(gGstin) !== cleanString(oGstin)) {
          gstinMismatches.push({
            'Invoice Number': gRow['Invoice number'],
            'GSTR-2B GSTIN': gGstin,
            'Our Data GSTIN': oGstin,
            'GSTR-2B Supplier': gRow['Trade/Legal name'],
            'Our Data Supplier': oRow['Trade/Legal name'],
            'Diagnosis': 'Same invoice found with different GSTINs. Correct the GSTIN in your records.',
          });
        }
      }
    });
  });

  return { notInOurData, notInGSTR2B, figNotMatched, gstinMismatches };
}

// ═══════════════════════════════════════════════════════════
// PR vs TALLY RECONCILIATION (Option 4)
// ═══════════════════════════════════════════════════════════

export function reconcilePRTally(prResult: any, tallyResult4: any) {
  const { bills, billOrder } = prResult;
  const { tally, tallyOrder } = tallyResult4;
  const TOL = 5;
  const prRows: any[] = [];
  const tallyRows: any[] = [];
  const usedTally: Record<string, boolean> = {};

  billOrder.forEach((ck: string) => {
    const pr = bills[ck];
    const t = tally[ck] || null;
    let status: string;
    const diffs: Record<string, any> = {};

    if (!t) {
      status = 'MISSING_IN_TALLY';
    } else {
      usedTally[ck] = true;
      const hasMismatch = AUDIT_FIELDS.some(f => Math.abs(pr[f.prKey] - (t[f.tallyKey] || 0)) > TOL);
      status = hasMismatch ? 'MISMATCH' : 'MATCHED';
    }

    if (t) {
      AUDIT_FIELDS.forEach(f => {
        const prV = pr[f.prKey] || 0;
        const tV = t[f.tallyKey] || 0;
        diffs[f.label] = { pr: prV, tally: tV, diff: prV - tV };
      });
    }
    prRows.push({ pr, t, ck, status, diffs });
  });

  tallyOrder.forEach((ck: string) => {
    const t = tally[ck];
    const pr = bills[ck] || null;
    let status: string;
    const diffs: Record<string, any> = {};

    if (!pr) {
      status = 'NOT_IN_PR';
    } else {
      const prRow = prRows.find(r => r.ck === ck);
      status = prRow ? prRow.status : 'MATCHED';
    }

    if (pr) {
      AUDIT_FIELDS.forEach(f => {
        const prV = pr[f.prKey] || 0;
        const tV = t[f.tallyKey] || 0;
        diffs[f.label] = { pr: prV, tally: tV, diff: tV - prV };
      });
    }
    tallyRows.push({ t, pr, ck, status, diffs });
  });

  return {
    prRows, tallyRows,
    mismatchCount: prRows.filter(r => r.status === 'MISMATCH').length,
    missingCount: prRows.filter(r => r.status === 'MISSING_IN_TALLY').length,
    extraCount: tallyRows.filter(r => r.status === 'NOT_IN_PR').length,
    prRaw: prResult, tallyRaw: tallyResult4,
  };
}
