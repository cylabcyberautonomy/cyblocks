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

Then open the printed local frontend URL. The prototype is intentionally nondescript: drag host and router blocks onto a plain board, edit VM-style host attributes, connect block ports, use `Download IDE JSON` to save the visible graph, or use `Compile`, `Deploy`, and `Status` to work through the local backend.

To start from the frontend and run the local three-host experiment:

```bash
cd frontend
npm run dev
```

In the browser, click `Three Host`, adjust the board if needed, then either click `Compile` and `Deploy` or click `Download IDE JSON`. The current sample includes three hosts connected through one router, which compiles into three Docker bridge subnets plus one router container. From the repo root, the downloaded graph can also be run manually:

```bash
PATH="/opt/homebrew/bin:$PATH" colima start --cpu 2 --memory 4 --disk 20
backend/scripts/run_three_host_example.sh ~/Downloads/routed-three-host.ide.json
```

Stop it with:

```bash
PATH="/opt/homebrew/bin:$PATH" DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" \
  python3 backend/scripts/teardown_docker.py backend/generated/three-host-http.intermediate.json
```

Design notes for the future Docker/container mapping live in [docs/docker-canvas-ide-chat-helper.md](/Users/mycomputer/Documents/GitHub/cyblocks/docs/docker-canvas-ide-chat-helper.md).
