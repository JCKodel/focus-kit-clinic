import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClinicView } from "../features/clinic/ClinicView.tsx";
import { HealthView } from "../features/health/HealthView.tsx";
import { OwnerView } from "../features/signIn/OwnerView.tsx";

// Two screens, chosen by path: /owner for the owner, the home page for any
// other path. No router library.
function App() {
	if (location.pathname === "/owner") {
		return (
			<main>
				<OwnerView />
			</main>
		);
	}
	return (
		<main>
			<ClinicView />
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
