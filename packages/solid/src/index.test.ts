import { graph } from "@graphrefly/ts";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createNodeInput } from "./index.js";

describe("@graphrefly/solid", () => {
	it("owns the Solid lifecycle and DATA write boundary", () => {
		createRoot((dispose) => {
			const state = graph().state(1);
			const [value, setValue] = createNodeInput(state);
			expect(value()).toBe(1);
			setValue(2);
			expect(value()).toBe(2);
			expect(() => (setValue as (value: undefined) => void)(undefined)).toThrow(/SENTINEL/);
			dispose();
		});
	});
});
