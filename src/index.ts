// @graphrefly/react — reactive binding + presentation layer for GraphReFly.
// TS owns framework-neutral store bindings and boundary manifests; React owns hooks and UI.

export type {
	BoundaryCapabilityKind,
	BoundaryCapabilityRef,
	BoundaryManifest,
	BoundaryNode,
	BoundaryRole,
	InputBoundaryNode,
	OutputBoundaryNode,
} from "@graphrefly/ts/inspection/boundary";
export { boundaryManifest } from "@graphrefly/ts/inspection/boundary";
export type {
	A2UIBoundaryCapability,
	A2UIBoundaryCapabilityDataModel,
	A2UIBoundaryCapabilityDataModelEntry,
	A2UIBoundaryCapabilityDataModelOptions,
	A2UIBoundaryCapabilityDataModelUpdateMessage,
	A2UIBoundaryDataModel,
	A2UIBoundaryDataModelEntry,
	A2UIBoundaryDataModelOptions,
	A2UIBoundaryValue,
	A2UICapabilityAdmission,
	A2UICapabilityResolution,
	A2UICapabilityResolver,
	A2UICapabilityResolverContext,
	A2UICapabilityStatus,
	A2UIJsonValue,
	A2UIUpdateDataModelMessage,
	A2UIVersion,
} from "./a2ui.js";
export {
	A2UI_VERSION,
	boundaryManifestToA2UICapabilityDataModel,
	boundaryManifestToA2UICapabilityDataModelUpdate,
	boundaryManifestToA2UIDataModel,
	boundaryManifestToA2UIDataModelUpdate,
	useA2UIBoundaryDataModel,
	useA2UIBoundaryDataModelUpdate,
} from "./a2ui.js";
export type {
	AutoPanelCapabilityRenderer,
	AutoPanelCapabilityResolution,
	AutoPanelCapabilityResolver,
	AutoPanelCapabilityResolverContext,
	AutoPanelCapabilityStatus,
	AutoPanelCapabilityViewProps,
	AutoPanelInputSetter,
	AutoPanelInputWidget,
	AutoPanelInputWidgetKey,
	AutoPanelInputWidgetProps,
	AutoPanelOutputWidget,
	AutoPanelOutputWidgetKey,
	AutoPanelOutputWidgetProps,
	AutoPanelProps,
	AutoPanelWidgetCatalog,
	AutoPanelWidgetResolver,
	AutoPanelWidgetResolverContext,
} from "./auto-panel.js";
export { AutoPanel } from "./auto-panel.js";
export type {
	TopologyFlowEdge,
	TopologyFlowNode,
	TopologyFlowPanelProps,
} from "./topology-flow.js";
export { TopologyFlowPanel } from "./topology-flow.js";
export { useBoundaryManifest } from "./use-boundary-manifest.js";
export { useNodeInput, useNodeRecord, useNodeValue } from "./use-node.js";

export const VERSION = "0.0.0";
