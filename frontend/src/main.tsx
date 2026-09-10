import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (!localStorage.getItem("web_user_id")) {
  localStorage.setItem(
    "web_user_id",
    `web-${crypto.randomUUID()}`
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
