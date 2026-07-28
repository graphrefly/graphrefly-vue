import { graph } from "@graphrefly/ts";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	AutoPanel,
	type AutoPanelCapabilityResolver,
	type AutoPanelWidgetCatalog,
} from "./auto-panel.js";

// A graph with one source (input) -> interior reduce -> one sink (output).
function doublerGraph() {
	const g = graph({ name: "auto" });
	const amount = g.state<number>(0, { name: "amount" });
	g.derived([amount], (value) => value * 2, { name: "doubled" });
	return g;
}

describe("AutoPanel — a usable UI auto-grown from a graph", () => {
	it("renders an input widget per source and an output widget per sink, no hand-wiring", () => {
		render(<AutoPanel graph={doublerGraph()} />);
		expect(screen.getByTestId("in:amount")).toBeTruthy();
		expect(screen.getByTestId("out:doubled")).toBeTruthy();
		expect(screen.getByTestId("out:doubled").textContent).toBe("0"); // 0 * 2
	});

	it("typing into an auto-rendered input propagates reactively to the auto-rendered output", () => {
		render(<AutoPanel graph={doublerGraph()} />);
		const input = screen.getByTestId("in:amount") as HTMLInputElement;
		act(() => {
			fireEvent.change(input, { target: { value: "21" } });
		});
		expect(screen.getByTestId("out:doubled").textContent).toBe("42"); // 21 * 2
	});

	it("updates its manifest when the graph topology changes after mount", () => {
		const g = graph({ name: "dynamic" });
		const amount = g.state<number>(1, { name: "amount" });

		render(<AutoPanel graph={g} />);
		expect(screen.queryByTestId("out:incremented")).toBeNull();

		act(() => {
			g.derived([amount], (value) => value + 1, { name: "incremented" });
		});

		expect(screen.getByTestId("out:incremented").textContent).toBe("2");
	});

	it("uses caller-supplied boolean, number, and text widgets from a trusted catalog", () => {
		const g = graph({ name: "catalog-inputs" });
		const enabled = g.state(true, { name: "enabled" });
		const amount = g.state(2, { name: "amount" });
		const label = g.state("base", { name: "label" });
		g.derived([enabled], (value) => String(value), { name: "enabled-out" });
		g.derived([amount], (value) => value * 10, { name: "amount-out" });
		g.derived([label], (value) => `${value}!`, { name: "label-out" });
		const widgetCatalog: AutoPanelWidgetCatalog = {
			inputs: {
				boolean: ({ entry, set, value }) => (
					<button
						data-testid={`custom:${entry.name}`}
						type="button"
						onClick={() => set(value !== true)}
					>
						bool:{String(value)}
					</button>
				),
				number: ({ entry, set, value }) => (
					<button
						data-testid={`custom:${entry.name}`}
						type="button"
						onClick={() => set(Number(value) + 1)}
					>
						number:{String(value)}
					</button>
				),
				text: ({ entry, set, value }) => (
					<button
						data-testid={`custom:${entry.name}`}
						type="button"
						onClick={() => set(`${value}:custom`)}
					>
						text:{String(value)}
					</button>
				),
			},
		};

		render(<AutoPanel graph={g} widgetCatalog={widgetCatalog} />);

		expect(screen.getByTestId("custom:enabled").textContent).toBe("bool:true");
		expect(screen.getByTestId("custom:amount").textContent).toBe("number:2");
		expect(screen.getByTestId("custom:label").textContent).toBe("text:base");

		act(() => {
			screen.getByTestId("custom:amount").click();
			screen.getByTestId("custom:label").click();
			screen.getByTestId("custom:enabled").click();
		});

		expect(screen.getByTestId("out:amount-out").textContent).toBe("30");
		expect(screen.getByTestId("out:label-out").textContent).toBe("base:custom!");
		expect(screen.getByTestId("out:enabled-out").textContent).toBe("false");
	});

	it("falls back to default widgets when the resolver selects a missing catalog key", () => {
		render(
			<AutoPanel
				graph={doublerGraph()}
				widgetCatalog={{ inputs: {} }}
				widgetResolver={() => "missing-widget"}
			/>,
		);

		const input = screen.getByTestId("in:amount") as HTMLInputElement;
		expect(input.type).toBe("number");

		act(() => {
			fireEvent.change(input, { target: { value: "5" } });
		});
		expect(screen.getByTestId("out:doubled").textContent).toBe("10");
	});

	it("resolves SENTINEL and null outputs as distinct widget keys, not fallback text", () => {
		const g = graph({ name: "catalog-output-sentinel" });
		const maybe = g.node<null>([], null, { name: "maybe" });
		const widgetCatalog: AutoPanelWidgetCatalog = {
			outputs: {
				null: ({ entry, testId }) => <output data-testid={testId}>null:{entry.name}</output>,
				sentinel: ({ entry, testId }) => (
					<output data-testid={testId}>sentinel:{entry.name}</output>
				),
				text: ({ entry, testId }) => <output data-testid={testId}>text:{entry.name}</output>,
			},
		};

		render(<AutoPanel graph={g} widgetCatalog={widgetCatalog} />);
		expect(screen.getByTestId("out:maybe").textContent).toBe("sentinel:maybe");

		act(() => {
			maybe.down([["DATA", null]]);
		});
		expect(screen.getByTestId("out:maybe").textContent).toBe("null:maybe");
	});

	it("shows D348 generic capability refs near boundary rows without changing roles", () => {
		const g = graph({ name: "capability-display" });
		const token = g.state("", {
			name: "token",
			meta: {
				boundaryCapabilities: [
					{ id: "github-oauth", kind: "auth", required: true, sourceRefs: ["github"] },
				],
			},
		});
		g.derived([token], (value) => value.length, {
			name: "length",
			meta: {
				boundaryCapabilities: [{ id: "repo-config", kind: "config", required: false }],
			},
		});

		render(<AutoPanel graph={g} />);

		expect(screen.getByTestId("in:token")).toBeTruthy();
		expect(screen.getByTestId("out:length")).toBeTruthy();
		expect(screen.getByTestId("cap:token:auth:github-oauth").textContent).toBe(
			"auth:github-oauth (required): pending",
		);
		expect(screen.getByTestId("cap:length:config:repo-config").textContent).toBe(
			"config:repo-config (optional): pending",
		);
	});

	it("lets a trusted caller mark one required capability missing and disable only that input", () => {
		const g = graph({ name: "capability-admission" });
		const token = g.state("", {
			name: "token",
			meta: {
				boundaryCapabilities: [{ id: "github-oauth", kind: "auth", required: true }],
			},
		});
		const label = g.state("ok", { name: "label" });
		g.derived([token], (value) => value.length, { name: "token-length" });
		g.derived([label], (value) => `${value}!`, { name: "label-out" });
		const action = vi.fn();
		let tokenSet: ((next: unknown) => void) | undefined;
		let labelSet: ((next: unknown) => void) | undefined;
		const widgetCatalog: AutoPanelWidgetCatalog = {
			inputs: {
				text: ({ entry, set, testId }) => {
					if (entry.name === "token") tokenSet = set;
					if (entry.name === "label") labelSet = set;
					return <output data-testid={`${testId}:custom-capture`}>{entry.name}</output>;
				},
			},
		};
		const capabilityResolver: AutoPanelCapabilityResolver = ({ capability }) =>
			capability.id === "github-oauth"
				? { actionLabel: "Connect", label: "GitHub", onAction: action, status: "unavailable" }
				: "ready";

		render(
			<AutoPanel graph={g} capabilityResolver={capabilityResolver} widgetCatalog={widgetCatalog} />,
		);

		expect(screen.getByTestId("in:token:custom-capture").closest("fieldset")?.disabled).toBe(true);
		expect(screen.getByTestId("in:label:custom-capture").closest("fieldset")?.disabled).toBe(false);
		expect(screen.getByTestId("cap:token:auth:github-oauth").textContent).toBe(
			"GitHub (required): unavailable",
		);

		act(() => {
			tokenSet?.("leak");
			labelSet?.("leak");
			screen.getByTestId("cap:token:auth:github-oauth:action").click();
		});

		expect(action).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId("out:label-out").textContent).toBe("leak!");
		expect(screen.getByTestId("out:token-length").textContent).toBe("0");
	});

	it("keeps captured input setters blocked after a capability becomes unavailable", () => {
		const g = graph({ name: "capability-admission-flip" });
		const token = g.state("", {
			name: "token",
			meta: {
				boundaryCapabilities: [{ id: "github-oauth", kind: "auth", required: true }],
			},
		});
		g.derived([token], (value) => value.length, { name: "token-length" });
		let firstTokenSet: ((next: unknown) => void) | undefined;
		let unavailable = false;
		const widgetCatalog: AutoPanelWidgetCatalog = {
			inputs: {
				text: ({ set, testId }) => {
					firstTokenSet ??= set;
					return <output data-testid={`${testId}:custom-capture`}>token</output>;
				},
			},
		};
		const capabilityResolver: AutoPanelCapabilityResolver = () =>
			unavailable ? "unavailable" : "ready";

		const rendered = render(
			<AutoPanel graph={g} capabilityResolver={capabilityResolver} widgetCatalog={widgetCatalog} />,
		);
		expect(screen.getByTestId("in:token:custom-capture").closest("fieldset")?.disabled).toBe(false);

		unavailable = true;
		rendered.rerender(
			<AutoPanel graph={g} capabilityResolver={capabilityResolver} widgetCatalog={widgetCatalog} />,
		);
		expect(screen.getByTestId("in:token:custom-capture").closest("fieldset")?.disabled).toBe(true);

		act(() => {
			firstTokenSet?.("leak");
		});

		expect(screen.getByTestId("out:token-length").textContent).toBe("0");
	});

	it("does not block ordinary input writes for optional unavailable capabilities", () => {
		const g = graph({ name: "optional-capability" });
		const query = g.state("draft", {
			name: "query",
			meta: {
				boundaryCapabilities: [{ id: "search-index", kind: "resource", required: false }],
			},
		});
		g.derived([query], (value) => value.toUpperCase(), { name: "query-out" });

		render(<AutoPanel graph={g} capabilityResolver={() => "unavailable"} />);

		const input = screen.getByTestId("in:query") as HTMLInputElement;
		expect(input.disabled).toBe(false);

		act(() => {
			fireEvent.change(input, { target: { value: "live" } });
		});

		expect(screen.getByTestId("cap:query:resource:search-index").textContent).toBe(
			"resource:search-index (optional): unavailable",
		);
		expect(screen.getByTestId("out:query-out").textContent).toBe("LIVE");
	});

	it("uses caller render props without inventing OAuth, config-form, or provider metadata", () => {
		const g = graph({ name: "capability-renderer" });
		const repo = g.state("graphrefly", {
			name: "repo",
			meta: {
				boundaryCapabilities: [
					{ id: "repo-auth", kind: "auth", required: true, sourceRefs: ["repo"] },
				],
			},
		});
		g.derived([repo], (value) => value, { name: "repo-out" });

		render(
			<AutoPanel
				graph={g}
				capabilityRenderer={({ capability, testId }) => (
					<output data-testid={testId}>{Object.keys(capability).sort().join(",")}</output>
				)}
			/>,
		);

		expect(screen.getByTestId("cap:repo:auth:repo-auth").textContent).toBe(
			"id,kind,required,sourceRefs",
		);
		expect(screen.getByTestId("cap:repo:auth:repo-auth").textContent).not.toContain("provider");
		expect(screen.getByTestId("cap:repo:auth:repo-auth").textContent).not.toContain("formSchema");
	});

	it("disambiguates duplicate capability refs on the same boundary row", () => {
		const g = graph({ name: "duplicate-capabilities" });
		g.state("x", {
			name: "repo",
			meta: {
				boundaryCapabilities: [
					{ id: "repo-auth", kind: "auth", required: true, sourceRefs: ["a"] },
					{ id: "repo-auth", kind: "auth", required: true, sourceRefs: ["b"] },
				],
			},
		});

		render(<AutoPanel graph={g} />);

		expect(screen.getByTestId("cap:repo:auth:repo-auth").textContent).toBe(
			"auth:repo-auth (required): pending",
		);
		expect(screen.getByTestId("cap:repo:auth:repo-auth:1").textContent).toBe(
			"auth:repo-auth (required): pending",
		);
	});
});
