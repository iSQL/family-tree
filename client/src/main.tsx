import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import App from './App';
import './index.css';

// CSP zabranjuje eval — bez ovoga zod proverava `Function('')` i pregledač prijavljuje CSP grešku.
z.config({ jitless: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
