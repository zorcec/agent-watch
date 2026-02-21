import { useEffect, useRef, useCallback } from 'react';
import type { DiagramDocument } from '../../types/DiagramDocument';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type BridgeOptions = {
  onDocumentUpdated: (doc: DiagramDocument) => void;
  onSvgResult?: (svgContent: string) => void;
};

export type VSCodeBridge = {
  postMessage: (msg: unknown) => void;
};

let vscodeApi: ReturnType<typeof acquireVsCodeApi> | null = null;

function getVSCodeApi(): ReturnType<typeof acquireVsCodeApi> {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

export function useVSCodeBridge(options: BridgeOptions): VSCodeBridge {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg?.type) return;

      if (msg.type === 'DOCUMENT_UPDATED') {
        optionsRef.current.onDocumentUpdated(msg.doc);
      } else if (msg.type === 'OPEN_SVG_RESULT') {
        optionsRef.current.onSvgResult?.(msg.svgContent);
      }
    };

    window.addEventListener('message', handleMessage);
    getVSCodeApi().postMessage({ type: 'WEBVIEW_READY' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const postMessage = useCallback((msg: unknown) => {
    getVSCodeApi().postMessage(msg);
  }, []);

  return { postMessage };
}
