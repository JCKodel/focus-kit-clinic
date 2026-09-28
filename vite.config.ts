import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development Vite serves the client and forwards /api to the server on
// PORT, the same variable the server reads.
export default defineConfig({
	plugins: [react()],
	server: {
		proxy: { "/api": `http://localhost:${process.env.PORT ?? 3000}` },
	},
});
