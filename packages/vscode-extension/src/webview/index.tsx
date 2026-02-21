import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { App } from './App';
import '@xyflow/react/dist/style.css';
import './styles/canvas.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>,
  );
}
