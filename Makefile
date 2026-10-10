# Shared project commands. `make help` lists them.

.DEFAULT_GOAL := help
.PHONY: help up down dev api-dev format check check-web check-api check-docker check-scripts check-codex

help: ## Show commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-17s %s\n", $$1, $$2}'

up: ## Start Postgres and API in Docker and wait until ready
	docker compose up -d --build --wait

down: ## Stop the Docker environment (database data is kept)
	docker compose down

dev: up ## API in Docker + frontend with hot reload
	pnpm dev

api-dev: ## API from sources: migrations and start (needs DATABASE_URL; set in the dev container)
	cd apps/api && go run ./cmd/api migrate && go run ./cmd/api serve

format: ## Bring code to style: Prettier and ESLint --fix for TS, gofumpt and goimports for Go
	pnpm format
	cd apps/api && golangci-lint fmt ./...

check: check-web check-api check-docker check-scripts check-codex ## All checks: the same as CI runs

# Checking agent files against the build is here, not in check-scripts: the build needs Node
# and workspace dependencies, which the scripts job lacks. `pnpm -r run check` builds the CLI.
check-web: ## Style, types, tests and build of frontend and packages; agent files match the harness
	pnpm lint
	pnpm -r run check
	node packages/cli/dist/cyberzavod.mjs sync --check

# The Go formatting hook test is here, not in check-scripts: the hook needs Go and golangci-lint,
# and they are present wherever check-api runs (the api CI job, the dev container).
check-api: ## golangci-lint, tests and build of the API, Go formatting hook test
	cd apps/api && golangci-lint run ./... && go test ./... && go build -o /dev/null ./cmd/api
	.claude/hooks/format-go.test.sh

check-docker: ## Build the API and site Docker images
	docker build -q -t cyberzavod-api:check apps/api >/dev/null
	docker build -q -f apps/web/Dockerfile -t cyberzavod-web:check . >/dev/null

# The end-to-end run needs npm (it installs the pinned Codex, e2e/codex-version.ts) and is slow, so it
# stays out of check-web, which the stop hook runs. CODEX_E2E_BIN=<path> uses a Codex that is
# already installed, for runs without network.
check-codex: ## Real `codex exec` against a mock model API: trust, hooks, subagent role, recording
	pnpm --filter @cyberzavod/adapter-codex e2e

check-scripts: ## Dev container and project hook shell scripts: shellcheck and hook tests
	docker run --rm -v "$(CURDIR):/mnt:ro" koalaman/shellcheck:stable -x \
		/mnt/.devcontainer/init-firewall.sh /mnt/.claude/hooks/format-go.sh \
		/mnt/.claude/hooks/format-go.test.sh /mnt/.claude/hooks/session-start.sh \
		/mnt/.claude/hooks/session-start.test.sh
	.claude/hooks/session-start.test.sh
