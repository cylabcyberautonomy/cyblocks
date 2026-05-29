import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Cloud, Code2, FileDown, Power, RefreshCcw, Rocket, Square, X } from "lucide-react";

const BLOCK_WIDTH = 132;
const BLOCK_HEIGHT = 56;
const API_BASE_URL = import.meta.env.VITE_CYBLOCKS_API_URL || "http://127.0.0.1:8787";
const DEFAULT_BOARD_NAME = "routed-three-host";
const DEFAULT_OS_IMAGE_PATH = "docker://nginx:alpine";
const DEFAULT_ROUTER_IMAGE_PATH = "docker://alpine:latest";
const DEFAULT_CONNECTION_LABEL = "http";
const DEFAULT_CONNECTION_PORT = "80";
const STORAGE_KEY = "simple-block-board-state-v7";

const BLOCK_TYPES = [
  { id: "host-small", kind: "host", label: "host.small", color: "#ff8a7a", ramGb: 2, storageGb: 32 },
  { id: "host-medium", kind: "host", label: "host.medium", color: "#ffd166", ramGb: 4, storageGb: 64 },
  { id: "host-large", kind: "host", label: "host.large", color: "#74d3ae", ramGb: 8, storageGb: 128 },
  { id: "host-storage", kind: "host", label: "host.storage", color: "#8fb8ff", ramGb: 4, storageGb: 256 },
  { id: "router", kind: "router", label: "router", color: "#f4f7fb" },
  { id: "host-custom", kind: "host", label: "host.custom", color: "#d7a8ff", ramGb: 4, storageGb: 64 }
];

const PORT_OPTIONS = [
  { value: "22", label: "22 / ssh" },
  { value: "80", label: "80 / http" },
  { value: "443", label: "443 / https" },
  { value: "5432", label: "5432 / postgres" },
  { value: "3306", label: "3306 / mysql" },
  { value: "6379", label: "6379 / redis" },
  { value: "8080", label: "8080 / app" },
  { value: "custom", label: "custom" }
];

const BLOCK_TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map((type) => [type.id, type]));

function loadCanvas() {
  const fallback = createThreeHostCanvas();

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;

    if (Array.isArray(parsed)) {
      return { name: fallback.name, blocks: normalizeBlocks(parsed), connections: [], playbooks: [] };
    }

    if (!parsed) {
      return fallback;
    }

    return {
      name: typeof parsed?.name === "string" && parsed.name.trim() ? parsed.name : fallback.name,
      blocks: normalizeBlocks(Array.isArray(parsed?.blocks) ? parsed.blocks : []),
      connections: normalizeConnections(Array.isArray(parsed?.connections) ? parsed.connections : []),
      playbooks: normalizePlaybooks(parsed?.playbooks)
    };
  } catch {
    return fallback;
  }
}

function createHostDefaults(typeId, index = 1) {
  const type = BLOCK_TYPE_MAP[typeId] || BLOCK_TYPES[0];

  return {
    hostname: `${type.label.replace(".", "-")}-${index}`,
    osImagePath: DEFAULT_OS_IMAGE_PATH,
    ramGb: type.ramGb,
    storageGb: type.storageGb,
    externalDrives: []
  };
}

function createRouterDefaults(index = 1) {
  return {
    name: `router-${index}`,
    imagePath: DEFAULT_ROUTER_IMAGE_PATH
  };
}

function normalizeBlocks(blocks) {
  return blocks.map((block, index) => {
    const type = BLOCK_TYPE_MAP[block.type] || BLOCK_TYPES[0];
    const defaults = createHostDefaults(type.id, index + 1);
    const kind = block.kind || block.nodeType || type.kind || "host";

    if (kind === "router") {
      const routerDefaults = createRouterDefaults(index + 1);
      return {
        ...block,
        kind: "router",
        type: "router",
        label: block.label || "router",
        color: block.color || type.color,
        router: {
          name: block.router?.name || block.name || routerDefaults.name,
          imagePath: block.router?.imagePath || block.router?.osImagePath || routerDefaults.imagePath
        }
      };
    }

    return {
      ...block,
      kind: "host",
      type: type.id,
      label: block.label || type.label,
      color: block.color || type.color,
      host: {
        hostname: block.host?.hostname || block.hostname || defaults.hostname,
        osImagePath: block.host?.osImagePath || block.osImagePath || defaults.osImagePath,
        ramGb: numberOrDefault(block.host?.ramGb ?? block.ramGb, defaults.ramGb),
        storageGb: numberOrDefault(block.host?.storageGb ?? block.storageGb, defaults.storageGb),
        externalDrives: Array.isArray(block.host?.externalDrives)
          ? block.host.externalDrives
          : Array.isArray(block.externalDrives)
            ? block.externalDrives
            : defaults.externalDrives
      }
    };
  });
}

function normalizeConnections(connections) {
  return connections.map((connection, index) => {
    const kind = connection.kind || "service";
    return {
      ...connection,
      kind,
      label: connection.label || (kind === "topology" ? `link.${index + 1}` : index === 0 ? DEFAULT_CONNECTION_LABEL : `${DEFAULT_CONNECTION_LABEL}.${index + 1}`),
      port: kind === "topology" ? "" : String(connection.port || DEFAULT_CONNECTION_PORT)
    };
  });
}

