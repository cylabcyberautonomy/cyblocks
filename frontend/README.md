# Cyblocks Frontend

The frontend is a React/Vite canvas for building environment graphs. The default sample is the smaller Incalmo Equifax Docker environment from the local `../Incalmo` checkout.

## Main Files

- `src/App.jsx`: canvas state, Equifax-focused block catalog, connector behavior, sample graph, export payloads, backend API calls.
- `src/styles.css`: canvas layout, block shapes, connector styling, responsive layout.
- `vite.config.js`: Vite dev-server configuration.

## Block Kinds

- `host`: deployable host node.
- `router`: topology gateway node.
- `service`: software/service exposed by a host.
- `vulnerability`: CVE associated with a service.
- `misconfiguration`: non-CVE security finding such as weak trust, exposed shell behavior, or poor credential handling.

## Connector Kinds

- `topology`: network-only link between host/router blocks.
- `service`: directed service relationship.
- `vulnerability`: directed service-to-CVE or service-to-misconfiguration exposure.
- `access`: directed multi-host relationship, such as one host holding a key that reaches another host.

Topology links are visually distinct from service, vulnerability, misconfiguration, and access links so the network graph does not look the same as the attack-path graph.
Topology links can also show a directional arrow when their `directed` flag is set; the Incalmo Equifax sample uses that to show `attacker -> webserver -> db` traversal while the actual Docker networks still come from explicit host interfaces.

## Export

`Download IDE JSON`, `Compile`, and `Deploy` all use the visible board export from `buildVisibleGraph()` in `src/App.jsx`.
The export keeps block kinds, positions, service metadata, finding metadata, connector kinds, and connector direction.
The separate Incalmo pane exports runtime metadata as top-level `runtimeBlocks[]`; those items are not part of the visible host/network canvas and do not affect local Docker topology.
Host properties include a structured `networkInterfaces[]` editor for multi-homed hosts such as the Incalmo webserver.

## Backend Controls

- `Compile` posts the visible board to `POST /api/compile`.
- The topbar `Equifax Sample` button and the Incalmo pane's `Equifax` button load the packaged Equifax model without adding C2/agent blocks to the canvas.
- The Incalmo pane's `Export Compose` button posts the board to `POST /api/export/incalmo` and writes a Compose project under `backend/generated/<board>-compose`.
- The Incalmo pane's project/strategy/environment/C2 fields are exported as top-level `incalmo` metadata, so Equifax-specific values are sample data rather than hardcoded compiler behavior.
- The Incalmo pane's key form posts to `POST /api/incalmo/api-key` and updates the local Incalmo `.env`.
- The Incalmo pane's monitor calls `GET /api/incalmo/status?name=<board>` for Compose service state, C2 reachability, and recent Incalmo output logs.
- `Deploy` posts plain `docker://` boards to `POST /api/deploy`; Incalmo boards relabel that topbar action to `Export Compose` and use `POST /api/export/incalmo`.
- `End Deployment` posts the visible board to `POST /api/teardown` and removes only the compiled project.
- `Quit` posts to `POST /api/quit`, which removes all Cyblocks-owned Docker containers/networks, stops the macOS Colima VM when Cyblocks is using it, then stops the frontend and backend dev servers.

## Local Development

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Build:

```bash
npm run build
```
