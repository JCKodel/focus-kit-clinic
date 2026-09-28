import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HealthView } from "../features/health/HealthView.tsx";
import { strings } from "./strings.ts";

function App() {
	return (
		<main>
			<h1>{strings.title}</h1>
			<HealthView />
		</main>
	);
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}
