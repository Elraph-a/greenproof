import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { App } from './App'
import { requestDurableStorage } from './lib/queue'
import { primeMlUrl } from './lib/ml'
import { applyStoredPalette } from './lib/palette'
import './index.css'

// Before the first paint, not in an effect — otherwise the default palette
// renders for a frame and then swaps, and a flash of the colours you are
// comparing against is exactly what makes the comparison untrustworthy.
// Compiles away entirely outside `npm run dev`.
applyStoredPalette()

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
