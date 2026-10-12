import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";

import "./index.css";
import "./App.css";
import "./professional-ui.css";
import "./lifegrid-redesign.css";
import "./readable-ui.css";
import "./lifegrid-theme.css";

const rootElement =
  document.getElementById("root");

if (!rootElement) {
  throw new Error(
    "LIFEGRID root element was not found."
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);