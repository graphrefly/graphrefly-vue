import { batch, type Ctx, depLatest, type Graph, graph, type Node } from "@graphrefly/ts";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AutoPanel } from "./auto-panel.js";
import { useNodeValue } from "./index.js";
import { useBoundaryManifest } from "./use-boundary-manifest.js";

function ManifestProbe({ graph }: { graph: Graph }) {
	const manifest = useBoundaryManifest(graph);
	const label = `${manifest.inputs.length}|${manifest.outputs.length}`;
	return <output data-testid="manifest">{label}</output>;
}

function ValueHistoryProbe<T>({
	node,
	seen,
	testId,
}: {
	node: Node<T>;
	seen: Array<T | undefined>;
	testId: string;
}) {
	const value = useNodeValue(node);
	seen.push(value);
	return <output data-testid={testId}>{String(value)}</output>;
}

describe("binding robustness under graph churn", () => {
	it("tears down topology subscriptions when the hook unmounts", () => {
		const g = graph({ name: "teardown" });
		g.state(0, { name: "amount" });
		const originalObserveTopology = g.observeTopology.bind(g);
		let activeSubscriptions = 0;

		g.observeTopology = ((path?: string) => {
			const stream = originalObserveTopology(path);
			return {
				subscribe(run: Parameters<typeof stream.subscribe>[0]) {
					activeSubscriptions++;
					const unsubscribe = stream.subscribe(run);
					return () => {
						activeSubscriptions--;
						unsubscribe();
					};
				},
			};
		}) as Graph["observeTopology"];

		const { unmount } = render(<ManifestProbe graph={g} />);
		expect(activeSubscriptions).toBe(1);

		unmount();
		expect(activeSubscriptions).toBe(0);

		act(() => {
			const amount = g.find("amount");
			g.derived([amount], (value) => Number(value) + 1, { name: "after-unmount" });
		});
		expect(activeSubscriptions).toBe(0);
	});

	it("keeps AutoPanel outputs consistent through a batched diamond update", () => {
		const g = graph({ name: "batch-diamond" });
		const amount = g.state(1, { name: "amount" });
		const fee = g.state(10, { name: "fee" });
		const doubled = g.derived([amount], (value) => value * 2, { name: "doubled" });
		const total = g.derived(
			[amount, doubled, fee],
			(value, doubledValue, feeValue) => value + doubledValue + feeValue,
			{
				name: "total",
			},
		);
		const seen: Array<number | undefined> = [];

		render(
			<>
				<AutoPanel graph={g} />
				<ValueHistoryProbe node={total} seen={seen} testId="total-history" />
			</>,
		);
		expect(screen.getByTestId("out:total").textContent).toBe("13");

		act(() => {
			batch(() => {
				amount.set(2);
				fee.set(100);
			});
		});

		expect(screen.getByTestId("out:total").textContent).toBe("106");
		expect(seen.filter((value) => value !== undefined)).toEqual(expect.arrayContaining([13, 106]));
		expect(new Set(seen.filter((value) => value !== undefined))).toEqual(new Set([13, 106]));
	});

	it("keeps a bound output live after rapid rewire churn and drains removed deps", () => {
		const g = graph({ name: "rewire" });
		const left = g.state(1, { name: "left" });
		const right = g.state(10, { name: "right" });
		const leftBody = (ctx: Ctx) => {
			ctx.down([["DATA", Number(depLatest(ctx, 0))]]);
		};
		const rightBody = (ctx: Ctx) => {
			ctx.down([["DATA", Number(depLatest(ctx, 0)) * 10]]);
		};
		const selected = g.node<number>([left], leftBody, { name: "selected" });

		render(<AutoPanel graph={g} />);
		expect(screen.getByTestId("out:selected").textContent).toBe("1");

		act(() => {
			for (let i = 0; i < 5; i++) {
				selected.replaceDeps([right], rightBody);
				selected.replaceDeps([left], leftBody);
			}
			selected.replaceDeps([right], rightBody);
		});
		expect(screen.getByTestId("out:selected").textContent).toBe("100");

		act(() => {
			left.set(2);
		});
		expect(screen.getByTestId("out:selected").textContent).toBe("100");

		act(() => {
			right.set(11);
		});
		expect(screen.getByTestId("out:selected").textContent).toBe("110");
	});

	it("survives a burst of input writes and renders the final graph value", () => {
		const g = graph({ name: "burst" });
		const amount = g.state(0, { name: "amount" });
		g.derived([amount], (value) => value * 2, { name: "doubled" });

		render(<AutoPanel graph={g} />);
		const input = screen.getByTestId("in:amount") as HTMLInputElement;

		act(() => {
			for (let i = 1; i <= 40; i++) {
				fireEvent.change(input, { target: { value: String(i) } });
			}
		});

		expect(screen.getByTestId("out:doubled").textContent).toBe("80");
	});
});
