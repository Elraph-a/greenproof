import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { App } from './App'
import { requestDurableStorage } from './lib/queue'
import { adoptMlUrlFromQuery } from './lib/ml'
import './index.css'

// Ask the browser not to evict the pending-upload queue under storage
// pressure. Fire and forget — refusal is not fatal.
void requestDurableStorage()

// Before render, so the first scoring request already uses it. Opening the app
// with ?ml=https://something.trycloudflare.com points this device at that
// service until it is cleared.
adoptMlUrlFromQuery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
