import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { OverlayApp } from "./components/Overlay";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root missing");

const overlay = window.location.hash.startsWith("#/overlay");
if (overlay) document.documentElement.classList.add("is-overlay");

createRoot(root).render(<StrictMode>{overlay ? <OverlayApp /> : <App />}</StrictMode>);
