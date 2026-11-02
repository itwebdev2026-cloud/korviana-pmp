import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AssociatesPage from './AssociatesPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AssociatesPage />
  </StrictMode>,
)
