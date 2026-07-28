import type { Node } from "@graphrefly/ts";
import { readableStore, recordReadableStore, type WritableNode } from "@graphrefly/ts/adapters";
import { type Accessor, createSignal, onCleanup } from "solid-js";

function assertDataValue(value: unknown): void {
	if (value === undefined) {
		throw new TypeError(
			"createNodeInput: undefined is SENTINEL/no DATA, not a writable DATA value",
		);
	}
}

function bindReadable<T>(store: { get(): T; subscribe(run: (value: T) => void): () => void }) {
	const [value, setValue] = createSignal<T>(store.get());
	const unsubscribe = store.subscribe((next) => {
		setValue(() => next);
	});
	onCleanup(unsubscribe);
	return value;
}

export function createNodeValue<T>(node: Node<T>): Accessor<T | undefined> {
	return bindReadable(readableStore(node));
}

export function createNodeInput<T>(
	node: WritableNode<T>,
): readonly [Accessor<T | undefined>, (value: T) => void] {
	return [
		createNodeValue(node),
		(value: T) => {
			assertDataValue(value);
			node.set(value);
		},
	] as const;
}

export function createNodeRecord<K extends string, R extends Record<string, unknown>>(
	keysNode: Node<readonly K[]>,
	factory: (key: K) => { [P in keyof R]: Node<R[P]> },
): Accessor<Record<K, R>> {
	const store = recordReadableStore(keysNode, factory);
	return bindReadable({
		get: () => store.get() ?? ({} as Record<K, R>),
		subscribe: (run) => store.subscribe((value) => run(value ?? ({} as Record<K, R>))),
	});
}
