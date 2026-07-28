import type { Graph } from "@graphrefly/ts";
import { type BoundaryManifest, boundaryManifest } from "@graphrefly/ts/inspection/boundary";
import { useMemo, useSyncExternalStore } from "react";

function topologySnapshot(graph: Graph): string {
	const described = graph.describe();
	return JSON.stringify(projectTopology(described));
}

function projectTopology(described: ReturnType<Graph["describe"]>): unknown {
	return {
		nodes: described.nodes?.map((node) => ({
			id: node.id,
			deps: node.deps,
			factory: node.factory,
			meta: node.meta,
			name: node.name,
		})),
		edges: described.edges,
		subgraphs: described.subgraphs?.map(projectTopology),
	};
}

/**
 * Read a live boundary manifest for a graph and rerender when topology changes.
 *
 * This hook is intentionally small and generic so presentation shells can reuse
 * the boundary-binding contract without copying internal manifest wiring.
 */
export function useBoundaryManifest(graph: Graph): BoundaryManifest {
	const store = useMemo(() => {
		return {
			subscribe: (onStoreChange: () => void) =>
				graph.observeTopology().subscribe(() => onStoreChange()),
			getSnapshot: () => topologySnapshot(graph),
		};
	}, [graph]);

	useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	return boundaryManifest(graph);
}
