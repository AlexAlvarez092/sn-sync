Title: feature: consolidate auth security model, shared HTTP transport, runtime helpers, and full documentation alignment

Problem statement
The extension had architectural drift across auth, HTTP transport, command runtime behavior, and documentation:
- Auth behavior was split between rc config assumptions and secrets usage, causing security and consistency risks.
- Transport logic was duplicated across services, increasing divergence and runtime instability.
- Command handlers repeated workspace/progress/error patterns with inconsistent behavior.
- The workflow lacked an explicit command to clear active auth state.
- Documentation no longer matched current behavior after refactors.

Proposed solution
Apply a repo-wide consolidation that standardizes behavior across auth, transport, commands, docs, and tests.

1) Security and auth model hardening
- Enforce secrets-only auth data at runtime.
- Keep .snsyncrc as non-sensitive config only (instance selector + settings).
- Sanitize legacy auth fields from .snsyncrc during initialization.
- Expand auth secret model to support multiple modes:
  - session headers (X-UserToken/Cookie)
  - bearer token
  - basic credentials
- Introduce deterministic auth priority:
  - session headers -> bearer -> basic

2) New command
- Add sn: reset auth (sn-sync.reset-auth).
- Register command in extension activation.
- Implement command behavior and tests.
- Add dedicated documentation page for the command.

3) Auth validation reliability
- Rework validateAuth to use the same ServiceNow Table API family as pull/push flows:
  - /api/now/v2/table/sys_user?user_name=...&sysparm_fields=...
- Add network error normalization path for fetch/request failures.
- Preserve/merge advanced auth fields when saving basic credentials.

4) Shared HTTP transport architecture
- Add shared got-based fetch-compatible transport factory in shared HTTP service.
- Add shared connection header resolver.
- Centralize method/header/body normalization for transport.
- Adopt shared transport across:
  - auth validation requests
  - pull service
  - push service
  - push report service
- Normalize HTTP error behavior consistently (401 as invalid credentials, other statuses as status-based errors).

5) Command runtime unification
- Add shared runtime helpers for:
  - workspace resolution with NO_WORKSPACE handling
  - standardized notification progress
  - standardized prefixed command errors
- Migrate command handlers to use common helpers.

6) Shared utility extraction
- Add shared pull progress callback helper for pull and pull-by-sys-id command flows.
- Add shared optional string normalizer utility and reuse where needed.
- Add missing constants/messages and normalized value constants.

7) Dependencies and packaging
- Add runtime dependencies:
  - got
  - tough-cookie
- Reflect package/lock updates for version and dependency graph.

8) Testing and quality gate
- Extend unit coverage for:
  - shared HTTP helper and transport branches
  - auth service behavior and precedence
  - reset auth command
  - runtime helper behavior
  - pull/push/report services with shared transport behavior
- Keep compile and coverage green.
- Final validated coverage target reached at 100%.

9) Documentation synchronization
- Update root README and docs index.
- Update architecture doc to reflect shared transport/runtime and auth strategy.
- Update command docs for behavior, dependencies, and flow details.
- Add docs for sn: reset auth.

Alternatives considered
- Keep per-service fetch/transport implementations and patch each independently.
  - Rejected because duplication caused behavioral drift and repeated regressions.
- Keep auth data in .snsyncrc for convenience.
  - Rejected due to explicit security requirement and risk of sensitive data leakage.

Area
Other

Scope and impact
- Security posture improves by removing auth persistence from workspace config.
- Existing users with legacy auth in .snsyncrc are migrated by sanitization (auth fields stripped).
- Runtime behavior is more deterministic due to shared transport and auth precedence.
- New command adds a safe recovery path for stale credentials.
- Broad internal refactor with low user-facing workflow changes beyond improved consistency.

Additional context
Validation summary from local runs:
- npm run compile: pass
- npm run coverage: pass
- Coverage summary: 100% statements, 100% branches, 100% functions, 100% lines

Suggested labels after creation (in addition to template defaults if needed)
- area: Auth
- area: Pull
- area: Push
- area: Documentation
- priority: p1
