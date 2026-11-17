# Development workflow

- Pull before changing code. Use an isolated worktree when another worker owns the release slot; agree on the final commit and explicit slot handoff before integration. Never overlap root integration or deployment.
- During development, reproduce the issue and run the relevant tests against each change. Keep assertions, driving contracts and coverage intact; a timeout is not a failing gameplay assertion.
- Use the existing Node runner, not per-test shell jobs or a second runner:

  ```sh
  node --test tests/road-surface.test.js
  node --test --test-name-pattern='suspension capture' tests/road-surface.test.js
  npm test
  npm run build
  npm run format:check
  ```

  Select files/names that cover the change. `npm test` runs the full Node suite; `npm run build` includes strict browser/worker typechecks. Run applicable browser checks from README as well.

- Freeze the candidate before the broad final suite, integrated browser/capture checks and independent review. If it changes, rerun affected checks and re-establish the final gates on the resulting candidate; do not present an older pass as validation of changed code.
- Coordinate resource-heavy suites and browser captures across worktrees before starting them. Isolated source trees still share CPU and memory; use the Node runner's `--test-concurrency` when measured contention requires it.
- Let the test command finish. Set any shell timeout from measured runtime or an actual tool constraint, not an assumed 52–55-second ceiling. Batch related files when a measured resource limit requires it; do not weaken checks or split every test into its own job. Distinguish the shell deadline from any wrapper's wait deadline. Use completion notifications/`subagent await`, not repeated model-driven log/status polling; report a concrete milestone or blocker briefly.
- In Batty, run long commands directly with `functions.bash` and an appropriate `timeout` (seconds), or explicitly set the enclosing codemode `// @options: {"timeout_ms": ...}` deadline (milliseconds). Codemode defaults to 300,000 ms independently of an inner bash timeout; increasing only the latter does not prevent wrapper cancellation.
- Reuse the browser harnesses and helpers in `tests/` before writing a capture fixture. For a new fixture, validate one representative run before a matrix: production imports, actual craft/class/route, simulation timing, LOWRES state, canvas dimensions and `World.resize` after viewport changes. Reject browser errors or mismatched state. Compare identical driving moments and settings; inspect motion for landing, camera and aliasing changes. Record the source commit and command with evidence. Software-rendered captures are not hardware FPS measurements.
- Preserve the current release owner's slot and user data. Follow the task's production approval boundary; development checks do not authorize production tests, restarts or deployment.
