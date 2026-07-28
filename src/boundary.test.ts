import { graph } from "@graphrefly/ts";
import { boundaryManifest } from "@graphrefly/ts/inspection/boundary";
import { describe, expect, it } from "vitest";

describe("boundaryManifest", () => {
	it("classifies sources as inputs, sinks as outputs, and omits interior nodes", () => {
		const g = graph({ name: "m" });
		const amount = g.state(0, { name: "amount" }); // source -> input
		const taxed = g.derived([amount], () => 1, { name: "taxed" }); // interior
		g.derived([taxed], () => 1, { name: "total" }); // sink -> output

		const m = boundaryManifest(g);
		expect(m.inputs.map((n) => n.name)).toEqual(["amount"]);
		expect(m.outputs.map((n) => n.name)).toEqual(["total"]);
		expect(m.inputs[0].type).toBe("state");
		expect(m.inputs[0].role).toBe("input");
		expect(m.outputs[0].role).toBe("output");
	});

	it("exposes the live node handle so a widget can bind directly", () => {
		const g = graph({ name: "m2" });
		const amount = g.state(0, { name: "amount" });
		g.derived([amount], () => 1, { name: "out" });

		const m = boundaryManifest(g);
		expect(m.inputs[0].node).toBe(amount);
	});

	it("keeps a consumed source as an input (a gauge feeding the graph), not interior", () => {
		const g = graph({ name: "m3" });
		const amount = g.state(0, { name: "amount" }); // no deps but consumed by `out`
		g.derived([amount], () => 1, { name: "out" });

		const m = boundaryManifest(g);
		expect(m.inputs.map((n) => n.name)).toContain("amount");
		expect(m.outputs.map((n) => n.name)).toContain("out");
	});
});
