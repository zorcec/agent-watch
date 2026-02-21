import { useState } from 'react';
import { CanvasPanel } from './components/CanvasPanel';
import { useVSCodeBridge } from './hooks/useVSCodeBridge';
import { useGraphState } from './hooks/useGraphState';
import type { DiagramDocument } from '../types/DiagramDocument';

export function App() {
  const [doc, setDoc] = useState<DiagramDocument | null>(null);

  const bridge = useVSCodeBridge({ onDocumentUpdated: setDoc });
  const graph = useGraphState(doc, bridge);

  if (!doc) {
    return (
      <div className="loading" data-testid="loading">
        Loading diagram...
      </div>
    );
  }

  return <CanvasPanel graph={graph} />;
}
