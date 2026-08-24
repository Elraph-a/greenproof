import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { App } from './App'
import { requestDurableStorage } from './lib/queue'
import { primeMlUrl } from './lib/ml'
import './index.css'


// Ask the browser not to evict the pending-upload queue under storage
// pressure. Fire and forget — refusal is not fatal.
void requestDurableStorage()

// Read the scoring service URL from app_config. Deliberately not awaited: a
// slow config read must never delay first paint, and until it lands the cached
// or build-time value is used.
void primeMlUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
