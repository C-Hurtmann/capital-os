.PHONY: dev backend frontend

export PATH := $(HOME)/.local/bin:$(PATH)

BACKEND_PORT := 8001

dev:
	$(MAKE) -j2 backend frontend

backend:
	cd backend && uv run uvicorn app.main:app \
		--reload \
		--host 127.0.0.1 \
		--port $(BACKEND_PORT)

frontend:
	bash -c 'if [ -s "$$HOME/.nvm/nvm.sh" ]; then . "$$HOME/.nvm/nvm.sh"; nvm use --silent || exit; fi; cd frontend && npm run dev'
