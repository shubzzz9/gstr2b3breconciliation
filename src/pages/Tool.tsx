/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import XLSX from 'xlsx-js-style';
import { scanTally, processTally, scanGSTR2B, parseGSTR2B, parseCombined, parsePurchaseRegister, parseTally4, reParseCombined, reParsePR, reParseTally4 } from '@/lib/gst-parsers';
import { reconcile, diagnoseMismatches, reconcilePRTally } from '@/lib/gst-reconcile';
import { downloadFile1, downloadFile2, downloadFile3, downloadPRTallyAudit } from '@/lib/gst-downloads';
import { TALLY_SINGLE_ROWS, TALLY_MULTI_ROWS, GSTR_STD_COLS } from '@/lib/gst-helpers';
import { generateFingerprint } from '@/lib/fingerprint';
import ContactPaywall from '@/components/ContactPaywall';
import AuthModal from '@/components/AuthModal';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AdBanner from '@/components/AdBanner';

type Mode = 'tally' | 'full' | 'combined' | 'prtally' | null;

const Tool = () => {
  const { user, loading, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState('');

  // Files
  const [tallyWB, setTallyWB] = useState<any>(null);
  const [gstrWB, setGstrWB] = useState<any>(null);
  const [combinedWB, setCombinedWB] = useState<any>(null);
  const [prWB, setPrWB] = useState<any>(null);
  const [tallyWB4, setTallyWB4] = useState<any>(null);
  const [tallyName, setTallyName] = useState('');
  const [gstrName, setGstrName] = useState('');
  const [combinedName, setCombinedName] = useState('');
  const [prName, setPrName] = useState('');
  const [tally4Name, setTally4Name] = useState('');

  // Scan results
  const [tallyScan, setTallyScan] = useState<any>(null);
  const [gstrScan, setGstrScan] = useState<any>(null);

  // Mappings
  const [singleMap, setSingleMap] = useState<Record<string, number>>({});
  const [multiMap, setMultiMap] = useState<Record<string, number[]>>({});
  const [gstrDetected, setGstrDetected] = useState<Record<string, string | null>>({});
  const [combinedDetection, setCombinedDetection] = useState<any>(null);
  const [prDetection, setPrDetection] = useState<any>(null);
  const [tally4Detection, setTally4Detection] = useState<any>(null);

  // Results
  const [tallyData, setTallyData] = useState<any>(null);
  const [recoRows, setRecoRows] = useState<any>(null);
  const [diagData, setDiagData] = useState<any>(null);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [tallyResult, setTallyResult] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  // Usage
  const [exportCount, setExportCount] = useState(0);
  const [maxExports, setMaxExports] = useState(10);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{ type: string; fn: () => void } | null>(null);
  const deviceFP = useRef<string>('');
  const clientIP = useRef<string>('unknown');

  // Generate fingerprint and fetch IP on mount
  useEffect(() => {
    generateFingerprint().then(fp => { deviceFP.current = fp; });
    supabase.functions.invoke('get-client-ip').then(({ data }) => {
      if (data?.ip) clientIP.current = data.ip;
    }).catch(() => {});
  }, []);

  const loadUsage = useCallback(async () => {
    if (!user) return;
    const { data: count } = await supabase.rpc('get_export_count', { p_user_id: user.id });
    setExportCount(count || 0);
    const { data: profile } = await supabase.from('profiles').select('max_exports, is_blocked').eq('user_id', user.id).single();
    if (profile) { setMaxExports(profile.max_exports); if (profile.is_blocked) setShowPaywall(true); }
  }, [user]);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  const trackExport = async (type: string, userId: string): Promise<boolean> => {
    // Check user-level limits
    const { data: canExport } = await supabase.rpc('can_user_export', { p_user_id: userId });
    if (!canExport) { setShowPaywall(true); return false; }
    // Check device-level limits
    const fp = deviceFP.current;
    const ip = clientIP.current;
    if (fp) {
      const { data: canDevice } = await supabase.rpc('can_device_export', { p_fingerprint: fp, p_ip: ip });
      if (canDevice === false) { setShowPaywall(true); return false; }
    }
    // Log export with device info
    await supabase.rpc('log_export_with_device', {
      p_user_id: userId,
      p_export_type: type,
      p_fingerprint: fp || 'unknown',
      p_ip: ip,
    });
    setExportCount(prev => prev + 1);
    return true;
  };

  const handleDownload = async (type: string, fn: () => void) => {
    if (!user) {
      setPendingDownload({ type, fn });
      setShowAuthModal(true);
      return;
    }
    if (await trackExport(type, user.id)) fn();
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    const { data: { user: freshUser } } = await supabase.auth.getUser();
    if (!freshUser || !pendingDownload) { setPendingDownload(null); return; }
    const { data: count } = await supabase.rpc('get_export_count', { p_user_id: freshUser.id });
    setExportCount(count || 0);
    const { data: profile } = await supabase.from('profiles').select('max_exports, is_blocked').eq('user_id', freshUser.id).single();
    if (profile) { setMaxExports(profile.max_exports); }
    if (await trackExport(pendingDownload.type, freshUser.id)) {
      pendingDownload.fn();
    }
    setPendingDownload(null);
  };

  const handleFile = (file: File, setter: (wb: any) => void, nameSetter: (n: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        setter(wb);
        nameSetter(file.name);
      } catch { alert('Failed to read file. Make sure it is a valid Excel file.'); }
    };
    reader.readAsBinaryString(file);
  };

  const UploadBox = ({ label, hint, icon, fileName, onFile, borderColor }: any) => {
    const [dragover, setDragover] = useState(false);
    return (
      <div
        className={`upload-zone ${fileName ? 'loaded' : ''} ${dragover ? 'dragover' : ''}`}
        style={borderColor ? { borderColor } : {}}
        onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls'; i.onchange = (e: any) => { if (e.target.files[0]) onFile(e.target.files[0]); }; i.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => { e.preventDefault(); setDragover(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
      >
        <div className="text-3xl mb-2">{icon}</div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        {fileName && <div className="text-xs font-semibold text-success mt-2">✓ {fileName}</div>}
      </div>
    );
  };

  const handleStartFlow = (m: string) => {
    setMode(m as Mode);
    setError('');
    try {
      if (m === 'prtally') {
        const prRes = parsePurchaseRegister(prWB);
        const talRes = parseTally4(tallyWB4);
        setTallyResult({ prResult: prRes, tallyResult4: talRes });
        setPrDetection(prRes.ci);
        setTally4Detection(talRes.detectedCols);
        setStep(2);
        return;
      }
      if (m === 'combined') {
        const combined = parseCombined(combinedWB);
        setTallyResult(combined);
        setCombinedDetection(combined.detection);
        setStep(2);
        return;
      }
      const scan = scanTally(tallyWB);
      setTallyScan(scan);
      setSingleMap(scan.singleGuesses);
      setMultiMap(scan.multiGuesses);
      if (m === 'full') {
        const gScan = scanGSTR2B(gstrWB);
        setGstrScan(gScan);
        setGstrDetected({ ...gScan.detected });
      }
      setStep(2);
    } catch (e: any) { setError(e.message); }
  };

  const handleConfirm = async () => {
    setStep(3); setProgress(0);
    try {
      if (mode === 'prtally') {
        setProgressLabel('Running audit...');
        setProgress(50);
        const result = reconcilePRTally(tallyResult.prResult, tallyResult.tallyResult4);
        setAuditResult(result);
        setProgress(100);
        setStep(4);
        return;
      }
      if (mode === 'combined') {
        setProgressLabel('Reconciling combined file...');
        setProgress(30);
        const reco = reconcile(tallyResult.gstrRows, tallyResult.ourRows);
        setRecoRows(reco);
        setProgress(70);
        const diag = diagnoseMismatches(tallyResult.gstrRows, tallyResult.ourRows, reco);
        setDiagData(diag);
        setProgress(100);
        setStep(4);
        return;
      }
      setProgressLabel('Processing tally data...');
      setProgress(20);
      const mapping = { hdrIdx: tallyScan.hdrIdx, headers: tallyScan.headers, raw: tallyScan.raw, ...singleMap, ...multiMap };
      const tResult = processTally(mapping as any);
      setTallyData(tResult.rows);
      setTallyResult(tResult);

      if (mode === 'full' && gstrScan) {
        setProgressLabel('Parsing GSTR-2B...');
        setProgress(50);
        // Use the user-edited mapping
        const editedScan = { ...gstrScan, detected: gstrDetected };
        const gstrRows = parseGSTR2B(editedScan);
        setProgressLabel('Reconciling...');
        setProgress(70);
        const reco = reconcile(gstrRows, tResult.rows, editedScan.extraCols);
        setRecoRows(reco);
        setProgress(85);
        setProgressLabel('Diagnosing mismatches...');
        const diag = diagnoseMismatches(gstrRows, tResult.rows, reco);
        setDiagData(diag);
      }
      setProgress(100);
      setStep(4);
    } catch (e: any) { setError('Processing error: ' + e.message); setStep(2); }
  };


  const resetTool = () => {
    setStep(1); setMode(null); setError('');
    setTallyWB(null); setGstrWB(null); setCombinedWB(null); setPrWB(null); setTallyWB4(null);
    setTallyName(''); setGstrName(''); setCombinedName(''); setPrName(''); setTally4Name('');
    setTallyScan(null); setGstrScan(null); setTallyData(null); setRecoRows(null);
    setDiagData(null); setAuditResult(null); setTallyResult(null);
    setCombinedDetection(null); setPrDetection(null); setTally4Detection(null);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="spinner" /></div>;

  const stepLabels = ['1 · Upload', '2 · Map Columns', '3 · Processing', '4 · Download'];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      {/* Top Ad Banner */}
      <AdBanner slot="TOP_AD_SLOT" className="py-2 bg-secondary" />
      <main className="flex-1 p-4 md:p-6">
      <div className="max-w-[1100px] mx-auto">
        {/* Tool Header */}
        <div className="gradient-header text-primary-foreground p-5 rounded-t-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs opacity-85 mt-1">Convert, compare and reconcile your Purchase Data with GSTR-2B</p>
          </div>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <span className="bg-white/20 px-2 py-1 rounded text-xs">{exportCount}/{maxExports} exports</span>
            </div>
          )}
          {!user && (
            <div className="flex items-center gap-3 text-sm">
              <span className="bg-white/20 px-2 py-1 rounded text-xs">🎁 10 free exports on signup</span>
            </div>
          )}
        </div>

        <div className="bg-card rounded-b-xl p-5 md:p-8 shadow-lg border border-border border-t-0">
          {/* Step Nav */}
          <div className="flex mb-6 rounded-lg overflow-hidden border border-border">
            {stepLabels.map((label, i) => (
              <div key={i} className={`step-tab ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>{label}</div>
            ))}
          </div>

          {error && <div className="alert-box alert-error mb-4">{error}</div>}

          {/* STEP 1: Upload */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-secondary border border-border rounded-lg p-3 text-sm text-foreground">
                <strong className="text-primary">📌 Which option do I need?</strong>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-2 text-xs">
                  <div>• <strong>Option 1</strong> — Convert any purchase file to GSTR-2B format</div>
                  <div>• <strong>Option 2</strong> — Reconcile purchase file vs GSTR-2B</div>
                  <div>• <strong>Option 3</strong> — Reconcile from single combined file</div>
                  <div>• <strong>Option 4</strong> — Client Purchase Sheet vs Tally audit</div>
                </div>
              </div>

              {/* Option 1 */}
              <div className="option-card border-accent bg-accent/5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded">Option 1</span>
                  <span className="font-bold text-sm text-primary">Convert Purchase File → GSTR-2B Format</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Upload any purchase file and convert to GSTR-2B column layout. No reconciliation.</p>
                <UploadBox icon="📊" label="Upload Purchase File" hint="Tally export, client register, or any invoice-wise Excel" fileName={tallyName} onFile={(f: File) => handleFile(f, setTallyWB, setTallyName)} />
                <button disabled={!tallyWB} onClick={() => handleStartFlow('tally')} className="btn-tool bg-accent text-accent-foreground mt-3 hover:opacity-90">Continue with Option 1 →</button>
              </div>

              {/* Option 2 */}
              <div className="option-card border-success bg-success/5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-success text-success-foreground text-xs font-bold px-3 py-1 rounded">Option 2</span>
                  <span className="font-bold text-sm text-primary">Reconcile Purchase File vs GSTR-2B</span>
                  <span className="bg-success/20 text-success text-[10px] font-semibold px-2 py-0.5 rounded-full">Recommended</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Upload purchase file + GSTR-2B from GST portal → full reconciliation.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <UploadBox icon="📊" label="Your Purchase File *" hint="Tally export or any invoice-wise Excel" fileName={tallyName} onFile={(f: File) => handleFile(f, setTallyWB, setTallyName)} />
                  <UploadBox icon="🏛️" label="GSTR-2B from GST Portal *" hint="Excel from gstin.gov.in" fileName={gstrName} onFile={(f: File) => handleFile(f, setGstrWB, setGstrName)} />
                </div>
                <button disabled={!tallyWB || !gstrWB} onClick={() => handleStartFlow('full')} className="btn-tool bg-success text-success-foreground hover:opacity-90">Continue with Option 2 →</button>
              </div>

              {/* Option 3 */}
              <div className="option-card border-dashed border-purple-500 bg-purple-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded">Option 3</span>
                  <span className="font-bold text-sm text-primary">Reconcile from Single Combined File</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Both datasets in one file with a DATA column ("GSTR 2B" / "Our Data").</p>
                <UploadBox icon="📋" label="Combined File" hint='Must have DATA column' fileName={combinedName} onFile={(f: File) => handleFile(f, setCombinedWB, setCombinedName)} borderColor="#a78bfa" />
                <button disabled={!combinedWB} onClick={() => handleStartFlow('combined')} className="btn-tool bg-purple-600 text-white mt-3 hover:opacity-90">Continue with Option 3 →</button>
              </div>

              {/* Option 4 */}
              <div className="option-card border-cyan-500 bg-cyan-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-cyan-600 text-white text-xs font-bold px-3 py-1 rounded">Option 4</span>
                  <span className="font-bold text-sm text-primary">Client Purchase Sheet vs Tally Audit</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Compare client's purchase register with Tally entries.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <UploadBox icon="📄" label="Client's Purchase Sheet *" hint="Original purchase register" fileName={prName} onFile={(f: File) => handleFile(f, setPrWB, setPrName)} borderColor="#67e8f9" />
                  <UploadBox icon="📊" label="Tally Accounted Data *" hint="Purchase register from Tally" fileName={tally4Name} onFile={(f: File) => handleFile(f, setTallyWB4, setTally4Name)} borderColor="#67e8f9" />
                </div>
                <button disabled={!prWB || !tallyWB4} onClick={() => handleStartFlow('prtally')} className="btn-tool bg-cyan-600 text-white hover:opacity-90">Continue with Option 4 →</button>
              </div>
            </div>
          )}

          {/* STEP 2: Mapping */}
          {step === 2 && (
            <div>
              <div className="alert-box alert-info mb-4">
                <strong>Step 2: Confirm Column Detection</strong><br />
                We've auto-detected columns. Review below and confirm.
              </div>
              {(mode === 'tally' || mode === 'full') && tallyScan && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-primary bg-secondary p-2 rounded mb-2">📊 Purchase File — Column Mapping</h3>
                  <table className="map-table">
                    <thead><tr><th>Purpose</th><th>Detected Column</th><th>Status</th></tr></thead>
                    <tbody>
                      {TALLY_SINGLE_ROWS.map(row => (
                        <tr key={row.id}>
                          <td className="text-xs font-medium">{row.label} {row.required && <span className="text-destructive">*</span>}</td>
                          <td>
                            <select className="w-full p-1 border border-input rounded text-xs bg-background"
                              value={singleMap[row.id] ?? -1}
                              onChange={(e) => setSingleMap(prev => ({ ...prev, [row.id]: parseInt(e.target.value) }))}>
                              <option value={-1}>(Not mapped)</option>
                              {tallyScan.headers.map((h: string, i: number) => <option key={i} value={i}>{h}</option>)}
                            </select>
                          </td>
                          <td>{(singleMap[row.id] ?? -1) >= 0 ? <span className="text-xs text-success font-semibold">✓ Found</span> : row.required ? <span className="text-xs text-destructive font-semibold">✗ Required</span> : <span className="text-xs text-warning font-semibold">⚠ Optional</span>}</td>
                        </tr>
                      ))}
                      {TALLY_MULTI_ROWS.map(row => (
                        <tr key={row.id}>
                          <td className="text-xs font-medium">{row.label} {row.required && <span className="text-destructive">*</span>}</td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {tallyScan.headers.map((h: string, i: number) => (
                                <label key={i} className="inline-flex items-center gap-1 text-[11px] border border-input rounded px-1.5 py-0.5 cursor-pointer hover:bg-secondary">
                                  <input type="checkbox" checked={(multiMap[row.id] || []).includes(i)}
                                    onChange={(e) => {
                                      setMultiMap(prev => {
                                        const current = prev[row.id] || [];
                                        return { ...prev, [row.id]: e.target.checked ? [...current, i] : current.filter(x => x !== i) };
                                      });
                                    }} />
                                  {h}
                                </label>
                              ))}
                            </div>
                          </td>
                          <td>{(multiMap[row.id] || []).length > 0 ? <span className="text-xs text-success font-semibold">✓ {(multiMap[row.id] || []).length} cols</span> : row.required ? <span className="text-xs text-destructive font-semibold">✗ Required</span> : <span className="text-xs text-warning font-semibold">⚠ Optional</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* GSTR-2B Column Mapping UI */}
              {mode === 'full' && gstrScan && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-primary bg-secondary p-2 rounded mb-2">🏛️ GSTR-2B — Column Mapping</h3>
                  {gstrScan.headerFallback && (
                    <div className="alert-box alert-warn mb-3 text-xs">
                      <strong>⚠ GSTR-2B header detected via fuzzy matching.</strong> Columns have been auto-mapped — please review and correct any wrong mappings.
                    </div>
                  )}
                  <table className="map-table">
                    <thead><tr><th>Expected Column</th><th>Mapped To</th><th>Status</th></tr></thead>
                    <tbody>
                      {GSTR_STD_COLS.map((expected, ei) => {
                        const REQUIRED = new Set(['GSTIN of supplier', 'Invoice number', 'Invoice Date', 'Taxable Value (₹)']);
                        const isRequired = REQUIRED.has(expected);
                        const mapped = gstrDetected[expected] || '';
                        return (
                          <tr key={ei}>
                            <td className="text-xs font-medium">
                              {expected} {isRequired && <span className="text-destructive">*</span>}
                            </td>
                            <td>
                              <select className="w-full p-1 border border-input rounded text-xs bg-background"
                                value={mapped}
                                onChange={(e) => setGstrDetected(prev => ({ ...prev, [expected]: e.target.value || null }))}>
                                <option value="">(Not mapped)</option>
                                {gstrScan.allHeaders.map((h: string, i: number) => <option key={i} value={h}>{h}</option>)}
                              </select>
                            </td>
                            <td>
                              {mapped ? <span className="text-xs text-success font-semibold">✓ Mapped</span>
                                : isRequired ? <span className="text-xs text-destructive font-semibold">✗ Required</span>
                                : <span className="text-xs text-warning font-semibold">⚠ Optional</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sanity Warnings */}
              {mode === 'full' && gstrScan && gstrScan.sanityWarnings.length > 0 && (
                <div className="alert-box alert-warn mb-4">
                  <strong>⚠ Data Sanity Warnings:</strong>
                  <ul className="list-disc pl-5 mt-1 text-xs space-y-1">
                    {gstrScan.sanityWarnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              {/* Combined mode mapping UI */}
              {mode === 'combined' && combinedDetection && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-primary bg-secondary p-2 rounded mb-2">📋 Combined File — Column Detection</h3>
                  <div className="alert-box alert-success mb-3 text-xs">
                    <strong>✓ File parsed successfully.</strong> Found <strong>{combinedDetection.gstrCount}</strong> GSTR-2B rows and <strong>{combinedDetection.ourCount}</strong> Our Data rows.
                  </div>
                  <table className="map-table">
                    <thead><tr><th>Column</th><th>Detected At</th><th>Status</th></tr></thead>
                    <tbody>
                      {Object.entries(combinedDetection.cols as Record<string, { idx: number; required: boolean }>).map(([col, info]) => (
                        <tr key={col}>
                          <td className="text-xs font-medium">{col} {info.required && <span className="text-destructive">*</span>}</td>
                          <td className="text-xs">{info.idx >= 0 ? `Column ${info.idx + 1} — "${combinedDetection.headers[info.idx]}"` : '(Not found)'}</td>
                          <td>{info.idx >= 0 ? <span className="text-xs text-success font-semibold">✓ Found</span> : info.required ? <span className="text-xs text-destructive font-semibold">✗ Missing</span> : <span className="text-xs text-warning font-semibold">⚠ Optional</span>}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="text-xs font-medium">DATA column <span className="text-destructive">*</span></td>
                        <td className="text-xs">Column {combinedDetection.dataColIdx + 1} — "{combinedDetection.headers[combinedDetection.dataColIdx]}"</td>
                        <td><span className="text-xs text-success font-semibold">✓ Found</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* PR vs Tally mapping UI */}
              {mode === 'prtally' && prDetection && tally4Detection && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-primary bg-secondary p-2 rounded mb-2">📄 Purchase Register — Column Detection</h3>
                  <table className="map-table">
                    <thead><tr><th>Column</th><th>Detected Index</th><th>Status</th></tr></thead>
                    <tbody>
                      {Object.entries(prDetection as Record<string, number>).map(([col, idx]) => (
                        <tr key={col}>
                          <td className="text-xs font-medium">{col}</td>
                          <td className="text-xs">Column {idx + 1}</td>
                          <td><span className="text-xs text-success font-semibold">✓ Found</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h3 className="text-sm font-bold text-primary bg-secondary p-2 rounded mb-2 mt-4">📊 Tally File — Column Detection</h3>
                  <table className="map-table">
                    <thead><tr><th>Column</th><th>Detected Index</th><th>Status</th></tr></thead>
                    <tbody>
                      {Object.entries(tally4Detection as Record<string, number>).map(([col, idx]) => (
                        <tr key={col}>
                          <td className="text-xs font-medium">{col}</td>
                          <td className="text-xs">{idx >= 0 ? `Column ${idx + 1}` : '(Not found)'}</td>
                          <td>{idx >= 0 ? <span className="text-xs text-success font-semibold">✓ Found</span> : <span className="text-xs text-warning font-semibold">⚠ Not detected</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(mode === 'combined' || mode === 'prtally') && !combinedDetection && !prDetection && (
                <div className="alert-box alert-success">
                  <strong>✓ File parsed successfully.</strong> Ready to process.
                </div>
              )}
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="btn-tool bg-secondary text-foreground border border-border w-auto px-6 hover:bg-muted">← Back</button>
                <button onClick={handleConfirm} className="btn-tool bg-primary text-primary-foreground w-auto px-6 hover:opacity-90"
                  disabled={mode !== 'combined' && mode !== 'prtally' && TALLY_SINGLE_ROWS.filter(r => r.required).some(r => (singleMap[r.id] ?? -1) < 0)}>
                  Confirmed — Continue →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Processing */}
          {step === 3 && (
            <div className="text-center py-10">
              <div className="spinner" />
              <p className="text-sm font-semibold text-primary mt-4">{progressLabel || 'Processing...'}</p>
              <div className="bg-secondary rounded-lg h-2.5 mt-4 overflow-hidden max-w-md mx-auto">
                <div className="h-full bg-gradient-to-r from-primary to-success rounded-lg transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* STEP 4: Download */}
          {step === 4 && (
            <div>
              <div className="alert-box alert-success mb-4"><strong>✓ Done!</strong> All output files are ready.</div>

              {recoRows && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {(() => {
                    const counts: Record<string, number> = {};
                    recoRows.forEach((r: any) => { counts[r['Remarks']] = (counts[r['Remarks']] || 0) + 1; });
                    const matched = Object.entries(counts).filter(([k]) => k.startsWith('Matched')).reduce((s, [, v]) => s + v, 0);
                    const gstrCount = recoRows.filter((r: any) => r['DATA'] === 'GSTR 2B').length;
                    const ourCount = recoRows.filter((r: any) => r['DATA'] === 'Our Data').length;
                    return (<>
                      <div className="summary-card"><div className="summary-val">{gstrCount}</div><div className="summary-lbl">GSTR-2B Rows</div></div>
                      <div className="summary-card"><div className="summary-val">{ourCount}</div><div className="summary-lbl">Our Data Rows</div></div>
                      <div className="summary-card border-success/30 bg-success/5"><div className="summary-val text-success">{matched}</div><div className="summary-lbl">Matched</div></div>
                      <div className="summary-card border-warning/30 bg-warning/5"><div className="summary-val text-warning">{recoRows.length - matched}</div><div className="summary-lbl">Unmatched</div></div>
                    </>);
                  })()}
                </div>
              )}

              {/* Remarks Breakdown Table */}
              {recoRows && (() => {
                const counts: Record<string, number> = {};
                recoRows.forEach((r: any) => { counts[r['Remarks']] = (counts[r['Remarks']] || 0) + 1; });
                const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                return (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-primary mb-2">Remarks Breakdown</h3>
                    <table className="w-full border-collapse text-sm mb-4">
                      <thead>
                        <tr>
                          <th className="bg-secondary p-2 text-left border border-border font-semibold">Remark</th>
                          <th className="bg-secondary p-2 text-right border border-border font-semibold">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(([remark, count], i) => (
                          <tr key={i}>
                            <td className="p-2 border border-border text-xs">{remark}</td>
                            <td className="p-2 border border-border text-xs text-right">{count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <hr className="border-border mb-4" />
                  </div>
                );
              })()}

              {/* Standardiser Preview */}
              {tallyData && tallyData.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-primary mb-2">📊 Standardised Data Preview <span className="text-xs font-normal text-muted-foreground">(first 10 rows)</span></h3>
                  <div className="relative w-full overflow-auto border border-border rounded max-h-[300px]">
                    <table className="w-full border-collapse text-[11px]">
                      <thead className="sticky top-0">
                        <tr>
                          {['GSTIN', 'Trade Name', 'Invoice No', 'Invoice Date', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess'].map(h => (
                            <th key={h} className="bg-secondary p-1.5 border border-border font-semibold text-left whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tallyData.slice(0, 10).map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-muted/50">
                            <td className="p-1.5 border border-border whitespace-nowrap">{row.gstin || ''}</td>
                            <td className="p-1.5 border border-border max-w-[150px] truncate">{row.tradeName || ''}</td>
                            <td className="p-1.5 border border-border whitespace-nowrap">{row.invoiceNum || ''}</td>
                            <td className="p-1.5 border border-border whitespace-nowrap">{row.invoiceDate || ''}</td>
                            <td className="p-1.5 border border-border text-right">{(row.taxable || 0).toFixed(2)}</td>
                            <td className="p-1.5 border border-border text-right">{(row.igst || 0).toFixed(2)}</td>
                            <td className="p-1.5 border border-border text-right">{(row.cgst || 0).toFixed(2)}</td>
                            <td className="p-1.5 border border-border text-right">{(row.sgst || 0).toFixed(2)}</td>
                            <td className="p-1.5 border border-border text-right">{(row.cess || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {tallyData.length > 10 && <p className="text-[10px] text-muted-foreground mt-1">...and {tallyData.length - 10} more rows</p>}
                  <hr className="border-border my-4" />
                </div>
              )}

              <h3 className="text-sm font-bold text-primary mb-3">Download Files</h3>
              <div className="flex flex-wrap gap-4">
                {(mode === 'tally' || mode === 'full' || mode === 'combined') && tallyData && (
                  <div className="file-card">
                    <span className="text-[10px] font-semibold bg-accent/20 text-accent px-2 py-0.5 rounded-full">File 1</span>
                    <h4 className="text-sm font-bold mt-2">📄 GSTR-2B Format</h4>
                    <p className="text-xs text-muted-foreground mb-2">Your data formatted to GSTR-2B columns.</p>
                    <div className="text-[10px] text-muted-foreground mb-3 space-y-0.5">
                      <div>• GSTR-2B Format — <strong>{tallyData.length}</strong> rows</div>
                    </div>
                    <button onClick={() => handleDownload('file1', () => downloadFile1(tallyData))} className="btn-tool bg-primary text-primary-foreground hover:opacity-90">💾 Download</button>
                  </div>
                )}
                {(mode === 'full' || mode === 'combined') && recoRows && (
                  <div className="file-card">
                    <span className="text-[10px] font-semibold bg-success/20 text-success px-2 py-0.5 rounded-full">File 2</span>
                    <h4 className="text-sm font-bold mt-2">📋 Reconciliation Report</h4>
                    <p className="text-xs text-muted-foreground mb-2">Full reconciliation with remarks.</p>
                    <div className="text-[10px] text-muted-foreground mb-3 space-y-0.5">
                      <div>• Reconciliation Output — <strong>{recoRows.length}</strong> rows</div>
                      <div>• Remarks Guide — <strong>7</strong> rows</div>
                    </div>
                    <button onClick={() => handleDownload('file2', () => downloadFile2(recoRows, gstrScan?.extraCols))} className="btn-tool bg-success text-success-foreground hover:opacity-90">💾 Download</button>
                  </div>
                )}
                {(mode === 'full' || mode === 'combined') && diagData && (
                  <div className="file-card">
                    <span className="text-[10px] font-semibold bg-secondary text-foreground px-2 py-0.5 rounded-full">File 3</span>
                    <h4 className="text-sm font-bold mt-2">🔍 Mismatch Diagnosis</h4>
                    <p className="text-xs text-muted-foreground mb-2">Detailed mismatch analysis.</p>
                    <div className="text-[10px] text-muted-foreground mb-3 space-y-0.5">
                      <div>• Not In Our Data — <strong>{diagData.notInOurData?.length || 0}</strong> rows</div>
                      <div>• Not In GSTR 2B (ITC Risk) — <strong>{diagData.notInGSTR2B?.length || 0}</strong> rows</div>
                      <div>• GSTIN Mismatches — <strong>{diagData.gstinMismatches?.length || 0}</strong> rows</div>
                      <div>• Possible Matches — <strong>{((recoRows as any)?._possibleMatchPairs || []).length}</strong> rows</div>
                      <div>• Fig Not Matched — <strong>{diagData.figNotMatched?.length || 0}</strong> rows</div>
                      <div>• Summary — category totals</div>
                    </div>
                    <button onClick={() => handleDownload('file3', () => downloadFile3(diagData, recoRows || [], (recoRows as any)?._possibleMatchPairs || []))} className="btn-tool bg-secondary text-foreground border border-border hover:bg-muted">💾 Download</button>
                  </div>
                )}
                {mode === 'prtally' && auditResult && (
                  <div className="file-card">
                    <span className="text-[10px] font-semibold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">Audit</span>
                    <h4 className="text-sm font-bold mt-2">🔎 PR vs Tally Audit</h4>
                    <p className="text-xs text-muted-foreground mb-3">Colour-coded audit result.</p>
                    <button onClick={() => handleDownload('file4', () => downloadPRTallyAudit(auditResult))} className="btn-tool bg-cyan-600 text-white hover:opacity-90">💾 Download</button>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <button onClick={resetTool} className="btn-tool bg-secondary text-foreground border border-border w-auto px-6 hover:bg-muted">← Start Over</button>
              </div>
            </div>
          )}
        </div>
      </div>
      </main>

      {/* Mid-page Ad Banner */}
      <AdBanner slot="MID_AD_SLOT" className="py-3 bg-background" />

      {/* SEO Content Section - visible to search engines, helpful for users */}
      <section className="bg-secondary border-t border-border">
        <div className="max-w-[1100px] mx-auto px-4 py-8">
          <h2 className="text-lg font-bold text-foreground mb-4">Free Online GSTR-2B Reconciliation Tool</h2>
          <div className="prose prose-sm text-muted-foreground max-w-none">
            <p className="mb-3">
              Struggling to match your <strong>Tally purchase data with GSTR-2B</strong>? Our free online tool instantly reconciles your books with the government's GSTR-2B data. No software installation needed — everything works in your browser.
            </p>
            <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">What This Tool Does</h3>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li><strong>GSTR-2B vs Tally Reconciliation</strong> — Match your purchase register with GSTR-2B invoices</li>
              <li><strong>Auto Column Detection</strong> — Works with any Excel format, no manual mapping needed</li>
              <li><strong>Smart Invoice Matching</strong> — Matches by GSTIN + Invoice Number, handles typos</li>
              <li><strong>Mismatch Diagnosis</strong> — Tells you WHY invoices don't match with actionable fixes</li>
              <li><strong>ITC Risk Report</strong> — Identifies invoices not in GSTR-2B (ITC at risk)</li>
              <li><strong>Styled Excel Output</strong> — Professional color-coded reports ready for clients</li>
            </ul>
            <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">Who Uses This Tool?</h3>
            <p className="text-xs">
              <strong>Chartered Accountants (CAs)</strong>, <strong>tax professionals</strong>, <strong>GST practitioners</strong>, and <strong>businesses</strong> across India use this tool to save hours of manual reconciliation work. Perfect for quarterly GST filing, annual audits, and ITC verification.
            </p>
            <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">100% Secure</h3>
            <p className="text-xs">
              All file processing happens <strong>locally in your browser</strong>. Your Excel files are never uploaded to any server. Your sensitive GSTIN data, invoice details, and financial information stay on your device.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom Ad Banner */}
      <AdBanner slot="BOTTOM_AD_SLOT" className="py-3 bg-secondary border-t border-border" />

      <Footer />

      {showPaywall && <ContactPaywall onClose={() => setShowPaywall(false)} exportCount={exportCount} maxExports={maxExports} />}
      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); setPendingDownload(null); }} onSuccess={handleAuthSuccess} />}
    </div>
  );
};

export default Tool;
