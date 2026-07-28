import { depLatest, type Graph, graph, type Node } from "@graphrefly/ts";
import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import {
	AutoPanel,
	type AutoPanelInputWidgetProps,
	type AutoPanelOutputWidgetProps,
	type AutoPanelWidgetCatalog,
} from "./auto-panel.js";
import { useBoundaryManifest, useNodeValue } from "./index.js";

const LARGE_BOUNDARY_SIZE = 128;

interface LargeBoundaryGraph {
	graph: Graph;
	inputs: Node<number>[];
	outputs: Node<number>[];
}

function largeBoundaryGraph(size = LARGE_BOUNDARY_SIZE): LargeBoundaryGraph {
	const g = graph({ name: "large-boundary" });
	const inputs = Array.from({ length: size }, (_, i) => g.state(i, { name: `input-${i}` }));
	const outputs = inputs.map((input, i) =>
		g.derived([input], (value) => value * 2, { name: `output-${i}` }),
	);
	return { graph: g, inputs, outputs };
}

function countMap() {
	return new Map<string, number>();
}

function increment(map: Map<string, number>, key: string) {
	map.set(key, (map.get(key) ?? 0) + 1);
}

function getCount(map: Map<string, number>, key: string): number {
	return map.get(key) ?? 0;
}

function sumCounts(map: Map<string, number>): number {
	return Array.from(map.values()).reduce((sum, count) => sum + count, 0);
}

function outputTestIds(size: number, extra: string[] = []): string[] {
	return [
		...Array.from({ length: size }, (_, i) => `out:output-${i}`),
		...extra.map((name) => `out:${name}`),
	].sort();
}

function renderedOutputTestIds(): string[] {
	return screen
		.getAllByTestId(/^out:/)
		.map((node) => node.getAttribute("data-testid") ?? "")
		.sort();
}

function makeCountingCatalog(counts: {
	inputMounts: Map<string, number>;
	inputRenders: Map<string, number>;
	inputUnmounts: Map<string, number>;
	outputMounts: Map<string, number>;
	outputRenders: Map<string, number>;
	outputUnmounts: Map<string, number>;
}): AutoPanelWidgetCatalog {
	function CountingInput({ entry, testId, value }: AutoPanelInputWidgetProps) {
		increment(counts.inputRenders, entry.name);
		useEffect(() => {
			increment(counts.inputMounts, entry.name);
			return () => increment(counts.inputUnmounts, entry.name);
		}, [entry.name]);
		return <input data-testid={testId} readOnly type="text" value={String(value ?? "")} />;
	}

	function CountingOutput({ entry, testId, text }: AutoPanelOutputWidgetProps) {
		increment(counts.outputRenders, entry.name);
		useEffect(() => {
			increment(counts.outputMounts, entry.name);
			return () => increment(counts.outputUnmounts, entry.name);
		}, [entry.name]);
		return <output data-testid={testId}>{text}</output>;
	}

	return {
		inputs: { number: CountingInput },
		outputs: { text: CountingOutput },
	};
}

function instrumentTopology(graph: Graph) {
	const originalObserveTopology = graph.observeTopology.bind(graph);
	let active = 0;
	let events = 0;
	let total = 0;

	graph.observeTopology = ((path?: string) => {
		const stream = originalObserveTopology(path);
		return {
			subscribe(run: Parameters<typeof stream.subscribe>[0]) {
				active++;
				total++;
				const unsubscribe = stream.subscribe((event) => {
					events++;
					run(event);
				});
				let closed = false;
				return () => {
					if (closed) return;
					closed = true;
					active--;
					unsubscribe();
				};
			},
		};
	}) as Graph["observeTopology"];

	return {
		get active() {
			return active;
		},
		get events() {
			return events;
		},
		get total() {
			return total;
		},
	};
}

