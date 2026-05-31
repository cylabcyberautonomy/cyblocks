import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Code2, FileDown, Plus, Power, RefreshCcw, Rocket, Square, Trash2, X } from "lucide-react";

const BLOCK_WIDTH = 132;
const BLOCK_HEIGHT = 56;
const API_BASE_URL = import.meta.env.VITE_CYBLOCKS_API_URL || "http://127.0.0.1:8787";
const DEFAULT_BOARD_NAME = "incalmo-equifax";
const DEFAULT_OS_IMAGE_PATH = "docker://nginx:alpine";
const DEFAULT_ROUTER_IMAGE_PATH = "docker://alpine:latest";
const DEFAULT_CONNECTION_LABEL = "http";
const DEFAULT_CONNECTION_PORT = "80";
const STORAGE_KEY = "simple-block-board-state-v9";

const BLOCK_TYPES = [
  { id: "host-small", kind: "host", label: "host.small", color: "#ff8a7a", ramGb: 2, storageGb: 32 },
  { id: "host-medium", kind: "host", label: "host.medium", color: "#ffd166", ramGb: 4, storageGb: 64 },
  { id: "host-large", kind: "host", label: "host.large", color: "#74d3ae", ramGb: 8, storageGb: 128 },
  { id: "host-storage", kind: "host", label: "host.storage", color: "#8fb8ff", ramGb: 4, storageGb: 256 },
  { id: "router", kind: "router", label: "router", color: "#f4f7fb" },
  {
    id: "service-struts",
    kind: "service",
    label: "apache.struts",
    color: "#a9d6ff",
    service: {
      name: "struts-http",
      product: "Apache Struts",
      version: "2.3.31",
      protocol: "http",
      port: "8080",
      mhbenchVmType: "webserver_running"
    }
  },
  {
    id: "service-vsftpd",
    kind: "service",
    palette: false,
    label: "vsftpd",
    color: "#b8e986",
    service: {
      name: "ftp-service",
      product: "vsftpd",
      version: "2.3.4",
      protocol: "ftp",
      port: "21",
      mhbenchVmType: "ubuntu_base_running"
    }
  },
  {
    id: "service-openssh",
    kind: "service",
    label: "openssh",
    color: "#f7c873",
    service: {
      name: "ssh-service",
      product: "OpenSSH",
      version: "8.x",
      protocol: "ssh",
      port: "22",
      mhbenchVmType: "ubuntu_base_running"
    }
  },
  {
    id: "service-netcat",
    kind: "service",
    palette: false,
    label: "netcat.shell",
    color: "#a7f0d5",
    service: {
      name: "netcat-shell",
      product: "Netcat",
      version: "1.10",
      protocol: "tcp",
      port: "4444",
      mhbenchVmType: "ubuntu_netcat_running"
    }
  },
  {
    id: "service-sudo",
    kind: "service",
    palette: false,
    label: "sudo",
    color: "#e5c4ff",
    service: {
      name: "sudo",
      product: "sudo",
      version: "1.8.10p3",
      protocol: "local",
      port: "",
      mhbenchVmType: "ubuntu_sudobaron_running"
    }
  },
  {
    id: "vuln-struts-cve",
    kind: "vulnerability",
    label: "CVE-2017-5638",
    color: "#ffb1a8",
    vulnerability: {
      id: "CVE-2017-5638",
      name: "Struts Jakarta multipart RCE",
      category: "cve",
      severity: "critical",
      summary: "Incalmo's Equifax webserver exposes the vulnerable Struts/Tomcat service on TCP 8080.",
      source: "Incalmo docker/equifax/webserver",
      playbooks: []
    }
  },
  {
    id: "vuln-vsftpd-backdoor",
    kind: "vulnerability",
    palette: false,
    label: "CVE-2011-2523",
    color: "#ffcf8a",
    vulnerability: {
      id: "CVE-2011-2523",
      name: "vsftpd 2.3.4 backdoor",
      category: "cve",
      severity: "critical",
      summary: "The vsftpd 2.3.4 source package contains a backdoor reachable through the FTP service.",
      source: "MHBench vsftpd_backdoor",
      playbooks: [{ name: "vsftpd_backdoor", args: { host: "$host" } }]
    }
  },
  {
    id: "misconfig-root-ssh-trust",
    kind: "misconfiguration",
    label: "web.db.ssh.key",
    color: "#ffe082",
    vulnerability: {
      id: "MISCONFIG-ROOT-SSH-KEY",
      name: "Tomcat SSH key trusted by database",
      category: "credential-trust",
      severity: "high",
      summary: "The Equifax webserver contains a Tomcat user's SSH key and config for the database host.",
      source: "Incalmo docker/equifax webserver/database Dockerfiles",
      sourceHostId: "",
      playbooks: []
    }
  },
  {
    id: "misconfig-netcat-listener",
    kind: "misconfiguration",
    palette: false,
    label: "unauth.shell",
    color: "#b9f3c5",
    vulnerability: {
      id: "MISCONFIG-NETCAT-SHELL",
      name: "Unauthenticated shell listener",
      category: "backdoor",
      severity: "high",
      summary: "A reboot-persistent Netcat listener exposes an interactive shell on TCP 4444.",
      source: "MHBench netcat_shell",
      playbooks: [{ name: "netcat_shell", args: { host: "$host", user: "root" } }]
    }
  },
  {
    id: "vuln-sudo-baron",
    kind: "vulnerability",
    palette: false,
    label: "CVE-2021-3156",
    color: "#d7c0ff",
    vulnerability: {
      id: "CVE-2021-3156",
      name: "Sudo Baron Samedit",
      category: "cve",
      severity: "high",
      summary: "sudo 1.8.10p3 is vulnerable to Baron Samedit local privilege escalation.",
      source: "MHBench sudobaron",
      playbooks: [{ name: "sudobaron", args: { host: "$host" } }]
    }
  },
  { id: "host-custom", kind: "host", label: "host.custom", color: "#d7a8ff", ramGb: 4, storageGb: 64 }
];

