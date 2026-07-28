import { graph } from "@graphrefly/ts";
import { describe, expect, it } from "vitest";
import {
	fromNestReq,
	GraphReq,
	getNestBoundaryBindings,
	NEST_BOUNDARY_ENVELOPE_VERSION,
} from "./index.js";

describe("@graphrefly/nestjs", () => {
	it("owns structural decorator metadata without importing Nest runtime", () => {
		const request = fromNestReq(graph(), {
			bindingId: "orders.create.in",
			payload: () => ({ ok: true }),
		});
		class Controller {
			post() {}
		}
		GraphReq(request)(Controller.prototype, "post", {
			value: Controller.prototype.post,
		});

		expect(getNestBoundaryBindings(Controller, "post")).toMatchObject([
			{ bindingId: "orders.create.in", kind: "request" },
		]);
		expect(NEST_BOUNDARY_ENVELOPE_VERSION).toBe(1);
	});
});
