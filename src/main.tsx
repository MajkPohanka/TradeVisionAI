import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Guard against cross-origin iframe listener warnings in preview iframe environments
if (typeof window !== 'undefined') {
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (desc && desc.get) {
      const origGet = desc.get;
      let safeDummy: any = null;
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true,
        enumerable: true,
        get: function () {
          try {
            const win = origGet.call(this);
            if (win) return win;
          } catch {
            // fallback
          }
          if (!safeDummy && typeof Proxy !== 'undefined') {
            safeDummy = new Proxy(window, {
              get: (target: any, prop: string) => {
                if (prop === 'addEventListener' || prop === 'removeEventListener' || prop === 'postMessage') {
                  return () => {};
                }
                if (prop === 'document') return null;
                return target[prop];
              },
            });
          }
          return safeDummy || window;
        },
      });
    }
  } catch {
    // silent
  }

  const isIframeError = (msg: any) => {
    if (!msg) return false;
    const s = String(msg);
    return (
      s.includes('contentWindow is not available') ||
      s.includes('Cannot listen to the event from the provided iframe')
    );
  };

  const origError = console.error;
  console.error = function (...args: any[]) {
    if (args.some((a) => isIframeError(a))) return;
    origError.apply(console, args);
  };

  const origWarn = console.warn;
  console.warn = function (...args: any[]) {
    if (args.some((a) => isIframeError(a))) return;
    origWarn.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

