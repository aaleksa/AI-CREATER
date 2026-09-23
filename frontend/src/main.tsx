import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import ScreenError from "./components/ScreenError.tsx";
import { LocaleProvider } from "./i18n/locale";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <ScreenError>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ScreenError>
    </LocaleProvider>
  </StrictMode>
);
