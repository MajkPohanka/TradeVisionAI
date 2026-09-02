import React, { useRef, useState } from 'react';
import {
  X,
  Share2,
  Download,
  Copy,
  Check,
  Send,
  Image as ImageIcon,
  Printer,
  FileSpreadsheet,
  AlertOctagon,
  Brain,
  Calendar,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Activity,
  ShieldAlert,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { MetaTraderAuditResult, LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface ShareAuditModalProps {
  auditResult: MetaTraderAuditResult;
  isOpen: boolean;
  onClose: () => void;
  language?: LanguageOption;
}

export const ShareAuditModal: React.FC<ShareAuditModalProps> = ({
  auditResult,
  isOpen,
  onClose,
  language = 'cs',
}) => {
  const t = getTranslation(language);
  const cardRef = useRef<HTMLDivElement>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  if (!isOpen) return null;

  const dateStr = new Date(auditResult.timestamp || Date.now()).toLocaleDateString(
    language === 'cs' ? 'cs-CZ' : language === 'es' ? 'es-ES' : 'en-US',
    { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  );

  // Formatted Text Summary for WhatsApp, Telegram, Discord, Email
  const formattedText = `📊 *TRADEOY.com — ${t.auditReportHeader}*
📅 ${dateStr}

📈 *${t.auditPerformanceTitle}:*
• ${t.tradesAnalyzed}: *${auditResult.tradesAnalyzedCount}*
• ${t.winRate}: *${auditResult.winRatePercent}%*
• ${t.totalPnL}: *${auditResult.totalProfitLoss >= 0 ? '+' : ''}${auditResult.totalProfitLoss} $*
• ${t.profitFactor}: *${auditResult.profitFactor || 'N/A'}*

⚠️ *${t.auditMistakesTitle}:*
${(auditResult.primaryMistakes || [])
  .slice(0, 3)
  .map((m) => `• [${m.severity} RISK] *${m.title}*: ${m.description}`)
  .join('\n')}

🧠 *${t.auditPsychologyTitle}:*
${auditResult.psychologyAssessment}

🎯 *${t.auditActionableTitle}:*
${(auditResult.actionableRecommendations || [])
  .map((r, i) => `${i + 1}. ${r}`)
  .join('\n')}

— ${t.generatedByApp} 🚀`;

  // html2canvas config
  const getCanvasOptions = () => ({
    scale: 2,
    useCORS: true,
    backgroundColor: '#020617',
    logging: false,
    onclone: (clonedDoc: Document) => {
      // Remove style & link tags so html2canvas doesn't fail on Tailwind v4 color spaces
      const styleTags = clonedDoc.querySelectorAll('style, link');
      styleTags.forEach((tag) => tag.remove());
    },
  });

  // 1. Copy Text Summary
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // 2. Download PNG Image Card
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setIsGeneratingImage(true);
    setShareError(null);
    try {
      const canvas = await html2canvas(cardRef.current, getCanvasOptions());
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `TRADEOY_MetaTrader_Audit_${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
    } catch (err) {
      console.error('Failed to generate PNG image:', err);
      setShareError('Obrázek se nepodařilo vygenerovat. Zkuste zkopírovat textovou verzi.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 3. Copy Image to Clipboard
  const handleCopyImageToClipboard = async () => {
    if (!cardRef.current) return;
    setIsGeneratingImage(true);
    setShareError(null);
    try {
      const canvas = await html2canvas(cardRef.current, getCanvasOptions());
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (blob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            setCopiedImage(true);
            setTimeout(() => setCopiedImage(false), 2500);
            return;
          }
        } catch (clipErr) {
          console.warn('Clipboard API image copy failed, falling back to download:', clipErr);
        }
      }

      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `TRADEOY_MetaTrader_Audit_${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2500);
    } catch (err) {
      console.error('Error copying image:', err);
      setShareError('Obrázek se nepodařilo zkopírovat ani stáhnout. Zkuste zkopírovat textovou verzi.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 4. WhatsApp Direct Share Link
  const handleShareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(formattedText)}`;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('Unable to open window:', err);
    }
  };

  // 5. Telegram Direct Share Link
  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(formattedText)}`;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('Unable to open window:', err);
    }
  };

  // 6. Native Web Share API
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `TRADEOY.com — ${t.auditReportHeader}`,
          text: formattedText,
        });
      } catch (err) {
        console.log('Share canceled or not supported:', err);
      }
    } else {
      handleCopyText();
    }
  };

  // 7. Print / PDF Export
  const handleExportPdf = async () => {
    if (!cardRef.current) {
      window.print();
      return;
    }

    setIsGeneratingPdf(true);
    setShareError(null);

    try {
      const canvas = await html2canvas(cardRef.current, getCanvasOptions());
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const posX = 10;
      const posY = Math.max(10, (pageHeight - imgHeight) / 2);

      pdf.setFillColor(2, 6, 23);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      pdf.addImage(imgData, 'PNG', posX, posY, imgWidth, Math.min(imgHeight, pageHeight - 20));

      const fileName = `TRADEOY_MetaTrader_Audit_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.warn('Direct PDF export failed, falling back to window.print():', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div
      id="share-audit-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="share-audit-modal-container"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl relative my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-purple-950/30 to-slate-900 sticky top-0 z-20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-950/50">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                {t.exportAuditModalTitle}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                  MT4 / MT5
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {t.exportAuditModalSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-h-[82vh] overflow-y-auto no-scrollbar">
          {shareError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
              <span>{shareError}</span>
              <button onClick={() => setShareError(null)} className="text-rose-400 hover:text-white font-bold ml-2">✕</button>
            </div>
          )}

          {/* Quick Platform Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={handleShareWhatsApp}
              className="p-3 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 rounded-xl flex flex-col items-center justify-center space-y-1.5 transition text-xs font-semibold cursor-pointer shadow-sm group active:scale-95"
            >
              <Send className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>{t.shareWhatsApp}</span>
            </button>

            <button
              onClick={handleShareTelegram}
              className="p-3 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 rounded-xl flex flex-col items-center justify-center space-y-1.5 transition text-xs font-semibold cursor-pointer shadow-sm group active:scale-95"
            >
              <Send className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>{t.shareTelegram}</span>
            </button>

            {typeof navigator !== 'undefined' && 'share' in navigator ? (
              <button
                onClick={handleNativeShare}
                className="p-3 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-500/40 text-blue-300 rounded-xl flex flex-col items-center justify-center space-y-1.5 transition text-xs font-semibold cursor-pointer shadow-sm group active:scale-95"
              >
                <Share2 className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                <span>{t.shareMessengerApp}</span>
              </button>
            ) : (
              <button
                onClick={handleCopyText}
                className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl flex flex-col items-center justify-center space-y-1.5 transition text-xs font-semibold cursor-pointer shadow-sm group active:scale-95"
              >
                {copiedText ? (
                  <>
                    <Check className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400">{t.textCopied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 text-slate-400 group-hover:scale-110 transition-transform" />
                    <span>{t.copyAuditTextBtn}</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleDownloadImage}
              disabled={isGeneratingImage}
              className="p-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl flex flex-col items-center justify-center space-y-1.5 transition text-xs font-extrabold cursor-pointer shadow-lg shadow-purple-950/50 group active:scale-95 disabled:opacity-50"
            >
              <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
              <span>{t.downloadAuditPngBtn}</span>
            </button>
          </div>

          {/* Secondary Utilities Bar (PDF Print & Copy Image) */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={handleCopyImageToClipboard}
              disabled={isGeneratingImage}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg flex items-center space-x-2 transition cursor-pointer active:scale-95"
            >
              {copiedImage ? <Check className="w-4 h-4 text-emerald-400" /> : <ImageIcon className="w-4 h-4 text-purple-400" />}
              <span>{copiedImage ? t.imageCopied : t.copyAuditPngBtn}</span>
            </button>

            <button
              onClick={handleExportPdf}
              disabled={isGeneratingPdf || isGeneratingImage}
              className="px-3.5 py-2 bg-slate-900 hover:bg-purple-950/50 hover:border-purple-500/50 text-purple-300 border border-slate-700 rounded-lg flex items-center space-x-2 transition cursor-pointer active:scale-95 font-semibold disabled:opacity-50"
            >
              {isGeneratingPdf ? (
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Printer className="w-4 h-4 text-purple-400" />
              )}
              <span>{isGeneratingPdf ? 'Generuji PDF...' : t.printPdfAuditBtn}</span>
            </button>
          </div>

          {/* VISUAL IMAGE CARD PREVIEW (Rendered for html2canvas & high-definition export) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
                {t.auditCardPreviewTitle}
              </span>
              <span className="text-[10px] text-purple-400 font-mono">1080 x 1440 HD Report</span>
            </div>

            <div className="overflow-x-auto no-scrollbar pb-2 flex justify-center bg-slate-950/60 p-3 sm:p-4 rounded-2xl border border-slate-800">
              <div
                ref={cardRef}
                style={{
                  width: '560px',
                  backgroundColor: '#030712',
                  color: '#ffffff',
                  border: '2px solid #1e1b4b',
                  borderRadius: '20px',
                  padding: '28px',
                  boxSizing: 'border-box',
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  position: 'relative',
                }}
              >
                {/* 1. Header & Brand Banner */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #1f2937',
                    paddingBottom: '16px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #9333ea 0%, #4f46e5 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '900',
                        fontSize: '16px',
                        color: '#ffffff',
                        flexShrink: 0,
                        boxShadow: '0 4px 14px rgba(147, 51, 234, 0.4)',
                      }}
                    >
                      MT
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#ffffff', fontWeight: '900', fontSize: '15px', letterSpacing: '0.4px' }}>
                          TRADEOY.com
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            backgroundColor: '#3b0764',
                            color: '#e9d5ff',
                            border: '1px solid #7e22ce',
                            fontWeight: '700',
                          }}
                        >
                          PRO AUDIT
                        </span>
                      </div>
                      <span style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '500' }}>
                        {t.auditReportHeader}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: '#6b7280', fontSize: '10px', display: 'block', fontWeight: '600' }}>
                      AUDIT DATE
                    </span>
                    <span style={{ color: '#d1d5db', fontSize: '11px', fontWeight: '700', fontFamily: 'monospace' }}>
                      {dateStr}
                    </span>
                  </div>
                </div>

                {/* 2. Key Metrics 4-Box Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '10px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Trades Analyzed */}
                  <div
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '12px',
                      padding: '12px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ color: '#9ca3af', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>
                      {t.tradesAnalyzed}
                    </div>
                    <div style={{ color: '#ffffff', fontSize: '20px', fontWeight: '900', marginTop: '4px' }}>
                      {auditResult.tradesAnalyzedCount}
                    </div>
                  </div>

                  {/* Win Rate */}
                  <div
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '12px',
                      padding: '12px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ color: '#9ca3af', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>
                      {t.winRate}
                    </div>
                    <div
                      style={{
                        color: auditResult.winRatePercent >= 50 ? '#34d399' : '#f87171',
                        fontSize: '20px',
                        fontWeight: '900',
                        marginTop: '4px',
                      }}
                    >
                      {auditResult.winRatePercent}%
                    </div>
                  </div>

                  {/* Total PnL */}
                  <div
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '12px',
                      padding: '12px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ color: '#9ca3af', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>
                      {t.totalPnL}
                    </div>
                    <div
                      style={{
                        color: auditResult.totalProfitLoss >= 0 ? '#34d399' : '#f87171',
                        fontSize: '20px',
                        fontWeight: '900',
                        marginTop: '4px',
                      }}
                    >
                      {auditResult.totalProfitLoss >= 0 ? '+' : ''}
                      {auditResult.totalProfitLoss} $
                    </div>
                  </div>

                  {/* Profit Factor */}
                  <div
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '12px',
                      padding: '12px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ color: '#9ca3af', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>
                      {t.profitFactor}
                    </div>
                    <div style={{ color: '#38bdf8', fontSize: '20px', fontWeight: '900', marginTop: '4px' }}>
                      {auditResult.profitFactor || 'N/A'}
                    </div>
                  </div>
                </div>

                {/* 3. Primary Mistakes Section */}
                {auditResult.primaryMistakes && auditResult.primaryMistakes.length > 0 && (
                  <div
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        color: '#f87171',
                        fontSize: '11px',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>⚠️ {t.auditMistakesTitle}</span>
                      <span style={{ fontSize: '10px', color: '#9ca3af' }}>AI RISK ANALYSIS</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {auditResult.primaryMistakes.slice(0, 3).map((m, idx) => (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: '#18181b',
                            border: '1px solid #3f3f46',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#fca5a5', fontWeight: '700', fontSize: '12px' }}>
                              • {m.title}
                            </span>
                            <span
                              style={{
                                fontSize: '9px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#450a0a',
                                color: '#f87171',
                                border: '1px solid #991b1b',
                                fontWeight: '800',
                              }}
                            >
                              {m.severity} RISK
                            </span>
                          </div>
                          <p style={{ color: '#d1d5db', fontSize: '11px', lineHeight: '1.4', margin: 0 }}>
                            {m.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Macro Economic News Correlations */}
                {auditResult.economicNewsCorrelations && auditResult.economicNewsCorrelations.length > 0 && (
                  <div
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        color: '#fbbf24',
                        fontSize: '11px',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      📅 {t.auditNewsTitle}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {auditResult.economicNewsCorrelations.slice(0, 2).map((news, idx) => (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: '#18181b',
                            border: '1px solid #451a03',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            fontSize: '11px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fde68a', fontWeight: '700' }}>
                            <span>{news.tradeTicketOrTime} • {news.newsTitle}</span>
                            <span style={{ color: '#ef4444', fontSize: '9px', fontWeight: '800' }}>HIGH IMPACT</span>
                          </div>
                          <p style={{ color: '#d1d5db', fontSize: '10px', marginTop: '2px', margin: 0 }}>
                            {news.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Psychology Breakdown */}
                <div
                  style={{
                    backgroundColor: '#111827',
                    border: '1px solid #1f2937',
                    borderRadius: '14px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      color: '#c084fc',
                      fontSize: '11px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    🧠 {t.auditPsychologyTitle}
                  </div>
                  <p
                    style={{
                      color: '#e5e7eb',
                      fontSize: '11px',
                      lineHeight: '1.5',
                      margin: 0,
                      backgroundColor: '#18181b',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #27272a',
                    }}
                  >
                    {auditResult.psychologyAssessment}
                  </p>
                </div>

                {/* 6. Actionable Recommendations */}
                <div
                  style={{
                    backgroundColor: '#111827',
                    border: '1px solid #1f2937',
                    borderRadius: '14px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      color: '#34d399',
                      fontSize: '11px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    🎯 {t.auditActionableTitle}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      backgroundColor: '#18181b',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #27272a',
                    }}
                  >
                    {auditResult.actionableRecommendations?.map((rec, idx) => (
                      <div key={idx} style={{ color: '#e5e7eb', fontSize: '11px', lineHeight: '1.4', display: 'flex', gap: '6px' }}>
                        <span style={{ color: '#34d399', fontWeight: '800' }}>•</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer branding */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid #1f2937',
                    paddingTop: '12px',
                    fontSize: '10px',
                    color: '#6b7280',
                    fontWeight: '600',
                  }}
                >
                  <span>TRADEOY.com • Institutional AI Trading Analysis</span>
                  <span style={{ color: '#9ca3af' }}>Prop-Firm & Portfolio Auditing Engine</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
