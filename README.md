# cyblocks

Visual block canvas experiments.

Run the React prototype:

```bash
cd frontend
npm install
npm run dev
```

Run the local compile/deploy API in another terminal when you want the frontend buttons to call the backend:

```bash
python3 backend/scripts/api_server.py
```

The backend expects the Docker CLI to reach a running Docker Engine. On Linux, start Docker with your distro's service manager and verify access before deploying:

```bash
sudo systemctl start docker
docker info
```

Then open the printed local frontend URL. The prototype is intentionally nondescript: drag host and router blocks onto a plain board, edit VM-style host attributes, connect block ports, use `Download IDE JSON` to save the visible graph, use `Compile`, `Deploy`, `Status`, and `End Deployment` to work through the local backend, or use `Quit` to stop the local frontend/backend dev servers.

To start from the frontend and run the local three-host experiment:

```bash
cd frontend
npm run dev
```

In the browser, click `Three Host`, adjust the board if needed, then either click `Compile` and `Deploy` or click `Download IDE JSON`. The current sample includes three hosts connected through one router, which compiles into three Docker bridge subnets plus one router container. From the repo root, the downloaded graph can also be run manually:

```bash
backend/scripts/run_three_host_example.sh ~/Downloads/routed-three-host.ide.json
```

Stop it with:

```bash
python3 backend/scripts/teardown_docker.py backend/generated/routed-three-host.intermediate.json
```

Design notes for the future Docker/container mapping live in [docs/docker-canvas-ide-chat-helper.md](/Users/mycomputer/Documents/GitHub/cyblocks/docs/docker-canvas-ide-chat-helper.md).
