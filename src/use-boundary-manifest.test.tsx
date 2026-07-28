import type { Graph } from "@graphrefly/ts";
import { graph } from "@graphrefly/ts";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boundaryManifest, useBoundaryManifest, useNodeInput } from "./index.js";

function ManifestProbe({ graph }: { graph: Graph }) {
	const manifest = useBoundaryManifest(graph);
	const label = `${manifest.inputs.map((entry) => entry.name).join(",")}|${manifest.outputs.map((entry) => entry.name).join(",")}`;

	return <output data-testid="manifest">{label}</output>;
}

describe("useBoundaryManifest hook", () => {
	it("recomputes the boundary manifest when graph topology changes", () => {
		const g = graph({ name: "manifest-hook" });
		g.state(0, { name: "source" });

		render(<ManifestProbe graph={g} />);
		expect(screen.getByTestId("manifest").textContent).toBe("source|");

		const source = g.find("source");
		act(() => {
			g.derived([source], (value) => value + 1, { name: "next" });
		});
		expect(screen.getByTestId("manifest").textContent).toBe("source|next");
	});

	it("recomputes when mounted child graph topology changes", () => {
		const parent = graph({ name: "parent" });
		const child = graph({ name: "child" });
		child.state(0, { name: "source" });
		parent.mount(child, { at: "child" });

		render(<ManifestProbe graph={parent} />);
		expect(screen.getByTestId("manifest").textContent).toBe("child::source|");

		const source = child.find("source");
		act(() => {
			child.derived([source], (value) => Number(value) + 1, { name: "next" });
		});
		expect(screen.getByTestId("manifest").textContent).toBe("child::source|child::next");
	});

	it("rejects undefined input writes as SENTINEL, not DATA", () => {
		const g = graph({ name: "sentinel-input" });
		const input = g.state<number | undefined>(1, { name: "input" });
		let write: ((value: number | undefined) => void) | undefined;

		function Probe() {
			const [, setValue] = useNodeInput(input);
			write = setValue;
			return <output data-testid="input">{String(input.cache)}</output>;
		}

		render(<Probe />);
		expect(() => write?.(undefined)).toThrow(/SENTINEL\/no DATA/);
		expect(input.cache).toBe(1);
	});

	it("exports through package entrypoint", () => {
		const g = graph({ name: "manifest-exports" });
		g.state(1, { name: "amount" });
		const manifest = boundaryManifest(g);

		expect(typeof useBoundaryManifest).toBe("function");
		expect(manifest.inputs.length).toBe(1);
	});
});
