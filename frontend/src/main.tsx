import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import ScreenError from "./components/ScreenError.tsx";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ScreenError>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ScreenError>
  </StrictMode>
);
