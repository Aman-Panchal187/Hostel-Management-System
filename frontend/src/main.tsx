import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/app/App';
import { createQueryClient, Providers } from '@/app/providers';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers client={createQueryClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Providers>
  </StrictMode>,
);
