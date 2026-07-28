import assert from "node:assert/strict";
import test from "node:test";
import { estateFlowTokens } from "../dist/index.js";

test("EstateFlow tokens reserve gold for meaningful financial status", () => {
  assert.equal(estateFlowTokens.color.gold, "#a96f16");
  assert.equal(estateFlowTokens.color.navy, "#123152");
  assert.equal(estateFlowTokens.font.numeric.includes("Mono"), true);
});

test("EstateFlow tokens expose a complete semantic spacing scale", () => {
  assert.equal(Object.keys(estateFlowTokens.space).length, 7);
  assert.equal(estateFlowTokens.radius.pill, "999px");
});
