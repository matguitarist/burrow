import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { installAuthFetch } from './auth.js'
import './index.css'

installAuthFetch()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
