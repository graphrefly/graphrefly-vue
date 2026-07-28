// ---------------------------------------------------------------------------
// AutoPanel (spike/reference UI) — slices 1 + 2 composed.
//
// Give it a graph and it grows a usable panel with ZERO hand-wiring:
//   boundaryManifest -> one input widget per writable source, one output per sink,
//   each bound to its live node via useNodeInput / useNodeValue.
//
// Widget choice is React-local presentation: callers may resolve each boundary
// entry to a trusted catalog key while @graphrefly/ts keeps owning generic
// boundary semantics.
// ---------------------------------------------------------------------------

import type { Graph } from "@graphrefly/ts";
import type {
	BoundaryCapabilityRef,
	BoundaryNode,
	InputBoundaryNode,
	OutputBoundaryNode,
} from "@graphrefly/ts/inspection/boundary";
import { type ComponentType, useCallback, useRef } from "react";
import { useBoundaryManifest } from "./use-boundary-manifest.js";
import { useNodeInput, useNodeValue } from "./use-node.js";

export type AutoPanelInputWidgetKey = "boolean" | "number" | "text";
export type AutoPanelOutputWidgetKey = "json" | "null" | "sentinel" | "text";
export type AutoPanelCapabilityStatus = "pending" | "ready" | "unavailable";

export type AutoPanelInputSetter = (next: unknown) => void;

export interface AutoPanelInputWidgetProps {
	disabled?: boolean;
	entry: InputBoundaryNode;
	kind: AutoPanelInputWidgetKey;
	set: AutoPanelInputSetter;
	testId: string;
	value: unknown;
}

export interface AutoPanelOutputWidgetProps {
	entry: OutputBoundaryNode;
	kind: AutoPanelOutputWidgetKey;
	testId: string;
	text: string;
	value: unknown;
}

export type AutoPanelInputWidget = ComponentType<AutoPanelInputWidgetProps>;
export type AutoPanelOutputWidget = ComponentType<AutoPanelOutputWidgetProps>;

export interface AutoPanelWidgetCatalog {
	inputs?: Record<string, AutoPanelInputWidget>;
	outputs?: Record<string, AutoPanelOutputWidget>;
}

export type AutoPanelWidgetResolverContext =
	| {
			defaultKey: AutoPanelInputWidgetKey;
			entry: InputBoundaryNode;
			role: "input";
			value: unknown;
	  }
	| {
			defaultKey: AutoPanelOutputWidgetKey;
			entry: OutputBoundaryNode;
			role: "output";
			value: unknown;
	  };

export type AutoPanelWidgetResolver = (
	context: AutoPanelWidgetResolverContext,
) => string | null | undefined;

export interface AutoPanelCapabilityResolverContext {
	capability: BoundaryCapabilityRef;
	entry: BoundaryNode;
}

export interface AutoPanelCapabilityResolution {
	actionLabel?: string;
	label?: string;
	onAction?: () => void;
	status: AutoPanelCapabilityStatus;
}

export type AutoPanelCapabilityResolver = (
	context: AutoPanelCapabilityResolverContext,
) => AutoPanelCapabilityResolution | AutoPanelCapabilityStatus | null | undefined;

export interface AutoPanelCapabilityViewProps extends AutoPanelCapabilityResolution {
	blocksInput: boolean;
	capability: BoundaryCapabilityRef;
	entry: BoundaryNode;
	testId: string;
}

export type AutoPanelCapabilityRenderer = ComponentType<AutoPanelCapabilityViewProps>;

function defaultInputKey(value: unknown): AutoPanelInputWidgetKey {
	if (typeof value === "boolean") {
		return "boolean";
	}
	if (typeof value === "number") {
		return "number";
	}
	return "text";
}

function defaultOutputKey(value: unknown): AutoPanelOutputWidgetKey {
	if (value === undefined) return "sentinel";
	if (value === null) return "null";
	if (typeof value === "object") return "json";
	return "text";
}

