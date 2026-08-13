import React, { useState } from 'react';
import { X, Github, Server, Check, Copy, Code } from 'lucide-react';
import { LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface GitHubExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: LanguageOption;
}

export const GitHubExportModal: React.FC<GitHubExportModalProps> = ({
  isOpen,
  onClose,
  language = 'cs',
}) => {
  const t = getTranslation(language as LanguageOption);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const gitCommands = [
    '# 1. Initialize Git repository in project directory',
    'git init',
    'git add .',
    'git commit -m "Initial commit - AIAUTOTRADER.com App"',
    '',
    '# 2. Link your GitHub repository and push main branch',
    'git branch -M main',
    'git remote add origin https://github.com/YOUR-USERNAME/aiautotrader-com.git',
    'git push -u origin main',
  ].join('\n');

  const serverCommands = [
    '# Server build & start on your VPS / Linux server',
    'npm install',
    'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"',
    'npm run build',
    'npm start',
  ].join('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-slate-800 rounded-xl text-white border border-slate-700">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t.githubModalTitle}</h3>
              <p className="text-xs text-slate-400">{t.githubModalSubtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Step 1: GitHub Push */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Code className="w-4 h-4" />
                <span>{t.githubStep1}</span>
              </h4>

              <button
                onClick={() => copyToClipboard(gitCommands, 1)}
                className="text-[11px] font-semibold text-slate-300 hover:text-emerald-400 flex items-center space-x-1 cursor-pointer"
              >
                {copiedIndex === 1 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIndex === 1 ? t.textCopied : t.copyCommands}</span>
              </button>
            </div>

            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed">
              {gitCommands}
            </pre>
          </div>

          {/* Step 2: Deployment on Server */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                <Server className="w-4 h-4" />
                <span>{t.githubStep2}</span>
              </h4>

              <button
                onClick={() => copyToClipboard(serverCommands, 2)}
                className="text-[11px] font-semibold text-slate-300 hover:text-cyan-400 flex items-center space-x-1 cursor-pointer"
              >
                {copiedIndex === 2 ? <Check className="w-3.5 h-3.5 text-cyan-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIndex === 2 ? t.textCopied : t.copyCommands}</span>
              </button>
            </div>

            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed">
              {serverCommands}
            </pre>
          </div>

          {/* Export via Menu note */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1">
            <strong className="text-emerald-400 font-bold block">{t.zipExportNoteTitle}</strong>
            <p className="text-slate-400">{t.zipExportNoteDesc}</p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
          >
            {t.closeGuide}
          </button>
        </div>
      </div>
    </div>
  );
};