function instrumentNodeSubscriptions(nodes: readonly Node<unknown>[]) {
	let active = 0;
	let total = 0;

	for (const node of nodes) {
		const originalSubscribe = node.subscribe.bind(node);
		node.subscribe = ((sink: Parameters<Node<unknown>["subscribe"]>[0]) => {
			active++;
			total++;
			const unsubscribe = originalSubscribe(sink);
			let closed = false;
			return () => {
				if (closed) return;
				closed = true;
				active--;
				unsubscribe();
			};
		}) as Node<unknown>["subscribe"];
	}

	return {
		get active() {
			return active;
		},
		get total() {
			return total;
		},
	};
}

function instrumentDescribe(graph: Graph) {
	const originalDescribe = graph.describe.bind(graph);
	let calls = 0;

	graph.describe = ((...args: Parameters<Graph["describe"]>) => {
		calls++;
		return originalDescribe(...args);
	}) as Graph["describe"];

	return {
		get calls() {
			return calls;
		},
		reset() {
			calls = 0;
		},
	};
}

function ManifestProbe({ graph }: { graph: Graph }) {
	const manifest = useBoundaryManifest(graph);
	return (
		<output data-testid="manifest">
			{manifest.inputs.length}|{manifest.outputs.length}
		</output>
	);
}

function ValueProbe({ node }: { node: Node<number> }) {
	const value = useNodeValue(node);
	return <output data-testid="value">{String(value)}</output>;
}

