import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { db } from './data/local/db'
import { seedInitialData } from './data/local/seed'

if (typeof window !== 'undefined') {
  (window as any).__db = db;
  (window as any).__seed = () => seedInitialData(db);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
