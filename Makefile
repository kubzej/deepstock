verify:
	cd frontend && npm run lint
	cd frontend && npm run build
	cd backend && python3 -m pytest

# Regenerate the Python lock files (needs uv). Resolved for what production and CI run:
# Linux, Python 3.12. Versions already in a lock file stay; add -U to move them forward.
LOCK = uv pip compile --python-version 3.12 --python-platform linux --generate-hashes

lock:
	cd backend && $(LOCK) requirements.in -o requirements.txt
	cd backend && $(LOCK) requirements-dev.in -c requirements.txt -o requirements-dev.txt
	cd mcp && $(LOCK) requirements.in -o requirements.txt
