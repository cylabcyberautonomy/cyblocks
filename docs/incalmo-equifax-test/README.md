# Test Incalmo Equifax From Cyblocks

This runbook tests the Incalmo Equifax example from the Cyblocks IDE.

It assumes these folders exist:

```text
/Users/mycomputer/Documents/GitHub/cyblocks
/Users/mycomputer/Documents/GitHub/Incalmo
```

## 1. Start Docker Engine

Start Docker Engine on this PC.

Cyblocks does not need Docker Desktop specifically. It only needs the Docker CLI connected to a working Docker Engine.

If you use Colima on macOS:

```bash
colima start --cpu 2 --memory 4 --disk 20
```

If you use Linux Docker Engine:

```bash
sudo systemctl start docker
```

Then check Docker from any terminal:

```bash
docker info
docker compose version
```

Continue only after both commands work.

## 2. Start The Cyblocks Backend

Open Terminal 1:

```bash
cd /Users/mycomputer/Documents/GitHub/cyblocks
python3 backend/scripts/api_server.py
```

Leave this terminal running.

Expected line:

```text
Cyblocks backend API listening on http://127.0.0.1:8787
```

## 3. Start The Cyblocks Frontend

Open Terminal 2:

```bash
cd /Users/mycomputer/Documents/GitHub/cyblocks/frontend
npm run dev
```

Leave this terminal running.

Open the browser:

```text
http://127.0.0.1:5173
```

## 4. Load And Export Equifax In The IDE

In the Cyblocks page:

1. Click `Equifax Sample`.
2. In the `Incalmo` panel, check `Strategy`.
3. The default is `claude-4.5-haiku`, which uses an Anthropic key.
4. If you want to use an OpenAI key instead, change `Strategy` to `gpt-4o` or `gpt-4o-mini`.
5. Pick the matching `LLM provider`.
6. Paste the API key.
7. Click `Save Key`.
8. Click `Compile`.
9. Click `Export Compose`.

You can use either `Export Compose` button:

- The top toolbar button.
- The `Export Compose` button inside the `Incalmo` panel.

Expected generated folder:

```text
/Users/mycomputer/Documents/GitHub/cyblocks/backend/generated/incalmo-equifax-compose
```

## 5. Run The Generated Incalmo Environment

Open Terminal 3:

```bash
cd /Users/mycomputer/Documents/GitHub/Incalmo

cp ../cyblocks/backend/generated/incalmo-equifax-compose/incalmo.config.json config/config.json

DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose \
  -p incalmo-equifax \
  -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml \
  up --build
```

Leave this terminal running.

The first build can take several minutes.

## 6. Check The Run From The IDE

Go back to the Cyblocks browser page.

In the `Incalmo` panel:

1. Find `Monitor`.
2. Click `Refresh`.

Expected:

```text
compose: ready
c2: reachable
```

You should also see services for:

```text
attacker
webserver
db
```

Optional browser check:

```text
http://127.0.0.1:8080
```

## 7. Run The Incalmo Strategy

Open Terminal 4:

```bash
cd /Users/mycomputer/Documents/GitHub/Incalmo

docker compose \
  -p incalmo-equifax \
  -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml \
  exec attacker sh -lc 'for i in $(seq 1 60); do curl -fsS http://attacker:8888/agents >/dev/null 2>&1 && echo "C2 ready" && exit 0; sleep 2; done; echo "C2 not ready"; exit 1'

docker compose \
  -p incalmo-equifax \
  -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml \
  exec attacker uv run main.py
```

It is normal to see repeated `[DEBUG] Current environment state` lines while the agent is working.

Good signs in the newest `output/.../actions.json` file:

```text
VulnerableServiceFound
InfectedNewHost
SSHCredentialFound
ExfiltratedData
```

Press `Ctrl+C` to stop the strategy run.

## 8. Clean Up

When finished, stop the Incalmo containers.

In a terminal:

```bash
cd /Users/mycomputer/Documents/GitHub/Incalmo

docker compose \
  -p incalmo-equifax \
  -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml \
  down -v --remove-orphans
```

Then stop the Cyblocks dev servers:

1. Go back to the Cyblocks browser page.
2. Click `Quit`.

## Troubleshooting

If `docker info` fails:

```text
Start Docker Engine and try again.
```

If the browser cannot reach the backend:

```text
Make sure Terminal 1 is still running python3 backend/scripts/api_server.py.
```

If the browser cannot reach the frontend:

```text
Make sure Terminal 2 is still running npm run dev.
```

If Incalmo needs an LLM API key:

1. Use the `LLM provider` dropdown in the `Incalmo` panel.
2. Paste the key into the `API key` field.
3. Click `Save Key`.
4. If an Incalmo strategy run is already in progress, stop it and start a new run.

If the strategy starts and then stops right away, check the newest LLM log:

```bash
cd /Users/mycomputer/Documents/GitHub/Incalmo
ls -td output/* | head
tail -n 80 output/PASTE_NEWEST_FOLDER_HERE/llm.log
```

If the log says `model ... not found`, use `claude-4.5-haiku`, click `Save Key`, click `Export Compose`, and run Step 7 again.

Do not put API keys in this README.
