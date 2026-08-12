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

      const data = await res.json();

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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>{t.chatTitle}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h3>
              <p className="text-[10px] text-slate-400">
                {currentAnalysis ? `${t.mentorConsultationFor} ${currentAnalysis.symbol}` : t.generalTradingAcademy}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-2.5 bg-slate-950/50 border-b border-slate-800/80 flex items-center space-x-2 overflow-x-auto no-scrollbar text-[11px]">
          <button
            onClick={() => setInputText(t.quickQ1)}
            className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 hover:text-emerald-400 transition whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t.quickSlBreakeven}
          </button>
          <button
            onClick={() => setInputText(t.quickQ2)}
            className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 hover:text-emerald-400 transition whitespace-nowrap cursor-pointer active:scale-95"
          >
            {t.quickBiggestRisk}
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3.5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-emerald-500 text-slate-950 font-medium rounded-tr-none shadow-md'
                    : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none shadow-md'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex justify-start">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-2xl text-xs text-slate-400 flex items-center space-x-2">
                <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span>{t.mentorThinking}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-800">
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
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
