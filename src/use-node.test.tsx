import { graph, type Node } from "@graphrefly/ts";
import type { WritableNode } from "@graphrefly/ts/adapters";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNodeInput, useNodeRecord, useNodeValue } from "./use-node.js";

// A real graph (no mocks): an input `state` node feeding a `derived` output.
// This is the minimal "boundary input -> reduce -> boundary output" the
// presentation layer binds widgets to.
function makeDoublerGraph() {
	const g = graph({ name: "spike" });
	const amount = g.state<number>(0, { name: "amount" });
	const doubled = g.derived([amount], (value) => value * 2, { name: "doubled" });
	return { amount, doubled };
}

function Doubler({ amount, doubled }: { amount: WritableNode<number>; doubled: Node<number> }) {
	const [value, setValue] = useNodeInput<number>(amount);
	const out = useNodeValue<number>(doubled);
	return (
		<div>
			<output data-testid="out">{out ?? "—"}</output>
			<button type="button" onClick={() => setValue((value ?? 0) + 21)}>
				+21
			</button>
		</div>
	);
}

describe("two-way node ⇄ widget binding", () => {
	it("output widget reflects the derived node's initial value (push-on-subscribe)", () => {
		const { amount, doubled } = makeDoublerGraph();
		render(<Doubler amount={amount} doubled={doubled} />);
		expect(screen.getByTestId("out").textContent).toBe("0"); // 0 * 2
	});

	it("input-widget write propagates reactively to the output widget", () => {
		const { amount, doubled } = makeDoublerGraph();
		render(<Doubler amount={amount} doubled={doubled} />);
		act(() => {
			screen.getByRole("button").click(); // setValue(0 + 21)
		});
		expect(screen.getByTestId("out").textContent).toBe("42"); // 21 * 2
	});

	it("distinguishes SENTINEL (no value yet) from a real null DATA at the widget boundary", () => {
		const g = graph({ name: "sentinel" });
		const raw = g.node<number | null>([], null, { name: "raw" }); // no initial -> SENTINEL

		function Probe({ node }: { node: Node<number | null> }) {
			const v = useNodeValue<number | null>(node);
			const label = v === undefined ? "SENTINEL" : v === null ? "null-data" : String(v);
			return <output data-testid="probe">{label}</output>;
		}

		render(<Probe node={raw} />);
		expect(screen.getByTestId("probe").textContent).toBe("SENTINEL");

		act(() => {
			raw.down([["DATA", null]]); // emit a *valid* null DATA
		});
		expect(screen.getByTestId("probe").textContent).toBe("null-data");
	});

	it("subscribes to keyed node records with a stable factory identity", () => {
		const g = graph({ name: "record" });
		const keys = g.state<readonly string[]>(["a"]);
		const a = g.state(1);
		const b = g.state(2);
		const nodes: Record<string, typeof a> = { a, b };
		const factory = (key: string) => ({ value: nodes[key] });

		function Probe() {
			const record = useNodeRecord(keys, factory);
			return <output data-testid="record">{JSON.stringify(record)}</output>;
		}

		render(<Probe />);
		expect(screen.getByTestId("record").textContent).toBe('{"a":{"value":1}}');

		act(() => {
			keys.set(["a", "b"]);
		});
		expect(screen.getByTestId("record").textContent).toBe('{"a":{"value":1},"b":{"value":2}}');
	});
});
