import { graph } from "@graphrefly/ts";
import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import { nodeWritable } from "./index.js";

describe("@graphrefly/svelte", () => {
	it("owns the Svelte store and DATA write boundary", () => {
		const state = graph().state(1);
		const store = nodeWritable(state);
		expect(get(store)).toBe(1);
		store.set(2);
		expect(get(store)).toBe(2);
		expect(() => (store.set as (value: undefined) => void)(undefined)).toThrow(/SENTINEL/);
	});
});
