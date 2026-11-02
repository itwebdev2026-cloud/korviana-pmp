import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PurchasePage from './PurchasePage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PurchasePage />
  </StrictMode>,
)
