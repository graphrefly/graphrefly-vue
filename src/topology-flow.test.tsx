import { graph } from "@graphrefly/ts";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopologyFlowPanel } from "./topology-flow.js";

function sumGraph() {
	const g = graph({ name: "flow" });
	const left = g.state(1, { name: "left" });
	const right = g.state(2, { name: "right" });
	g.derived([left, right], (a, b) => a + b, { name: "sum" });
	return g;
}

describe("TopologyFlowPanel", () => {
	it("renders describe() nodes and edges as a live topology flow", () => {
		render(<TopologyFlowPanel graph={sumGraph()} />);

		expect(screen.getByTestId("topology-counts").textContent).toBe("3 nodes / 2 edges");
		expect(screen.getByTestId("topology-node:left").textContent).toContain("state");
		expect(screen.getByTestId("topology-node:right").textContent).toContain("state");
		expect(screen.getByTestId("topology-node:sum").textContent).toContain("derived");
		expect(screen.getByTestId("topology-edge:left->sum")).toBeTruthy();
		expect(screen.getByTestId("topology-edge:right->sum")).toBeTruthy();
	});

	it("refreshes when graph topology changes after mount", () => {
		const g = graph({ name: "live-flow" });
		const source = g.state(1, { name: "source" });

		render(<TopologyFlowPanel graph={g} />);
		expect(screen.getByTestId("topology-counts").textContent).toBe("1 nodes / 0 edges");
		expect(screen.queryByTestId("topology-node:next")).toBeNull();

		act(() => {
			g.derived([source], (value) => value + 1, { name: "next" });
		});

		expect(screen.getByTestId("topology-counts").textContent).toBe("2 nodes / 1 edges");
		expect(screen.getByTestId("topology-node:next").textContent).toContain("derived");
		expect(screen.getByTestId("topology-edge:source->next")).toBeTruthy();
	});

	it("flattens mounted subgraph topology by mount-aware path", () => {
		const parent = graph({ name: "parent" });
		const child = graph({ name: "debug-child-name" });
		const source = child.state(1, { name: "source" });
		child.derived([source], (value) => value + 1, { name: "next" });
		parent.mount(child, { at: "mounted" });

		render(<TopologyFlowPanel graph={parent} initialSelectedId="mounted::next" />);

		expect(screen.getByTestId("topology-counts").textContent).toBe("2 nodes / 1 edges");
		expect(screen.getByTestId("topology-node:mounted::source").textContent).toContain("state");
		expect(screen.getByTestId("topology-edge:mounted::source->mounted::next")).toBeTruthy();
		expect(screen.getByLabelText("topology details").textContent).toContain("subgraph: mounted");
	});

	it("selects a node and shows describe() details", () => {
		render(<TopologyFlowPanel graph={sumGraph()} />);

		act(() => {
			screen.getByTestId("topology-node:sum").click();
		});

		expect(screen.getByTestId("topology-selected").textContent).toBe("sum");
		expect(screen.getByLabelText("topology details").textContent).toContain("factory: derived");
		expect(screen.getByLabelText("topology details").textContent).toContain("deps: left, right");
	});

	it("projects topology without serializing cached DATA values", () => {
		const g = graph({ name: "non-json-data" });
		const cyclic: { self?: unknown } = {};
		cyclic.self = cyclic;
		g.state(cyclic, { name: "cyclic" });
		g.state(1n, { name: "bigint" });

		render(<TopologyFlowPanel graph={g} />);

		expect(screen.getByTestId("topology-counts").textContent).toBe("2 nodes / 0 edges");
		expect(screen.getByTestId("topology-node:cyclic").textContent).toContain("state");
		expect(screen.getByTestId("topology-node:bigint").textContent).toContain("state");
	});
});
