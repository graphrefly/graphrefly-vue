import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^react$/,
				replacement: new URL("./node_modules/react/index.js", import.meta.url).pathname,
			},
			{
				find: /^react\/(.*)$/,
				replacement: new URL("./node_modules/react/$1", import.meta.url).pathname,
			},
		],
	},
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
