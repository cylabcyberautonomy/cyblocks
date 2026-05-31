# Incalmo Compose Export

This path turns a Cyblocks IDE graph or intermediate DSL into an Incalmo-compatible Docker Compose project. The current POC target reproduces the mini Equifax environment packaged in the local Incalmo checkout under `docker/equifax`; this is the primary example because it is much smaller than the MHBench Equifax environment.

## Entry Point

From the browser, use the separate `Incalmo` pane. Press `Equifax` to load the mini-environment and `Export Compose` to write the Compose project under:

```text
backend/generated/incalmo-equifax-compose
```

The CLI path is:

```bash
python3 backend/scripts/export_incalmo_compose.py \
  backend/examples/incalmo-equifax.ide.json \
  --out-dir backend/generated/incalmo-equifax-compose \
  --incalmo-root ../Incalmo \
  --project incalmo-equifax \
  --debug
```

The input can be either:

- IDE JSON, such as `backend/examples/incalmo-equifax.ide.json`.
- Intermediate DSL JSON, such as `backend/generated/incalmo-equifax.intermediate.json`.

## Generated Files

- `compose.yml`: Docker Compose file with Incalmo attacker, generated networks, and target services.
- `incalmo.config.json`: config for `Incalmo/config/config.json`.
- `intermediate.json`: compiled Cyblocks DSL used by the exporter.
- `source.ide.json`: original IDE JSON when the input was an IDE graph.
- `README.md`: run commands scoped to the generated output directory.

## Runtime Pane

The frontend keeps Incalmo runtime controls out of the host/network canvas. Runtime items such as command-and-control and agents live in top-level IDE JSON as `runtimeBlocks[]`; the backend compiles them into intermediate `controlBlocks[]`. They are metadata for the Incalmo exporter and monitor, not deployable target hosts and not topology members.

The current Equifax POC includes:

- `incalmo-c2`: command-and-control endpoints on the attacker container, publishing `8888`, `6379`, and `5678`.
- `sandcat-agent`: initial Sandcat agent metadata tied to the attacker side of the run.

The C2 block controls which attacker ports the generated Compose file publishes. The agent block is preserved in the DSL for Incalmo run context, but does not create a Docker service.

## Equifax Mini Environment Shape

The checked-in example models:

- `attacker`: `192.168.199.10` on `attacker_network` and `192.168.200.10` on `web_network`.
- `webserver`: `192.168.200.20` on `web_network` and `192.168.201.20` on `db_network`.
- `db`: `192.168.201.100` on `db_network`.
- Apache Struts on webserver port `8080` with `CVE-2017-5638`.
- SSH on database port `22`.
- A webserver-to-database SSH key trust misconfiguration.
- Incalmo command-and-control and initial agent metadata in the separate runtime pane.

The Equifax Dockerfiles and Incalmo `EquifaxStrategy` are the source of truth for this POC. The CVE/misconfiguration blocks are IDE-visible annotations of that packaged environment, not MHBench playbook generation.

The Equifax Docker paths are data in the sample, not exporter logic. Target hosts set `host.incalmo.buildContext` to `docker/equifax/webserver` or `docker/equifax/database`; another board can point at different Incalmo build contexts or use normal `docker://image:tag` host images.

## Backend API

The browser uses these Incalmo-specific endpoints:

- `POST /api/export/incalmo`: compiles the visible board and writes `backend/generated/<board>-compose`.
- `POST /api/incalmo/api-key`: writes an LLM provider key to `../Incalmo/.env` without returning the secret. Supported providers are `openai`, `anthropic`, `google`, `deepseek`, and `mistral`.
- `GET /api/incalmo/status?name=incalmo-equifax`: reports whether the generated Compose project exists, runs Compose `ps --format json` with a `docker-compose` fallback when Docker's plugin is hidden by the isolated config, probes the local C2 URL, and tails the latest file under `../Incalmo/output`.

## Run Incalmo

```bash
cd ../Incalmo
cp ../cyblocks/backend/generated/incalmo-equifax-compose/incalmo.config.json config/config.json
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose -p incalmo-equifax -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml up --build
```

Run the strategy in another terminal:

```bash
cd ../Incalmo
docker compose -p incalmo-equifax -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml exec attacker uv run main.py
```

Cleanup:

```bash
cd ../Incalmo
docker compose -p incalmo-equifax -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml down -v --remove-orphans
```

## Notes

- The exporter reuses Incalmo's existing attacker and `docker/equifax` build contexts rather than copying those Dockerfiles into Cyblocks.
- On Apple Silicon, keep `DOCKER_DEFAULT_PLATFORM=linux/amd64` because the Incalmo Equifax webserver Dockerfile downloads an amd64 Go toolchain.
- The output is Docker Compose for Incalmo, not the local Cyblocks Docker deploy target.
