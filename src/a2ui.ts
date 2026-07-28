import type { Graph, Node } from "@graphrefly/ts";
import { nodeSnapshot, subscribeNodeValues } from "@graphrefly/ts/adapters";
import {
	type BoundaryCapabilityRef,
	type BoundaryManifest,
	type BoundaryNode,
	boundaryManifest,
} from "@graphrefly/ts/inspection/boundary";
import { useMemo, useSyncExternalStore } from "react";

export const A2UI_VERSION = "v0.9.1" as const;

export type A2UIVersion = typeof A2UI_VERSION;
export type A2UIJsonValue =
	| null
	| boolean
	| number
	| string
	| A2UIJsonValue[]
	| { [key: string]: A2UIJsonValue };

export type A2UIBoundaryValue =
	| { state: "data"; value: A2UIJsonValue }
	| { state: "nonJson"; kind: string }
	| { state: "sentinel" };

export interface A2UIBoundaryDataModelEntry {
	name: string;
	nodeType: string;
	role: "input" | "output";
	value: A2UIBoundaryValue;
}

export interface A2UIBoundaryDataModel {
	inputs: Record<string, A2UIBoundaryDataModelEntry>;
	outputs: Record<string, A2UIBoundaryDataModelEntry>;
}

export type A2UICapabilityStatus = "pending" | "ready" | "unknown" | "unavailable";
export type A2UICapabilityAdmission = "allow" | "block";

export interface A2UIBoundaryCapability {
	ref: BoundaryCapabilityRef;
	status?: A2UICapabilityStatus;
	admission?: A2UICapabilityAdmission;
}

export interface A2UIBoundaryCapabilityDataModelEntry {
	capabilities: A2UIBoundaryCapability[];
	name: string;
	role: "input" | "output";
}

export interface A2UIBoundaryCapabilityDataModel {
	boundaries: Record<string, A2UIBoundaryCapabilityDataModelEntry>;
}

export interface A2UICapabilityResolverContext {
	capability: BoundaryCapabilityRef;
	entry: BoundaryNode;
}

export interface A2UICapabilityResolution {
	admission?: A2UICapabilityAdmission;
	status?: A2UICapabilityStatus;
}

export type A2UICapabilityResolver = (
	context: A2UICapabilityResolverContext,
) => A2UICapabilityResolution | A2UICapabilityStatus | null | undefined;

export interface A2UIUpdateDataModelMessage {
	version: A2UIVersion;
	updateDataModel: {
		path: string;
		surfaceId: string;
		value: A2UIBoundaryDataModel;
	};
}

export interface A2UIBoundaryDataModelOptions {
	path?: string;
	surfaceId: string;
}

export interface A2UIBoundaryCapabilityDataModelOptions {
	path?: string;
	resolver?: A2UICapabilityResolver;
	surfaceId: string;
}

export interface A2UIBoundaryCapabilityDataModelUpdateMessage {
	version: A2UIVersion;
	updateDataModel: {
		path: string;
		surfaceId: string;
		value: A2UIBoundaryCapabilityDataModel;
	};
}

const DEFAULT_A2UI_BOUNDARY_PATH = "/graphrefly/boundary";
const DEFAULT_A2UI_BOUNDARY_CAPABILITIES_PATH = "/graphrefly/boundary/capabilities";

export function boundaryManifestToA2UIDataModel(manifest: BoundaryManifest): A2UIBoundaryDataModel {
	return {
		inputs: entriesToRecord(manifest.inputs),
		outputs: entriesToRecord(manifest.outputs),
	};
}

export function boundaryManifestToA2UIDataModelUpdate(
	manifest: BoundaryManifest,
	options: A2UIBoundaryDataModelOptions,
): A2UIUpdateDataModelMessage {
	return {
		version: A2UI_VERSION,
		updateDataModel: {
			path: options.path ?? DEFAULT_A2UI_BOUNDARY_PATH,
			surfaceId: options.surfaceId,
			value: boundaryManifestToA2UIDataModel(manifest),
		},
	};
}

