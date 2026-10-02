import { expect, test } from "bun:test";

test("merged pull requests enqueue worktree-remove-merged and do not cancel Dagu runs", async () => {
  const text = await Bun.file(new URL("../.github/workflows/worktree-remove-merged.yml", import.meta.url)).text();
  expect(text).toContain("github.event.pull_request.merged == true");
  expect(text).toContain("/api/v1/dags/worktree-remove-merged/enqueue");
  expect(text).toContain("workflow_dispatch:");
  expect(text).toContain("permissions:");
  expect(text).toContain("contents: read");
  expect(text).toContain("secrets.TAILSCALE_AUTHKEY");
  expect(text).toContain("secrets.DAGU_API_KEY");
  expect(text).not.toContain("cancel-in-progress: true");
  expect(text).not.toContain("--force");
  expect(text).not.toContain("git worktree remove");
});
