import type { Graph } from "@graphrefly/ts";
import type {
	GraphTopologyEdge,
	GraphTopologyNode,
	GraphTopologySnapshot,
} from "@graphrefly/ts/graph";
import { useMemo, useState, useSyncExternalStore } from "react";

export interface TopologyFlowPanelProps {
	graph: Graph;
	initialSelectedId?: string;
}

export interface TopologyFlowNode {
	deps: string[];
	factory: string;
	id: string;
	label: string;
	rank: number;
	subgraph?: string;
	x: number;
	y: number;
}

export interface TopologyFlowEdge {
	from: string;
	to: string;
}

interface FlattenedDescribe {
	edges: GraphTopologyEdge[];
	nodes: Array<GraphTopologyNode & { subgraph?: string }>;
}

interface TopologyFlowModel {
	edges: TopologyFlowEdge[];
	height: number;
	nodes: TopologyFlowNode[];
	width: number;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 72;
const COLUMN_GAP = 96;
const ROW_GAP = 36;
const PADDING = 24;

function topologySnapshot(graph: Graph): string {
	return JSON.stringify(projectTopology(graph.describe()));
}

function useTopologySnapshot(graph: Graph): GraphTopologySnapshot {
	const store = useMemo(
		() => ({
			getSnapshot: () => topologySnapshot(graph),
			subscribe: (onStoreChange: () => void) =>
				graph.observeTopology().subscribe(() => onStoreChange()),
		}),
		[graph],
	);
	const encoded = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	return useMemo(() => JSON.parse(encoded) as GraphTopologySnapshot, [encoded]);
}

function projectTopology(snapshot: ReturnType<Graph["describe"]>): GraphTopologySnapshot {
	const out: GraphTopologySnapshot = {
		edges: snapshot.edges.map((edge) => ({ from: edge.from, to: edge.to })),
		nodes: snapshot.nodes.map((node) => {
			const projected: GraphTopologyNode = {
				deps: [...node.deps],
				factory: node.factory,
				id: node.id,
			};
			if (node.name !== undefined) projected.name = node.name;
			return projected;
		}),
	};
	if (snapshot.name !== undefined) out.name = snapshot.name;
	if (snapshot.subgraphs !== undefined) out.subgraphs = snapshot.subgraphs.map(projectTopology);
	return out;
}

function mountPathFromNodeId(id: string): string | undefined {
	const marker = id.lastIndexOf("::");
	if (marker === -1) return undefined;
	return id.slice(0, marker);
}

function flattenTopology(snapshot: GraphTopologySnapshot): FlattenedDescribe {
	const nodes = snapshot.nodes.map((node) => {
		const subgraph = mountPathFromNodeId(node.id);
		return subgraph === undefined ? node : { ...node, subgraph };
	});
	const edges = [...snapshot.edges];
	for (const child of snapshot.subgraphs ?? []) {
		const flattened = flattenTopology(child);
		nodes.push(...flattened.nodes);
		edges.push(...flattened.edges);
	}
	return { edges, nodes };
}

function buildTopologyFlowModel(snapshot: GraphTopologySnapshot): TopologyFlowModel {
	const flattened = flattenTopology(snapshot);
	const knownIds = new Set(flattened.nodes.map((node) => node.id));
	const edges = flattened.edges.filter((edge) => knownIds.has(edge.from) && knownIds.has(edge.to));
	const ranks = new Map(flattened.nodes.map((node) => [node.id, 0]));

	for (let i = 0; i < flattened.nodes.length; i++) {
		let changed = false;
		for (const edge of edges) {
			const nextRank = (ranks.get(edge.from) ?? 0) + 1;
			if (nextRank > (ranks.get(edge.to) ?? 0)) {
				ranks.set(edge.to, nextRank);
				changed = true;
			}
		}
		if (!changed) break;
	}

	const byRank = new Map<number, Array<GraphTopologyNode & { subgraph?: string }>>();
	for (const node of flattened.nodes) {
		const rank = ranks.get(node.id) ?? 0;
		const bucket = byRank.get(rank) ?? [];
		bucket.push(node);
		byRank.set(rank, bucket);
	}
	for (const bucket of byRank.values()) {
		bucket.sort((a, b) => a.id.localeCompare(b.id));
	}

	const nodes = flattened.nodes
		.map((node) => {
			const rank = ranks.get(node.id) ?? 0;
			const rankIndex = byRank.get(rank)?.findIndex((candidate) => candidate.id === node.id) ?? 0;
			return {
				deps: [...node.deps],
				factory: node.factory,
				id: node.id,
				label: node.name ?? node.id,
				rank,
				subgraph: node.subgraph,
				x: PADDING + rank * (NODE_WIDTH + COLUMN_GAP),
				y: PADDING + rankIndex * (NODE_HEIGHT + ROW_GAP),
			};
		})
		.sort((a, b) => a.rank - b.rank || a.y - b.y || a.id.localeCompare(b.id));

	const rankBuckets = Array.from(byRank.values());
	const maxRankSize = Math.max(1, ...rankBuckets.map((bucket) => bucket.length));
	const maxRank = Math.max(0, ...nodes.map((node) => node.rank));
	const width = PADDING * 2 + (maxRank + 1) * NODE_WIDTH + maxRank * COLUMN_GAP;
	const height = PADDING * 2 + maxRankSize * NODE_HEIGHT + Math.max(0, maxRankSize - 1) * ROW_GAP;

	return {
		edges,
		height,
		nodes,
		width,
	};
}

function edgePath(from: TopologyFlowNode, to: TopologyFlowNode): string {
	const startX = from.x + NODE_WIDTH;
	const startY = from.y + NODE_HEIGHT / 2;
	const endX = to.x;
	const endY = to.y + NODE_HEIGHT / 2;
	const midX = startX + Math.max(32, (endX - startX) / 2);
	return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

/**
 * Live topology sidebar over graph.describe().
 *
 * This is React reference UI only: it consumes the TS-owned describe/topology
 * snapshot and renders DOM/SVG affordances without owning substrate, Canvas
 * state, value subscriptions, or pure GraphSpec string renderers.
 */
export function TopologyFlowPanel({ graph, initialSelectedId }: TopologyFlowPanelProps) {
	const snapshot = useTopologySnapshot(graph);
	const model = useMemo(() => buildTopologyFlowModel(snapshot), [snapshot]);
	const [selectedId, setSelectedId] = useState(initialSelectedId);
	const selected =
		model.nodes.find((node) => node.id === selectedId) ??
		model.nodes.find((node) => node.id === initialSelectedId) ??
		model.nodes[0];
	const byId = new Map(model.nodes.map((node) => [node.id, node]));

	return (
		<aside aria-label="topology flow" style={panelStyle}>
			<header style={headerStyle}>
				<strong>{snapshot.name ?? "graph"}</strong>
				<span data-testid="topology-counts">
					{model.nodes.length} nodes / {model.edges.length} edges
				</span>
			</header>
			<div style={viewportStyle}>
				<svg
					aria-hidden="true"
					data-testid="topology-edges"
					height={model.height}
					style={svgStyle}
					viewBox={`0 0 ${model.width} ${model.height}`}
					width={model.width}
				>
					<title>topology edges</title>
					{model.edges.map((edge) => {
						const from = byId.get(edge.from);
						const to = byId.get(edge.to);
						if (!from || !to) return null;
						return (
							<path
								d={edgePath(from, to)}
								data-testid={`topology-edge:${edge.from}->${edge.to}`}
								fill="none"
								key={`${edge.from}->${edge.to}`}
								stroke="#61738a"
								strokeWidth="2"
							/>
						);
					})}
				</svg>
				<div style={{ height: model.height, position: "relative", width: model.width }}>
					{model.nodes.map((node) => (
						<button
							aria-pressed={node.id === selected?.id}
							data-testid={`topology-node:${node.id}`}
							key={node.id}
							onClick={() => setSelectedId(node.id)}
							style={{
								...nodeStyle,
								left: node.x,
								outline: node.id === selected?.id ? "2px solid #276ef1" : "1px solid #c8d1dc",
								top: node.y,
							}}
							type="button"
						>
							<span style={nodeLabelStyle}>{node.label}</span>
							<span>{node.factory}</span>
							<span>{node.deps.length === 0 ? "source" : `${node.deps.length} deps`}</span>
						</button>
					))}
				</div>
			</div>
			{selected ? (
				<section aria-label="topology details" style={detailsStyle}>
					<strong data-testid="topology-selected">{selected.id}</strong>
					<span>factory: {selected.factory}</span>
					<span>deps: {selected.deps.length === 0 ? "none" : selected.deps.join(", ")}</span>
					{selected.subgraph ? <span>subgraph: {selected.subgraph}</span> : null}
				</section>
			) : (
				<section aria-label="topology details" style={detailsStyle}>
					<span data-testid="topology-selected">empty graph</span>
				</section>
			)}
		</aside>
	);
}

const panelStyle = {
	border: "1px solid #d4dce7",
	borderRadius: 8,
	display: "grid",
	fontFamily: "system-ui, sans-serif",
	gap: 12,
	padding: 12,
} as const;

const headerStyle = {
	alignItems: "center",
	display: "flex",
	gap: 12,
	justifyContent: "space-between",
} as const;

const viewportStyle = {
	border: "1px solid #e1e7ef",
	borderRadius: 6,
	minHeight: 180,
	overflow: "auto",
	position: "relative",
} as const;

const svgStyle = {
	left: 0,
	pointerEvents: "none",
	position: "absolute",
	top: 0,
} as const;

const nodeStyle = {
	background: "#ffffff",
	border: 0,
	borderRadius: 6,
	color: "#102033",
	display: "grid",
	font: "inherit",
	height: NODE_HEIGHT,
	padding: 10,
	position: "absolute",
	textAlign: "left",
	width: NODE_WIDTH,
} as const;

const nodeLabelStyle = {
	fontWeight: 700,
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
} as const;

const detailsStyle = {
	borderTop: "1px solid #e1e7ef",
	display: "grid",
	gap: 4,
	paddingTop: 8,
} as const;