export function boundaryManifestToA2UICapabilityDataModel(
	manifest: BoundaryManifest,
	options: Pick<A2UIBoundaryCapabilityDataModelOptions, "resolver"> = {},
): A2UIBoundaryCapabilityDataModel {
	return {
		boundaries: capabilityEntriesToRecord(
			[...manifest.inputs, ...manifest.outputs],
			options.resolver,
		),
	};
}

export function boundaryManifestToA2UICapabilityDataModelUpdate(
	manifest: BoundaryManifest,
	options: A2UIBoundaryCapabilityDataModelOptions,
): A2UIBoundaryCapabilityDataModelUpdateMessage {
	return {
		version: A2UI_VERSION,
		updateDataModel: {
			path: options.path ?? DEFAULT_A2UI_BOUNDARY_CAPABILITIES_PATH,
			surfaceId: options.surfaceId,
			value: boundaryManifestToA2UICapabilityDataModel(manifest, {
				resolver: options.resolver,
			}),
		},
	};
}

export function useA2UIBoundaryDataModel(graph: Graph): A2UIBoundaryDataModel {
	const store = useMemo(() => boundaryDataModelStore(graph), [graph]);
	const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	return useMemo(() => JSON.parse(snapshot) as A2UIBoundaryDataModel, [snapshot]);
}

export function useA2UIBoundaryDataModelUpdate(
	graph: Graph,
	options: A2UIBoundaryDataModelOptions,
): A2UIUpdateDataModelMessage {
	const model = useA2UIBoundaryDataModel(graph);
	return useMemo(
		() => ({
			version: A2UI_VERSION,
			updateDataModel: {
				path: options.path ?? DEFAULT_A2UI_BOUNDARY_PATH,
				surfaceId: options.surfaceId,
				value: model,
			},
		}),
		[model, options.path, options.surfaceId],
	);
}

function boundaryDataModelStore(graph: Graph) {
	const listeners = new Set<() => void>();
	const nodeSubscriptions = new Map<Node<unknown>, () => void>();
	let unsubscribeTopology: (() => void) | undefined;
	const notify = () => {
		for (const listener of listeners) listener();
	};
	const start = () => {
		syncBoundaryNodeSubscriptions(graph, nodeSubscriptions, notify);
		unsubscribeTopology = graph.observeTopology().subscribe(() => {
			syncBoundaryNodeSubscriptions(graph, nodeSubscriptions, notify);
			notify();
		});
	};
	const stop = () => {
		unsubscribeTopology?.();
		unsubscribeTopology = undefined;
		for (const unsubscribe of nodeSubscriptions.values()) unsubscribe();
		nodeSubscriptions.clear();
	};
	return {
		getSnapshot: () => boundaryDataModelSnapshot(graph),
		subscribe(onStoreChange: () => void) {
			listeners.add(onStoreChange);
			if (listeners.size === 1) start();
			return () => {
				listeners.delete(onStoreChange);
				if (listeners.size === 0) stop();
			};
		},
	};
}

function boundaryDataModelSnapshot(graph: Graph): string {
	return JSON.stringify(boundaryManifestToA2UIDataModel(boundaryManifest(graph)));
}

function syncBoundaryNodeSubscriptions(
	graph: Graph,
	subscriptions: Map<Node<unknown>, () => void>,
	onStoreChange: () => void,
): void {
	const manifest = boundaryManifest(graph);
	const nextNodes = new Set<Node<unknown>>(
		[...manifest.inputs, ...manifest.outputs].map((entry) => entry.node),
	);
	for (const [node, unsubscribe] of subscriptions) {
		if (nextNodes.has(node)) continue;
		unsubscribe();
		subscriptions.delete(node);
	}
	for (const node of nextNodes) {
		if (subscriptions.has(node)) continue;
		subscriptions.set(node, subscribeNodeValues(node, onStoreChange, { changesOnly: true }));
	}
}

