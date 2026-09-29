// Must stay first: it installs the Ed25519 WebCrypto shim on WebViews that lack
// it, and nothing may touch `@solana/kit`'s signers before it has settled.
import './polyfills.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
