// CLI wrapper around node-version-check.ts. Fails the build when the Dockerfile's
// FROM node:<major> stages, the actions/setup-node pins in .github/workflows/ and
// the @types/node range in app/package.json disagree about the Node major the
// image ships. Closes the gap left by the #211 guard, which only asserted that a
// major was named somewhere. Run from app/ (`npm run check:node-version`),
// matching the other scripts/ checks.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { findNodeVersionProblems, type NodeVersionInput } from "./node-version-check";

const appDir = process.cwd();
const repoRoot = resolve(appDir, "..");
const workflowsDir = join(repoRoot, ".github", "workflows");

const dockerfilePath = "app/Dockerfile";
const packageJsonPath = "app/package.json";

function read(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf8");
}

function workflowInputs(): { path: string; content: string }[] {
  return readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => ({
      path: `.github/workflows/${name}`,
      content: readFileSync(join(workflowsDir, name), "utf8"),
    }));
}

const input: NodeVersionInput = {
  dockerfile: { path: dockerfilePath, content: read(dockerfilePath) },
  workflows: workflowInputs(),
  packageJson: { path: packageJsonPath, content: read(packageJsonPath) },
};

const problems = findNodeVersionProblems(input);

if (problems.length === 0) {
  console.log(
    "✓ Node version gate: app/Dockerfile, .github/workflows/ and @types/node agree on the Node major the image ships",
  );
  process.exit(0);
}

const explain = (problem: (typeof problems)[number]): string => {
  switch (problem.kind) {
    case "no-node-stage":
      return `no FROM node:<major> stage in ${problem.path}; the gate cannot tell which Node version the image ships`;
    case "dockerfile-mismatch":
      return `this stage builds on node:${problem.declared}, but the shipping stage is node:${problem.expected}; every stage must name the same major or the build tree and the runtime diverge`;
    case "workflow-mismatch":
      return `CI pins node-version: ${problem.declared}, but the image ships node:${problem.expected}; tests and type-checks would run on a runtime the deployed container never has`;
    case "types-mismatch":
      return `@types/node is declared as ${problem.declared}, which does not describe node:${problem.expected}; type-checking runs against the wrong API surface`;
  }
};

console.error(`✗ Node version gate: ${problems.length} declaration(s) disagree with the shipped runtime\n`);
for (const problem of problems) {
  const location = problem.line > 0 ? `file=${problem.path},line=${problem.line}` : `file=${problem.path}`;
  console.error(`::error ${location}::${problem.kind}: ${explain(problem)}`);
}

process.exit(1);
