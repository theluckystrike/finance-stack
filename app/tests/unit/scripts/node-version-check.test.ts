import { describe, it, expect } from "vitest";

import {
  findNodeVersionProblems,
  parseDockerfileStages,
  parseWorkflowPins,
  typesNodeMajor,
  type NodeVersionInput,
} from "@/scripts/node-version-check";

// Fixtures are inline strings: the gate's whole job is reading three kinds of
// file that live in three kinds of place, and every branch is worth pinning
// without touching the filesystem.

const dockerfile = (...majors: number[]): string =>
  majors
    .map((m, i) => `FROM node:${m}-alpine AS stage${i}\nRUN echo hi\n`)
    .join("\n");

const workflow = (...pins: number[]): string =>
  [
    "jobs:",
    "  build:",
    "    steps:",
    ...pins.flatMap((p) => ["      - uses: actions/setup-node@v4", `        with:`, `          node-version: ${p}`]),
  ].join("\n");

const pkg = (range: string): string =>
  JSON.stringify({ devDependencies: { "@types/node": range } }, null, 2);

function input(over: Partial<NodeVersionInput> = {}): NodeVersionInput {
  return {
    dockerfile: { path: "app/Dockerfile", content: dockerfile(24, 24, 24) },
    workflows: [{ path: ".github/workflows/ci.yml", content: workflow(24, 24) }],
    packageJson: { path: "app/package.json", content: pkg("^24") },
    ...over,
  };
}

describe("parseDockerfileStages", () => {
  it("records the major and the 1-based line of every FROM node stage", () => {
    expect(parseDockerfileStages("ARG X=1\nFROM node:26-alpine AS deps\n\nFROM node:24-alpine AS runner\n")).toEqual([
      { line: 2, major: 26 },
      { line: 4, major: 24 },
    ]);
  });

  it("ignores non-node stages and commented-out lines", () => {
    expect(parseDockerfileStages("# FROM node:22-alpine\nFROM caddy:2-alpine AS web\n")).toEqual([]);
  });
});

describe("parseWorkflowPins", () => {
  it("reads quoted and unquoted node-version pins", () => {
    expect(parseWorkflowPins('        node-version: "22"\n          node-version: 24\n')).toEqual([
      { line: 1, major: 22 },
      { line: 2, major: 24 },
    ]);
  });

  it("ignores matrix variables it cannot resolve to a major", () => {
    expect(parseWorkflowPins("          node-version: ${{ matrix.node }}\n")).toEqual([]);
  });
});

describe("typesNodeMajor", () => {
  it("accepts caret, tilde, >=, exact and x-range declarations", () => {
    for (const [range, major] of [
      ["^24", 24],
      ["~24.9.0", 24],
      [">=22", 22],
      ["24", 24],
      ["24.x", 24],
    ] as const) {
      expect(typesNodeMajor(pkg(range))?.major, range).toBe(major);
    }
  });

  it("returns null when the declaration pins no single major", () => {
    expect(typesNodeMajor(pkg(">=20 <25"))).toBeNull();
    expect(typesNodeMajor(JSON.stringify({ dependencies: {} }))?.major ?? null).toBeNull();
  });
});

describe("findNodeVersionProblems", () => {
  it("reports nothing when all three sources agree", () => {
    expect(findNodeVersionProblems(input())).toEqual([]);
  });

  it("reports a Dockerfile whose stages disagree with the shipping stage", () => {
    expect(findNodeVersionProblems(input({ dockerfile: { path: "app/Dockerfile", content: dockerfile(26, 24) } }))).toEqual([
      { kind: "dockerfile-mismatch", path: "app/Dockerfile", line: 1, declared: "26", expected: "24" },
    ]);
  });

  it("reports every workflow pin that lags the image", () => {
    const problems = findNodeVersionProblems(
      input({
        dockerfile: { path: "app/Dockerfile", content: dockerfile(26, 26) },
        workflows: [{ path: ".github/workflows/ci.yml", content: workflow(26, 24, 24) }],
        packageJson: { path: "app/package.json", content: pkg("^26") },
      }),
    );
    expect(problems).toEqual([
      { kind: "workflow-mismatch", path: ".github/workflows/ci.yml", line: 9, declared: "24", expected: "26" },
      { kind: "workflow-mismatch", path: ".github/workflows/ci.yml", line: 12, declared: "24", expected: "26" },
    ]);
  });

  it("reports an @types/node major that is ahead of the runtime", () => {
    expect(findNodeVersionProblems(input({ packageJson: { path: "app/package.json", content: pkg("^26") } }))).toEqual([
      { kind: "types-mismatch", path: "app/package.json", line: 3, declared: "^26", expected: "^24" },
    ]);
  });

  it("fails closed when the Dockerfile names no node stage at all", () => {
    expect(
      findNodeVersionProblems(input({ dockerfile: { path: "app/Dockerfile", content: "FROM caddy:2-alpine\n" } })),
    ).toEqual([{ kind: "no-node-stage", path: "app/Dockerfile", line: 0, declared: "", expected: "" }]);
  });

  it("reports drift across several workflow files in path order", () => {
    const problems = findNodeVersionProblems(
      input({
        workflows: [
          { path: ".github/workflows/ci.yml", content: workflow(26) },
          { path: ".github/workflows/release.yml", content: workflow(22) },
        ],
      }),
    );
    expect(problems.map((p) => [p.kind, p.path])).toEqual([
      ["workflow-mismatch", ".github/workflows/ci.yml"],
      ["workflow-mismatch", ".github/workflows/release.yml"],
    ]);
  });
});
