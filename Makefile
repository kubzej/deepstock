verify:
	cd frontend && npm run lint
	cd frontend && npm run build
	cd backend && python3 -m pytest
