.PHONY: install format lint test test-all typecheck dev gen-contracts

install:
	$(MAKE) -C backend install
	cd frontend && npm ci

format:
	$(MAKE) -C backend format
	cd frontend && npm run format

lint:
	$(MAKE) -C backend lint
	cd frontend && npm run lint

test:
	$(MAKE) -C backend test
	cd frontend && npm test

test-all:
	$(MAKE) -C backend test-all
	cd frontend && npm test

typecheck:
	$(MAKE) -C backend typecheck
	cd frontend && npx tsc --noEmit

dev:
	$(MAKE) -C backend dev &
	cd frontend && npm run start

gen-contracts:
	cd frontend/packages/nexus-contracts && npm run gen:local