function formatOutputValue(value: unknown): string {
	if (value === undefined) return "—";
	if (value === null) return "null";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function DefaultBooleanInputWidget({
	disabled,
	entry,
	set,
	testId,
	value,
}: AutoPanelInputWidgetProps) {
	return (
		<label>
			{entry.name}
			<input
				data-testid={testId}
				disabled={disabled}
				type="checkbox"
				checked={value === true}
				onChange={(e) => set(e.target.checked)}
			/>
		</label>
	);
}

function DefaultNumberInputWidget({
	disabled,
	entry,
	set,
	testId,
	value,
}: AutoPanelInputWidgetProps) {
	const inputValue = typeof value === "number" ? value : "";
	return (
		<label>
			{entry.name}
			<input
				data-testid={testId}
				disabled={disabled}
				type="number"
				value={inputValue}
				onChange={(e) => {
					const n = Number(e.target.value);
					if (!Number.isNaN(n)) set(n);
				}}
			/>
		</label>
	);
}

function DefaultTextInputWidget({
	disabled,
	entry,
	set,
	testId,
	value,
}: AutoPanelInputWidgetProps) {
	return (
		<label>
			{entry.name}
			<input
				data-testid={testId}
				disabled={disabled}
				type="text"
				value={value == null ? "" : String(value)}
				onChange={(e) => set(e.target.value)}
			/>
		</label>
	);
}

function DefaultOutputWidget({ entry, testId, text }: AutoPanelOutputWidgetProps) {
	return (
		<div>
			{entry.name}: <output data-testid={testId}>{text}</output>
		</div>
	);
}

const defaultInputWidgets: Record<AutoPanelInputWidgetKey, AutoPanelInputWidget> = {
	boolean: DefaultBooleanInputWidget,
	number: DefaultNumberInputWidget,
	text: DefaultTextInputWidget,
};

const defaultOutputWidgets: Record<AutoPanelOutputWidgetKey, AutoPanelOutputWidget> = {
	json: DefaultOutputWidget,
	null: DefaultOutputWidget,
	sentinel: DefaultOutputWidget,
	text: DefaultOutputWidget,
};

function resolveInputWidget(
	catalog: AutoPanelWidgetCatalog | undefined,
	resolver: AutoPanelWidgetResolver | undefined,
	entry: InputBoundaryNode,
	value: unknown,
): { kind: AutoPanelInputWidgetKey; Widget: AutoPanelInputWidget } {
	const kind = defaultInputKey(value);
	const resolvedKey = resolver?.({ defaultKey: kind, entry, role: "input", value }) ?? kind;
	const Widget = catalog?.inputs?.[resolvedKey] ?? defaultInputWidgets[kind];
	return { kind, Widget };
}

function resolveOutputWidget(
	catalog: AutoPanelWidgetCatalog | undefined,
	resolver: AutoPanelWidgetResolver | undefined,
	entry: OutputBoundaryNode,
	value: unknown,
): { kind: AutoPanelOutputWidgetKey; Widget: AutoPanelOutputWidget } {
	const kind = defaultOutputKey(value);
	const resolvedKey = resolver?.({ defaultKey: kind, entry, role: "output", value }) ?? kind;
	const Widget = catalog?.outputs?.[resolvedKey] ?? defaultOutputWidgets[kind];
	return { kind, Widget };
}

function resolveCapability(
	capabilityResolver: AutoPanelCapabilityResolver | undefined,
	entry: BoundaryNode,
	capability: BoundaryCapabilityRef,
): AutoPanelCapabilityResolution {
	const resolved = capabilityResolver?.({ capability, entry });
	if (resolved === "pending" || resolved === "ready" || resolved === "unavailable") {
		return { status: resolved };
	}
	return {
		status: resolved?.status ?? "pending",
		...(resolved?.label === undefined ? {} : { label: resolved.label }),
		...(resolved?.actionLabel === undefined ? {} : { actionLabel: resolved.actionLabel }),
		...(resolved?.onAction === undefined ? {} : { onAction: resolved.onAction }),
	};
}

function capabilityTestId(entry: BoundaryNode, capability: BoundaryCapabilityRef, index: number) {
	const base = `cap:${entry.name}:${capability.kind}:${capability.id}`;
	return index === 0 ? base : `${base}:${index}`;
}

function capabilityLabel(capability: BoundaryCapabilityRef) {
	return `${capability.kind}:${capability.id}`;
}

function DefaultCapabilityView({
	actionLabel,
	capability,
	label,
	onAction,
	status,
	testId,
}: AutoPanelCapabilityViewProps) {
	return (
		<span data-capability-required={capability.required} data-capability-status={status}>
			<span data-testid={testId}>
				{label ?? capabilityLabel(capability)} ({capability.required ? "required" : "optional"}):{" "}
				{status}
			</span>
			{onAction === undefined ? null : (
				<button data-testid={`${testId}:action`} type="button" onClick={onAction}>
					{actionLabel ?? "Resolve"}
				</button>
			)}
		</span>
	);
}

function capabilityViews({
	capabilityRenderer,
	capabilityResolver,
	entry,
}: {
	capabilityRenderer?: AutoPanelCapabilityRenderer;
	capabilityResolver?: AutoPanelCapabilityResolver;
	entry: BoundaryNode;
}) {
	const CapabilityView = capabilityRenderer ?? DefaultCapabilityView;
	return (entry.capabilities ?? []).map((capability, index) => {
		const resolved = resolveCapability(capabilityResolver, entry, capability);
		const blocksInput =
			entry.role === "input" && capability.required && resolved.status === "unavailable";
		return {
			blocksInput,
			key: `${capability.kind}:${capability.id}:${capability.sourceRefs?.join(",") ?? ""}:${index}`,
			view: (
				<CapabilityView
					{...resolved}
					blocksInput={blocksInput}
					capability={capability}
					entry={entry}
					testId={capabilityTestId(entry, capability, index)}
				/>
			),
		};
	});
}

function InputWidget({
	capabilityRenderer,
	capabilityResolver,
	entry,
	widgetCatalog,
	widgetResolver,
}: {
	capabilityRenderer?: AutoPanelCapabilityRenderer;
	capabilityResolver?: AutoPanelCapabilityResolver;
	entry: InputBoundaryNode;
	widgetCatalog?: AutoPanelWidgetCatalog;
	widgetResolver?: AutoPanelWidgetResolver;
}) {
	const [value, set] = useNodeInput(entry.node);
	const testId = `in:${entry.name}`;
	const { kind, Widget } = resolveInputWidget(widgetCatalog, widgetResolver, entry, value);
	const capabilities = capabilityViews({ capabilityRenderer, capabilityResolver, entry });
	const disabled = capabilities.some((capability) => capability.blocksInput);
	const disabledRef = useRef(disabled);
	disabledRef.current = disabled;
	const guardedSet = useCallback<AutoPanelInputSetter>(
		(next) => {
			if (!disabledRef.current) set(next);
		},
		[set],
	);
	return (
		<div>
			<fieldset disabled={disabled}>
				<Widget
					disabled={disabled}
					entry={entry}
					kind={kind}
					set={guardedSet}
					testId={testId}
					value={value}
				/>
			</fieldset>
			{capabilities.map((capability) => (
				<div key={capability.key}>{capability.view}</div>
			))}
		</div>
	);
}

function OutputWidget({
	capabilityRenderer,
	capabilityResolver,
	entry,
	widgetCatalog,
	widgetResolver,
}: {
	capabilityRenderer?: AutoPanelCapabilityRenderer;
	capabilityResolver?: AutoPanelCapabilityResolver;
	entry: OutputBoundaryNode;
	widgetCatalog?: AutoPanelWidgetCatalog;
	widgetResolver?: AutoPanelWidgetResolver;
}) {
	const value = useNodeValue(entry.node);
	const testId = `out:${entry.name}`;
	const text = formatOutputValue(value);
	const { kind, Widget } = resolveOutputWidget(widgetCatalog, widgetResolver, entry, value);
	const capabilities = capabilityViews({ capabilityRenderer, capabilityResolver, entry });
	return (
		<div>
			<Widget entry={entry} kind={kind} testId={testId} text={text} value={value} />
			{capabilities.map((capability) => (
				<div key={capability.key}>{capability.view}</div>
			))}
		</div>
	);
}

/**
 * Auto-render a usable panel straight from a graph's boundary: one input widget
 * per writable source, one output widget per sink — each bound to its node with zero
 * hand-wiring. Callers may provide trusted widget and capability resolvers without
 * changing graph, boundary, or protocol semantics.
 */
export interface AutoPanelProps {
	capabilityRenderer?: AutoPanelCapabilityRenderer;
	capabilityResolver?: AutoPanelCapabilityResolver;
	graph: Graph;
	widgetCatalog?: AutoPanelWidgetCatalog;
	widgetResolver?: AutoPanelWidgetResolver;
}

export function AutoPanel({
	capabilityRenderer,
	capabilityResolver,
	graph,
	widgetCatalog,
	widgetResolver,
}: AutoPanelProps) {
	const manifest = useBoundaryManifest(graph);
	return (
		<div>
			<section aria-label="inputs">
				{manifest.inputs.map((entry) => (
					<InputWidget
						key={entry.name}
						capabilityRenderer={capabilityRenderer}
						capabilityResolver={capabilityResolver}
						entry={entry}
						widgetCatalog={widgetCatalog}
						widgetResolver={widgetResolver}
					/>
				))}
			</section>
			<section aria-label="outputs">
				{manifest.outputs.map((entry) => (
					<OutputWidget
						key={entry.name}
						capabilityRenderer={capabilityRenderer}
						capabilityResolver={capabilityResolver}
						entry={entry}
						widgetCatalog={widgetCatalog}
						widgetResolver={widgetResolver}
					/>
				))}
			</section>
		</div>
	);
}