describe("binding perf budget — large manifests and subscription churn", () => {
	it("keeps large AutoPanel value updates scoped to affected rows", () => {
		const fixture = largeBoundaryGraph();
		const topology = instrumentTopology(fixture.graph);
		const subscriptions = instrumentNodeSubscriptions([...fixture.inputs, ...fixture.outputs]);
		const describeCalls = instrumentDescribe(fixture.graph);
		const counts = {
			inputMounts: countMap(),
			inputRenders: countMap(),
			inputUnmounts: countMap(),
			outputMounts: countMap(),
			outputRenders: countMap(),
			outputUnmounts: countMap(),
		};
		const widgetCatalog = makeCountingCatalog(counts);

		const { unmount } = render(<AutoPanel graph={fixture.graph} widgetCatalog={widgetCatalog} />);

		expect(topology.active).toBe(1);
		expect(subscriptions.active).toBe(LARGE_BOUNDARY_SIZE * 3);
		expect(screen.getAllByTestId(/^in:/)).toHaveLength(LARGE_BOUNDARY_SIZE);
		expect(screen.getAllByTestId(/^out:/)).toHaveLength(LARGE_BOUNDARY_SIZE);
		expect(getCount(counts.inputMounts, "input-7")).toBe(1);
		expect(getCount(counts.outputMounts, "output-7")).toBe(1);

		describeCalls.reset();
		const subscriptionsBefore = subscriptions.active;
		const topologyEventsBefore = topology.events;
		act(() => {
			(fixture.inputs[7] as { set(value: number): void }).set(200);
		});

		expect(screen.getByTestId("out:output-7").textContent).toBe("400");
		expect(topology.active).toBe(1);
		expect(topology.events).toBe(topologyEventsBefore);
		expect(subscriptions.active).toBe(subscriptionsBefore);
		expect(describeCalls.calls).toBe(0);
		expect(sumCounts(counts.inputRenders)).toBe(LARGE_BOUNDARY_SIZE + 1);
		expect(sumCounts(counts.outputRenders)).toBe(LARGE_BOUNDARY_SIZE + 1);
		for (let i = 0; i < LARGE_BOUNDARY_SIZE; i++) {
			const expected = i === 7 ? 2 : 1;
			expect(getCount(counts.inputRenders, `input-${i}`)).toBe(expected);
			expect(getCount(counts.outputRenders, `output-${i}`)).toBe(expected);
			expect(getCount(counts.inputMounts, `input-${i}`)).toBe(1);
			expect(getCount(counts.outputMounts, `output-${i}`)).toBe(1);
			expect(getCount(counts.inputUnmounts, `input-${i}`)).toBe(0);
			expect(getCount(counts.outputUnmounts, `output-${i}`)).toBe(0);
		}

		unmount();
		expect(topology.active).toBe(0);
		expect(subscriptions.active).toBe(0);
	});

	it("cleans useNodeValue, useBoundaryManifest, and AutoPanel subscriptions across remounts", () => {
		const g = graph({ name: "remount-cleanup" });
		const source = g.state(1, { name: "source" });
		const output = g.derived([source], (value) => value + 1, { name: "output" });
		const topology = instrumentTopology(g);
		const subscriptions = instrumentNodeSubscriptions([source, output]);

		for (let i = 0; i < 6; i++) {
			const rendered = render(
				<>
					<ManifestProbe graph={g} />
					<AutoPanel graph={g} />
					<ValueProbe node={output} />
				</>,
			);

			expect(topology.active).toBe(2);
			expect(subscriptions.active).toBe(4);
			rendered.unmount();
			expect(topology.active).toBe(0);
			expect(subscriptions.active).toBe(0);
		}

		expect(topology.total).toBe(12);
		expect(subscriptions.total).toBe(24);
	});

	it("does not leak subscriptions or stale rows during rapid rewire in a large panel", () => {
		const fixture = largeBoundaryGraph(48);
		const selector = fixture.graph.node<number>(
			[fixture.inputs[0]],
			(ctx) => ctx.down([["DATA", depLatest(ctx, 0)]]),
			{ name: "selected" },
		);
		const topology = instrumentTopology(fixture.graph);
		const subscriptions = instrumentNodeSubscriptions([
			...fixture.inputs,
			...fixture.outputs,
			selector,
		]);

		const { unmount } = render(<AutoPanel graph={fixture.graph} />);
		expect(topology.active).toBe(1);
		expect(renderedOutputTestIds()).toEqual(outputTestIds(48, ["selected"]));

		act(() => {
			for (let i = 1; i <= 24; i++) {
				const dep = fixture.inputs[i % fixture.inputs.length];
				selector.replaceDeps([dep], (ctx) => ctx.down([["DATA", depLatest(ctx, 0)]]));
			}
		});

		expect(topology.active).toBe(1);
		expect(subscriptions.active).toBe(48 * 3 + 2);
		expect(screen.getAllByTestId(/^in:/)).toHaveLength(48);
		expect(renderedOutputTestIds()).toEqual(outputTestIds(48, ["selected"]));

		act(() => {
			(fixture.inputs[24] as { set(value: number): void }).set(300);
		});
		expect(screen.getByTestId("out:selected").textContent).toBe("300");
		expect(topology.active).toBe(1);
		expect(subscriptions.active).toBe(48 * 3 + 2);

		unmount();
		expect(topology.active).toBe(0);
		expect(subscriptions.active).toBe(0);
	});

	it("refreshes manifest topology only after graph topology events", () => {
		const g = graph({ name: "manifest-budget" });
		const source = g.state(1, { name: "source" });
		const topology = instrumentTopology(g);
		const describeCalls = instrumentDescribe(g);

		const { unmount } = render(<ManifestProbe graph={g} />);
		expect(screen.getByTestId("manifest").textContent).toBe("1|0");
		expect(topology.active).toBe(1);

		describeCalls.reset();
		act(() => {
			source.set(2);
		});
		expect(screen.getByTestId("manifest").textContent).toBe("1|0");
		expect(topology.events).toBe(0);
		expect(describeCalls.calls).toBe(0);

		act(() => {
			g.derived([source], (value) => value + 1, { name: "next" });
		});
		expect(screen.getByTestId("manifest").textContent).toBe("1|1");
		expect(topology.events).toBe(1);
		expect(describeCalls.calls).toBeGreaterThan(0);
		expect(describeCalls.calls).toBeLessThanOrEqual(5);

		unmount();
		expect(topology.active).toBe(0);
	});
});
