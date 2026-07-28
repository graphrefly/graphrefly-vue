import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC = join(ROOT, "node_modules", ".bin", "tsc");
const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const peerLinks = {
	"@graphrefly/ts": resolveDevDependencyPath("@graphrefly/ts"),
	react: join(ROOT, "node_modules", "react"),
};
const allowedRuntimeRootExports = [
	"A2UI_VERSION",
	"AutoPanel",
	"TopologyFlowPanel",
	"VERSION",
	"boundaryManifest",
	"boundaryManifestToA2UICapabilityDataModel",
	"boundaryManifestToA2UICapabilityDataModelUpdate",
	"boundaryManifestToA2UIDataModel",
	"boundaryManifestToA2UIDataModelUpdate",
	"useA2UIBoundaryDataModel",
	"useA2UIBoundaryDataModelUpdate",
	"useBoundaryManifest",
	"useNodeInput",
	"useNodeRecord",
	"useNodeValue",
];
const deniedRootExports = [
	"Canvas",
	"CanvasProvider",
	"CanvasRuntime",
	"ConfigForm",
	"DynamicA2UIRegistry",
	"DynamicA2UIRenderer",
	"ELK",
	"OAuthProvider",
	"ProviderRegistry",
	"ReactFlow",
	"RendererRegistry",
	"WorkspaceGraph",
];

function fail(message) {
	console.error(`check-package-exports: ${message}`);
	process.exit(1);
}

function assert(condition, message) {
	if (!condition) fail(message);
}

function resolveDevDependencyPath(name) {
	const spec = packageJson.devDependencies?.[name];
	if (typeof spec !== "string") {
		fail(`${name} devDependency must be declared`);
	}
	if (spec.startsWith("link:")) {
		return resolve(ROOT, spec.slice("link:".length));
	}
	return join(ROOT, "node_modules", ...name.split("/"));
}

function errorOutput(err) {
	const stdout =
		typeof err.stdout === "string"
			? err.stdout
			: Buffer.isBuffer(err.stdout)
				? err.stdout.toString("utf8")
				: "";
	const stderr =
		typeof err.stderr === "string"
			? err.stderr
			: Buffer.isBuffer(err.stderr)
				? err.stderr.toString("utf8")
				: "";
	return `${stdout}${stderr}`;
}

function validateExportTarget(path, target) {
	assert(typeof target === "string", `${path} must be a string target`);
	assert(target.startsWith("./"), `${path} must be package-relative`);
	assert(existsSync(join(ROOT, target)), `${path} target missing: ${target}`);
}

validateExportTarget("exports.import", packageJson.exports?.["."]?.import);
validateExportTarget("exports.require", packageJson.exports?.["."]?.require);
validateExportTarget("exports.default", packageJson.exports?.["."]?.default);
validateExportTarget("exports.types", packageJson.exports?.["."]?.types);
assert(packageJson.main === "dist/index.cjs", "main must point to the CommonJS build");
assert(packageJson.module === "dist/index.js", "module must point to the ESM build");
assert(
	JSON.stringify(Object.keys(packageJson.exports ?? {}).sort()) === JSON.stringify(["."]),
	"exports must expose only the light root entry until a focused subpath is reviewed",
);
assert(
	JSON.stringify(packageJson.files) === JSON.stringify(["dist", "README.md", "package.json"]),
	"files must stay limited to dist, README.md, and package.json",
);
assert(packageJson.sideEffects === false, "sideEffects must stay false");
assert(
	packageJson.peerDependencies?.["@graphrefly/ts"] === ">=0.6.2 <1.0.0",
	"@graphrefly/ts peerDependency must be a versioned pre-1.0 range",
);
assert(
	typeof packageJson.devDependencies?.["@graphrefly/ts"] === "string" &&
		existsSync(peerLinks["@graphrefly/ts"]),
	"@graphrefly/ts devDependency must resolve to an installed package",
);
assert(
	packageJson.peerDependencies?.react === "^18.0.0 || ^19.0.0",
	"react peerDependency must cover React 18 and 19",
);
assert(
	packageJson.peerDependencies?.["react-dom"] === undefined,
	"react-dom must not be a runtime peer",
);

