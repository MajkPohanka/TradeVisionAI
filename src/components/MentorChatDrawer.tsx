import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot } from 'lucide-react';
import { AnalysisResult, LanguageOption, MentorChatMessage, StrategySettings } from '../types';
import { getTranslation } from '../utils/translations';

interface MentorChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentAnalysis: AnalysisResult | null;
  settings: StrategySettings;
  language?: LanguageOption;
}

export const MentorChatDrawer: React.FC<MentorChatDrawerProps> = ({
  isOpen,
  onClose,
  currentAnalysis,
  settings,
  language = 'cs',
}) => {
  const activeLang = language || settings.language || 'cs';
  const t = getTranslation(activeLang);

  const [messages, setMessages] = useState<MentorChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset initial welcome message according to language if empty or on lang change
    setMessages([
      {
        id: '1',
        sender: 'mentor',
        text: t.mentorWelcome,
        timestamp: Date.now(),
      },
    ]);
  }, [activeLang]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() || isSending) return;

    const userMsg: MentorChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = overrideText ? messages : [...messages, userMsg];
    if (!overrideText) {
      setMessages(updatedMessages);
      setInputText('');
    }
    setIsSending(true);

    try {
      const res = await fetch('/api/ask-mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsg.text,
          currentAnalysis: currentAnalysis,
          chatHistory: updatedMessages,
          settings: { ...settings, language: activeLang },
        }),
      });

      let data: any = {};
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch (e) {
        data = { success: false, error: 'Chyba při komunikaci s AI mentorem.' };
      }

      if (!res.ok || !data.success || !data.answer) {
        const errorDetail = data.error || data.details || t.errorOccurred;
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'mentor',
            text: `Error: ${errorDetail}`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      const botMsg: MentorChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'mentor',
        text: data.answer,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'mentor',
          text: `${t.errorOccurred}: ${err.message || ''}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md bg-[#0c0c0e]/95 backdrop-blur-3xl border-l border-white/[0.08] h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 bg-black/40 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{t.chatTitle}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h3>
              <p className="text-[11px] text-[#86868b]">
                {currentAnalysis ? `${t.mentorConsultationFor} ${currentAnalysis.symbol}` : t.generalTradingAcademy}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-[#86868b] hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-3 bg-black/20 border-b border-white/[0.06] flex items-center space-x-2 overflow-x-auto no-scrollbar text-xs">
          <button
            onClick={() => setInputText(t.quickQ1)}
            className="px-3 py-1.5 rounded-full bg-white/[0.06] text-[#86868b] hover:text-white hover:bg-white/[0.12] border border-white/[0.08] transition whitespace-nowrap cursor-pointer active:scale-95 text-xs font-semibold"
          >
            {t.quickSlBreakeven}
          </button>
          <button
            onClick={() => setInputText(t.quickQ2)}
            className="px-3 py-1.5 rounded-full bg-white/[0.06] text-[#86868b] hover:text-white hover:bg-white/[0.12] border border-white/[0.08] transition whitespace-nowrap cursor-pointer active:scale-95 text-xs font-semibold"
          >
            {t.quickBiggestRisk}
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-4 rounded-3xl text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-white text-black font-semibold rounded-br-xs shadow-md'
                    : 'bg-white/[0.06] border border-white/[0.08] text-[#f5f5f7] rounded-bl-xs shadow-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex justify-start">
              <div className="bg-white/[0.06] border border-white/[0.08] p-3.5 rounded-3xl text-xs text-[#86868b] flex items-center space-x-2.5">
                <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span>{t.mentorThinking}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-black/40 border-t border-white/[0.08]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={t.askMentorAnythingPlaceholder}
              className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-full px-4 py-2.5 text-xs text-white placeholder-[#86868b]/60 focus:outline-none focus:border-white/30 transition"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="p-2.5 rounded-full bg-white text-black hover:bg-[#f5f5f7] disabled:opacity-40 transition cursor-pointer shadow-sm active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
