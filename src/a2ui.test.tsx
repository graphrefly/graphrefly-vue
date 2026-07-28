import { graph, type Node } from "@graphrefly/ts";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	A2UI_VERSION,
	boundaryManifest,
	boundaryManifestToA2UICapabilityDataModel,
	boundaryManifestToA2UICapabilityDataModelUpdate,
	boundaryManifestToA2UIDataModel,
	boundaryManifestToA2UIDataModelUpdate,
	useA2UIBoundaryDataModelUpdate,
} from "./index.js";

describe("A2UI boundary data-model lowering", () => {
	it("lowers boundary values without confusing SENTINEL, null DATA, and non-JSON DATA", () => {
		const g = graph({ name: "a2ui-values" });
		g.state<null>(null, { name: "nullable" });
		g.state<unknown>(1n, { name: "big" });
		g.node<number | null>([], null, { name: "pending" });

		const model = boundaryManifestToA2UIDataModel(boundaryManifest(g));

		expect(model.inputs.nullable?.value).toEqual({ state: "data", value: null });
		expect(model.inputs.big?.value).toEqual({ state: "nonJson", kind: "bigint" });
		expect(model.outputs.pending?.value).toEqual({ state: "sentinel" });
	});

	it("builds a versioned A2UI updateDataModel message with a stable default path", () => {
		const g = graph({ name: "a2ui-message" });
		g.state(7, { name: "amount" });

		const msg = boundaryManifestToA2UIDataModelUpdate(boundaryManifest(g), {
			surfaceId: "surface-1",
		});

		expect(msg.version).toBe(A2UI_VERSION);
		expect(msg.updateDataModel.surfaceId).toBe("surface-1");
		expect(msg.updateDataModel.path).toBe("/graphrefly/boundary");
		expect(msg.updateDataModel.value.inputs.amount?.value).toEqual({ state: "data", value: 7 });
	});

	it("honors a caller-owned A2UI data-model path without changing boundary values", () => {
		const g = graph({ name: "a2ui-custom-path" });
		g.state("ready", { name: "status" });

		const msg = boundaryManifestToA2UIDataModelUpdate(boundaryManifest(g), {
			path: "/surfaces/main/data",
			surfaceId: "surface-path",
		});

		expect(msg).toMatchObject({
			version: A2UI_VERSION,
			updateDataModel: {
				path: "/surfaces/main/data",
				surfaceId: "surface-path",
			},
		});
		expect(Object.keys(msg)).toEqual(["version", "updateDataModel"]);
		expect(Object.keys(msg.updateDataModel)).toEqual(["path", "surfaceId", "value"]);
		expect(Object.keys(msg.updateDataModel.value)).toEqual(["inputs", "outputs"]);
		expect(Object.keys(msg.updateDataModel.value.inputs.status ?? {})).toEqual([
			"name",
			"nodeType",
			"role",
			"value",
		]);
		expect(msg.updateDataModel.value.inputs.status?.value).toEqual({
			state: "data",
			value: "ready",
		});
	});

	it("keeps A2UI boundary records sorted by stable boundary name", () => {
		const g = graph({ name: "a2ui-sorted" });
		const zeta = g.state(1, { name: "zeta" });
		const alpha = g.state(2, { name: "alpha" });
		g.derived([zeta], (value) => value + 1, { name: "zetaOut" });
		g.derived([alpha], (value) => value + 1, { name: "alphaOut" });

		const model = boundaryManifestToA2UIDataModel(boundaryManifest(g));

		expect(Object.keys(model.inputs)).toEqual(["alpha", "zeta"]);
		expect(Object.keys(model.outputs)).toEqual(["alphaOut", "zetaOut"]);
	});

	it("encodes JSON-compatible objects and rejects nested non-JSON values without protocol errors", () => {
		const g = graph({ name: "a2ui-json-shapes" });
		const plain = Object.assign(Object.create(null) as Record<string, unknown>, {
			ok: true,
			when: new Date("2026-06-16T12:00:00.000Z"),
			nested: [1, null, { label: "x" }],
		});
		const cyclic: Record<string, unknown> = { label: "cycle" };
		cyclic.self = cyclic;
		g.state(plain, { name: "plain" });
		g.state({ missing: undefined }, { name: "nestedUndefined" });
		g.state(Number.NaN, { name: "nan" });
		g.state(cyclic, { name: "cycle" });

		const model = boundaryManifestToA2UIDataModel(boundaryManifest(g));

		expect(model.inputs.plain?.value).toEqual({
			state: "data",
			value: {
				ok: true,
				when: "2026-06-16T12:00:00.000Z",
				nested: [1, null, { label: "x" }],
			},
		});
		expect(model.inputs.nestedUndefined?.value).toEqual({
			state: "nonJson",
			kind: "undefined",
		});
		expect(model.inputs.nan?.value).toEqual({ state: "nonJson", kind: "nonFiniteNumber" });
		expect(model.inputs.cycle?.value).toEqual({ state: "nonJson", kind: "cycle" });
	});

	it("lowers capability refs into a separate fixed-schema data model without changing value lowering", () => {
		const g = graph({ name: "a2ui-capabilities" });
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

		const manifest = boundaryManifest(g);
		const valueModel = boundaryManifestToA2UIDataModel(manifest);
		const capabilityModel = boundaryManifestToA2UICapabilityDataModel(manifest);

		expect(valueModel.inputs.token).toEqual({
			name: "token",
			nodeType: "state",
			role: "input",
			value: { state: "data", value: "" },
		});
		expect(Object.keys(valueModel.inputs.token ?? {})).not.toContain("capabilities");
		expect(capabilityModel.boundaries.token).toEqual({
			name: "token",
			role: "input",
			capabilities: [
				{
					ref: {
						id: "github-oauth",
						kind: "auth",
						required: true,
						sourceRefs: ["github"],
					},
				},
			],
		});
		expect(capabilityModel.boundaries.length).toEqual({
			name: "length",
			role: "output",
			capabilities: [
				{
					ref: {
						id: "repo-config",
						kind: "config",
						required: false,
					},
				},
			],
		});
	});

	it("omits boundaries without capability refs from the capability data model", () => {
		const g = graph({ name: "a2ui-capability-filter" });
		g.state("plain", { name: "plainInput" });
		g.state("secret", {
			name: "secretInput",
			meta: {
				boundaryCapabilities: [{ id: "secret-auth", kind: "auth", required: true }],
			},
		});

		const model = boundaryManifestToA2UICapabilityDataModel(boundaryManifest(g));

		expect(Object.keys(model.boundaries)).toEqual(["secretInput"]);
		expect(model.boundaries.secretInput?.capabilities).toEqual([
			{ ref: { id: "secret-auth", kind: "auth", required: true } },
		]);
	});

	it("copies lowered capability refs so callers cannot mutate boundaryManifest source refs", () => {
		const sourceRefs = ["github", "workspace"];
		const capability = { id: "repo-auth", kind: "auth" as const, required: true, sourceRefs };
		const g = graph({ name: "a2ui-capability-copy" });
		g.state("repo", {
			name: "repo",
			meta: {
				boundaryCapabilities: [capability],
			},
		});

		const model = boundaryManifestToA2UICapabilityDataModel(boundaryManifest(g));
		const lowered = model.boundaries.repo?.capabilities[0]?.ref;

		expect(lowered).toEqual(capability);
		expect(lowered).not.toBe(capability);
		expect(lowered?.sourceRefs).not.toBe(sourceRefs);
		(lowered?.sourceRefs as string[] | undefined)?.push("mutated");

		expect(capability.sourceRefs).toEqual(["github", "workspace"]);
	});

	it("lets trusted callers add only minimal capability status/admission facts to A2UI updates", () => {
		const g = graph({ name: "a2ui-capability-status" });
		g.state("draft", {
			name: "repo",
			meta: {
				boundaryCapabilities: [
					{ id: "repo-auth", kind: "auth", required: true, sourceRefs: ["repo"] },
					{ id: "repo-config", kind: "config", required: false },
				],
			},
		});

		const msg = boundaryManifestToA2UICapabilityDataModelUpdate(boundaryManifest(g), {
			resolver: ({ capability, entry }) => {
				expect(entry.name).toBe("repo");
				if (capability.id === "repo-auth") return { admission: "block", status: "unavailable" };
				return "ready";
			},
			surfaceId: "surface-capabilities",
		});

		expect(msg.version).toBe(A2UI_VERSION);
		expect(msg.updateDataModel.path).toBe("/graphrefly/boundary/capabilities");
		expect(msg.updateDataModel.surfaceId).toBe("surface-capabilities");
		expect(msg.updateDataModel.value.boundaries.repo?.capabilities).toEqual([
			{
				ref: {
					id: "repo-auth",
					kind: "auth",
					required: true,
					sourceRefs: ["repo"],
				},
				status: "unavailable",
				admission: "block",
			},
			{
				ref: {
					id: "repo-config",
					kind: "config",
					required: false,
				},
				status: "ready",
			},
		]);
		expect(JSON.stringify(msg)).not.toMatch(/provider|formSchema|oauthUrl|actionLabel/i);
	});

	it("drops product-shaped resolver extras from A2UI capability updates", () => {
		const g = graph({ name: "a2ui-capability-extra-drop" });
		g.state("repo", {
			name: "repo",
			meta: {
				boundaryCapabilities: [{ id: "repo-auth", kind: "auth", required: true }],
			},
		});

		const msg = boundaryManifestToA2UICapabilityDataModelUpdate(boundaryManifest(g), {
			resolver: () =>
				({
					admission: "allow",
					status: "ready",
					provider: "github",
					formSchema: { fields: ["token"] },
					oauthUrl: "https://example.invalid/oauth",
					actionLabel: "Connect",
				}) as never,
			surfaceId: "surface-capability-extra-drop",
		});

		expect(msg.updateDataModel.value.boundaries.repo?.capabilities).toEqual([
			{
				ref: { id: "repo-auth", kind: "auth", required: true },
				status: "ready",
				admission: "allow",
			},
		]);
		expect(JSON.stringify(msg)).not.toMatch(/provider|formSchema|oauthUrl|actionLabel/i);
	});

	it("honors a caller-owned A2UI capability path and preserves null resolver results", () => {
		const g = graph({ name: "a2ui-capability-custom-path" });
		g.state("repo", {
			name: "repo",
			meta: {
				boundaryCapabilities: [{ id: "repo-resource", kind: "resource", required: false }],
			},
		});

		const msg = boundaryManifestToA2UICapabilityDataModelUpdate(boundaryManifest(g), {
			path: "/surfaces/main/capabilities",
			resolver: () => null,
			surfaceId: "surface-capability-path",
		});

		expect(msg).toMatchObject({
			version: A2UI_VERSION,
			updateDataModel: {
				path: "/surfaces/main/capabilities",
				surfaceId: "surface-capability-path",
			},
		});
		expect(Object.keys(msg)).toEqual(["version", "updateDataModel"]);
		expect(Object.keys(msg.updateDataModel)).toEqual(["path", "surfaceId", "value"]);
		expect(Object.keys(msg.updateDataModel.value)).toEqual(["boundaries"]);
		expect(Object.keys(msg.updateDataModel.value.boundaries.repo ?? {})).toEqual([
			"capabilities",
			"name",
			"role",
		]);
		expect(msg.updateDataModel.value.boundaries.repo?.capabilities).toEqual([
			{ ref: { id: "repo-resource", kind: "resource", required: false } },
		]);
	});

	it("keeps a fixed-schema A2UI data-model update live as graph values change", async () => {
		const g = graph({ name: "a2ui-live" });
		const amount = g.state(1, { name: "amount" });
		g.derived([amount], (value) => value * 2, { name: "doubled" });

		function Probe() {
			const msg = useA2UIBoundaryDataModelUpdate(g, {
				path: "/data",
				surfaceId: "surface-live",
			});
			return <output data-testid="msg">{JSON.stringify(msg)}</output>;
		}

		render(<Probe />);

		await waitFor(() => {
			const msg = JSON.parse(screen.getByTestId("msg").textContent ?? "{}");
			expect(msg.updateDataModel.value.outputs.doubled.value).toEqual({
				state: "data",
				value: 2,
			});
		});

		act(() => {
			amount.set(3);
		});

		await waitFor(() => {
			const msg = JSON.parse(screen.getByTestId("msg").textContent ?? "{}");
			expect(msg.updateDataModel.path).toBe("/data");
			expect(msg.updateDataModel.value.inputs.amount.value).toEqual({
				state: "data",
				value: 3,
			});
			expect(msg.updateDataModel.value.outputs.doubled.value).toEqual({
				state: "data",
				value: 6,
			});
		});
	});

	it("resubscribes A2UI data-model updates when boundary topology changes", async () => {
		const g = graph({ name: "a2ui-live-topology" });
		const driver = g.state(1, { name: "driver" });
		const watched = g.state(1, { name: "watched" });
		const subscriptions = instrumentNodeSubscriptions([watched]);
		let lateOutput: Node<number> | undefined;

		function Probe() {
			const msg = useA2UIBoundaryDataModelUpdate(g, {
				surfaceId: "surface-topology",
			});
			return (
				<output data-testid="topology-msg">{JSON.stringify(msg.updateDataModel.value)}</output>
			);
		}

		const { unmount } = render(<Probe />);

		await waitFor(() => {
			const model = JSON.parse(screen.getByTestId("topology-msg").textContent ?? "{}");
			expect(Object.keys(model.inputs)).toEqual(["driver", "watched"]);
			expect(Object.keys(model.outputs)).toEqual([]);
		});
		expect(subscriptions.active).toBe(1);

		act(() => {
			lateOutput = g.derived([driver], (value) => value + 1, { name: "late" });
		});

		await waitFor(() => {
			const model = JSON.parse(screen.getByTestId("topology-msg").textContent ?? "{}");
			expect(model.outputs.late.value).toEqual({ state: "data", value: 2 });
		});
		expect(subscriptions.active).toBe(1);

		act(() => {
			driver.set(4);
		});

		await waitFor(() => {
			const model = JSON.parse(screen.getByTestId("topology-msg").textContent ?? "{}");
			expect(model.outputs.late.value).toEqual({ state: "data", value: 5 });
		});

		act(() => {
			g.derived([lateOutput as Node<number>], (value) => value * 2, { name: "consumer" });
		});

		await waitFor(() => {
			const model = JSON.parse(screen.getByTestId("topology-msg").textContent ?? "{}");
			expect(model.outputs.late).toBeUndefined();
			expect(model.outputs.consumer.value).toEqual({ state: "data", value: 10 });
		});
		expect(subscriptions.active).toBe(1);

		unmount();
		expect(subscriptions.active).toBe(0);
	});
});

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