function normalizePlaybooks(playbooks) {
  if (!Array.isArray(playbooks)) {
    return [];
  }

  return playbooks
    .filter((playbook) => playbook && typeof playbook === "object" && playbook.name)
    .map((playbook) => ({
      name: String(playbook.name),
      args: playbook.args && typeof playbook.args === "object" ? playbook.args : {}
    }));
}

function App() {
  const initialCanvasRef = useRef(null);
  const boardRef = useRef(null);
  const blockDragRef = useRef(null);
  const connectorDragRef = useRef(null);
  const copiedBlockRef = useRef(null);
  const paletteDragRef = useRef(null);
  if (!initialCanvasRef.current) {
    initialCanvasRef.current = loadCanvas();
  }
  const [boardName, setBoardName] = useState(() => initialCanvasRef.current.name);
  const [blocks, setBlocks] = useState(() => initialCanvasRef.current.blocks);
  const [connections, setConnections] = useState(() => initialCanvasRef.current.connections);
  const [playbooks, setPlaybooks] = useState(() => initialCanvasRef.current.playbooks || []);
  const [boardSize, setBoardSize] = useState({ width: 900, height: 520 });
  const [connectorDrag, setConnectorDrag] = useState(null);
  const [paletteDrag, setPaletteDrag] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [runState, setRunState] = useState({
    phase: "idle",
    message: "No backend run yet.",
    result: null,
    deployment: null,
    containers: [],
    error: null
  });
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) || null;
  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId) || null;
  const isBackendBusy = ["checking", "compiling", "deploying", "ending", "exporting", "quitting"].includes(runState.phase);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: boardName, blocks, connections, playbooks }));
  }, [boardName, blocks, connections, playbooks]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      setBoardSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height)
      });
    });

    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const commandKey = event.metaKey || event.ctrlKey;

      if ((event.key === "Delete" || event.key === "Backspace") && (selectedBlock || selectedConnection)) {
        event.preventDefault();

        if (selectedBlock) {
          deleteBlock(selectedBlock.id);
          return;
        }

        if (selectedConnection) {
          deleteConnection(selectedConnection.id);
        }
      }

      if (commandKey && key === "c" && selectedBlock) {
        event.preventDefault();
        copiedBlockRef.current = selectedBlock;
        setStatus(`Copied ${nodeName(selectedBlock)}`);
      }

      if (commandKey && key === "v" && copiedBlockRef.current) {
        event.preventDefault();
        pasteCopiedBlock();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [blocks.length, boardSize.height, boardSize.width, selectedBlock, selectedConnection]);

  const getBoardPoint = useCallback((event) => {
    const rect = boardRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }, []);

  const isPointInsideBoard = useCallback((clientX, clientY) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return false;
    }

    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }, []);

  const addBlockAt = useCallback(
    (typeId, x, y) => {
      const type = BLOCK_TYPE_MAP[typeId] || BLOCK_TYPES[0];
      const nextIndex = blocks.length + 1;
      const kind = type.kind || "host";
      const block = {
        id: `block-${Date.now()}-${Math.round(Math.random() * 999)}`,
        kind,
        type: type.id,
        label: type.label,
        color: type.color,
        x: clamp(Math.round(x - BLOCK_WIDTH / 2), 8, Math.max(8, boardSize.width - BLOCK_WIDTH - 8)),
        y: clamp(Math.round(y - BLOCK_HEIGHT / 2), 8, Math.max(8, boardSize.height - BLOCK_HEIGHT - 8))
      };
      if (kind === "router") {
        block.router = createRouterDefaults(nextIndex);
      } else {
        block.host = createHostDefaults(type.id, nextIndex);
      }

      setBlocks((current) => [...current, block]);
      setSelectedBlockId(block.id);
      setSelectedConnectionId(null);
      setStatus(`Added ${type.label}`);
    },
    [blocks.length, boardSize.height, boardSize.width]
  );

  useEffect(() => {
    function handlePointerMove(event) {
      if (blockDragRef.current) {
        const drag = blockDragRef.current;
        const point = getBoardPoint(event);
        const maxX = Math.max(8, boardSize.width - BLOCK_WIDTH - 8);
        const maxY = Math.max(8, boardSize.height - BLOCK_HEIGHT - 8);
        const nextX = clamp(point.x - drag.offsetX, 8, maxX);
        const nextY = clamp(point.y - drag.offsetY, 8, maxY);

        setBlocks((current) =>
          current.map((block) =>
            block.id === drag.id
              ? { ...block, x: Math.round(nextX), y: Math.round(nextY) }
              : block
          )
        );
      }

      if (connectorDragRef.current) {
        const point = getBoardPoint(event);
        const drag = {
          ...connectorDragRef.current,
          end: point
        };

        connectorDragRef.current = drag;
        setConnectorDrag(drag);
      }

      if (paletteDragRef.current) {
        const drag = {
          ...paletteDragRef.current,
          x: event.clientX,
          y: event.clientY
        };

        paletteDragRef.current = drag;
        setPaletteDrag(drag);
        setDropActive(isPointInsideBoard(event.clientX, event.clientY));
      }
    }

    function handlePointerUp(event) {
      blockDragRef.current = null;

      if (connectorDragRef.current) {
        const sourceId = connectorDragRef.current.from;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const targetId =
          target?.closest("[data-input-port]")?.getAttribute("data-input-port") ||
          target?.closest("[data-block-id]")?.getAttribute("data-block-id");

        connectorDragRef.current = null;
        setConnectorDrag(null);

        if (targetId && targetId !== sourceId) {
          setConnections((current) => {
            const exists = current.some(
              (connection) => connection.from === sourceId && connection.to === targetId
            );

            if (exists) {
              return current;
            }

            setStatus("Connected blocks");
            const connectionId = `connection-${Date.now()}-${Math.round(Math.random() * 999)}`;
            const source = blocks.find((block) => block.id === sourceId);
            const targetBlock = blocks.find((block) => block.id === targetId);
            const isTopology = blockKind(source) === "router" || blockKind(targetBlock) === "router";
            setSelectedConnectionId(connectionId);
            return [
              ...current,
              {
                id: connectionId,
                kind: isTopology ? "topology" : "service",
                label: isTopology
                  ? `link.${current.length + 1}`
                  : current.length === 0
                    ? DEFAULT_CONNECTION_LABEL
                    : `${DEFAULT_CONNECTION_LABEL}.${current.length + 1}`,
                from: sourceId,
                to: targetId,
                port: isTopology ? "" : DEFAULT_CONNECTION_PORT
              }
            ];
          });
          setSelectedBlockId(null);
        }
      }

      if (paletteDragRef.current) {
        const typeId = paletteDragRef.current.typeId;
        const droppedOnBoard = isPointInsideBoard(event.clientX, event.clientY);

        paletteDragRef.current = null;
        setPaletteDrag(null);
        setDropActive(false);

        if (droppedOnBoard) {
          const point = getBoardPoint(event);
          addBlockAt(typeId, point.x, point.y);
        }
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [addBlockAt, blocks, boardSize.height, boardSize.width, getBoardPoint, isPointInsideBoard]);

  function beginPaletteDrag(event, typeId) {
    if (event.button !== 0) {
      return;
    }

    const type = BLOCK_TYPE_MAP[typeId];
    if (!type) {
      return;
    }

    const drag = {
      typeId,
      label: type.label,
      color: type.color,
      x: event.clientX,
      y: event.clientY
    };

    event.preventDefault();
    paletteDragRef.current = drag;
    setPaletteDrag(drag);
    setDropActive(isPointInsideBoard(event.clientX, event.clientY));
  }

  function beginBlockDrag(event, block) {
    if (event.button !== 0) {
      return;
    }

    const point = getBoardPoint(event);
    blockDragRef.current = {
      id: block.id,
      offsetX: point.x - block.x,
      offsetY: point.y - block.y
    };
    setSelectedBlockId(block.id);
    setSelectedConnectionId(null);
  }

  function beginConnectorDrag(event, block) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const start = {
      x: block.x + BLOCK_WIDTH,
      y: block.y + BLOCK_HEIGHT / 2
    };
    const drag = {
      from: block.id,
      start,
      end: start
    };

    connectorDragRef.current = drag;
    setConnectorDrag(drag);
    setStatus(`Connecting from ${block.label}`);
  }

  function clearBoard() {
    setBlocks([]);
    setConnections([]);
    setPlaybooks([]);
    setSelectedBlockId(null);
    setSelectedConnectionId(null);
    setStatus("Cleared board");
  }

  function updateSelectedBlockHost(patch) {
    if (!selectedBlock) {
      return;
    }

    setBlocks((current) =>
      current.map((block) =>
        block.id === selectedBlock.id
          ? {
              ...block,
              host: {
                ...block.host,
                ...patch
              }
            }
          : block
      )
    );
  }

  function updateSelectedBlockRouter(patch) {
    if (!selectedBlock) {
      return;
    }

    setBlocks((current) =>
      current.map((block) =>
        block.id === selectedBlock.id
          ? {
              ...block,
              router: {
                ...block.router,
                ...patch
              }
            }
          : block
      )
    );
  }

  function updateSelectedConnection(patch) {
    if (!selectedConnection) {
      return;
    }

    setConnections((current) =>
      current.map((connection) =>
        connection.id === selectedConnection.id
          ? {
              ...connection,
              ...patch
            }
          : connection
      )
    );
  }

  function deleteBlock(blockId) {
    const block = blocks.find((item) => item.id === blockId);

    setBlocks((current) => current.filter((item) => item.id !== blockId));
    setConnections((current) =>
      current.filter((connection) => connection.from !== blockId && connection.to !== blockId)
    );
    setSelectedBlockId(null);
    setSelectedConnectionId(null);
    setStatus(`Deleted ${nodeName(block) || "block"}`);
  }

  function deleteConnection(connectionId) {
    setConnections((current) => current.filter((connection) => connection.id !== connectionId));
    setSelectedConnectionId(null);
    setStatus("Deleted connection");
  }

  function pasteCopiedBlock() {
    const copiedBlock = copiedBlockRef.current;
    if (!copiedBlock) {
      return;
    }

    const block = {
      ...structuredClone(copiedBlock),
      id: `block-${Date.now()}-${Math.round(Math.random() * 999)}`,
      x: clamp(copiedBlock.x + 24, 8, Math.max(8, boardSize.width - BLOCK_WIDTH - 8)),
      y: clamp(copiedBlock.y + 24, 8, Math.max(8, boardSize.height - BLOCK_HEIGHT - 8))
    };
    if (blockKind(copiedBlock) === "router") {
      block.router = {
        ...copiedBlock.router,
        name: `${copiedBlock.router.name}-copy`
      };
    } else {
      block.host = {
        ...copiedBlock.host,
        hostname: `${copiedBlock.host.hostname}-copy`
      };
    }

    setBlocks((current) => [...current, block]);
    setSelectedBlockId(block.id);
    setSelectedConnectionId(null);
    setStatus(`Pasted ${nodeName(block)}`);
  }

  function removeSelectedConnection() {
    if (!selectedConnection) {
      return;
    }

    deleteConnection(selectedConnection.id);
  }

  function resetBoard() {
    const sample = createThreeHostCanvas();

    setBoardName(sample.name);
    setBlocks(sample.blocks);
    setConnections(sample.connections);
    setPlaybooks(sample.playbooks || []);
    setSelectedBlockId(sample.blocks[0]?.id || null);
    setSelectedConnectionId(null);
    setStatus("Loaded three-host graph");
  }

  function buildVisibleGraph() {
    const outputName = slugName(boardName);
    const visibleBlockIds = new Set();
    const visibleBlocks = blocks
      .filter((block) => {
        const right = block.x + BLOCK_WIDTH;
        const bottom = block.y + BLOCK_HEIGHT;
        const isVisible = block.x < boardSize.width && block.y < boardSize.height && right > 0 && bottom > 0;

        if (isVisible) {
          visibleBlockIds.add(block.id);
        }

        return isVisible;
      })
      .map((block, index) => {
        const base = {
          id: block.id,
          order: index,
          kind: blockKind(block),
          type: block.type,
          label: block.label,
          color: block.color,
          position: {
            x: block.x,
            y: block.y
          },
          size: {
            width: BLOCK_WIDTH,
            height: BLOCK_HEIGHT
          }
        };

        if (blockKind(block) === "router") {
          return {
            ...base,
            router: {
              name: block.router.name,
              imagePath: block.router.imagePath
            }
          };
        }

        return {
          ...base,
          host: {
            hostname: block.host.hostname,
            osImagePath: block.host.osImagePath,
            ramGb: block.host.ramGb,
            storageGb: block.host.storageGb,
            externalDrives: block.host.externalDrives
          }
        };
      });
    const visibleConnections = connections
      .filter((connection) => visibleBlockIds.has(connection.from) && visibleBlockIds.has(connection.to))
      .map((connection) => ({
        id: connection.id,
        kind: connection.kind || "service",
        label: connection.label,
        from: connection.from,
        to: connection.to,
        port: connection.kind === "topology" ? "" : connection.port
      }));

    return {
      kind: "block-board",
      version: 1,
      name: outputName,
      compiledAt: new Date().toISOString(),
      blockCount: visibleBlocks.length,
      connectionCount: visibleConnections.length,
      blocks: visibleBlocks,
      connections: visibleConnections,
      playbooks
    };
  }

  function downloadBlocksJson() {
    const output = buildVisibleGraph();

    const blob = new Blob([`${JSON.stringify(output, null, 2)}\n`], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const fileName = `${output.name}.ide.json`;

    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(
      `Downloaded ${output.blockCount} block${output.blockCount === 1 ? "" : "s"}, ${output.connectionCount} connection${output.connectionCount === 1 ? "" : "s"} as ${fileName}`
    );
  }

  async function postGraph(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ graph: buildVisibleGraph() })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }

    return payload;
  }

  async function fetchDeploymentStatus(name = slugName(boardName)) {
    const response = await fetch(`${API_BASE_URL}/api/status?name=${encodeURIComponent(name)}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Status failed with ${response.status}`);
    }

    return payload.status;
  }

  async function compileBoard() {
    setStatus("Compiling board");
    setRunState((current) => ({
      ...current,
      phase: "compiling",
      message: "Compiling visible board...",
      error: null
    }));

    try {
      const payload = await postGraph("/api/compile");
      setRunState({
        phase: "compiled",
        message: `Compiled ${payload.result.name}`,
        result: payload.result,
        deployment: null,
        containers: [],
        error: null
      });
      setStatus(`Compiled ${payload.result.name}`);
    } catch (error) {
      setRunState((current) => ({
        ...current,
        phase: "error",
        message: "Compile failed.",
        error: error.message
      }));
      setStatus("Compile failed");
    }
  }

  async function exportMhbenchSpec() {
    setStatus("Exporting MHBench spec");
    setRunState((current) => ({
      ...current,
      phase: "exporting",
      message: "Writing MHBench environment JSON...",
      error: null
    }));

    try {
      const payload = await postGraph("/api/export-mhbench");
      const subnetCount = payload.result.mhbench?.networks?.[0]?.subnets?.length || 0;
      const playbookCount = payload.result.mhbench?.playbooks?.length || 0;

      setRunState({
        phase: "compiled",
        message: `Exported ${payload.result.name} for MHBench; ${subnetCount} subnet${subnetCount === 1 ? "" : "s"}, ${playbookCount} playbook${playbookCount === 1 ? "" : "s"}.`,
        result: payload.result,
        deployment: null,
        containers: [],
        error: null
      });
      setStatus(`Exported MHBench spec for ${payload.result.name}`);
    } catch (error) {
      setRunState((current) => ({
        ...current,
        phase: "error",
        message: "MHBench export failed.",
        error: error.message
      }));
      setStatus("MHBench export failed");
    }
  }

  async function deployBoard() {
    setStatus("Deploying board");
    setRunState((current) => ({
      ...current,
      phase: "deploying",
      message: "Deploying visible board...",
      error: null
    }));

    try {
      const payload = await postGraph("/api/deploy");
      const liveStatus = await fetchDeploymentStatus(payload.result.name);
      const checks = payload.deployment?.checks || [];
      const passed = checks.filter((check) => check.ok).length;

      setRunState({
        phase: "deployed",
        message: `Deployed ${payload.result.name}; ${passed}/${checks.length} checks passed.`,
        result: payload.result,
        deployment: payload.deployment,
        containers: liveStatus.containers || [],
        error: null
      });
      setStatus(`Deployed ${payload.result.name}`);
    } catch (error) {
      setRunState((current) => ({
        ...current,
        phase: "error",
        message: "Deploy failed.",
        error: error.message
      }));
      setStatus("Deploy failed");
    }
  }

  async function endDeployment() {
    setStatus("Ending deployment");
    setRunState((current) => ({
      ...current,
      phase: "ending",
      message: "Removing deployed containers and networks...",
      error: null
    }));

    try {
      const payload = await postGraph("/api/teardown");
      setRunState((current) => ({
        ...current,
        phase: "idle",
        message: `Ended ${payload.result.name}; removed ${payload.teardown.removedContainers.length} container${payload.teardown.removedContainers.length === 1 ? "" : "s"} and ${payload.teardown.removedNetworks.length} network${payload.teardown.removedNetworks.length === 1 ? "" : "s"}.`,
        result: payload.result,
        deployment: null,
        containers: [],
        error: null
      }));
      setStatus(`Ended ${payload.result.name}`);
    } catch (error) {
      setRunState((current) => ({
        ...current,
        phase: "error",
        message: "End deployment failed.",
        error: error.message
      }));
      setStatus("End deployment failed");
    }
  }

  async function quitServers() {
    setStatus("Quitting app");
    setRunState((current) => ({
      ...current,
      phase: "quitting",
      message: "Stopping frontend and backend servers...",
      error: null
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/quit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Request failed with ${response.status}`);
      }

      setRunState((current) => ({
        ...current,
        phase: "idle",
        message: `Quit requested. Backend is stopping and frontend port ${payload.frontendPort} is being released.`,
        error: null
      }));
      setStatus("Quit requested");
    } catch (error) {
      setRunState((current) => ({
        ...current,
        phase: "error",
        message: "Quit failed.",
        error: error.message
      }));
      setStatus("Quit failed");
    }
  }

  async function refreshDeploymentStatus() {
    setStatus("Checking containers");
    setRunState((current) => ({
      ...current,
      phase: current.phase === "idle" ? "checking" : current.phase,
      message: "Checking deployed containers...",
      error: null
    }));

    try {
      const liveStatus = await fetchDeploymentStatus();
      setRunState((current) => ({
        ...current,
        phase: liveStatus.containers.length ? "deployed" : "compiled",
        message: liveStatus.containers.length
          ? `${liveStatus.containers.length} deployed container${liveStatus.containers.length === 1 ? "" : "s"} found.`
          : "No deployed containers found.",
        result:
          current.result ||
          (liveStatus.intermediate
            ? {
                name: liveStatus.project,
                intermediatePath: liveStatus.intermediatePath,
                intermediate: liveStatus.intermediate
              }
            : null),
        containers: liveStatus.containers || [],
        deployment: liveStatus.state || current.deployment,
        error: null
      }));
      setStatus("Container status updated");
    } catch (error) {
      setRunState((current) => ({
        ...current,
        phase: "error",
        message: "Status check failed.",
        error: error.message
      }));
      setStatus("Status check failed");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tiny canvas prototype</p>
          <h1>Block Board</h1>
        </div>
        <div className="topbar-actions" aria-label="Board actions">
          <label className="board-name-field">
            <span>Name</span>
            <input
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              aria-label="Board name"
            />
          </label>
          <button type="button" onClick={resetBoard}>
            <RefreshCcw size={17} aria-hidden="true" />
            <span>Three Host</span>
          </button>
          <button type="button" onClick={compileBoard} disabled={isBackendBusy}>
            <Code2 size={17} aria-hidden="true" />
            <span>{runState.phase === "compiling" ? "Compiling" : "Compile"}</span>
          </button>
          <button type="button" onClick={exportMhbenchSpec} disabled={isBackendBusy}>
            <Cloud size={17} aria-hidden="true" />
            <span>{runState.phase === "exporting" ? "Exporting" : "Export MHBench"}</span>
          </button>
          <button type="button" onClick={deployBoard} disabled={isBackendBusy}>
            <Rocket size={17} aria-hidden="true" />
            <span>{runState.phase === "deploying" ? "Deploying" : "Deploy"}</span>
          </button>
          <button type="button" onClick={endDeployment} disabled={isBackendBusy}>
            <Square size={17} aria-hidden="true" />
            <span>{runState.phase === "ending" ? "Ending" : "End Deployment"}</span>
          </button>
          <button type="button" onClick={refreshDeploymentStatus} disabled={isBackendBusy}>
            <Activity size={17} aria-hidden="true" />
            <span>Status</span>
          </button>
          <button type="button" onClick={downloadBlocksJson}>
            <FileDown size={17} aria-hidden="true" />
            <span>Download IDE JSON</span>
          </button>
          <button type="button" onClick={clearBoard}>
            <X size={17} aria-hidden="true" />
            <span>Clear</span>
          </button>
          <button type="button" onClick={quitServers} disabled={isBackendBusy}>
            <Power size={17} aria-hidden="true" />
            <span>{runState.phase === "quitting" ? "Quitting" : "Quit"}</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="panel palette-panel" aria-label="Block palette">
          <h2>Blocks</h2>
          <div className="palette-list">
            {BLOCK_TYPES.map((type) => (
              <button
                type="button"
                className="palette-item"
                key={type.id}
                data-type={type.id}
                style={{ "--item-color": type.color }}
                onPointerDown={(event) => beginPaletteDrag(event, type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="board-panel" aria-label="Canvas board">
          <div className="board-meta">
            <span>{blocks.length} blocks</span>
            <span>{connections.length} connections</span>
            <span>{status}</span>
          </div>
          <div
            ref={boardRef}
            className={`board${dropActive ? " is-drop-target" : ""}`}
            tabIndex={0}
            aria-label="Drag and drop board"
          >
            <svg
              className="connection-layer"
              viewBox={`0 0 ${boardSize.width} ${boardSize.height}`}
              aria-hidden="true"
            >
              {connections.map((connection) => {
                const from = blocks.find((block) => block.id === connection.from);
                const to = blocks.find((block) => block.id === connection.to);

                if (!from || !to) {
                  return null;
                }
                const path = makeConnectorPath(outputPoint(from), inputPoint(to));

                return (
                  <g
                    key={connection.id}
                    data-connection-id={connection.id}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedConnectionId(connection.id);
                      setSelectedBlockId(null);
                    }}
                  >
                    <path
                      id={`${connection.id}-path`}
                      className="connection-text-path"
                      d={path}
                    />
                    <path
                      className="connection-hitbox"
                      d={path}
                    />
                    <path
                      className={`connection-path${connection.id === selectedConnectionId ? " is-selected" : ""}`}
                      d={path}
                    />
                    <text className="connection-label" dy="-6">
                      <textPath href={`#${connection.id}-path`} startOffset="50%" textAnchor="middle">
                        {connectionLabel(connection)}
                      </textPath>
                    </text>
                  </g>
                );
              })}
              {connectorDrag && (
                <path
                  className="connection-path connection-path-preview"
                  d={makeConnectorPath(connectorDrag.start, connectorDrag.end)}
                />
              )}
            </svg>
            <div className="block-layer">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className={`block block-${blockKind(block)}${block.id === selectedBlockId ? " is-selected" : ""}`}
                  data-block-id={block.id}
                  style={{
                    left: block.x,
                    top: block.y,
                    "--block-color": block.color
                  }}
                  onPointerDown={(event) => beginBlockDrag(event, block)}
                >
                  <span className="port port-in" data-input-port={block.id} aria-hidden="true" />
                  <span className="block-label">{nodeName(block)}</span>
                  <span className="block-meta">{blockMeta(block)}</span>
                  <button
                    type="button"
                    className="port port-out"
                    data-output-port={block.id}
                    aria-label={`Connect from ${block.label}`}
                    onPointerDown={(event) => beginConnectorDrag(event, block)}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="panel properties-panel" aria-label="Properties">
          <h2>Properties</h2>
          {selectedBlock && blockKind(selectedBlock) === "host" && (
            <form className="properties-form">
              <p className="properties-kicker">{selectedBlock.label}</p>
              <label>
                Hostname
                <input
                  value={selectedBlock.host.hostname}
                  onChange={(event) => updateSelectedBlockHost({ hostname: event.target.value })}
                />
              </label>
              <label>
                OS image path
                <input
                  value={selectedBlock.host.osImagePath}
                  onChange={(event) => updateSelectedBlockHost({ osImagePath: event.target.value })}
                />
              </label>
              <label>
                RAM (GB)
                <input
                  type="number"
                  min="1"
                  value={selectedBlock.host.ramGb}
                  onChange={(event) =>
                    updateSelectedBlockHost({ ramGb: numberOrDefault(event.target.value, 1) })
                  }
                />
              </label>
              <label>
                Storage (GB)
                <input
                  type="number"
                  min="1"
                  value={selectedBlock.host.storageGb}
                  onChange={(event) =>
                    updateSelectedBlockHost({ storageGb: numberOrDefault(event.target.value, 1) })
                  }
                />
              </label>
              <label>
                External drives
                <textarea
                  rows={5}
                  placeholder="/Volumes/data.img"
                  value={selectedBlock.host.externalDrives.join("\n")}
                  onChange={(event) =>
                    updateSelectedBlockHost({
                      externalDrives: event.target.value
                        .split("\n")
                        .map((drive) => drive.trim())
                        .filter(Boolean)
                    })
                  }
                />
              </label>
              <div className="hotkeys-panel" aria-label="Available hotkeys">
                <strong>Hotkeys</strong>
                <span>Delete: delete host</span>
                <span>Cmd/Ctrl+C: copy host</span>
                <span>Cmd/Ctrl+V: paste host</span>
              </div>
            </form>
          )}

          {selectedBlock && blockKind(selectedBlock) === "router" && (
            <form className="properties-form">
              <p className="properties-kicker">{selectedBlock.label}</p>
              <label>
                Router name
                <input
                  value={selectedBlock.router.name}
                  onChange={(event) => updateSelectedBlockRouter({ name: event.target.value })}
                />
              </label>
              <label>
                Router image path
                <input
                  value={selectedBlock.router.imagePath}
                  onChange={(event) => updateSelectedBlockRouter({ imagePath: event.target.value })}
                />
              </label>
              <div className="hotkeys-panel" aria-label="Available hotkeys">
                <strong>Hotkeys</strong>
                <span>Delete: delete router</span>
                <span>Cmd/Ctrl+C: copy router</span>
                <span>Cmd/Ctrl+V: paste router</span>
              </div>
            </form>
          )}

          {selectedConnection && (
            <form className="properties-form">
              <p className="properties-kicker">
                {blockName(blocks, selectedConnection.from)} to {blockName(blocks, selectedConnection.to)}
              </p>
              <label>
                Connector type
                <select
                  value={selectedConnection.kind || "service"}
                  onChange={(event) =>
                    updateSelectedConnection({
                      kind: event.target.value,
                      port: event.target.value === "topology" ? "" : selectedConnection.port || DEFAULT_CONNECTION_PORT
                    })
                  }
                >
                  <option value="service">service</option>
                  <option value="topology">topology</option>
                </select>
              </label>
              <label>
                Connector name
                <input
                  value={selectedConnection.label}
                  onChange={(event) => updateSelectedConnection({ label: event.target.value })}
                />
              </label>
              {(selectedConnection.kind || "service") !== "topology" && (
                <label>
                  Port
                  <select
                    value={portSelectValue(selectedConnection.port)}
                    onChange={(event) =>
                      updateSelectedConnection({
                        port: event.target.value === "custom" ? "" : event.target.value
                      })
                    }
                  >
                    {PORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(selectedConnection.kind || "service") !== "topology" && portSelectValue(selectedConnection.port) === "custom" && (
                <label>
                  Custom port
                  <input
                    inputMode="numeric"
                    value={selectedConnection.port}
                    onChange={(event) => updateSelectedConnection({ port: event.target.value })}
                  />
                </label>
              )}
              <button type="button" className="remove-button" onClick={removeSelectedConnection}>
                Remove connection
              </button>
              <div className="hotkeys-panel" aria-label="Available hotkeys">
                <strong>Hotkeys</strong>
                <span>Delete: delete connector</span>
              </div>
            </form>
          )}

          {!selectedBlock && !selectedConnection && (
            <p className="properties-empty">Select a block or connector.</p>
          )}

          <section className={`run-status run-status-${runState.phase}`} aria-label="Run status">
            <div className="run-status-header">
              <strong>Run Status</strong>
              <span>{runState.phase}</span>
            </div>
            <p>{runState.message}</p>
            {runState.error && <pre className="run-error">{runState.error}</pre>}
            {runState.result && (
              <dl className="run-details">
                <div>
                  <dt>Intermediate</dt>
                  <dd>{fileName(runState.result.intermediatePath)}</dd>
                </div>
                {runState.result.mhbenchPath && (
                  <div>
                    <dt>MHBench</dt>
                    <dd>{fileName(runState.result.mhbenchPath)}</dd>
                  </div>
                )}
                <div>
                  <dt>Hosts</dt>
                  <dd>{runState.result.intermediate?.hosts?.length || 0}</dd>
                </div>
                <div>
                  <dt>Routers</dt>
                  <dd>{runState.result.intermediate?.routers?.length || 0}</dd>
                </div>
                <div>
                  <dt>Subnets</dt>
                  <dd>{runState.result.intermediate?.networks?.length || 0}</dd>
                </div>
                <div>
                  <dt>Connectors</dt>
                  <dd>{runState.result.intermediate?.connections?.length || 0}</dd>
                </div>
              </dl>
            )}
            {runState.deployment?.checks?.length > 0 && (
              <div className="check-list">
                {runState.deployment.checks.map((check) => (
                  <span key={check.connection} className={check.ok ? "check-ok" : "check-failed"}>
                    {check.connection}: {check.ok ? "ok" : "failed"}
                  </span>
                ))}
              </div>
            )}
            {runState.result?.intermediate?.networks?.length > 0 && (
              <div className="subnet-list" aria-label="Compiled subnet map">
                <strong>Subnets</strong>
                {runState.result.intermediate.networks.map((network) => (
                  <div key={network.id} className="subnet-row">
                    <span>{network.id}</span>
                    <span>{network.cidr}</span>
                    <small>{subnetMemberText(network)}</small>
                  </div>
                ))}
              </div>
            )}
            {runState.containers.length > 0 && (
              <div className="container-list">
                {runState.containers.map((container) => (
                  <div key={container.name} className="container-row">
                    <div>
                      <span>{container.name}</span>
                      <small>{container.networks || "no networks"}</small>
                    </div>
                    <span>{container.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </main>

      {paletteDrag && (
        <div
          className="palette-item drag-ghost"
          style={{
            "--item-color": paletteDrag.color,
            left: paletteDrag.x,
            top: paletteDrag.y
          }}
        >
          {paletteDrag.label}
        </div>
      )}
    </div>
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createThreeHostCanvas() {
  const hosts = [
    { id: "linux-1", x: 92, y: 80, color: BLOCK_TYPES[0].color },
    { id: "linux-2", x: 92, y: 300, color: BLOCK_TYPES[1].color },
    { id: "linux-3", x: 520, y: 300, color: BLOCK_TYPES[2].color }
  ];

  return {
    name: DEFAULT_BOARD_NAME,
    blocks: [
      ...hosts.map((host, index) => ({
        id: host.id,
        kind: "host",
        type: "host-small",
        label: "host.small",
        color: host.color,
        host: {
          hostname: host.id,
          osImagePath: DEFAULT_OS_IMAGE_PATH,
          ramGb: 1,
          storageGb: 8,
          externalDrives: []
        },
        x: host.x,
        y: host.y,
        order: index
      })),
      {
        id: "router-1",
        kind: "router",
        type: "router",
        label: "router",
        color: BLOCK_TYPE_MAP.router.color,
        router: createRouterDefaults(1),
        x: 320,
        y: 190,
        order: 3
      }
    ],
    connections: [
      {
        id: "linux-1-to-router-1",
        kind: "topology",
        label: "subnet.web",
        from: "linux-1",
        to: "router-1",
        port: ""
      },
      {
        id: "linux-2-to-router-1",
        kind: "topology",
        label: "subnet.internal",
        from: "linux-2",
        to: "router-1",
        port: ""
      },
      {
        id: "linux-3-to-router-1",
        kind: "topology",
        label: "subnet.backend",
        from: "linux-3",
        to: "router-1",
        port: ""
      }
    ],
    playbooks: [
      {
        name: "wait_for_port",
        args: {
          host: "linux-1",
          port: 80
        }
      }
    ]
  };
}

function numberOrDefault(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function blockKind(block) {
  return block?.kind || block?.nodeType || (block?.type === "router" ? "router" : "host");
}

function nodeName(block) {
  if (!block) {
    return "";
  }
  return blockKind(block) === "router" ? block.router?.name || block.label : block.host?.hostname || block.label;
}

function blockMeta(block) {
  if (blockKind(block) === "router") {
    return "router / subnet gateway";
  }
  return `${block.host.ramGb}GB RAM / ${block.host.storageGb}GB disk`;
}

function blockName(blocks, blockId) {
  const block = blocks.find((item) => item.id === blockId);
  return nodeName(block) || "missing";
}

function connectionLabel(connection) {
  if ((connection.kind || "service") === "topology") {
    return connection.label;
  }
  return `${connection.label}:${connection.port}`;
}

function subnetMemberText(network) {
  return (network.members || [])
    .map((member) => `${member.kind}:${member.id}@${member.ipAddress || "dynamic"}`)
    .join("  ");
}

function portSelectValue(port) {
  return PORT_OPTIONS.some((option) => option.value === port) ? port : "custom";
}

function fileName(path) {
  return String(path || "").split("/").filter(Boolean).pop() || "";
}

function slugName(value) {
  const normalized = String(value || DEFAULT_BOARD_NAME)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || DEFAULT_BOARD_NAME;
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
}

function inputPoint(block) {
  return {
    x: block.x,
    y: block.y + BLOCK_HEIGHT / 2
  };
}

function outputPoint(block) {
  return {
    x: block.x + BLOCK_WIDTH,
    y: block.y + BLOCK_HEIGHT / 2
  };
}

function makeConnectorPath(from, to) {
  const distance = Math.max(42, Math.abs(to.x - from.x) * 0.5);

  return `M ${from.x} ${from.y} C ${from.x + distance} ${from.y}, ${to.x - distance} ${to.y}, ${to.x} ${to.y}`;
}

export default App;
