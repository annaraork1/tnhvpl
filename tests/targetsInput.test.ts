import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTargetsText,
  parseTargetsText,
  targetsFitBestOf,
  trimTargetsToBestOf,
} from "../lib/targetsInput.ts";

test("parseTargetsText accepts commas, spaces, dashes while typing fragments", () => {
  assert.deepEqual(parseTargetsText("21,"), [21]);
  assert.deepEqual(parseTargetsText("21, 21,"), [21, 21]);
  assert.deepEqual(parseTargetsText("21,21,15"), [21, 21, 15]);
  assert.deepEqual(parseTargetsText("21-21-15"), [21, 21, 15]);
  assert.deepEqual(parseTargetsText("25 25 15"), [25, 25, 15]);
  assert.deepEqual(parseTargetsText(""), []);
  assert.deepEqual(parseTargetsText("abc"), []);
});

test("formatTargetsText uses comma+space", () => {
  assert.equal(formatTargetsText([21, 21, 15]), "21, 21, 15");
});

test("targetsFitBestOf rejects extra targets for best of 1", () => {
  assert.equal(targetsFitBestOf(1, [25]), null);
  assert.match(targetsFitBestOf(1, [21, 21, 15]) ?? "", /Best of 1/);
  assert.equal(targetsFitBestOf(3, [21, 21, 15]), null);
  assert.match(targetsFitBestOf(3, [21, 21, 21, 21]) ?? "", /at most 3/);
  assert.equal(targetsFitBestOf(3, [21]), null);
});

test("trimTargetsToBestOf keeps first N", () => {
  assert.deepEqual(trimTargetsToBestOf(1, [21, 21, 15]), [21]);
  assert.deepEqual(trimTargetsToBestOf(3, [21, 21, 15]), [21, 21, 15]);
});