function entriesToRecord(
	entries: readonly BoundaryNode[],
): Record<string, A2UIBoundaryDataModelEntry> {
	const out: Record<string, A2UIBoundaryDataModelEntry> = {};
	for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
		out[entry.name] = {
			name: entry.name,
			nodeType: entry.type,
			role: entry.role,
			value: encodeBoundaryValue(nodeSnapshot(entry.node)),
		};
	}
	return out;
}

function capabilityEntriesToRecord(
	entries: readonly BoundaryNode[],
	resolver: A2UICapabilityResolver | undefined,
): Record<string, A2UIBoundaryCapabilityDataModelEntry> {
	const out: Record<string, A2UIBoundaryCapabilityDataModelEntry> = {};
	for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
		const capabilities = entry.capabilities?.map((capability) =>
			a2uiCapability(entry, capability, resolver),
		);
		if (capabilities === undefined || capabilities.length === 0) continue;
		out[entry.name] = {
			capabilities,
			name: entry.name,
			role: entry.role,
		};
	}
	return out;
}

function a2uiCapability(
	entry: BoundaryNode,
	capability: BoundaryCapabilityRef,
	resolver: A2UICapabilityResolver | undefined,
): A2UIBoundaryCapability {
	const resolved = resolver?.({ capability, entry });
	const ref = {
		id: capability.id,
		kind: capability.kind,
		required: capability.required,
		...(capability.sourceRefs === undefined ? {} : { sourceRefs: [...capability.sourceRefs] }),
	};
	if (
		resolved === "pending" ||
		resolved === "ready" ||
		resolved === "unknown" ||
		resolved === "unavailable"
	) {
		return { ref, status: resolved };
	}
	return {
		ref,
		...(resolved?.status === undefined ? {} : { status: resolved.status }),
		...(resolved?.admission === undefined ? {} : { admission: resolved.admission }),
	};
}

function encodeBoundaryValue(value: unknown): A2UIBoundaryValue {
	if (value === undefined) return { state: "sentinel" };
	const json = toJsonValue(value, new WeakSet());
	if (json.ok) return { state: "data", value: json.value };
	return { state: "nonJson", kind: json.kind };
}

type JsonResult = { ok: true; value: A2UIJsonValue } | { kind: string; ok: false };

function toJsonValue(value: unknown, seen: WeakSet<object>): JsonResult {
	if (value === null) return { ok: true, value: null };
	if (typeof value === "string" || typeof value === "boolean") return { ok: true, value };
	if (typeof value === "number") {
		return Number.isFinite(value) ? { ok: true, value } : { kind: "nonFiniteNumber", ok: false };
	}
	if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
		return { kind: typeof value, ok: false };
	}
	if (value === undefined) return { kind: "undefined", ok: false };
	if (value instanceof Date) return { ok: true, value: value.toISOString() };
	if (Array.isArray(value)) {
		if (seen.has(value)) return { kind: "cycle", ok: false };
		seen.add(value);
		const out: A2UIJsonValue[] = [];
		for (const item of value) {
			const encoded = toJsonValue(item, seen);
			if (!encoded.ok) return encoded;
			out.push(encoded.value);
		}
		seen.delete(value);
		return { ok: true, value: out };
	}
	if (!isPlainObject(value)) return { kind: objectKind(value), ok: false };
	if (seen.has(value)) return { kind: "cycle", ok: false };
	seen.add(value);
	const out: { [key: string]: A2UIJsonValue } = {};
	for (const [key, item] of Object.entries(value)) {
		const encoded = toJsonValue(item, seen);
		if (!encoded.ok) return encoded;
		out[key] = encoded.value;
	}
	seen.delete(value);
	return { ok: true, value: out };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function objectKind(value: object): string {
	return value.constructor?.name ?? "object";
}
