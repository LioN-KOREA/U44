import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import U44App from './U44App.tsx'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from './hooks/useAuth.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <U44App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
