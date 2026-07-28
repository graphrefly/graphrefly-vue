import { graph } from "@graphrefly/ts";
import { describe, expect, it } from "vitest";
import { effectScope } from "vue";
import { useNodeInput } from "./index.js";

describe("@graphrefly/vue", () => {
	it("owns the Vue lifecycle and DATA write boundary", () => {
		const state = graph().state(1);
		const scope = effectScope();
		const binding = scope.run(() => useNodeInput(state));
		expect(binding?.[0].value).toBe(1);
		binding?.[1](2);
		expect(binding?.[0].value).toBe(2);
		expect(() => (binding?.[1] as (value: undefined) => void)(undefined)).toThrow(/SENTINEL/);
		scope.stop();
	});
});
