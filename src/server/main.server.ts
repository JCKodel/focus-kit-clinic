import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { clinicRoute } from "../features/clinic/route.server.ts";
import { healthRoute } from "../features/health/route.server.ts";
import { signInRoute } from "../features/signIn/route.server.ts";
import { openMigratedDatabase } from "./start.server.ts";

const port = Number(process.env.PORT ?? 3000);
const db = openMigratedDatabase();

const app = new Hono()
	.route("/api", healthRoute)
	.route("/api", clinicRoute(db))
	.route("/api", signInRoute(db));

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`Server listening on http://localhost:${info.port}`);
});