const PALETTE_BLOCK_TYPES = BLOCK_TYPES.filter((type) => type.palette !== false);
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
  const fallback = createIncalmoEquifaxCanvas();

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;

    if (Array.isArray(parsed)) {
      return { name: fallback.name, blocks: normalizeBlocks(parsed), connections: [], runtimeBlocks: [], incalmo: {} };
    }

    if (!parsed) {
      return {
        ...fallback,
        runtimeBlocks: normalizeRuntimeBlocks(fallback.runtimeBlocks),
        incalmo: normalizeIncalmoConfig(fallback.incalmo)
      };
    }

    const blocks = normalizeBlocks(Array.isArray(parsed?.blocks) ? parsed.blocks : []);

    return {
      name: typeof parsed?.name === "string" && parsed.name.trim() ? parsed.name : fallback.name,
      blocks,
      connections: normalizeConnections(Array.isArray(parsed?.connections) ? parsed.connections : [], blocks),
      runtimeBlocks: normalizeRuntimeBlocks(parsed?.runtimeBlocks),
      incalmo: normalizeIncalmoConfig(parsed?.incalmo)
    };
  } catch {
    return {
      ...fallback,
      runtimeBlocks: normalizeRuntimeBlocks(fallback.runtimeBlocks),
      incalmo: normalizeIncalmoConfig(fallback.incalmo)
    };
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

function createServiceDefaults(typeId, index = 1) {
  const type = BLOCK_TYPE_MAP[typeId] || defaultTypeForKind("service");
  const service = type.service || {};

  return {
    name: service.name || `service-${index}`,
    product: service.product || type.label || "service",
    version: service.version || "1.0.0",
    protocol: service.protocol || "tcp",
    port: service.port ?? "",
    mhbenchVmType: service.mhbenchVmType || ""
  };
}

function createVulnerabilityDefaults(typeId, index = 1) {
  const type = BLOCK_TYPE_MAP[typeId] || defaultTypeForKind("vulnerability");
  const vulnerability = type.vulnerability || {};

  return {
    id: vulnerability.id || `VULN-${index}`,
    name: vulnerability.name || type.label || `vulnerability-${index}`,
    category: vulnerability.category || "cve",
    severity: vulnerability.severity || "medium",
    summary: vulnerability.summary || "",
    source: vulnerability.source || "",
    sourceHostId: vulnerability.sourceHostId || "",
    playbooks: Array.isArray(vulnerability.playbooks)
      ? structuredClone(vulnerability.playbooks)
      : []
  };
}

function normalizeBlocks(blocks) {
  return blocks.map((block, index) => {
    const kind = blockKind(block);
    const type = BLOCK_TYPE_MAP[block.type] || defaultTypeForKind(kind);

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

    if (kind === "service") {
      const serviceDefaults = createServiceDefaults(type.id, index + 1);
      return {
        ...block,
        kind: "service",
        type: type.id,
        label: block.label || type.label,
        color: block.color || type.color,
        service: {
          name: block.service?.name || block.name || serviceDefaults.name,
          product: block.service?.product || serviceDefaults.product,
          version: block.service?.version || serviceDefaults.version,
          protocol: block.service?.protocol || serviceDefaults.protocol,
          port: block.service?.port ?? serviceDefaults.port,
          mhbenchVmType: block.service?.mhbenchVmType || block.service?.vmType || serviceDefaults.mhbenchVmType
        }
      };
    }

    if (isFindingKind(kind)) {
      const vulnerabilityDefaults = createVulnerabilityDefaults(type.id, index + 1);
      return {
        ...block,
        kind,
        type: type.id,
        label: block.label || type.label,
        color: block.color || type.color,
        vulnerability: {
          id: block.vulnerability?.id || block.vulnerability?.cve || vulnerabilityDefaults.id,
          name: block.vulnerability?.name || block.name || vulnerabilityDefaults.name,
          category: block.vulnerability?.category || vulnerabilityDefaults.category,
          severity: block.vulnerability?.severity || vulnerabilityDefaults.severity,
          summary: block.vulnerability?.summary || block.vulnerability?.description || vulnerabilityDefaults.summary,
          source: block.vulnerability?.source || vulnerabilityDefaults.source,
          sourceHostId: block.vulnerability?.sourceHostId || vulnerabilityDefaults.sourceHostId,
          playbooks: Array.isArray(block.vulnerability?.playbooks)
            ? block.vulnerability.playbooks
            : vulnerabilityDefaults.playbooks
        }
      };
    }

    const defaults = createHostDefaults(type.id, index + 1);
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
        vmType: block.host?.vmType || block.vmType || "",
        flavor: block.host?.flavor || block.flavor || "",
        externalDrives: Array.isArray(block.host?.externalDrives)
          ? block.host.externalDrives
          : Array.isArray(block.externalDrives)
            ? block.externalDrives
            : defaults.externalDrives,
        networkInterfaces: Array.isArray(block.host?.networkInterfaces)
          ? block.host.networkInterfaces
          : Array.isArray(block.networkInterfaces)
            ? block.networkInterfaces
            : [],
        incalmo: block.host?.incalmo && typeof block.host.incalmo === "object" ? block.host.incalmo : {}
      }
    };
  });
}

function normalizeConnections(connections, blocks = []) {
  return connections.map((connection, index) => {
    const kind = normalizeConnectionKind(connection.kind || inferConnectionKind(connection.from, connection.to, blocks));
    const from = blocks.find((block) => block.id === connection.from);
    const to = blocks.find((block) => block.id === connection.to);
    const service = [from, to].find((block) => blockKind(block) === "service");
    const defaultPort = service?.service?.port || DEFAULT_CONNECTION_PORT;

    return {
      ...connection,
      kind,
      label: connection.label || defaultConnectionLabel(kind, index, service),
      directed: Boolean(connection.directed),
      port: kind === "service" ? String(connection.port ?? defaultPort) : ""
    };
  });
}

function normalizeRuntimeBlocks(runtimeBlocks) {
  if (!Array.isArray(runtimeBlocks)) {
    return [];
  }

  return runtimeBlocks.map((block, index) => {
    const control = block.control && typeof block.control === "object" ? block.control : {};
    const blockId = block.id || control.id || `runtime-${index + 1}`;
    const ports = Array.isArray(control.ports)
      ? control.ports
      : Array.isArray(block.ports)
        ? block.ports
        : [];

    return {
      ...block,
      id: blockId,
      kind: block.kind || "control",
      type: block.type || control.type || "runtime",
      label: block.label || control.name || blockId,
      color: block.color || "#dbeafe",
      order: block.order ?? index,
      control: {
        name: control.name || block.label || blockId,
        role: control.role || "",
        product: control.product || "",
        protocol: control.protocol || "",
        ports: ports.map((port) => String(port)).filter(Boolean),
        hostId: control.hostId || control.runtimeHostId || "",
        summary: control.summary || ""
      }
    };
  });
}

function normalizeIncalmoConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    project: source.project || "",
    strategy: source.strategy || "",
    environment: source.environment || "",
    c2Server: source.c2Server || "http://localhost:8888",
    debug: typeof source.debug === "boolean" ? source.debug : true
  };
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
  const [runtimeBlocks, setRuntimeBlocks] = useState(() => initialCanvasRef.current.runtimeBlocks || []);
  const [incalmoConfig, setIncalmoConfig] = useState(() => normalizeIncalmoConfig(initialCanvasRef.current.incalmo));
  const [boardSize, setBoardSize] = useState({ width: 900, height: 520 });
  const [connectorDrag, setConnectorDrag] = useState(null);
  const [paletteDrag, setPaletteDrag] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [incalmoApiKey, setIncalmoApiKey] = useState("");
  const [incalmoKeyProvider, setIncalmoKeyProvider] = useState("openai");
  const [incalmoStatus, setIncalmoStatus] = useState(null);
  const [incalmoMessage, setIncalmoMessage] = useState("No Incalmo monitor data yet.");
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
  const isBackendBusy = ["checking", "compiling", "exporting", "deploying", "ending", "quitting"].includes(runState.phase);
  const activeBoardUsesIncalmo = blocks.some(blockUsesIncalmo);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: boardName, blocks, connections, runtimeBlocks, incalmo: incalmoConfig })
    );
  }, [boardName, blocks, connections, runtimeBlocks, incalmoConfig]);

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
      } else if (kind === "service") {
        block.service = createServiceDefaults(type.id, nextIndex);
      } else if (kind === "vulnerability") {
        block.vulnerability = createVulnerabilityDefaults(type.id, nextIndex);
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
            const kind = inferConnectionKind(sourceId, targetId, blocks);
            const service = [source, targetBlock].find((block) => blockKind(block) === "service");
            setSelectedConnectionId(connectionId);
            return [
              ...current,
              {
                id: connectionId,
                kind,
                label: defaultConnectionLabel(kind, current.length, service),
                from: sourceId,
                to: targetId,
                port: kind === "service" ? String(service?.service?.port || DEFAULT_CONNECTION_PORT) : ""
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
    setRuntimeBlocks([]);
    setIncalmoConfig(normalizeIncalmoConfig({}));
    setSelectedBlockId(null);
    setSelectedConnectionId(null);
    setIncalmoStatus(null);
    setIncalmoMessage("No Incalmo monitor data yet.");
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

  function updateSelectedHostInterface(index, patch) {
    if (!selectedBlock) {
      return;
    }

    const currentInterfaces = Array.isArray(selectedBlock.host.networkInterfaces)
      ? selectedBlock.host.networkInterfaces
      : [];

    updateSelectedBlockHost({
      networkInterfaces: currentInterfaces.map((networkInterface, itemIndex) =>
        itemIndex === index
          ? {
              ...networkInterface,
              ...patch
            }
          : networkInterface
      )
    });
  }

  function addSelectedHostInterface() {
    if (!selectedBlock) {
      return;
    }

    const currentInterfaces = Array.isArray(selectedBlock.host.networkInterfaces)
      ? selectedBlock.host.networkInterfaces
      : [];
    const nextIndex = currentInterfaces.length + 1;
    const networkId = `network_${nextIndex}`;

    updateSelectedBlockHost({
      networkInterfaces: [
        ...currentInterfaces,
        {
          networkId,
          networkName: networkId,
          cidr: `10.80.${nextIndex}.0/24`,
          ipAddress: `10.80.${nextIndex}.10`
        }
      ]
    });
  }

  function removeSelectedHostInterface(index) {
    if (!selectedBlock) {
      return;
    }

    const currentInterfaces = Array.isArray(selectedBlock.host.networkInterfaces)
      ? selectedBlock.host.networkInterfaces
      : [];

    updateSelectedBlockHost({
      networkInterfaces: currentInterfaces.filter((_, itemIndex) => itemIndex !== index)
    });
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

  function updateSelectedBlockService(patch) {
    if (!selectedBlock) {
      return;
    }

    setBlocks((current) =>
      current.map((block) =>
        block.id === selectedBlock.id
          ? {
              ...block,
              service: {
                ...block.service,
                ...patch
              }
            }
          : block
      )
    );
  }

  function updateSelectedBlockVulnerability(patch) {
    if (!selectedBlock) {
      return;
    }

    setBlocks((current) =>
      current.map((block) =>
        block.id === selectedBlock.id
          ? {
              ...block,
              vulnerability: {
                ...block.vulnerability,
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
    } else if (blockKind(copiedBlock) === "service") {
      block.service = {
        ...copiedBlock.service,
        name: `${copiedBlock.service.name}-copy`
      };
    } else if (blockKind(copiedBlock) === "vulnerability") {
      block.vulnerability = {
        ...copiedBlock.vulnerability,
        id: `${copiedBlock.vulnerability.id}-copy`,
        name: `${copiedBlock.vulnerability.name} copy`
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
    const sample = createIncalmoEquifaxCanvas();

    setBoardName(sample.name);
    setBlocks(sample.blocks);
    setConnections(sample.connections);
    setRuntimeBlocks(sample.runtimeBlocks || []);
    setIncalmoConfig(normalizeIncalmoConfig(sample.incalmo));
    setSelectedBlockId(sample.blocks[0]?.id || null);
    setSelectedConnectionId(null);
    setIncalmoStatus(null);
    setIncalmoMessage("Incalmo Equifax runtime controls loaded.");
    setStatus("Loaded incalmo-equifax graph");
  }

  function loadIncalmoEquifaxBoard() {
    const sample = createIncalmoEquifaxCanvas();

    setBoardName(sample.name);
    setBlocks(sample.blocks);
    setConnections(sample.connections);
    setRuntimeBlocks(sample.runtimeBlocks || []);
    setIncalmoConfig(normalizeIncalmoConfig(sample.incalmo));
    setSelectedBlockId(sample.blocks[0]?.id || null);
    setSelectedConnectionId(null);
    setIncalmoStatus(null);
    setIncalmoMessage("Incalmo Equifax runtime controls loaded.");
    setStatus("Loaded incalmo-equifax graph");
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

        if (blockKind(block) === "service") {
          return {
            ...base,
            service: {
              name: block.service.name,
              product: block.service.product,
              version: block.service.version,
              protocol: block.service.protocol,
              port: block.service.port,
              mhbenchVmType: block.service.mhbenchVmType
            }
          };
        }

        if (isFindingKind(blockKind(block))) {
          return {
            ...base,
            vulnerability: {
              id: block.vulnerability.id,
              name: block.vulnerability.name,
              category: block.vulnerability.category,
              severity: block.vulnerability.severity,
              summary: block.vulnerability.summary,
              source: block.vulnerability.source,
              sourceHostId: block.vulnerability.sourceHostId,
              playbooks: block.vulnerability.playbooks
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
            vmType: block.host.vmType,
            flavor: block.host.flavor,
            externalDrives: block.host.externalDrives,
            networkInterfaces: block.host.networkInterfaces || [],
            incalmo: block.host.incalmo || {}
          }
        };
      });
    const visibleConnections = connections
      .filter((connection) => visibleBlockIds.has(connection.from) && visibleBlockIds.has(connection.to))
      .map((connection) => {
        const kind = normalizeConnectionKind(connection.kind);
        return {
          id: connection.id,
          kind,
          label: connection.label,
          from: connection.from,
          to: connection.to,
          directed: Boolean(connection.directed),
          port: kind === "service" ? connection.port : ""
        };
      });
    const exportedRuntimeBlocks = runtimeBlocks.map((block, index) => ({
      id: block.id,
      order: block.order ?? index,
      kind: block.kind || "control",
      type: block.type || "runtime",
      label: block.label,
      color: block.color,
      control: {
        name: block.control?.name || block.label,
        role: block.control?.role || "",
        product: block.control?.product || "",
        protocol: block.control?.protocol || "",
        ports: Array.isArray(block.control?.ports) ? block.control.ports : [],
        hostId: block.control?.hostId || "",
        summary: block.control?.summary || ""
      }
    }));

    return {
      kind: "block-board",
      version: 1,
      name: outputName,
      compiledAt: new Date().toISOString(),
      blockCount: visibleBlocks.length,
      connectionCount: visibleConnections.length,
      runtimeBlockCount: exportedRuntimeBlocks.length,
      incalmo: {
        ...incalmoConfig,
        project: incalmoConfig.project || outputName
      },
      blocks: visibleBlocks,
      connections: visibleConnections,
      runtimeBlocks: exportedRuntimeBlocks
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

  async function fetchIncalmoStatus(name = slugName(boardName)) {
    const response = await fetch(`${API_BASE_URL}/api/incalmo/status?name=${encodeURIComponent(name)}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Incalmo status failed with ${response.status}`);
    }

    return payload.status;
  }

  async function refreshIncalmoMonitor(name = slugName(boardName)) {
    setIncalmoMessage("Checking Incalmo compose run...");

    try {
      const latestStatus = await fetchIncalmoStatus(name);
      setIncalmoStatus(latestStatus);
      setIncalmoMessage(
        latestStatus.composeExists
          ? `${latestStatus.services.length} Incalmo compose service${latestStatus.services.length === 1 ? "" : "s"} found.`
          : "No generated Incalmo compose project found."
      );
    } catch (error) {
      setIncalmoMessage(`Incalmo monitor failed: ${error.message}`);
    }
  }

  async function submitIncalmoApiKey(event) {
    event.preventDefault();
    const apiKey = incalmoApiKey.trim();
    if (!apiKey) {
      setIncalmoMessage("Enter an LLM API key before saving.");
      return;
    }

    setIncalmoMessage(`Saving ${incalmoKeyProvider} API key to Incalmo .env...`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/incalmo/api-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ provider: incalmoKeyProvider, apiKey })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Request failed with ${response.status}`);
      }

      setIncalmoApiKey("");
      setIncalmoMessage(`Saved ${payload.result.keyName} in ${fileName(payload.result.envPath)}.`);
    } catch (error) {
      setIncalmoMessage(`API key save failed: ${error.message}`);
    }
  }

  function updateIncalmoConfig(patch) {
    setIncalmoConfig((current) => normalizeIncalmoConfig({ ...current, ...patch }));
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

  async function exportIncalmoCompose() {
    setStatus("Exporting Incalmo Compose");
    setRunState((current) => ({
      ...current,
      phase: "exporting",
      message: "Exporting Incalmo Compose...",
      error: null
    }));

    try {
      const payload = await postGraph("/api/export/incalmo");
      const incalmo = payload.result.incalmo;
      setRunState({
        phase: "compiled",
        message: `Exported Incalmo Compose to ${incalmo.outDir}`,
        result: payload.result,
        deployment: null,
        containers: [],
        error: null
      });
      await refreshIncalmoMonitor(payload.result.name);
      setStatus(`Exported ${payload.result.name} Incalmo Compose`);
    } catch (error) {
      setRunState((current) => ({
        ...current,
        phase: "error",
        message: "Incalmo export failed.",
        error: error.message
      }));
      setStatus("Incalmo export failed");
    }
  }

  async function deployBoard() {
    if (activeBoardUsesIncalmo) {
      await exportIncalmoCompose();
      return;
    }

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

      const cleanup = payload.cleanup || {};
      const removedContainers = cleanup.removedContainers?.length || 0;
      const removedNetworks = cleanup.removedNetworks?.length || 0;
      const dockerVm = cleanup.dockerVm || null;
      const vmStopFailed = Boolean(dockerVm?.attempted && !dockerVm?.stopped);
      let vmMessage = "";
      if (dockerVm?.attempted) {
        vmMessage = dockerVm.stopped ? "Colima VM stopped." : `Colima VM stop failed: ${dockerVm.message || "unknown error"}.`;
      } else if (dockerVm?.stopped) {
        vmMessage = dockerVm.message || "Colima is already stopped.";
      } else if (dockerVm?.message) {
        vmMessage = dockerVm.message;
      }
      if (vmMessage && !/[.!?]$/.test(vmMessage)) {
        vmMessage = `${vmMessage}.`;
      }
      const cleanupMessage = cleanup.error
        ? `Docker cleanup failed: ${cleanup.error}`
        : `removed ${removedContainers} Cyblocks container${removedContainers === 1 ? "" : "s"} and ${removedNetworks} network${removedNetworks === 1 ? "" : "s"}`;
      const quitError = cleanup.error || (vmStopFailed ? dockerVm.message || "Colima VM stop failed." : null);
      const quitDetails = vmMessage ? `${cleanupMessage}. ${vmMessage}` : `${cleanupMessage}.`;

      setRunState((current) => ({
        ...current,
        phase: quitError ? "error" : "idle",
        message: `Quit requested; ${quitDetails} Backend is stopping and frontend port ${payload.frontendPort} is being released.`,
        error: quitError
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
            <span>Equifax Sample</span>
          </button>
          <button type="button" onClick={compileBoard} disabled={isBackendBusy}>
            <Code2 size={17} aria-hidden="true" />
            <span>{runState.phase === "compiling" ? "Compiling" : "Compile"}</span>
          </button>
          <button type="button" onClick={deployBoard} disabled={isBackendBusy}>
            <Rocket size={17} aria-hidden="true" />
            <span>
              {runState.phase === "deploying"
                ? "Deploying"
                : runState.phase === "exporting" && activeBoardUsesIncalmo
                  ? "Exporting"
                  : activeBoardUsesIncalmo
                    ? "Export Compose"
                    : "Deploy"}
            </span>
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
            {PALETTE_BLOCK_TYPES.map((type) => (
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

        <aside className="panel incalmo-panel" aria-label="Incalmo runtime">
          <div className="panel-title-row">
            <h2>Incalmo</h2>
            <span>runtime</span>
          </div>
          <div className="incalmo-actions">
            <button type="button" onClick={loadIncalmoEquifaxBoard}>
              <RefreshCcw size={17} aria-hidden="true" />
              <span>Equifax</span>
            </button>
            <button type="button" onClick={exportIncalmoCompose} disabled={isBackendBusy}>
              <FileDown size={17} aria-hidden="true" />
              <span>{runState.phase === "exporting" ? "Exporting" : "Export Compose"}</span>
            </button>
          </div>
          <form className="incalmo-key-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              Project
              <input
                value={incalmoConfig.project || slugName(boardName)}
                onChange={(event) => updateIncalmoConfig({ project: event.target.value })}
              />
            </label>
            <label>
              Strategy
              <input
                value={incalmoConfig.strategy}
                onChange={(event) => updateIncalmoConfig({ strategy: event.target.value })}
              />
            </label>
            <label>
              Environment
              <input
                value={incalmoConfig.environment}
                onChange={(event) => updateIncalmoConfig({ environment: event.target.value })}
              />
            </label>
            <label>
              C2 server
              <input
                value={incalmoConfig.c2Server}
                onChange={(event) => updateIncalmoConfig({ c2Server: event.target.value })}
              />
            </label>
          </form>
          <div className="runtime-list" aria-label="Incalmo runtime blocks">
            {runtimeBlocks.length > 0 ? (
              runtimeBlocks.map((block) => (
                <article
                  key={block.id}
                  className="runtime-block"
                  style={{ "--runtime-color": block.color }}
                >
                  <div>
                    <strong>{runtimeBlockName(block)}</strong>
                    <span>{runtimeBlockMeta(block)}</span>
                  </div>
                  {block.control?.summary && <p>{block.control.summary}</p>}
                </article>
              ))
            ) : (
              <p className="properties-empty">No Incalmo runtime blocks on this board.</p>
            )}
          </div>
          <form className="incalmo-key-form" onSubmit={submitIncalmoApiKey}>
            <label>
              LLM provider
              <select
                value={incalmoKeyProvider}
                onChange={(event) => setIncalmoKeyProvider(event.target.value)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
                <option value="deepseek">DeepSeek</option>
                <option value="mistral">Mistral</option>
              </select>
            </label>
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                value={incalmoApiKey}
                onChange={(event) => setIncalmoApiKey(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!incalmoApiKey.trim()}>
              Save Key
            </button>
          </form>
          <section className="incalmo-monitor" aria-label="Incalmo monitor">
            <div className="run-status-header">
              <strong>Monitor</strong>
              <button type="button" onClick={() => refreshIncalmoMonitor()} disabled={isBackendBusy}>
                <Activity size={16} aria-hidden="true" />
                <span>Refresh</span>
              </button>
            </div>
            <p>{incalmoMessage}</p>
            {incalmoStatus && (
              <div className="incalmo-monitor-details">
                <div>
                  <span>compose</span>
                  <strong>{incalmoStatus.composeExists ? "ready" : "missing"}</strong>
                </div>
                <div>
                  <span>c2</span>
                  <strong>{incalmoStatus.c2?.reachable ? "reachable" : "offline"}</strong>
                </div>
                {incalmoStatus.services?.map((service) => (
                  <div key={`${service.name}-${service.service}`}>
                    <span>{service.service || service.name || "service"}</span>
                    <strong>{service.state || service.status || "unknown"}</strong>
                  </div>
                ))}
                {incalmoStatus.dockerError && <pre className="run-error">{incalmoStatus.dockerError}</pre>}
                {incalmoStatus.latestLog?.tail && (
                  <pre className="incalmo-log">{incalmoStatus.latestLog.tail}</pre>
                )}
              </div>
            )}
          </section>
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
              <defs>
                <marker
                  id="arrow-topology"
                  className="connection-marker connection-marker-topology"
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="4.5"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 9 4.5 L 0 9 z" />
                </marker>
                <marker
                  id="arrow-service"
                  className="connection-marker connection-marker-service"
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="4.5"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 9 4.5 L 0 9 z" />
                </marker>
                <marker
                  id="arrow-vulnerability"
                  className="connection-marker connection-marker-vulnerability"
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="4.5"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 9 4.5 L 0 9 z" />
                </marker>
                <marker
                  id="arrow-access"
                  className="connection-marker connection-marker-access"
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="4.5"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 9 4.5 L 0 9 z" />
                </marker>
              </defs>
              {connections.map((connection) => {
                const from = blocks.find((block) => block.id === connection.from);
                const to = blocks.find((block) => block.id === connection.to);

                if (!from || !to) {
                  return null;
                }
                const kind = normalizeConnectionKind(connection.kind);
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
                      className={`connection-path connection-${kind}${connection.id === selectedConnectionId ? " is-selected" : ""}`}
                      d={path}
                      markerEnd={isDirectedConnection(connection) ? `url(#arrow-${kind})` : undefined}
                    />
                    <text className={`connection-label connection-label-${kind}`} dy="-6">
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
              <section className="interface-editor" aria-label="Network interfaces">
                <div className="properties-section-header">
                  <strong>Network interfaces</strong>
                  <button type="button" onClick={addSelectedHostInterface} aria-label="Add network interface">
                    <Plus size={15} aria-hidden="true" />
                    <span>Add</span>
                  </button>
                </div>
                {(selectedBlock.host.networkInterfaces || []).length > 0 ? (
                  <div className="interface-list">
                    {selectedBlock.host.networkInterfaces.map((networkInterface, index) => (
                      <div className="interface-row" key={`${selectedBlock.id}-interface-${index}`}>
                        <label>
                          Network
                          <input
                            value={networkInterface.networkId || networkInterface.networkName || ""}
                            onChange={(event) =>
                              updateSelectedHostInterface(index, {
                                networkId: event.target.value,
                                networkName: event.target.value
                              })
                            }
                          />
                        </label>
                        <label>
                          CIDR
                          <input
                            value={networkInterface.cidr || ""}
                            onChange={(event) => updateSelectedHostInterface(index, { cidr: event.target.value })}
                          />
                        </label>
                        <label>
                          IP
                          <input
                            value={networkInterface.ipAddress || ""}
                            onChange={(event) =>
                              updateSelectedHostInterface(index, { ipAddress: event.target.value })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => removeSelectedHostInterface(index)}
                          aria-label={`Remove network interface ${index + 1}`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="properties-empty">No explicit interfaces.</p>
                )}
              </section>
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

          {selectedBlock && blockKind(selectedBlock) === "service" && (
            <form className="properties-form">
              <p className="properties-kicker">{selectedBlock.label}</p>
              <label>
                Service name
                <input
                  value={selectedBlock.service.name}
                  onChange={(event) => updateSelectedBlockService({ name: event.target.value })}
                />
              </label>
              <label>
                Product
                <input
                  value={selectedBlock.service.product}
                  onChange={(event) => updateSelectedBlockService({ product: event.target.value })}
                />
              </label>
              <label>
                Version
                <input
                  value={selectedBlock.service.version}
                  onChange={(event) => updateSelectedBlockService({ version: event.target.value })}
                />
              </label>
              <label>
                Protocol
                <input
                  value={selectedBlock.service.protocol}
                  onChange={(event) => updateSelectedBlockService({ protocol: event.target.value })}
                />
              </label>
              <label>
                Port
                <input
                  inputMode="numeric"
                  value={selectedBlock.service.port}
                  onChange={(event) => updateSelectedBlockService({ port: event.target.value })}
                />
              </label>
              <label>
                Environment VM type
                <input
                  value={selectedBlock.service.mhbenchVmType}
                  onChange={(event) => updateSelectedBlockService({ mhbenchVmType: event.target.value })}
                />
              </label>
            </form>
          )}

          {selectedBlock && isFindingKind(blockKind(selectedBlock)) && (
            <form className="properties-form">
              <p className="properties-kicker">{selectedBlock.label}</p>
              <label>
                Vulnerability ID
                <input
                  value={selectedBlock.vulnerability.id}
                  onChange={(event) => updateSelectedBlockVulnerability({ id: event.target.value })}
                />
              </label>
              <label>
                Name
                <input
                  value={selectedBlock.vulnerability.name}
                  onChange={(event) => updateSelectedBlockVulnerability({ name: event.target.value })}
                />
              </label>
              <label>
                Category
                <select
                  value={selectedBlock.vulnerability.category}
                  onChange={(event) => updateSelectedBlockVulnerability({ category: event.target.value })}
                >
                  <option value="cve">cve</option>
                  <option value="misconfiguration">misconfiguration</option>
                  <option value="backdoor">backdoor</option>
                  <option value="weak-credential">weak-credential</option>
                  <option value="credential-trust">credential-trust</option>
                </select>
              </label>
              <label>
                Severity
                <select
                  value={selectedBlock.vulnerability.severity}
                  onChange={(event) => updateSelectedBlockVulnerability({ severity: event.target.value })}
                >
                  <option value="critical">critical</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </label>
              <label>
                Summary
                <textarea
                  rows={4}
                  value={selectedBlock.vulnerability.summary}
                  onChange={(event) => updateSelectedBlockVulnerability({ summary: event.target.value })}
                />
              </label>
              <label>
                Source
                <input
                  value={selectedBlock.vulnerability.source}
                  onChange={(event) => updateSelectedBlockVulnerability({ source: event.target.value })}
                />
              </label>
              <label>
                Fallback source host ID
                <input
                  value={selectedBlock.vulnerability.sourceHostId}
                  onChange={(event) => updateSelectedBlockVulnerability({ sourceHostId: event.target.value })}
                />
              </label>
              <label>
                Setup playbooks
                <textarea
                  rows={4}
                  value={selectedBlock.vulnerability.playbooks.map((playbook) => playbook.name).join("\n")}
                  onChange={(event) =>
                    updateSelectedBlockVulnerability({
                      playbooks: event.target.value
                        .split("\n")
                        .map((name) => name.trim())
                        .filter(Boolean)
                        .map((name) => ({ name, args: { host: "$host" } }))
                    })
                  }
                />
              </label>
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
          value={normalizeConnectionKind(selectedConnection.kind)}
          onChange={(event) =>
            updateSelectedConnection({
              kind: event.target.value,
              port: event.target.value === "service" ? selectedConnection.port || DEFAULT_CONNECTION_PORT : ""
                    })
                  }
        >
          <option value="service">service</option>
          <option value="vulnerability">vulnerability</option>
          <option value="access">access</option>
          <option value="topology">topology</option>
        </select>
      </label>
              {normalizeConnectionKind(selectedConnection.kind) === "topology" && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedConnection.directed)}
                    onChange={(event) => updateSelectedConnection({ directed: event.target.checked })}
                  />
                  Directional arrow
                </label>
              )}
              <label>
                Connector name
                <input
                  value={selectedConnection.label}
                  onChange={(event) => updateSelectedConnection({ label: event.target.value })}
                />
              </label>
              {(selectedConnection.kind || "service") === "service" && (
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
              {(selectedConnection.kind || "service") === "service" && portSelectValue(selectedConnection.port) === "custom" && (
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
                <div>
                  <dt>Hosts</dt>
                  <dd>{runState.result.intermediate?.hosts?.length || 0}</dd>
                </div>
                <div>
                  <dt>Routers</dt>
                  <dd>{runState.result.intermediate?.routers?.length || 0}</dd>
                </div>
                <div>
                  <dt>Services</dt>
                  <dd>{runState.result.intermediate?.services?.length || 0}</dd>
                </div>
                <div>
                  <dt>Vulnerabilities</dt>
                  <dd>{runState.result.intermediate?.vulnerabilities?.length || 0}</dd>
                </div>
                <div>
                  <dt>Subnets</dt>
                  <dd>{runState.result.intermediate?.networks?.length || 0}</dd>
                </div>
                <div>
                  <dt>Connectors</dt>
                  <dd>{runState.result.intermediate?.connections?.length || 0}</dd>
                </div>
                <div>
                  <dt>Runtime</dt>
                  <dd>{runState.result.intermediate?.controlBlocks?.length || 0}</dd>
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
    { id: "web-1", x: 72, y: 76, color: BLOCK_TYPES[0].color, vmType: "webserver_netcat_running" },
    { id: "app-1", x: 72, y: 270, color: BLOCK_TYPES[1].color, vmType: "ubuntu_sudobaron_running" },
    { id: "db-1", x: 72, y: 410, color: BLOCK_TYPES[2].color, vmType: "ubuntu_base_running" }
  ];
  const services = [
    { id: "service-struts-1", type: "service-struts", x: 320, y: 40 },
    { id: "service-netcat-1", type: "service-netcat", x: 320, y: 115 },
    { id: "service-sudo-1", type: "service-sudo", x: 320, y: 275 },
    { id: "service-ssh-1", type: "service-openssh", x: 320, y: 380 },
    { id: "service-vsftpd-1", type: "service-vsftpd", x: 320, y: 455 }
  ];
  const findings = [
    { id: "vuln-struts-cve-1", type: "vuln-struts-cve", x: 530, y: 40 },
    { id: "misconfig-netcat-listener-1", type: "misconfig-netcat-listener", x: 530, y: 115 },
    { id: "vuln-sudo-baron-1", type: "vuln-sudo-baron", x: 530, y: 275 },
    { id: "misconfig-root-ssh-trust-1", type: "misconfig-root-ssh-trust", x: 530, y: 380 },
    { id: "vuln-vsftpd-backdoor-1", type: "vuln-vsftpd-backdoor", x: 530, y: 455 }
  ];

  return {
    name: DEFAULT_BOARD_NAME,
    incalmo: {},
    runtimeBlocks: [],
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
          vmType: host.vmType,
          flavor: "m1.small",
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
        x: 250,
        y: 190,
        order: 3
      },
      ...services.map((service, index) => {
        const type = BLOCK_TYPE_MAP[service.type];
        return {
          id: service.id,
          kind: "service",
          type: type.id,
          label: type.label,
          color: type.color,
          service: createServiceDefaults(type.id, index + 1),
          x: service.x,
          y: service.y,
          order: index + 4
        };
      }),
      ...findings.map((finding, index) => {
        const type = BLOCK_TYPE_MAP[finding.type];
        return {
          id: finding.id,
          kind: type.kind,
          type: type.id,
          label: type.label,
          color: type.color,
          vulnerability: createVulnerabilityDefaults(type.id, index + 1),
          x: finding.x,
          y: finding.y,
          order: index + 9
        };
      })
    ],
    connections: [
      {
        id: "web-1-to-router-1",
        kind: "topology",
        label: "web",
        from: "web-1",
        to: "router-1",
        port: ""
      },
      {
        id: "app-1-to-router-1",
        kind: "topology",
        label: "internal",
        from: "app-1",
        to: "router-1",
        port: ""
      },
      {
        id: "db-1-to-router-1",
        kind: "topology",
        label: "backend",
        from: "db-1",
        to: "router-1",
        port: ""
      },
      {
        id: "web-1-to-service-struts-1",
        kind: "service",
        label: "http",
        from: "web-1",
        to: "service-struts-1",
        port: "8080"
      },
      {
        id: "service-struts-1-to-vuln-struts-cve-1",
        kind: "vulnerability",
        label: "exposes",
        from: "service-struts-1",
        to: "vuln-struts-cve-1",
        port: ""
      },
      {
        id: "web-1-to-service-netcat-1",
        kind: "service",
        label: "bind",
        from: "web-1",
        to: "service-netcat-1",
        port: "4444"
      },
      {
        id: "service-netcat-1-to-misconfig-netcat-listener-1",
        kind: "vulnerability",
        label: "configured as",
        from: "service-netcat-1",
        to: "misconfig-netcat-listener-1",
        port: ""
      },
      {
        id: "app-1-to-service-sudo-1",
        kind: "service",
        label: "local",
        from: "app-1",
        to: "service-sudo-1",
        port: ""
      },
      {
        id: "service-sudo-1-to-vuln-sudo-baron-1",
        kind: "vulnerability",
        label: "exposes",
        from: "service-sudo-1",
        to: "vuln-sudo-baron-1",
        port: ""
      },
      {
        id: "db-1-to-service-ssh-1",
        kind: "service",
        label: "ssh",
        from: "db-1",
        to: "service-ssh-1",
        port: "22"
      },
      {
        id: "service-ssh-1-to-misconfig-root-ssh-trust-1",
        kind: "vulnerability",
        label: "trusts",
        from: "service-ssh-1",
        to: "misconfig-root-ssh-trust-1",
        port: ""
      },
      {
        id: "web-1-to-misconfig-root-ssh-trust-1",
        kind: "access",
        label: "root key",
        from: "web-1",
        to: "misconfig-root-ssh-trust-1",
        port: ""
      },
      {
        id: "db-1-to-service-vsftpd-1",
        kind: "service",
        label: "ftp",
        from: "db-1",
        to: "service-vsftpd-1",
        port: "21"
      },
      {
        id: "service-vsftpd-1-to-vuln-vsftpd-backdoor-1",
        kind: "vulnerability",
        label: "exposes",
        from: "service-vsftpd-1",
        to: "vuln-vsftpd-backdoor-1",
        port: ""
      }
    ]
  };
}

function createIncalmoEquifaxCanvas() {
  return {
    name: "incalmo-equifax",
    incalmo: {
      project: "incalmo-equifax",
      strategy: "EquifaxStrategy",
      environment: "EquifaxLarge",
      c2Server: "http://localhost:8888",
      debug: true
    },
    runtimeBlocks: [
      {
        id: "incalmo-c2",
        kind: "control",
        type: "incalmo-c2",
        label: "c2.server",
        color: "#dbeafe",
        control: {
          name: "Incalmo C2",
          role: "c2-server",
          product: "Incalmo command and control",
          protocol: "http",
          ports: ["8888", "6379", "5678"],
          hostId: "attacker",
          summary: "C2, Redis/Celery, and debug endpoints published by the attacker container."
        }
      },
      {
        id: "sandcat-agent",
        kind: "control",
        type: "sandcat-agent",
        label: "sandcat.agent",
        color: "#cffafe",
        control: {
          name: "Sandcat initial agent",
          role: "agent",
          product: "Sandcat",
          protocol: "http",
          ports: [],
          hostId: "attacker",
          summary: "Initial red agent that Incalmo starts from the attacker side in docker mode."
        }
      }
    ],
    blocks: [
      {
        id: "attacker",
        kind: "host",
        type: "host-medium",
        label: "attacker",
        color: BLOCK_TYPE_MAP["host-medium"].color,
        host: {
          hostname: "attacker",
          osImagePath: "incalmo://attacker",
          ramGb: 4,
          storageGb: 32,
          vmType: "kali_attacker",
          flavor: "m1.medium",
          externalDrives: [],
          networkInterfaces: [
            { networkId: "attacker_network", networkName: "attacker_network", cidr: "192.168.199.0/24", ipAddress: "192.168.199.10" },
            { networkId: "web_network", networkName: "web_network", cidr: "192.168.200.0/24", ipAddress: "192.168.200.10" }
          ],
          incalmo: {
            role: "attacker",
            buildContext: ".",
            dockerfile: "docker/attacker/incalmo.Dockerfile"
          }
        },
        x: 60,
        y: 90,
        order: 0
      },
      {
        id: "webserver",
        kind: "host",
        type: "host-medium",
        label: "webserver",
        color: BLOCK_TYPE_MAP["host-medium"].color,
        host: {
          hostname: "webserver",
          osImagePath: "incalmo://equifax/webserver",
          ramGb: 4,
          storageGb: 32,
          vmType: "webserver_running",
          flavor: "m1.medium",
          externalDrives: [],
          networkInterfaces: [
            { networkId: "web_network", networkName: "web_network", cidr: "192.168.200.0/24", ipAddress: "192.168.200.20" },
            { networkId: "db_network", networkName: "db_network", cidr: "192.168.201.0/24", ipAddress: "192.168.201.20" }
          ],
          incalmo: {
            role: "webserver",
            buildContext: "docker/equifax/webserver",
            containerName: "webserver_container",
            publishedPorts: ["127.0.0.1:8080:8080"]
          }
        },
        x: 230,
        y: 170,
        order: 1
      },
      {
        id: "db",
        kind: "host",
        type: "host-storage",
        label: "db",
        color: BLOCK_TYPE_MAP["host-storage"].color,
        host: {
          hostname: "db",
          osImagePath: "incalmo://equifax/database",
          ramGb: 2,
          storageGb: 32,
          vmType: "ubuntu_base_running",
          flavor: "m1.small",
          externalDrives: [],
          networkInterfaces: [
            { networkId: "db_network", networkName: "db_network", cidr: "192.168.201.0/24", ipAddress: "192.168.201.100" }
          ],
          incalmo: {
            role: "database",
            buildContext: "docker/equifax/database",
            containerName: "db_container"
          }
        },
        x: 60,
        y: 390,
        order: 2
      },
      {
        id: "service-struts",
        kind: "service",
        type: "service-struts",
        label: "apache.struts",
        color: BLOCK_TYPE_MAP["service-struts"].color,
        service: createServiceDefaults("service-struts", 1),
        x: 230,
        y: 300,
        order: 3
      },
      {
        id: "vuln-struts-cve",
        kind: "vulnerability",
        type: "vuln-struts-cve",
        label: "CVE-2017-5638",
        color: BLOCK_TYPE_MAP["vuln-struts-cve"].color,
        vulnerability: createVulnerabilityDefaults("vuln-struts-cve", 1),
        x: 420,
        y: 300,
        order: 4
      },
      {
        id: "service-ssh",
        kind: "service",
        type: "service-openssh",
        label: "openssh",
        color: BLOCK_TYPE_MAP["service-openssh"].color,
        service: createServiceDefaults("service-openssh", 2),
        x: 230,
        y: 430,
        order: 5
      },
      {
        id: "misconfig-web-db-ssh",
        kind: "misconfiguration",
        type: "misconfig-root-ssh-trust",
        label: "web.db.ssh.key",
        color: BLOCK_TYPE_MAP["misconfig-root-ssh-trust"].color,
        vulnerability: {
          id: "MISCONFIG-WEB-DB-SSH-KEY",
          name: "Webserver SSH key trusted by database",
          category: "credential-trust",
          severity: "high",
          summary: "The webserver contains an SSH key and config that can authenticate to the database host.",
          source: "Incalmo Equifax webserver/database Dockerfiles",
          sourceHostId: "",
          playbooks: []
        },
        x: 420,
        y: 430,
        order: 6
      }
    ],
    connections: [
      {
        id: "attacker-to-webserver-network",
        kind: "topology",
        label: "web_network",
        from: "attacker",
        to: "webserver",
        directed: true,
        port: ""
      },
      {
        id: "webserver-to-db-network",
        kind: "topology",
        label: "db_network",
        from: "webserver",
        to: "db",
        directed: true,
        port: ""
      },
      { id: "webserver-to-service-struts", kind: "service", label: "http", from: "webserver", to: "service-struts", port: "8080" },
      { id: "service-struts-to-vuln-struts-cve", kind: "vulnerability", label: "exposes", from: "service-struts", to: "vuln-struts-cve", port: "" },
      { id: "db-to-service-ssh", kind: "service", label: "ssh", from: "db", to: "service-ssh", port: "22" },
      { id: "service-ssh-to-misconfig-web-db-ssh", kind: "vulnerability", label: "trusts", from: "service-ssh", to: "misconfig-web-db-ssh", port: "" },
      { id: "webserver-to-misconfig-web-db-ssh", kind: "access", label: "ssh key", from: "webserver", to: "misconfig-web-db-ssh", port: "" }
    ]
  };
}

function numberOrDefault(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function blockKind(block) {
  const explicit = block?.kind || block?.nodeType;
  if (["host", "router", "service", "vulnerability", "misconfiguration"].includes(explicit)) {
    return explicit;
  }
  if (block?.service) {
    return "service";
  }
  if (block?.vulnerability) {
    const type = BLOCK_TYPE_MAP[block?.type];
    return isFindingKind(type?.kind) ? type.kind : "vulnerability";
  }
  if (block?.router || block?.type === "router") {
    return "router";
  }
  const type = BLOCK_TYPE_MAP[block?.type];
  return type?.kind || "host";
}

function isFindingKind(kind) {
  return kind === "vulnerability" || kind === "misconfiguration";
}

function defaultTypeForKind(kind) {
  return BLOCK_TYPES.find((type) => type.kind === kind) || BLOCK_TYPES[0];
}

function nodeName(block) {
  if (!block) {
    return "";
  }
  if (blockKind(block) === "router") {
    return block.router?.name || block.label;
  }
  if (blockKind(block) === "service") {
    return block.service?.name || block.label;
  }
  if (isFindingKind(blockKind(block))) {
    const vulnerabilityId = block.vulnerability?.id || "";
    if (vulnerabilityId.startsWith("MISCONFIG")) {
      return block.label || block.vulnerability?.name || vulnerabilityId;
    }
    return vulnerabilityId || block.vulnerability?.name || block.label;
  }
  return block.host?.hostname || block.label;
}

function blockMeta(block) {
  if (blockKind(block) === "router") {
    return "router / subnet gateway";
  }
  if (blockKind(block) === "service") {
    const port = block.service.port ? `:${block.service.port}` : "";
    return `${block.service.product} ${block.service.version}${port}`;
  }
  if (isFindingKind(blockKind(block))) {
    return `${block.vulnerability.category} / ${block.vulnerability.severity}`;
  }
  return `${block.host.ramGb}GB RAM / ${block.host.storageGb}GB disk`;
}

function blockUsesIncalmo(block) {
  return Boolean(
    block?.host?.incalmo?.buildContext ||
      (typeof block?.host?.osImagePath === "string" && block.host.osImagePath.startsWith("incalmo://"))
  );
}

function runtimeBlockName(block) {
  return block?.control?.name || block?.label || block?.id || "runtime";
}

function runtimeBlockMeta(block) {
  const parts = [
    block?.control?.role || block?.type || "runtime",
    block?.control?.hostId ? `host:${block.control.hostId}` : "",
    block?.control?.ports?.length ? `ports:${block.control.ports.join(",")}` : ""
  ].filter(Boolean);
  return parts.join(" / ");
}

function blockName(blocks, blockId) {
  const block = blocks.find((item) => item.id === blockId);
  return nodeName(block) || "missing";
}

function inferConnectionKind(fromId, toId, blocks) {
  const from = blocks.find((block) => block.id === fromId);
  const to = blocks.find((block) => block.id === toId);
  const endpointKinds = new Set([blockKind(from), blockKind(to)]);

  if (endpointKinds.has("router")) {
    return "topology";
  }
  if (endpointKinds.has("host") && [...endpointKinds].some(isFindingKind)) {
    return "access";
  }
  if ([...endpointKinds].some(isFindingKind)) {
    return "vulnerability";
  }
  return "service";
}

function normalizeConnectionKind(kind) {
  return ["topology", "service", "vulnerability", "access"].includes(kind) ? kind : "service";
}

function isDirectedConnection(connection) {
  return Boolean(connection?.directed) || ["service", "vulnerability", "access"].includes(normalizeConnectionKind(connection.kind));
}

function defaultConnectionLabel(kind, index, service) {
  if (kind === "topology") {
    return `link.${index + 1}`;
  }
  if (kind === "vulnerability") {
    return "exposes";
  }
  if (kind === "access") {
    return "access";
  }
  if (service?.service?.protocol) {
    return service.service.protocol;
  }
  return index === 0 ? DEFAULT_CONNECTION_LABEL : `${DEFAULT_CONNECTION_LABEL}.${index + 1}`;
}

function connectionLabel(connection) {
  const kind = normalizeConnectionKind(connection.kind);
  if (kind === "topology") {
    return connection.label;
  }
  if (kind === "vulnerability") {
    return connection.label || "exposes";
  }
  if (kind === "access") {
    return connection.label || "access";
  }
  if (!connection.port) {
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
