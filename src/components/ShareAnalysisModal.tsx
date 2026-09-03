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
  Sparkles,
  TrendingUp,
  TrendingDown,
  PauseCircle,
  FileText,
  Target,
  ShieldAlert,
  Magnet,
  Compass,
  AlertOctagon,
  CheckCircle2,
  Zap,
  BookOpen,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { AnalysisResult, LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface ShareAnalysisModalProps {
  result: AnalysisResult;
  isOpen: boolean;
  onClose: () => void;
  language?: LanguageOption;
}

export const ShareAnalysisModal: React.FC<ShareAnalysisModalProps> = ({
  result,
  isOpen,
  onClose,
  language = 'cs',
}) => {
  const t = getTranslation(language as LanguageOption);
  const cardRef = useRef<HTMLDivElement>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedFullText, setCopiedFullText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [cardMode, setCardMode] = useState<'full' | 'compact'>('full');

  if (!isOpen) return null;

  const isLong = result.signal === 'LONG';
  const isShort = result.signal === 'SHORT';

  const signalText = isLong
    ? t.longBuySignal
    : isShort
    ? t.shortSellSignal
    : t.waitNoEntrySignal;

  // 1. Full Comprehensive Text Report for complete export/sharing
  const formattedFullText = `🏛️ *TRADEOY.com - ${t.institutionalAnalysis}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 *${result.symbol || 'CHART'}* | Timeframe: *${result.timeframe || 'Intraday'}*
🕒 ${new Date(result.timestamp).toLocaleDateString()} ${new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

🧭 *${t.recommendedDirection}:* ${signalText}
⚡ *${t.confidenceAI}:* ${result.confidenceScore}%
⚖️ *${t.riskRewardRatioLabel}:* ${result.overallRiskRewardRatio || '1:2.5'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 *1. EXEKUCE & HLADINY (MODELOVÉ POI):*
• *${t.recommendedEntry}:* ${result.entryZone?.recommended || (result.entryZone?.min && result.entryZone?.max ? `${result.entryZone.min} - ${result.entryZone.max}` : 'N/A')}
• *${t.stopLossLabel}:* ${result.stopLoss?.price ?? 'N/A'} (-${result.stopLoss?.distancePercent ?? 0}%) ${result.stopLoss?.reason ? `[${result.stopLoss.reason}]` : ''}
${(result.takeProfitTargets || [])
  .map((tp) => `• *TP${tp.target}:* ${tp.price} (R:R 1:${tp.riskRewardRatio}, ${tp.closePercentage}%) - ${tp.description}`)
  .join('\n')}

${result.drawOnLiquidity ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧲 *2. DRAW ON LIQUIDITY (MAGNET LIKVIDITY):*
• *Směr:* ${result.drawOnLiquidity.direction === 'UPSIDE_BSL' ? 'MAGNET NAHOŘE (Buy-Side Liquidity)' : result.drawOnLiquidity.direction === 'DOWNSIDE_SSL' ? 'MAGNET DOLE (Sell-Side Liquidity)' : 'RANGE / VYČKÁVÁNÍ'}
• *Cílová zóna:* ${result.drawOnLiquidity.targetZone}
• *Důvod:* ${result.drawOnLiquidity.reason}
${result.drawOnLiquidity.prohibitedOpposingTrade ? `⚠️ *Rizikový faktor (Anti-Trap):* ${result.drawOnLiquidity.prohibitedOpposingTrade}` : ''}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ *3. MODELOVÉ ŘÍZENÍ RIZIKA & INVALIDACE:*
• *Modelové riziko:* ${result.riskManagement?.suggestedPositionSizePercent ?? 1}% kapitálu (edukační kalkulace)
• *Podmínka invalidace:* ${result.riskManagement?.invalidationCondition ?? 'N/A'}
${result.riskManagement?.trailingStopStrategy ? `• *Trailing SL:* ${result.riskManagement.trailingStopStrategy}` : ''}
${result.riskManagement?.maxLeverage ? `• *Referenční páka:* ${result.riskManagement.maxLeverage}` : ''}

${result.methodologyConfluences && result.methodologyConfluences.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ *4. METODICKÉ KONFLUENCE:*
${result.methodologyConfluences.map((c) => `• *${c.methodology}* [${c.bias}]: ${c.keyObservation}`).join('\n')}` : ''}

${result.priceActionStructures && result.priceActionStructures.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 *5. STRUKTURY & SVÍČKY:*
${result.priceActionStructures.map((s) => `• *${s.structure}:* ${s.description}`).join('\n')}
${(result.candlestickPatterns || []).map((cp) => `• *${cp.pattern}* (${cp.signalType}) v zóně ${cp.location}: ${cp.significance}`).join('\n')}` : ''}

${result.economicCalendarWarning ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📰 *6. MAKRO KALENDÁŘ & VOLATILITA:*
• ${result.economicCalendarWarning.riskAdvice}
${(result.economicCalendarWarning.upcomingNewsEvents || []).map((n) => `  - ${n.title} (${n.currency}) ${n.date}: ${n.warningText}`).join('\n')}` : ''}

${result.mentorAdvice ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 *7. MENTORSKÝ VÝKLAD & PSYCHOLOGIE:*
${result.mentorAdvice}` : ''}

${result.tradeChecklist && result.tradeChecklist.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ *8. PŘEDOBCHODNÍ CHECKLIST:*
${result.tradeChecklist.map((ch) => `${ch.passed ? '✓' : '✗'} ${ch.rule} (${ch.comment})`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 *SHRNUTÍ ANALÝZY:*
${result.biasReasoning}

— ${t.generatedByApp} 🚀`;

  // 2. Compact quick summary text for instant chats
  const formattedCompactText = `📊 *TRADEOY.com - ${t.institutionalAnalysis}*
Symbol: *${result.symbol || 'GRAF'}* (${result.timeframe || 'Intraday'})
${t.recommendedDirection}: *${signalText}*
${t.confidenceAI}: *${result.confidenceScore}%* | ${t.riskRewardRatioLabel}: *${result.overallRiskRewardRatio || '1:2.5'}*

📍 *${t.recommendedEntry}:* ${result.entryZone?.recommended || (result.entryZone?.min ? `${result.entryZone.min} - ${result.entryZone.max}` : 'N/A')}
🛑 *${t.stopLossLabel}:* ${result.stopLoss?.price ?? 'N/A'} (-${result.stopLoss?.distancePercent ?? 0}%)
🎯 *Take Profit Targety:*
${(result.takeProfitTargets || [])
  .map((tp) => `   • TP${tp.target}: ${tp.price} ${tp.closePercentage ? `(${tp.closePercentage}%)` : ''}`)
  .join('\n')}

${result.drawOnLiquidity ? `🧲 *Draw on Liquidity:* ${result.drawOnLiquidity.targetZone} (${result.drawOnLiquidity.direction})\n` : ''}💡 *${t.fundamentalTechnicalReason}* ${result.biasReasoning}

— ${t.generatedByApp} 🚀`;

  // Copy Full Text
  const handleCopyFullText = async () => {
    try {
      await navigator.clipboard.writeText(formattedFullText);
      setCopiedFullText(true);
      setTimeout(() => setCopiedFullText(false), 2500);
    } catch (err) {
      console.error('Failed to copy full text:', err);
    }
  };

  // Copy Compact Text
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(formattedCompactText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Canvas options for html2canvas
  const getCanvasOptions = () => ({
    scale: 2,
    useCORS: true,
    backgroundColor: '#020617',
    logging: false,
    onclone: (clonedDoc: Document) => {
      const styleTags = clonedDoc.querySelectorAll('style, link');
      styleTags.forEach((tag) => tag.remove());
    },
  });

  // Download PNG Image Card
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setIsGeneratingImage(true);
    setShareError(null);
    try {
      const canvas = await html2canvas(cardRef.current, getCanvasOptions());
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `TRADEOY_${result.symbol || 'Chart'}_${result.signal}_${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
    } catch (err) {
      console.error('Failed to generate PNG image:', err);
      setShareError('Obrázek se nepodařilo vygenerovat. Zkuste zkopírovat textovou verzi.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Copy Image to Clipboard
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
      link.download = `TRADEOY_${result.symbol || 'Chart'}_${result.signal}_${new Date().toISOString().slice(0, 10)}.png`;
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

  // WhatsApp Direct Share
  const handleShareWhatsApp = (useFull: boolean = false) => {
    const textToShare = useFull ? formattedFullText : formattedCompactText;
    const url = `https://wa.me/?text=${encodeURIComponent(textToShare)}`;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('Unable to open window:', err);
    }
  };

  // Telegram Direct Share
  const handleShareTelegram = (useFull: boolean = false) => {
    const textToShare = useFull ? formattedFullText : formattedCompactText;
    const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(textToShare)}`;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('Unable to open window:', err);
    }
  };

  // Native Web Share
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `TRADEOY.com - ${result.symbol}`,
          text: formattedFullText,
        });
      } catch (err) {
        console.log('Share canceled or not supported:', err);
      }
    } else {
      handleCopyFullText();
    }
  };

  // PDF Export
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

      const fileName = `TRADEOY_${result.symbol || 'Analysis'}_${result.signal || 'SETUP'}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.warn('Direct PDF export failed, falling back to window.print():', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div id="share-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div id="share-modal-container" className="bg-[#121216] border border-white/[0.08] rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl relative my-6">
        {/* Header Modal Bar */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.08] bg-[#121216]/95 sticky top-0 z-20">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-xl">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t.shareModalTitle}</h3>
              <p className="text-xs text-[#86868b]">{t.shareModalSubtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#86868b] hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-h-[82vh] overflow-y-auto no-scrollbar">
          {shareError && (
            <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center justify-between">
              <span>{shareError}</span>
              <button onClick={() => setShareError(null)} className="text-red-400 hover:text-white font-bold ml-2">✕</button>
            </div>
          )}

          {/* Quick Platform Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => handleShareWhatsApp(true)}
              className="p-3 bg-emerald-950/30 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 rounded-2xl flex flex-col items-center justify-center space-y-1 transition text-xs font-semibold cursor-pointer shadow-sm group"
            >
              <Send className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>{t.shareWhatsApp}</span>
            </button>

            <button
              onClick={() => handleShareTelegram(true)}
              className="p-3 bg-cyan-950/30 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 rounded-2xl flex flex-col items-center justify-center space-y-1 transition text-xs font-semibold cursor-pointer shadow-sm group"
            >
              <Send className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>{t.shareTelegram}</span>
            </button>

            {typeof navigator !== 'undefined' && 'share' in navigator ? (
              <button
                onClick={handleNativeShare}
                className="p-3 bg-blue-950/30 hover:bg-blue-900/50 border border-blue-500/30 text-blue-300 rounded-2xl flex flex-col items-center justify-center space-y-1 transition text-xs font-semibold cursor-pointer shadow-sm group"
              >
                <Share2 className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                <span>{t.shareMessengerApp}</span>
              </button>
            ) : (
              <button
                onClick={handleCopyFullText}
                className="p-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white rounded-2xl flex flex-col items-center justify-center space-y-1 transition text-xs font-semibold cursor-pointer shadow-sm group"
              >
                {copiedFullText ? (
                  <>
                    <Check className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400">{t.textCopied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 text-[#86868b] group-hover:scale-110 transition-transform" />
                    <span>{t.copyFullReport}</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleDownloadImage}
              disabled={isGeneratingImage}
              className="p-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black rounded-2xl flex flex-col items-center justify-center space-y-1 transition text-xs font-extrabold cursor-pointer shadow-lg shadow-emerald-500/20 group"
            >
              <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
              <span>{t.downloadPngBtn}</span>
            </button>
          </div>

          {/* Export & Copy Modes Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-black/60 rounded-2xl border border-white/[0.08] text-xs">
            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopyFullText}
                className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-emerald-400 border border-emerald-500/30 rounded-xl flex items-center space-x-1.5 transition cursor-pointer active:scale-95 font-semibold"
              >
                {copiedFullText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFullText ? t.textCopied : t.copyFullReport}</span>
              </button>

              <button
                onClick={handleCopyText}
                className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-[#86868b] hover:text-white border border-white/[0.08] rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
              >
                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5" />}
                <span>{copiedText ? t.textCopied : t.copyTextBtn}</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopyImageToClipboard}
                disabled={isGeneratingImage}
                className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.08] rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
              >
                {copiedImage ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{copiedImage ? t.imageCopied : t.copyPngBtn}</span>
              </button>

              <button
                onClick={handleExportPdf}
                disabled={isGeneratingPdf || isGeneratingImage}
                className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.08] rounded-xl flex items-center space-x-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{isGeneratingPdf ? 'Generuji PDF...' : t.printPdfExport}</span>
              </button>
            </div>
          </div>

          {/* Card View Switcher */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white">{t.cardPreviewTitle}</span>
              <span className="text-[10px] text-emerald-400 font-mono">({cardMode === 'full' ? t.fullCard : t.compactCard})</span>
            </div>

            <div className="flex items-center bg-black/60 p-1 rounded-xl border border-white/[0.08] gap-1">
              <button
                onClick={() => setCardMode('full')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  cardMode === 'full' ? 'bg-white/20 text-white' : 'text-[#86868b] hover:text-white'
                }`}
              >
                {t.fullCard}
              </button>
              <button
                onClick={() => setCardMode('compact')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  cardMode === 'compact' ? 'bg-white/20 text-white' : 'text-[#86868b] hover:text-white'
                }`}
              >
                {t.compactCard}
              </button>
            </div>
          </div>

          {/* VISUAL IMAGE CARD PREVIEW */}
          <div className="overflow-x-auto no-scrollbar pb-2 flex justify-center bg-black/40 p-3 sm:p-5 rounded-3xl border border-white/[0.08]">
            <div
              ref={cardRef}
              style={{
                width: '560px',
                backgroundColor: '#0c0c0e',
                color: '#ffffff',
                border: '2px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '24px',
                padding: '24px',
                boxSizing: 'border-box',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                position: 'relative',
              }}
            >
              {/* 1. Brand Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingBottom: '12px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '900',
                      fontSize: '14px',
                      color: '#000000',
                      flexShrink: 0,
                    }}
                  >
                    TR
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#ffffff', fontWeight: '900', fontSize: '15px', letterSpacing: '0.3px' }}>
                        TRADEOY
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 6px',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          borderRadius: '4px',
                          fontWeight: '800',
                          textTransform: 'uppercase',
                        }}
                      >
                        PRO Mentor
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#86868b', marginTop: '1px' }}>
                      TRADE. ENJOY.
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: '900',
                      color: '#34d399',
                      fontFamily: 'monospace, monospace',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {result.symbol || 'CHART'} • {result.timeframe || 'Intraday'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#86868b', marginTop: '2px' }}>
                    {new Date(result.timestamp).toLocaleDateString()} {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              {/* 2. Signal Verdict Banner */}
              <div
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '14px 16px',
                  borderRadius: '16px',
                  border: isLong
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : isShort
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : '1px solid rgba(245, 158, 11, 0.4)',
                  backgroundColor: isLong
                    ? 'rgba(6, 78, 59, 0.35)'
                    : isShort
                    ? 'rgba(127, 29, 29, 0.35)'
                    : 'rgba(120, 53, 15, 0.35)',
                  color: isLong ? '#6ee7b7' : isShort ? '#fca5a5' : '#fcd34d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: '#000000',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isLong ? (
                      <TrendingUp style={{ width: '20px', height: '20px', color: '#34d399' }} />
                    ) : isShort ? (
                      <TrendingDown style={{ width: '20px', height: '20px', color: '#f87171' }} />
                    ) : (
                      <PauseCircle style={{ width: '20px', height: '20px', color: '#fbbf24' }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div
                      style={{
                        fontSize: '9px',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '0.8px',
                        opacity: 0.85,
                      }}
                    >
                      {t.recommendedDirection}
                    </div>
                    <div
                      style={{
                        fontSize: '16px',
                        fontWeight: '900',
                        letterSpacing: '-0.3px',
                        marginTop: '1px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {signalText}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: '0.8px',
                      opacity: 0.85,
                    }}
                  >
                    {t.confidenceAI}
                  </div>
                  <div
                    style={{
                      fontSize: '22px',
                      fontWeight: '900',
                      fontFamily: 'monospace, monospace',
                      color: '#ffffff',
                      lineHeight: '1.1',
                      marginTop: '1px',
                    }}
                  >
                    {result.confidenceScore}%
                  </div>
                </div>
              </div>

              {/* 3. Execution Levels Grid (Entry, SL, TP1, TP2, TP3) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                  {/* Entry */}
                  <div
                    style={{
                      flex: '1',
                      padding: '10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.45)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      borderRadius: '12px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ fontSize: '9px', color: '#60a5fa', fontWeight: '800', textTransform: 'uppercase' }}>
                      {t.recommendedEntry}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '900', fontFamily: 'monospace, monospace', color: '#ffffff', marginTop: '2px' }}>
                      {result.entryZone?.recommended || (result.entryZone?.min ? `${result.entryZone.min}` : 'N/A')}
                    </div>
                  </div>

                  {/* Stop Loss */}
                  <div
                    style={{
                      flex: '1',
                      padding: '10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.45)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: '12px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ fontSize: '9px', color: '#f87171', fontWeight: '800', textTransform: 'uppercase' }}>
                      {t.stopLossLabel} (-{result.stopLoss?.distancePercent ?? 0}%)
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '900', fontFamily: 'monospace, monospace', color: '#fca5a5', marginTop: '2px' }}>
                      {result.stopLoss?.price ?? 'N/A'}
                    </div>
                  </div>

                  {/* TP1 */}
                  <div
                    style={{
                      flex: '1',
                      padding: '10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.45)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      borderRadius: '12px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ fontSize: '9px', color: '#34d399', fontWeight: '800', textTransform: 'uppercase' }}>
                      TP 1 ({result.takeProfitTargets?.[0]?.closePercentage ?? 50}%)
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '900', fontFamily: 'monospace, monospace', color: '#6ee7b7', marginTop: '2px' }}>
                      {result.takeProfitTargets?.[0]?.price ?? 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Additional TP Targets if available */}
                {(result.takeProfitTargets || []).length > 1 && (
                  <div style={{ display: 'flex', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                    {(result.takeProfitTargets || []).slice(1, 3).map((tp) => (
                      <div
                        key={tp.target}
                        style={{
                          flex: '1',
                          padding: '8px 10px',
                          backgroundColor: 'rgba(0, 0, 0, 0.35)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span style={{ fontSize: '9px', color: '#34d399', fontWeight: '800' }}>
                          TP {tp.target} ({tp.closePercentage}%):
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '900', fontFamily: 'monospace, monospace', color: '#ffffff' }}>
                          {tp.price} (R:R 1:{tp.riskRewardRatio})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Draw on Liquidity & Anti-Trap Section (Full Mode) */}
              {cardMode === 'full' && result.drawOnLiquidity && (
                <div
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'rgba(6, 182, 212, 0.08)',
                    border: '1px solid rgba(6, 182, 212, 0.25)',
                    borderRadius: '12px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', fontWeight: '800' }}>
                    <span style={{ color: '#22d3ee' }}>🧲 DRAW ON LIQUIDITY:</span>
                    <span style={{ color: '#ffffff', fontFamily: 'monospace, monospace' }}>
                      {result.drawOnLiquidity.targetZone} ({result.drawOnLiquidity.direction})
                    </span>
                  </div>
                  {result.drawOnLiquidity.prohibitedOpposingTrade && (
                    <div style={{ fontSize: '9.5px', color: '#fca5a5', lineHeight: '1.4' }}>
                      <strong>⚠️ Anti-Trap:</strong> {result.drawOnLiquidity.prohibitedOpposingTrade}
                    </div>
                  )}
                </div>
              )}

              {/* 5. Strategy Confluences & Risk Rules (Full Mode) */}
              {cardMode === 'full' && result.methodologyConfluences && result.methodologyConfluences.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {result.methodologyConfluences.map((conf, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        fontSize: '9.5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span style={{ color: '#ffffff', fontWeight: '700' }}>{conf.methodology}:</span>
                      <span
                        style={{
                          color: conf.bias === 'BULLISH' ? '#34d399' : conf.bias === 'BEARISH' ? '#f87171' : '#fbbf24',
                          fontWeight: '800',
                        }}
                      >
                        {conf.bias}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 6. R:R & Technical Bias Summary */}
              <div
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: '#86868b',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    paddingBottom: '5px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <span>
                    {t.riskRewardRatioLabel}:{' '}
                    <strong style={{ color: '#ffffff', fontFamily: 'monospace, monospace' }}>
                      {result.overallRiskRewardRatio || '1:2.5'}
                    </strong>
                  </span>
                  <span>
                    {t.suggestedRiskLabel}{' '}
                    <strong style={{ color: '#34d399', fontFamily: 'monospace, monospace' }}>
                      {result.riskManagement?.suggestedPositionSizePercent ?? 1}% {t.accountCapital}
                    </strong>
                  </span>
                </div>
                <div style={{ color: '#d1d5db', fontSize: '10px', lineHeight: '1.45', margin: 0 }}>
                  <span style={{ color: '#34d399', fontWeight: '800' }}>{t.fundamentalTechnicalReason} </span>
                  {result.biasReasoning}
                </div>
              </div>

              {/* 7. Footer Stamp */}
              <div
                style={{
                  paddingTop: '6px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '9.5px',
                  color: '#86868b',
                  fontFamily: 'monospace, monospace',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles style={{ width: '12px', height: '12px', color: '#10b981' }} />
                  <span>TRADEOY AI Engine • Institutional Analysis</span>
                </div>
                <div>TRADEOY.com</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 bg-[#121216]/95 border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-xs text-[#86868b]">{t.shareTip}</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-bold rounded-2xl transition cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};