const builtIndex = readFileSync(join(ROOT, "dist", "index.js"), "utf8");
const builtSpecifiers = Array.from(builtIndex.matchAll(/\bfrom\s+"([^"]+)"/g), (match) => match[1]);
assert(
	!builtSpecifiers.some((specifier) =>
		/@graphrefly\/ts\/solutions|react-flow|elkjs|canvas/i.test(specifier),
	),
	"root build must not import TS solutions, Canvas, React Flow, or ELK-heavy surfaces",
);

const tmp = mkdtempSync(join(tmpdir(), "graphrefly-react-export-smoke-"));

try {
	const reactPkg = join(tmp, "node_modules", "@graphrefly", "react");
	mkdirSync(reactPkg, { recursive: true });
	cpSync(join(ROOT, "package.json"), join(reactPkg, "package.json"));
	cpSync(join(ROOT, "dist"), join(reactPkg, "dist"), { recursive: true });

	for (const [name, target] of Object.entries(peerLinks)) {
		assert(existsSync(target), `peer package target missing for ${name}: ${target}`);
		const link = join(tmp, "node_modules", ...name.split("/"));
		mkdirSync(dirname(link), { recursive: true });
		symlinkSync(target, link, "dir");
	}

	writeFileSync(
		join(tmp, "package.json"),
		JSON.stringify({ type: "module", private: true }, null, "\t"),
	);
	writeFileSync(
		join(tmp, "esm-smoke.mjs"),
		`import assert from "node:assert/strict";
import * as reactSdk from "@graphrefly/react";
import { boundaryManifest } from "@graphrefly/ts/inspection/boundary";

const allowedRuntimeRootExports = ${JSON.stringify(allowedRuntimeRootExports)};
const deniedRootExports = ${JSON.stringify(deniedRootExports)};

assert.deepEqual(Object.keys(reactSdk).sort(), allowedRuntimeRootExports.sort());
for (const name of deniedRootExports) {
	assert.equal(Object.hasOwn(reactSdk, name), false);
}
assert.equal(typeof reactSdk.useNodeInput, "function");
assert.equal(typeof reactSdk.useNodeRecord, "function");
assert.equal(typeof reactSdk.useNodeValue, "function");
assert.equal(reactSdk.boundaryManifest, boundaryManifest);
assert.equal(typeof reactSdk.useBoundaryManifest, "function");
assert.equal(typeof reactSdk.AutoPanel, "function");
assert.equal(typeof reactSdk.TopologyFlowPanel, "function");
assert.equal(reactSdk.A2UI_VERSION, "v0.9.1");
assert.equal(typeof reactSdk.boundaryManifestToA2UICapabilityDataModel, "function");
assert.equal(typeof reactSdk.boundaryManifestToA2UICapabilityDataModelUpdate, "function");
assert.equal(typeof reactSdk.boundaryManifestToA2UIDataModel, "function");
assert.equal(typeof reactSdk.boundaryManifestToA2UIDataModelUpdate, "function");
assert.equal(typeof reactSdk.useA2UIBoundaryDataModel, "function");
assert.equal(typeof reactSdk.useA2UIBoundaryDataModelUpdate, "function");
	`,
	);
	writeFileSync(
		join(tmp, "cjs-smoke.cjs"),
		`const assert = require("node:assert/strict");
const reactSdk = require("@graphrefly/react");

const allowedRuntimeRootExports = ${JSON.stringify(allowedRuntimeRootExports)};
const deniedRootExports = ${JSON.stringify(deniedRootExports)};

assert.deepEqual(Object.keys(reactSdk).sort(), allowedRuntimeRootExports.sort());
for (const name of deniedRootExports) {
	assert.equal(Object.hasOwn(reactSdk, name), false);
}
assert.equal(typeof reactSdk.useNodeInput, "function");
assert.equal(typeof reactSdk.useNodeRecord, "function");
assert.equal(typeof reactSdk.useNodeValue, "function");
assert.equal(typeof reactSdk.AutoPanel, "function");
assert.equal(typeof reactSdk.TopologyFlowPanel, "function");
`,
	);
	writeFileSync(
		join(tmp, "types-smoke.mts"),
		`import {
		A2UI_VERSION,
		type A2UIBoundaryCapability,
		type A2UIBoundaryCapabilityDataModel,
		type A2UIBoundaryCapabilityDataModelUpdateMessage,
		type A2UIBoundaryDataModel,
		type A2UICapabilityAdmission,
		type A2UICapabilityResolution,
		type A2UICapabilityResolver,
		type A2UICapabilityResolverContext,
		type A2UICapabilityStatus,
		type A2UIUpdateDataModelMessage,
		AutoPanel,
		type AutoPanelInputWidgetProps,
		type AutoPanelOutputWidgetProps,
		type AutoPanelWidgetCatalog,
		type AutoPanelWidgetResolverContext,
			type BoundaryManifest,
			type BoundaryNode,
			type BoundaryRole,
			TopologyFlowPanel,
		type TopologyFlowPanelProps,
		boundaryManifest,
	boundaryManifestToA2UICapabilityDataModel,
	boundaryManifestToA2UICapabilityDataModelUpdate,
	boundaryManifestToA2UIDataModel,
	boundaryManifestToA2UIDataModelUpdate,
	useA2UIBoundaryDataModel,
	useA2UIBoundaryDataModelUpdate,
	useBoundaryManifest,
	useNodeInput,
	useNodeRecord,
	useNodeValue,
} from "@graphrefly/react";

${deniedRootExports
	.map(
		(name) => `// @ts-expect-error D346/D347 keep ${name} out of the root export.
import type { ${name} } from "@graphrefly/react";`,
	)
	.join("\n")}

void AutoPanel;
void TopologyFlowPanel;
void A2UI_VERSION;
void boundaryManifest;
void boundaryManifestToA2UICapabilityDataModel;
void boundaryManifestToA2UICapabilityDataModelUpdate;
void boundaryManifestToA2UIDataModel;
void boundaryManifestToA2UIDataModelUpdate;
void useA2UIBoundaryDataModel;
void useA2UIBoundaryDataModelUpdate;
void useBoundaryManifest;
void useNodeInput;
void useNodeRecord;
void useNodeValue;

	declare const manifest: BoundaryManifest;
	const role: BoundaryRole = "input";
	const node: BoundaryNode | undefined = manifest.inputs[0] ?? manifest.outputs[0];
	declare const inputProps: AutoPanelInputWidgetProps;
	declare const outputProps: AutoPanelOutputWidgetProps;
		declare const catalog: AutoPanelWidgetCatalog;
		declare const resolverContext: AutoPanelWidgetResolverContext;
		declare const topologyFlowProps: TopologyFlowPanelProps;
		declare const a2uiCapability: A2UIBoundaryCapability;
		declare const a2uiCapabilityModel: A2UIBoundaryCapabilityDataModel;
		declare const a2uiCapabilityUpdate: A2UIBoundaryCapabilityDataModelUpdateMessage;
		declare const a2uiCapabilityStatus: A2UICapabilityStatus;
		declare const a2uiCapabilityAdmission: A2UICapabilityAdmission;
		declare const a2uiCapabilityResolution: A2UICapabilityResolution;
		declare const a2uiCapabilityResolver: A2UICapabilityResolver;
		declare const a2uiCapabilityResolverContext: A2UICapabilityResolverContext;
		declare const a2uiModel: A2UIBoundaryDataModel;
		declare const a2uiUpdate: A2UIUpdateDataModelMessage;
		void role;
		void node;
		void inputProps;
		void outputProps;
		void catalog;
		void resolverContext;
		void topologyFlowProps;
		void a2uiCapability;
		void a2uiCapabilityModel;
		void a2uiCapabilityUpdate;
		void a2uiCapabilityStatus;
		void a2uiCapabilityAdmission;
		void a2uiCapabilityResolution;
		void a2uiCapabilityResolver;
		void a2uiCapabilityResolverContext;
		void a2uiModel;
		void a2uiUpdate;
		`,
	);
	writeFileSync(
		join(tmp, "tsconfig.json"),
		JSON.stringify(
			{
				compilerOptions: {
					target: "ES2022",
					module: "NodeNext",
					moduleResolution: "NodeNext",
					jsx: "react-jsx",
					strict: true,
					noEmit: true,
					skipLibCheck: true,
				},
				include: ["types-smoke.mts"],
			},
			null,
			"\t",
		),
	);

	execFileSync(process.execPath, ["esm-smoke.mjs"], { cwd: tmp, stdio: "pipe" });
	execFileSync(process.execPath, ["cjs-smoke.cjs"], { cwd: tmp, stdio: "pipe" });
	execFileSync(TSC, ["-p", "tsconfig.json"], { cwd: tmp, stdio: "pipe" });
} catch (e) {
	fail(`${e.message ?? e}\n${errorOutput(e)}`.trim());
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

console.log("check-package-exports: @graphrefly/react ESM/CJS/DTS smoke passed");
