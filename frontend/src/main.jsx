// Guard against sandboxed iframe premature null documentElement access during React mount
try {
  const origContentDocumentDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument');
  if (origContentDocumentDesc && origContentDocumentDesc.get) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
      get() {
        const doc = origContentDocumentDesc.get.call(this);
        if (doc && !doc.documentElement) {
          return null;
        }
        return doc;
      },
      configurable: true,
    });
  }
} catch (e) {
  console.warn('IFrame contentDocument guard error:', e);
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
