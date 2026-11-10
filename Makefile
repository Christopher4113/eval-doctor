.PHONY: dev install test cache
SHELL := /bin/bash
ENV := set -a; [ -f .env ] && . ./.env; set +a;

install:
	python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
	npm --prefix frontend install

dev:
	@$(ENV) trap 'kill 0' EXIT; .venv/bin/python backend/app.py & npm --prefix frontend run dev

test:
	cd backend && ../.venv/bin/pytest -q

# Replace the mock demo transcripts with real AssemblyAI responses (needs ASSEMBLYAI_API_KEY).
cache:
	@$(ENV) cd backend && ../.venv/bin/python refresh_demo_cache.py
