import type { Node } from "@graphrefly/ts";
import { externalStore, recordReadableStore, type WritableNode } from "@graphrefly/ts/adapters";
import { useCallback, useMemo, useSyncExternalStore } from "react";

function assertDataValue(value: unknown): void {
	if (value === undefined) {
		throw new TypeError("useNodeInput: undefined is SENTINEL/no DATA, not a writable DATA value");
	}
}

/** Read a GraphReFly node through React's external-store contract. */
export function useNodeValue<T>(node: Node<T>): T | undefined {
	const store = useMemo(() => externalStore(node), [node]);
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/** Bind a writable GraphReFly node as a stable `[value, setValue]` pair. */
export function useNodeInput<T>(
	node: WritableNode<T>,
): readonly [T | undefined, (value: T) => void] {
	const value = useNodeValue(node);
	const setValue = useCallback(
		(next: T) => {
			assertDataValue(next);
			node.set(next);
		},
		[node],
	);
	return [value, setValue] as const;
}

/** Read a keyed record of nodes; callers must keep `factory` identity stable. */
export function useNodeRecord<K extends string, R extends Record<string, unknown>>(
	keysNode: Node<readonly K[]>,
	factory: (key: K) => { [P in keyof R]: Node<R[P]> },
): Record<K, R> {
	const store = useMemo(() => {
		const recordStore = recordReadableStore(keysNode, factory);
		let current = recordStore.get() ?? ({} as Record<K, R>);
		return {
			getSnapshot: () => current,
			subscribe(onStoreChange: () => void) {
				return recordStore.subscribe((next) => {
					current = next ?? ({} as Record<K, R>);
					onStoreChange();
				});
			},
		};
	}, [keysNode, factory]);
	const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
	return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
