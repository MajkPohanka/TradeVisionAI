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
} from 'lucide-react';
import html2canvas from 'html2canvas';
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
  const [copiedImage, setCopiedImage] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const [shareError, setShareError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLong = result.signal === 'LONG';
  const isShort = result.signal === 'SHORT';

  const signalText = isLong
    ? t.longBuySignal
    : isShort
    ? t.shortSellSignal
    : t.waitNoEntrySignal;

  // Format text for WhatsApp / Telegram / Messenger text sharing
  const formattedText = `📊 *AIAUTOTRADER.com - ${t.institutionalAnalysis}*
Symbol: *${result.symbol || 'GRAF'}* (${result.timeframe || 'H1'})
${t.recommendedDirection}: *${signalText}*
${t.confidenceAI}: *${result.confidenceScore}%* | ${t.riskRewardRatioLabel}: *${result.overallRiskRewardRatio || '1:2.5'}*

📍 *${t.recommendedEntry}:* ${result.entryZone?.recommended || (result.entryZone?.min ? `${result.entryZone.min} - ${result.entryZone.max}` : 'N/A')}
🛑 *${t.stopLossLabel}:* ${result.stopLoss?.price ?? 'N/A'}
🎯 *Take Profit Targety:*
${(result.takeProfitTargets || [])
  .map((tp) => `   • TP${tp.target}: ${tp.price} ${tp.closePercentage ? `(${tp.closePercentage}%)` : ''}`)
  .join('\n')}

💡 *${t.fundamentalTechnicalReason}* ${result.biasReasoning}

— ${t.generatedByApp} 🚀`;

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

  // Canvas options for html2canvas - card uses pure inline CSS so removing style tags is completely safe
  const getCanvasOptions = () => ({
    scale: 2,
    useCORS: true,
    backgroundColor: '#020617',
    logging: false,
    onclone: (clonedDoc: Document) => {
      // Remove style & link tags so html2canvas doesn't attempt to parse Tailwind v4 CSS rules containing oklch/oklab
      const styleTags = clonedDoc.querySelectorAll('style, link');
      styleTags.forEach((tag) => tag.remove());
    },
  });

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
      link.download = `AIAUTOTRADER_${result.symbol || 'Chart'}_${result.signal}_${new Date().toISOString().slice(0, 10)}.png`;
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
      link.download = `AIAUTOTRADER_${result.symbol || 'Chart'}_${result.signal}_${new Date().toISOString().slice(0, 10)}.png`;
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
          title: `AIAUTOTRADER.com - ${result.symbol}`,
          text: formattedText,
        });
      } catch (err) {
        console.log('Share canceled or not supported:', err);
      }
    } else {
      handleCopyText();
    }
  };

  // 7. PDF Report Print
  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-8">
        {/* Header Modal Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t.shareModalTitle}</h3>
              <p className="text-xs text-slate-400">{t.shareModalSubtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar">
          {shareError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center justify-between">
              <span>{shareError}</span>
              <button onClick={() => setShareError(null)} className="text-red-400 hover:text-white font-bold ml-2">✕</button>
            </div>
          )}

          {/* Quick Platform Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={handleShareWhatsApp}
              className="p-3 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 rounded-xl flex flex-col items-center justify-center space-y-1 transition text-xs font-semibold cursor-pointer shadow-sm group"
            >
              <Send className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>{t.shareWhatsApp}</span>
            </button>

            <button
              onClick={handleShareTelegram}
              className="p-3 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 rounded-xl flex flex-col items-center justify-center space-y-1 transition text-xs font-semibold cursor-pointer shadow-sm group"
            >
              <Send className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>{t.shareTelegram}</span>
            </button>

            {typeof navigator !== 'undefined' && 'share' in navigator ? (
              <button
                onClick={handleNativeShare}
                className="p-3 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-500/40 text-blue-300 rounded-xl flex flex-col items-center justify-center space-y-1 transition text-xs font-semibold cursor-pointer shadow-sm group"
              >
                <Share2 className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                <span>{t.shareMessengerApp}</span>
              </button>
            ) : (
              <button
                onClick={handleCopyText}
                className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl flex flex-col items-center justify-center space-y-1 transition text-xs font-semibold cursor-pointer shadow-sm group"
              >
                {copiedText ? (
                  <>
                    <Check className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400">{t.textCopied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 text-slate-400 group-hover:scale-110 transition-transform" />
                    <span>{t.copyTextBtn}</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleDownloadImage}
              disabled={isGeneratingImage}
              className="p-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 rounded-xl flex flex-col items-center justify-center space-y-1 transition text-xs font-extrabold cursor-pointer shadow-lg shadow-emerald-500/20 group"
            >
              <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
              <span>{t.downloadPngBtn}</span>
            </button>
          </div>

          {/* Secondary Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={handleCopyImageToClipboard}
              disabled={isGeneratingImage}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
            >
              {copiedImage ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ImageIcon className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedImage ? t.imageCopied : t.copyPngBtn}</span>
            </button>

            <button
              onClick={handlePrintPdf}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>{t.printPdfExport}</span>
            </button>
          </div>

          {/* VISUAL IMAGE CARD PREVIEW (This target div gets converted to PNG) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{t.cardPreviewTitle}</span>
              <span className="text-[10px] text-emerald-400 font-mono">{t.highResCard}</span>
            </div>

            <div className="overflow-x-auto no-scrollbar pb-2 flex justify-center bg-slate-950/50 p-3 rounded-2xl border border-slate-800">
              <div
                ref={cardRef}
                style={{
                  width: '520px',
                  backgroundColor: '#020617',
                  color: '#ffffff',
                  border: '2px solid #1e293b',
                  borderRadius: '20px',
                  padding: '26px',
                  boxSizing: 'border-box',
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px',
                  position: 'relative',
                }}
              >
                {/* 1. Brand Header Banner */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #1e293b',
                    paddingBottom: '14px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '900',
                        fontSize: '15px',
                        color: '#020617',
                        flexShrink: 0,
                      }}
                    >
                      AA
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#ffffff', fontWeight: '900', fontSize: '15px', letterSpacing: '0.3px' }}>
                          AIAUTOTRADER.com
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '6px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                          }}
                        >
                          PRO Mentor
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        {t.institutionalAnalysis}
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
                      {result.symbol || 'CHART'} • {result.timeframe || 'H1'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {new Date(result.timestamp).toLocaleDateString()} {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {/* 2. Signal Badge Banner */}
                <div
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '18px 20px',
                    borderRadius: '16px',
                    border: isLong
                      ? '1px solid rgba(16, 185, 129, 0.5)'
                      : isShort
                      ? '1px solid rgba(239, 68, 68, 0.5)'
                      : '1px solid rgba(245, 158, 11, 0.5)',
                    backgroundColor: isLong
                      ? '#042f2e'
                      : isShort
                      ? '#450a0a'
                      : '#451a03',
                    color: isLong ? '#6ee7b7' : isShort ? '#fca5a5' : '#fcd34d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        backgroundColor: '#020617',
                        border: '1px solid #1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isLong ? (
                        <TrendingUp style={{ width: '22px', height: '22px', color: '#34d399' }} />
                      ) : isShort ? (
                        <TrendingDown style={{ width: '22px', height: '22px', color: '#f87171' }} />
                      ) : (
                        <PauseCircle style={{ width: '22px', height: '22px', color: '#fbbf24' }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div
                        style={{
                          fontSize: '10px',
                          fontWeight: '800',
                          textTransform: 'uppercase',
                          letterSpacing: '1px',
                          opacity: 0.85,
                        }}
                      >
                        {t.recommendedDirection}
                      </div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: '900',
                          letterSpacing: '-0.3px',
                          marginTop: '2px',
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
                        fontSize: '10px',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        opacity: 0.85,
                      }}
                    >
                      {t.confidenceAI}
                    </div>
                    <div
                      style={{
                        fontSize: '26px',
                        fontWeight: '900',
                        fontFamily: 'monospace, monospace',
                        color: '#ffffff',
                        lineHeight: '1.1',
                        marginTop: '2px',
                      }}
                    >
                      {result.confidenceScore}%
                    </div>
                  </div>
                </div>

                {/* 3. Key Price Levels Row */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '10px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      flex: '1',
                      padding: '12px 8px',
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      borderRadius: '12px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#60a5fa',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t.recommendedEntry}
                    </div>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: '900',
                        fontFamily: 'monospace, monospace',
                        color: '#ffffff',
                        marginTop: '4px',
                      }}
                    >
                      {result.entryZone?.recommended || (result.entryZone?.min ? `${result.entryZone.min}` : 'N/A')}
                    </div>
                  </div>

                  <div
                    style={{
                      flex: '1',
                      padding: '12px 8px',
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: '12px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#f87171',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t.stopLossLabel}
                    </div>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: '900',
                        fontFamily: 'monospace, monospace',
                        color: '#fca5a5',
                        marginTop: '4px',
                      }}
                    >
                      {result.stopLoss?.price ?? 'N/A'}
                    </div>
                  </div>

                  <div
                    style={{
                      flex: '1',
                      padding: '12px 8px',
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      borderRadius: '12px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#34d399',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t.takeProfit1Label}
                    </div>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: '900',
                        fontFamily: 'monospace, monospace',
                        color: '#6ee7b7',
                        marginTop: '4px',
                      }}
                    >
                      {result.takeProfitTargets?.[0]?.price ?? 'N/A'}
                    </div>
                  </div>
                </div>

                {/* 4. R:R and Bias Explanation */}
                <div
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: '#94a3b8',
                      borderBottom: '1px solid #1e293b',
                      paddingBottom: '8px',
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
                  <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: '1.5', margin: 0 }}>
                    <span style={{ color: '#34d399', fontWeight: '800' }}>{t.fundamentalTechnicalReason} </span>
                    {result.biasReasoning}
                  </div>
                </div>

                {/* 5. Footer Stamp */}
                <div
                  style={{
                    paddingTop: '8px',
                    borderTop: '1px solid #1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: '#64748b',
                    fontFamily: 'monospace, monospace',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles style={{ width: '13px', height: '13px', color: '#10b981' }} />
                    <span>AIAUTOTRADER.com AI Engine v3.6</span>
                  </div>
                  <div>AIAUTOTRADER.com</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">{t.shareTip}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
