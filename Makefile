# Single source of truth for the build/test pipeline. `make ci` runs the whole
# thing locally; any CI system only needs to call these targets.

SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help install build typecheck test smoke sec-probe ci clean

TARGET ?= http://localhost:3000

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install every workspace from the lockfile
	npm ci --no-audit --no-fund --loglevel=error

build: ## Build all workspaces (turbo; @whispers/protocol -> dist/)
	npx turbo run build

typecheck: ## Type-check the mobile app and the protocol package
	npx turbo run typecheck

test: ## Unit + integration tests across all workspaces
	npx turbo run test

smoke: build ## Backend end-to-end signed-flow smoke test (temp DB, no network)
	npm run smoke --workspace @whispers/backend

sec-probe: ## Security probe against a running relay (TARGET=url, default :3000). Run against a freshly started server.
	npm run sec-probe --workspace @whispers/backend -- $(TARGET)

ci: install build typecheck test smoke ## Full pipeline

clean: ## Remove installed deps and build output
	rm -rf node_modules apps/*/node_modules packages/*/node_modules \
	       packages/*/dist .turbo apps/*/.turbo packages/*/.turbo
