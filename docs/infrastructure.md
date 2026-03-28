# Infrastructure

## Docker Compose

```yaml
services:
  backend:
    build: { context: ./backend, dockerfile: Dockerfile }
    ports: ["8080:8080"]
    env_file: [.env]
    volumes: ["./backend:/app:z"]

  frontend:
    build: { context: ./frontend, dockerfile: Dockerfile }
    ports: ["3000:3000"]
    environment: ["VITE_API_URL=http://backend:8080"]
    depends_on: [backend]
    volumes:
      - "./frontend:/app:z"
      - "frontend_nm:/app/node_modules"

volumes:
  frontend_nm:
```

**Notes:**
- No `version:` field — obsolete in modern Docker Compose.
- `:z` suffix on bind mounts is required on SELinux-enforcing systems (Fedora, RHEL). Remove on macOS/Windows.
- `frontend_nm` named volume prevents the bind mount from shadowing the container's `node_modules`.
- `VITE_API_URL=http://backend:8080` uses the Docker service name — NOT `localhost` (which would resolve to the frontend container itself).

---

## Environment Variables

File: `.env` (repo root, not committed — use `.env.example` as template)

```env
HRFLOW_API_KEY=your_hrflow_api_key
HRFLOW_USER_EMAIL=your_hrflow_user_email
HRFLOW_SOURCE_KEY=your_hrflow_source_key
HRFLOW_BOARD_KEY=your_hrflow_board_key

LLM_API_KEY=your_openrouter_api_key
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=nvidia/nemotron-3-super-120b-a12b:free
```

All env vars are loaded via `pydantic-settings` in `backend/config.py`. The `LLM_MODEL` default is set in `config.py` and overridable via the env file.

---

## Backend Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]
```

Hot-reload is enabled (`--reload`) via the volume mount of `./backend:/app:z`.

## Frontend Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
CMD ["npm", "run", "dev"]
```

Vite dev server with HMR. The `/api` proxy in `vite.config.js` forwards all `/api/*` requests to `http://backend:8080`.

---

## Python Dependencies

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
httpx==0.27.2
python-dotenv==1.0.1
pydantic==2.9.2
pydantic-settings==2.5.2
openai==1.51.0
python-multipart==0.0.12
```

`python-multipart` is required for `multipart/form-data` file uploads (PDF resume parsing endpoint).

---

## Running the Stack

```bash
# Build images and start
sudo docker compose up --build

# Detached mode
sudo docker compose up -d --build

# Rebuild only backend after Python changes
sudo docker compose up --build backend

# Tail logs
sudo docker compose logs -f

# Stop and remove containers
sudo docker compose down
```

**Access:**
- Frontend: http://localhost:3000
- Backend Swagger UI: http://localhost:8080/docs

---

## FastAPI Configuration

`main.py` initialises FastAPI with:
```python
app = FastAPI(redirect_slashes=False)
```

`redirect_slashes=False` is required. Without it, requests like `GET /api/jobs` get redirected to `/api/jobs/` with a 307, which the browser follows but loses the proxy context, causing connection errors.

All router routes use empty string `""` for root paths (not `"/"`):
```python
@router.get("")     # matches /api/jobs
@router.post("")    # matches /api/jobs
```
