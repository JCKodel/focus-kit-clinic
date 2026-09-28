import { defineConfig, devices } from "@playwright/test";
import { e2eClinic, e2eDatabasePath } from "./src/server/e2eClinic.server.ts";

// Own ports and a throwaway database, so the tests never touch a running
// `npm run dev` or the local data.
const serverPort = "3100";
const clientPort = 5174;
const env = { PORT: serverPort, DATABASE_PATH: e2eDatabasePath };

// A fresh database, set up by the real setup command from piped answers.
const answers = [
	e2eClinic.name,
	e2eClinic.timeZone,
	e2eClinic.slotMinutes,
	e2eClinic.email,
	e2eClinic.password,
	e2eClinic.password,
]
	.map((answer) => `'${answer}'`)
	.join(" ");
const setUp = `rm -f '${e2eDatabasePath}' && printf '%s\\n' ${answers} | node src/server/setup.server.ts`;

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
		{
			// Owner screens are also used on a desktop (docs/05).
			name: "desktop",
			testMatch: ["**/OwnerView.e2e.ts", "**/ProfessionalsView.e2e.ts"],
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1280, height: 800 },
			},
		},
	],
	webServer: [
		{
			command: `${setUp} && node src/server/main.server.ts`,
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
