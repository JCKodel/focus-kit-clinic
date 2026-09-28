import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Own ports and a throwaway database, so the tests never touch a running
// `npm run dev` or the local data.
const serverPort = "3100";
const clientPort = 5174;
const env = {
	PORT: serverPort,
	DATABASE_PATH: join(tmpdir(), "focus-kit-clinic-e2e", "clinic.sqlite"),
};

export default defineConfig({
	testDir: "src",
	testMatch: "**/*.e2e.ts",
	forbidOnly: true,
	use: { baseURL: `http://localhost:${clientPort}` },
	projects: [
		{
			name: "phone",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 390, height: 844 },
			},
		},
	],
	webServer: [
		{
			command: "node src/server/main.server.ts",
			url: `http://localhost:${serverPort}/api/health`,
			env,
			reuseExistingServer: false,
		},
		{
			command: `vite --port ${clientPort} --strictPort`,
			url: `http://localhost:${clientPort}`,
			env,
			reuseExistingServer: false,
		},
	],
});
