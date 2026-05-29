# Cyblocks Frontend

The frontend is a React/Vite canvas for building environment graphs.

## Main Files

- `src/App.jsx`: canvas state, block catalog, connector behavior, sample graph, export payloads, backend API calls.
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

## Export

`Download IDE JSON`, `Compile`, and `Deploy` all use the visible board export from `buildVisibleGraph()` in `src/App.jsx`.
The export keeps block kinds, positions, service metadata, finding metadata, connector kinds, and connector direction.

## Backend Controls

- `Compile` posts the visible board to `POST /api/compile`.
- `Deploy` posts the visible board to `POST /api/deploy`.
- `End Deployment` posts the visible board to `POST /api/teardown` and removes only the compiled project.
- `Quit` posts to `POST /api/quit`, which removes all Cyblocks-owned Docker containers/networks before stopping the frontend and backend dev servers.

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
