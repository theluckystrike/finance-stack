// Pure consistency checks backing the Node-version CI gate
// (app/scripts/check-node-version.ts). Side-effect-free — no I/O, no
// process.exit — so the unit suite can drive every branch against inline
// fixtures. Mirrors check-changelog-core.ts and seed-reference-check.ts.
//
// Three files declare the Node major and nothing compared them: the Dockerfile's
// FROM node:N stages, the actions/setup-node pins in .github/workflows/, and the
// @types/node range in package.json. Drift between them is silent until it is
// expensive — CI type-checks against a runtime the image does not ship, or the
// app builds on a major its type packages do not describe. Issue #442: the
// guard added in #211 checked only that *some* major was named, not that the
// three agreed.
//
// The shipping stage — the last FROM node:N — is the baseline: that is the
// runtime the deployed container actually has. Everything else must match it.

export type NodeVersionProblem =
  | { kind: "no-node-stage"; path: string; line: number; declared: string; expected: string }
  | { kind: "dockerfile-mismatch"; path: string; line: number; declared: string; expected: string }
  | { kind: "workflow-mismatch"; path: string; line: number; declared: string; expected: string }
  | { kind: "types-mismatch"; path: string; line: number; declared: string; expected: string };

export interface NodeVersionInput {
  dockerfile: { path: string; content: string };
  workflows: { path: string; content: string }[];
  packageJson: { path: string; content: string };
}

const FROM_NODE_RE = /^\s*FROM\s+(?:--platform=\S+\s+)?node:(\d+)/;
const WORKFLOW_PIN_RE = /^\s*node-version:\s*['"]?(\d+)/;
// First major in a semver range: ^24, ~24.9.0, >=22, 24.x, 24. Rejects ranges
// that name more than one major (">=20 <25") — an ambiguous pin proves nothing.
const RANGE_MAJOR_RE = /^\s*(?:[~^><=v]*\s*)?(\d+)(?:\.[\dx*]+)*\s*$/;

// 1-based line numbers, so the annotation points at the offending line.
export function parseDockerfileStages(content: string): { line: number; major: number }[] {
  const stages: { line: number; major: number }[] = [];
  content.split("\n").forEach((text, i) => {
    if (text.trimStart().startsWith("#")) return;
    const m = FROM_NODE_RE.exec(text);
    if (m) stages.push({ line: i + 1, major: Number(m[1]) });
  });
  return stages;
}

// A resolved pin only. Matrix expressions (${{ matrix.node }}) are skipped: the
// gate compares declared majors, and it cannot know what a variable expands to.
export function parseWorkflowPins(content: string): { line: number; major: number }[] {
  const pins: { line: number; major: number }[] = [];
  content.split("\n").forEach((text, i) => {
    const m = WORKFLOW_PIN_RE.exec(text);
    if (m) pins.push({ line: i + 1, major: Number(m[1]) });
  });
  return pins;
}

export function typesNodeMajor(
  content: string,
): { line: number; declared: string; major: number } | null {
  const at = content.indexOf('"@types/node"');
  if (at === -1) return null;
  const line = content.slice(0, at).split("\n").length;
  let declared: unknown;
  try {
    const pkg = JSON.parse(content) as Record<string, Record<string, unknown> | undefined>;
    declared = pkg.devDependencies?.["@types/node"];
  } catch {
    return null;
  }
  if (typeof declared !== "string") return null;
  const m = RANGE_MAJOR_RE.exec(declared);
  if (!m) return null;
  return { line, declared, major: Number(m[1]) };
}

export function findNodeVersionProblems(input: NodeVersionInput): NodeVersionProblem[] {
  const stages = parseDockerfileStages(input.dockerfile.content);
  const shipping = stages[stages.length - 1];
  if (!shipping) {
    return [
      {
        kind: "no-node-stage",
        path: input.dockerfile.path,
        line: 0,
        declared: "",
        expected: "",
      },
    ];
  }

  const expected = String(shipping.major);
  const problems: NodeVersionProblem[] = [];

  for (const stage of stages) {
    if (stage.major !== shipping.major) {
      problems.push({
        kind: "dockerfile-mismatch",
        path: input.dockerfile.path,
        line: stage.line,
        declared: String(stage.major),
        expected,
      });
    }
  }

  // Workflows whose pin never got read (unquoted integer, matrix var) produce no
  // problems — the gate reports declared drift, not absence of a pin; the
  // Dockerfile's no-node-stage branch is the fail-closed case.
  for (const wf of [...input.workflows].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const pin of parseWorkflowPins(wf.content)) {
      if (pin.major !== shipping.major) {
        problems.push({
          kind: "workflow-mismatch",
          path: wf.path,
          line: pin.line,
          declared: String(pin.major),
          expected,
        });
      }
    }
  }

  const types = typesNodeMajor(input.packageJson.content);
  if (types !== null && types.major !== shipping.major) {
    problems.push({
      kind: "types-mismatch",
      path: input.packageJson.path,
      line: types.line,
      declared: types.declared,
      expected: `^${expected}`,
    });
  }

  return problems;
}
