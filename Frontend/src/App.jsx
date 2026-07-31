import './App.css'
import { ReactFlow, Background, Controls, applyNodeChanges , addEdge ,applyEdgeChanges} from '@xyflow/react' //so we can use the react flow components in our app like the canvas, background and controls
import '@xyflow/react/dist/style.css'
import { useState, useEffect } from 'react'; //so we can manage the taps and switch between them 
//we have different node types with differnt functionality that is imported from the parts files 
import HostNode from './parts/HostNode';
import AllNodes from './parts/AllNodes';
import AttackerNode from './parts/AttackerNode'
import { ENV_STYLES } from './parts/blockTheme';
import { demoThreeSubnet, demoSingleSubnet, demoSixHost, demoOodaAttack } from './parts/demos';

//Buidling a simple UI for the app, with a tapbar, sidebar and main canves
//This is just a placeholder for now, we will add more functionality later
function App() {
const Eblocks = ["Host", "Router", "Service", "Vulnerability", "Misconfiguration", "Subnet", "User", "File"];
const Ablocks = ["Human", "LLM", "Algorithm", "Start", "Stop", "Choice", "DataFile", "Library", "Module", "Parameter", "Condition", "Action", "Executor" ];
//Adding properties for for each block 
const blockProperties = {
  Host: { name: "", image: "", RAM: "", disk: "" },//deleted IP becuse its dervied at compilation 
  Router: { name: "", image: ""},
  Service: { name:"", protocol: "", port: "", version: "" },
  Vulnerability: { name: "", CVE: "", Description: "", severity: "" },
  Misconfiguration: { name: "", Description: "" },
  Subnet: { name: "", CIDR: "" },//CIDR is a notation for describing IP address ranges
  User:{name: "", password: "", privilege_level: ""},
  File:{name: "", path: "", sensitivity: "", contents:""}
};
const attackerBlockProperties = {
  Start:     { },
  Stop:      { debug: false },
  Condition: { name: "", check: "" },
  Choice:    { name: "", useLlmSuggestion: false },
  Human:     { name: "", mode: "", prompt: "" },
  LLM:       { name: "", model: "", apiKey: "" },
  DataFile:  { name: "", format: "" },
  Parameter: { role: "", instruction: "" },
  Algorithm: { name: "", description: "" },
  Library:   { name: "", query: "" },
  Module:    { name: "", description: "" },
  Action:    { tool: "" },
  Executor:  { container: "" },
};
const attackerBlockStyles = {
 Start:    { accentColor: "#1e3a2f", textColor: "#5dffb0", icon: "▶",  category: "control" },
  Stop:     { accentColor: "#3a1e1e", textColor: "#ff6b6b", icon: "■",  category: "control" },
  Choice:   { accentColor: "#1e2a3a", textColor: "#7eb8ff", icon: "⋄",  category: "control" },
  Human:    { accentColor: "#3d2b00", textColor: "#ffc94d", icon: "👤", category: "agent"   },
  LLM:      { accentColor: "#2a1a4a", textColor: "#c084fc", icon: "🧠", category: "agent"   },
  Algorithm:{ accentColor: "#0d2e2e", textColor: "#34d1c5", icon: "⚙️", category: "agent"   },
  DataFile: { accentColor: "#1a1f3a", textColor: "#a5b4fc", icon: "📄", category: "data"    },
  Library:  { accentColor: "#0f1f35", textColor: "#60a5fa", icon: "🗂", category: "data"    },
  Module:   { accentColor: "#111611", textColor: "#a3e635", icon: "📦", category: "module"  },
  Condition: { accentColor: "#3a3320", textColor: "#ffe066", icon: "◇",  category: "control" },
  Parameter:{ accentColor: "#0f1f35", textColor: "#60a5fa", icon: "⚙",  category: "data"    },
  Action:   { accentColor: "#101a10", textColor: "#a3e635", icon: "🔧", category: "action"    },
  Executor: { accentColor: "#1e2a3a", textColor: "#7eb8ff", icon: "▶",  category: "control" },
};
//To make reading the connections of nodes eaiser we have colorcoded the style of the edges for enviornment nodes and just a natural grey color for attacker edge 
const styleEdge = (edge) => {
  const kind = edge.data?.kind;
  if (isAttackerFile) {
    return {
      ...edge,
      style: { stroke: "#9aa0aa", strokeWidth: 2 },
      markerEnd: { type: "", color: "#9aa0aa", width: 18, height: 18 },
    };
  }

  // Environment edges will takes the color  of the block it starts from.
  const src = nodes.find((n) => n.id === edge.source);
  const color = ENV_STYLES[src?.data?.blockType]?.accent ?? "#9aa0aa";
  return {
    ...edge,
    style: { stroke: color, strokeWidth: 2 },
    markerEnd: { type: "", color, width: 18, height: 18 },
    animated: kind === "vulnerability",
  };
};

//We need the first laod of the page to open an environment tap so people can buidl their environments 
//(In te future we want it to open a normal introductory first page not a specefic tap becsue users can choose to build attaackw without ana environment and vise versa)
const initialFile = { id: crypto.randomUUID(), name: "Env 1", type: "environment", nodes: [], edges: [] };
const [panelPos, setPanelPos] = useState({ x: 320, y: 80 });
const [dragging, setDragging] = useState(false);
const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
const [files , setFiles] = useState([initialFile]); //this will allow us to manage the state of the files that we have uploaded, we will use this to show the list of files in the sidebar 
const [activeId, setActiveId] = useState(initialFile.id); //this will allow us to manage the state of the active file, we will use this to switch between different files and show different content based on the active file
const [openMenu, setOpenMenu] = useState(null);   //  our current drop down menues "file" | "env" | "attacker" | "export" | "demos" | "compile" | 
const toggleMenu = (name) => setOpenMenu((cur) => (cur === name ? null : name));
const [selectedId, setSelectedId] = useState(null);
const activeFile = files.find((f) => f.id === activeId);
const nodes = activeFile ? activeFile.nodes : []; //this will get the nodes of the active file, if there is no active file it will return an empty array, we will use this to show the nodes on the canvas based on the active file
const selectedNode = nodes.find((n) => n.id === selectedId);
const edges = activeFile ? activeFile.edges : [];
const [dialog, setDialog] = useState(null); //state of the popup window for connction type 
//help write any changes made to edge back to file 
const setActiveEdges = (updater) => {
  setFiles((files) => files.map((f) =>
    f.id === activeId ? { ...f, edges: updater(f.edges) } : f
  ));
};
// determind the current mode from the active file's type+ the block typer we want to show 
const blocks = activeFile?.type === "attacker" ? Ablocks : Eblocks;
const isAttackerFile = activeFile?.type === "attacker";

//Service and vuln names come from what the backend can actually build and support, loaded once from the API
//we use these names in our dropdowns so they match waht we hav ein teh library rather than being typed by hand
const [serviceCatalog, setServiceCatalog] = useState([]);
const [vulnCatalog, setVulnCatalog] = useState([]);

//All the states we need while running an experiment 
const [expOpen, setExpOpen] = useState(false);
const [expEnvId, setExpEnvId] = useState("");
const [expAtkId, setExpAtkId] = useState("");
const [expStage, setExpStage] = useState("");//to know which stage we are on (deploy --> compile --> run)
const [expLines, setExpLines] = useState([]);

//filling in our service and vulnaribilities catalog from our backend on the first laod 
useEffect(() => {
  fetch("http://127.0.0.1:8000/services")
    .then((r) => r.json())
    .then((d) => setServiceCatalog(Array.isArray(d) ? d : []))
    .catch(() => setServiceCatalog([]));
  fetch("http://127.0.0.1:8000/vulnerabilities")
    .then((r) => r.json())
    .then((d) => setVulnCatalog(Array.isArray(d) ? d : []))
    .catch(() => setVulnCatalog([]));
}, []);

//when we drag and drop we store the value of blocks into state and we return that then after droping them 
//anything above the return are out state and helper functions and cacluated values that we will use in our app, 
//anything inside the return is what we will render on the page
const newFile = (type) => {
  const count = files.filter((f) => f.type === type).length + 1;
  const name = (type === "environment" ? "Env " : "Attacker ") + count;
  const file = { id: crypto.randomUUID(), name, type, nodes: [], edges: [] };
  setFiles((current) => [...current, file]);
  setActiveId(file.id);
  setOpenMenu(null);   // close the File menu after creating a file
};
//this help us write the changes made to the canves back to the file and change between canveses and tabs
const setActiveNodes = (updater) => {
  setFiles((files) => files.map((f) =>
    f.id === activeId ? { ...f, nodes: updater(f.nodes) } : f
  ));
};
//for us to close any env or attacker tap we close a file 
const closeFile = (id) => {
  setFiles((current) => current.filter((f) => f.id !== id));
  if (activeId === id) setActiveId(null);//delete the active file and set the active id to null if we closed the active file
};
//this help us write the changes made to the canves back to the file and change between canveses and tabs
//Updating properties on one node on the canvas  and writting it back to the file 
const updateNodeProperty = (nodeId, key, value) => {
  setActiveNodes((nds) => nds.map((n) =>{
    if ( n.id !== nodeId) return n;
    const newProperties = { ...n.data.properties, [key]: value };
    const newLabel = (key ==="name")
      ? makeLabel(n.data.blockType, value)
      : (key === "tool")
        ? `🔧 Action: ${value}`
        : n.data.label;
      return{
      ...n,
    data: { ...n.data, properties: newProperties, label: newLabel },
    };
  }));
};
//setting a name and then auto-fill siblings for eaiser nad faster build (just for service and vuln) 
//typing a custom name falls back to updateNodeProperty
const applyPreset = (nodeId, blockType, preset) => {
  setActiveNodes((nds) => nds.map((n) => {
    if (n.id !== nodeId) return n;
    const p = { ...n.data.properties };
    if (blockType === "Service") {
      p.name = preset.name; p.protocol = preset.protocol;
      p.port = preset.port; p.version = preset.version;
    } else if (blockType === "Vulnerability") {
      p.name = preset.name; p.CVE = preset.cve;
      p.Description = preset.description; p.severity = preset.severity;
    }
    return { ...n, data: { ...n.data, properties: p, label: makeLabel(blockType, preset.name) } };
  }));
};
//need a button where we can delete a specific node and update our states
const deleteSelectedNode = () => {
  if (!selectedId) return;
  const parent = nodes.find((n) => n.id === selectedId);
  setActiveNodes((nds) => nds
    .map((n) => (parent && n.parentId === selectedId)
      ? { ...n, parentId: undefined, data: { ...n.data, parentId: undefined },
          position: { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y } }
      : n)
    .filter((n) => n.id !== selectedId));
  setActiveEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
  setSelectedId(null);
};
//To have the C shape from scratch where we attach an agent into a choice blcok we need to adabt to support parent nodes 
//for our nodes to attach we need to specify the compute distance from where they detect each other 
//these are gonna be used as inputs into onNodeDragStop
const AGENTS = ["LLM", "Human"];
const dimsOf = (n) => ({
  w: n.measured?.width  ?? 120,
  h: n.measured?.height ?? (n.data.blockType === "Choice" ? 92 : 60),
});


//we need this helper function to determind if an agent blcok was dropped into a choice block 
const onNodeDragStop = (_e, node) => {
  const oldParentId = node.parentId;///was the agent alredy setting already into choice block
  if (!isAttackerFile || !AGENTS.includes(node.data.blockType)) return;//if we are not in an attacker mood we do not want to use this fucntion so return 
  //compare the agent center against every Choice  block on the same coordinate system
  const parentNow = node.parentId ? findNode(node.parentId) : null;
  const abs = parentNow
    ? { x: parentNow.position.x + node.position.x, y: parentNow.position.y + node.position.y }
    : { x: node.position.x, y: node.position.y };
  const a = dimsOf(node);
  const aCx = abs.x + a.w / 2, aCy = abs.y + a.h / 2;   // agent center

  // walk all the choice blocks and attach to the Choice whose center is nearest(here)
  let best = null;
  for (const n of nodes) {
    if (n.data.blockType !== "Choice") continue;
    const c = dimsOf(n);
    const cCx = n.position.x + c.w / 2, cCy = n.position.y + c.h / 2;
    const d = Math.hypot(aCx - cCx, aCy - cCy);
    // generous: "touching or within ~half a block" counts as an attach
    const reach = (a.w + c.w) / 2 + 40;
    if (d < reach && (!best || d < best.d)) 
      best = { choice: n, c, d };
  }

//we need to rebuild the nodes list beacuse we need to 
  setActiveNodes((nds) => {
    const updated = nds.map((n) => {
//1)clear the old choice block 

      if (oldParentId && n.id === oldParentId && (!best || best.choice.id !== oldParentId)) {
        return { ...n, data: { ...n.data, cradleW: undefined, cradleH: undefined } };
      }
      if (best && n.id === best.choice.id) {
        return { ...n, data: { ...n.data, cradleW: a.w, cradleH: a.h } };
      }
      if (n.id !== node.id) return n;
      //2)adapt the width and hight of the choice cardle to wrap around the agent dimensione 
      //3)set the new parent ID for the agent to teh choice blcok we attached to 
      if (best) {
        const { c } = best;
        return { ...n, parentId: best.choice.id,
                 data: { ...n.data, parentId: best.choice.id },
                 position: { x: 92, y: 16 } };   // flush at right, 12px down for the top arm
      }
      return n.parentId
      //other nodes just passes 
        ? { ...n, parentId: undefined, data: { ...n.data, parentId: undefined }, position: abs }
        : n;
    });
    //recored the agent child after its parent choice
    if (!best) return updated;
    const child = updated.find((n) => n.id === node.id);
    const rest  = updated.filter((n) => n.id !== node.id);
    rest.splice(rest.findIndex((n) => n.id === best.choice.id) + 1, 0, child);
    return rest;
  });
};


//When we draw edges between blcoks we need to keep track of its source and target and recored the edge and check if its allowed 
const onConnect = (connection) => {
 if (isAttackerFile) {
    setActiveEdges((eds) => addEdge(connection, eds));   // already validated by isValidConnection
    return;
  }
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  const result = connectionKind(source.data.blockType, target.data.blockType);//validate if teh connection is corerct in  connectionKind
  if (result.status === "invalid") {
    setDialog({ kind: "invalid", reason: result.reason });
  } else if (result.status === "ambiguous") {
    setDialog({ kind: "ambiguous", connection });
  } else {
const kind = connectionKind(source.data.blockType, target.data.blockType).type;
  setActiveEdges((eds) => addEdge({ ...connection, data: { kind } }, eds));//recored the valid edges 
  }
};
//a helper function to handles all types of edge connections 
//this function expect direcional correct so if we want to connect host to router it should start from host and be connected to router 
//I NEED TO ADD A REVERSE RULE SO THE CONNECTIONS WORK NO MATER WHERE YOU START THE CONNCTION FROM 
//WILL BE CHANGED 
const connectionKind = (sourceType, targetType) => {
 if (sourceType === "Service" && targetType === "Host")
    return { status: "valid", type: "service" };
  if ((sourceType === "Vulnerability" || sourceType === "Misconfiguration") && targetType === "Service")
    return { status: "valid", type: "vulnerability" };
  if (sourceType === "Router" && targetType === "Host")
    return { status: "valid", type: "topology" };
  if (sourceType === "Router" && targetType === "Router")
    return { status: "valid", type: "topology" };
  if (sourceType === "Router" && targetType === "Subnet")
    return { status: "valid", type: "topology" };
  if (sourceType === "Subnet" && targetType === "Router")
    return { status: "valid", type: "topology" };
  if (sourceType === "Subnet" && targetType === "Host")
    return { status: "valid", type: "topology" };
  if (sourceType === "Service" && (targetType === "Vulnerability" || targetType === "Misconfiguration"))
    return { status: "valid", type: "vulnerability" };
  if (sourceType === "User" && targetType === "Host")
    return { status: "valid", type: "account" };
  if (sourceType === "File" && targetType === "Host")
    return { status: "valid", type: "storage" };
  if (sourceType === "User" && targetType === "File")
    return { status: "valid", type: "access" };
  if (sourceType === "File" && targetType === "User")
    return { status: "valid", type: "access" };
  return { status: "invalid", reason: `A ${sourceType} can't connect to a ${targetType}.` };
};

const makeLabel = (blockType, idValue) => {
  const icon = ENV_STYLES[blockType]?.icon ?? "";   // icons come from the live theme in blockTheme
  return idValue ? `${icon} ${blockType}: ${idValue}` : `${icon} ${blockType}`;
};

//node object look up using id 
const findNode = (id) => nodes.find((n) => n.id === id);
//finding the name of node look up 
const idName = (node) => node.data.properties?.name;


//Compile the current canves file of teh environment into a JSON file that can be used in the backend to be turned into docker files 
const buildEnvFrom = (file) => {
  const fnodes = file.nodes, fedges = file.edges;//normal look up for nodes in our active file (active tap)
  const findN = (id) => fnodes.find((n) => n.id === id);//use the files passed in not teh active tap(thsi is used when we run an experiment)
  const env = { name: file.name, hosts: [], subnets: [], routers: [],//our json will hvae all these sectiosn as a flat lsit of nodes 
    services: [], vulnerabilities: [], misconfigurations: [], users: [], files: [], connections: [] };
  for (const node of fnodes) {
    const p = node.data.properties || {};
    switch (node.data.blockType) {
      case "Host":            env.hosts.push({ name: p.name, image: p.image, ram: p.RAM, disk: p.disk }); break;
      case "Subnet":          env.subnets.push({ name: p.name, cidr: p.CIDR }); break;
      case "Router":          env.routers.push({ name: p.name, image: p.image }); break;
      case "Service":         env.services.push({ name: p.name, protocol: p.protocol, port: p.port, version: p.version }); break;
      case "Vulnerability":   env.vulnerabilities.push({ name: p.name, cve: p.CVE, description: p.Description, severity: p.severity }); break;
      case "Misconfiguration":env.misconfigurations.push({ name: p.name, description: p.Description }); break;
      case "User":            env.users.push({ name: p.name, privilege_level: p.privilege_level, password: p.password }); break;
      case "File":            env.files.push({ name: p.name, path: p.path, sensitivity: p.sensitivity, contents: p.contents }); break;
    }
  }
  //also need to recored the edges between our blocks 
  for (const edge of fedges) {
    const source = findN(edge.source), target = findN(edge.target);
    if (!source || !target) continue;
    const fromType = source.data.blockType, toType = target.data.blockType;
    env.connections.push({ from: idName(source), to: idName(target), fromType, toType,
      kind: edge.data?.kind || connectionKind(fromType, toType).type });
  }
  return env;//return the neasted list back 
};
const buildEnv = () => buildEnvFrom(activeFile);

// Compile the attacker canvas into the agreed contract JSON.
// Three outputs we need: blocks (id/name/propertise), control_connections (labeled), data_connections (read/write)
// all these outputs will be used in our python mapper in the backend)
const buildAttackFrom = (file) => {
  const fnodes = file.nodes, fedges = file.edges;//normal look up for nodes in our active file (active tap)
  const findN = (id) => fnodes.find((n) => n.id === id);//use the files passed in not the active tap(this is used when we run an experiment)
  const startNode = fnodes.find((n) => n.data.blockType === "Start");
  const blocks_on_canvas = fnodes.map((node) => ({
    id: node.id, name: node.data.blockType, properties: { ...(node.data.properties || {}) } }));
  const control_connections = [], data_connections = [];
  const branchTypes = ["Choice", "Condition"];
  for (const edge of fedges) {
    const sh = edge.sourceHandle || "";
    const source = findN(edge.source), target = findN(edge.target);
    if (!source || !target) continue;
    if (sh.startsWith("cf")) {
      const label = sh.startsWith("cf-out-") ? sh.slice("cf-out-".length) : "next";
      const conn = { from: edge.source, to: edge.target, label };
      if (branchTypes.includes(source.data.blockType)) conn.backend_decides = true;
      control_connections.push(conn);
    } else {
      const dataBlocks = ["DataFile", "Parameter", "Library"];
      data_connections.push({ from: edge.source, to: edge.target,
        access: dataBlocks.includes(source.data.blockType) ? "read" : "write" });
    }
  }
  // Cradle attachments carry no edge but the parent/child connection is the same Choice->agent data wiring (we give it the same edge contract)
  for (const node of fnodes) {
    if (!node.parentId) continue;
    const parent = findN(node.parentId);
    if (parent?.data.blockType === "Choice")
      data_connections.push({ from: parent.id, to: node.id, access: "write" });
  }
  return { name: file.name, start: startNode ? startNode.id : null,
    blocks_on_canvas, control_connections, data_connections };
};
const buildAttack = () => buildAttackFrom(activeFile);

const exportAttack = () => downloadJSON(`${activeFile.name}-attack.json`, buildAttack());
const exportEnv = () => downloadJSON(`${activeFile.name}-env.json`, buildEnv());
// give users the option to Download JSON
const downloadJSON = (filename, data0bj) => {
  const text = JSON.stringify(data0bj, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};


//post to teh backend to tear down the atatcker continer 
async function quitAttacker() {
  try {
    const res = await fetch("http://127.0.0.1:8000/quit-attacker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEnv()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "attacker teardown failed");
    alert(`Attacker down: ${data.attacker}`);
  } catch (e) {
    alert(`Attacker teardown failed: ${e.message}`);
  }
}


//we sill use hierachy structure for JSON file to match the examples from MHbench
//We need to use the flat env we created and use it to compile a file for docker where the orginization is from top to bottom
//subnets contain hosts and host contin other stuff and router could connect subnets or hosts toghther
// buildDockerDsl: PURE transform flat env -> nested docker DSL. Returned (not downloaded) so both
//the Compile->Docker button and Run Environment reuse it. This is our intermediary DSL.
const buildDockerDsl = (env) => {
  const hostsBySubnet = {};
  const Subnetcounts = {};
  //first find each subnet that has host inside it so we check the conntions we made in env that contain Host or Subnet 
    const subnetOfHost = (hostName) => {
    for (const c of env.connections) {
      if (c.fromType === "Host" && c.from === hostName && c.toType === "Subnet") return c.to;
      if (c.toType === "Host" && c.to === hostName && c.fromType === "Subnet") return c.from;
    }
    return null;
  };
  //we assign hosts under subnets 
  env.subnets.forEach((s) => { hostsBySubnet[s.name] = []; });
  //for each host we need to assign it different IP
  for (const h of env.hosts) {
    const subnet = env.subnets.find((s) => s.name === subnetOfHost(h.name));
    if (!subnet || !subnet.cidr) continue;
    const octets = subnet.cidr.split("/")[0].split(".");
    const n = Subnetcounts[subnet.name] || 0;
    octets[3] = String(10 + n);
    Subnetcounts[subnet.name] = n + 1;
    hostsBySubnet[subnet.name].push({ name: h.name, image: h.image, ip: octets.join("."), ram: h.ram, disk: h.disk });
  }
  const subnets = env.subnets.map((s) => ({ name: s.name, cidr: s.cidr, hosts: hostsBySubnet[s.name] || [] }));
//which subnets does a router connect to 
  const networksOfRouter = (routerName) => {
    const result = [];
    for (const c of env.connections) {
      if (c.fromType === "Router" && c.from === routerName && c.toType === "Subnet") result.push(c.to);
      if (c.toType === "Router" && c.to === routerName && c.fromType === "Subnet") result.push(c.from);
    }
    return result;
  };
  const routers = env.routers.map((r) => ({ name: r.name, image: r.image, networks: networksOfRouter(r.name) }));
  // subnet_connections from Router and Subnet connections 
  const subnetConnections = [];
  for (const c of env.connections) {
    const rs = c.fromType === "Router" && c.toType === "Subnet";
    const sr = c.fromType === "Subnet" && c.toType === "Router";
    if (rs || sr) subnetConnections.push({ router: rs ? c.from : c.to, from_subnet: rs ? c.to : c.from, to_subnet: null, bidirectional: true });
  }
  // All the connections except the ones we have listed before 
  const connections = [];
  for (const c of env.connections) {
    const topoPair = (c.fromType === "Subnet" || c.fromType === "Router") && (c.toType === "Subnet" || c.toType === "Router");
    const hostSubnet = (c.fromType === "Host" && c.toType === "Subnet") || (c.fromType === "Subnet" && c.toType === "Host");
    if (topoPair || hostSubnet) continue;
    connections.push({ from: c.from, to: c.to, fromType: c.fromType, toType: c.toType, label: c.kind });
  }
  //building our env object with all the small objects we have built 
  const dockerEnv = {
    name: env.name,
    networks: [{ name: env.name, subnets }],
    subnet_connections: subnetConnections,
    services: env.services.map((s) => ({ ...s, type: s.name })),
    vulnerabilities: env.vulnerabilities,
    misconfigurations: env.misconfigurations,
    routers,
    users: env.users,
    files: env.files,
    connections,
  };
  return dockerEnv;
};
// Compile->Docker button: build the DSL and download it for inspection.
const compileToDocker = (env) => downloadJSON(`${env.name}-docker.json`, buildDockerDsl(env));
//To have the ability to compile to differnt structures in the future(MHBENCH)
const targets = {
  docker: compileToDocker,
};
const compile = (targetName) => {
  const env = buildEnv();              // flat envionment
  const target = targets[targetName];  // which compilation to choose 
  if (!target) {
    alert("Unknown target: " + targetName);
    return;
  }
  target(env);                         
};


//builds the JSON attck contract that we got from buildAttacka nd post it to backend for our mapper to sue 
const compileAttack = async () => {
  const attack = buildAttack();
  try {
    const res = await fetch("http://127.0.0.1:8000/compile-attack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attack),
    });
    const data = await res.json();
    if (!res.ok) { alert("Compile failed: " + (data.error || res.status)); console.error(data.traceback); return; }
    const blob = new Blob([data.main_py], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "main.py"; a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Could not reach backend at :8000 — is backend running?");
    console.error(err);
  }
};

//we use this after "deploy env" is pressed 
//first build our dsl by passing out falt env to the docker builder and get our neasted dsl and post it to backend
const runEnvironment = async () => {
  const dsl = buildDockerDsl(buildEnv());
  try {
    const res = await fetch("http://127.0.0.1:8000/deploy", {//HTTP request to URL and wait for the backend to reply ( it waits for the whole deploying to finish)
      method: "POST",
      headers: { "Content-Type": "application/json" },//type of the file we are sending
      body: JSON.stringify(dsl)
    });
    //reporting back the deployment status 
    const data = await res.json();//the respons we get back from the backend 
    if (!res.ok) {
      alert("Deploying failed: " + (data.error || res.status));
      console.error(data.traceback);
      return;
    }
    alert("Deployed: " + data.project);
    console.log("deployment state:", data);
  } catch (err) {//catching the other failure where res was not event produced
    alert("Could not reach backend at :8000 — is backend running?");
    console.error(err);
  }
};
//POST helper
const post = async (path, body) => {
  const res = await fetch("http://127.0.0.1:8000" + path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `${path} -> ${res.status}`);
  return data;
};

// when we run our exp we wnat to -->deploy env -->debloy attacker -->compile attack (if all are done we can run the attack against what we built)
const runExperiment = async () => {
  const envFile = files.find((f) => f.id === expEnvId);
  const atkFile = files.find((f) => f.id === expAtkId);
  setExpLines([]);
  try {
    setExpStage("Deploying environment…");
    await post("/deploy", buildDockerDsl(buildEnvFrom(envFile)));   // nested DSL, like runEnvironment
    setExpStage("Deploying attacker…");
    await post("/deploy-attacker", buildEnvFrom(envFile));          // flat env, like runAttacker
    setExpStage("Compiling attacker flow…");
    await post("/compile-attack", buildAttackFrom(atkFile));        // rebakes prompts from canvas -> fresh main.py
    setExpStage("Running attack…");
    const { job_id } = await post("/run-attack", {});
    let cursor = 0, done = false;
    while (!done) {
      const s = await post("/attack-status", { job_id, cursor });
      if (s.lines.length) setExpLines((prev) => [...prev, ...s.lines]);
      cursor = s.cursor; done = s.done;
      if (!done) await new Promise((r) => setTimeout(r, 1500));
    }
    setExpStage("Finished");
  } catch (e) {
    setExpStage("Error: " + e.message);
  }
};


// tears down the running stack and tear down the docker backend 
// The backend lazily restarts on the next Run Environment.
const endExperiment = async () => {
  const dsl = buildDockerDsl(buildEnv());
  try {
    const res = await fetch("http://127.0.0.1:8000/quit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dsl)
    });
    const data = await res.json();
    if (!res.ok) {
      alert("End experiment failed: " + (data.error || res.status));
      console.error(data.traceback);
      return;
    }
    alert("Experiment ended (stack down, docker backend stopped).");
    console.log("end state:", data);
  } catch (err) {
    alert("Could not reach backend at :8000 — is backend running?");
    console.error(err);
  }
};
//giving the option to deploy the attcaker alone 
async function runAttacker() {
  try {
    const res = await fetch("http://127.0.0.1:8000/deploy-attacker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEnv()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "attacker deploy failed");
    alert(`Attacker deployed: ${data.attacker} on ${data.network}`);
  } catch (e) {
    alert(`Attacker deploy failed: ${e.message}`);
  }
}

//since all of our agents can have multiable control handels we addeda menue to chooce their control edges we wnat to use 
const AGENT_CF = ["LLM", "Human", "Algorithm"]; 
const toggleCfOut = (nodeId, handle) => {
  if (handle === "next") return;   // locked in all simple systems you jsut want to continue 
  setActiveNodes((nds) => nds.map((n) => {
    if (n.id !== nodeId) return n;
    const cur = n.data.enabledCfOut ?? ["next"];
    const on = cur.includes(handle);
    const next = on ? cur.filter((h) => h !== handle) : [...cur, handle];
    return { ...n, data: { ...n.data, enabledCfOut: next } };
  }));
  // if turning OFF, prune any edge from that now-gone handle
  setActiveEdges((eds) => eds.filter((e) =>
    !(e.source === nodeId && e.sourceHandle === `cf-out-${handle}`)
  ));
};

//Just laoding examples of environmets + one atatcker system to test compilation and attck systems faster 
//Builders live in ./parts/demos where the wrappers apply a chosen demo to the active file(moved to make readability eaiser)
const applyDemo = ({ nodes, edges }) => {
  setActiveNodes(() => nodes);
  setActiveEdges(() => edges);
};
const loadDemoEnvironment  = () => applyDemo(demoThreeSubnet({ makeLabel }));
const loadDemoSingleSubnet = () => applyDemo(demoSingleSubnet({ makeLabel }));
const loadDemoSixHost      = () => applyDemo(demoSixHost({ makeLabel }));
const loadDemoAttack       = () => applyDemo(demoOodaAttack({ attackerBlockStyles, attackerBlockProperties, AGENT_CF, toggleCfOut }));


//The start of the app 
return ( 
<> 
      <div className="App"> 
      {selectedNode && (
  <div className="Inspector" style={{ left: panelPos.x, top: panelPos.y }}>
    <div
      className="InspectorHeader"
      onPointerDown={(e) => {
        setDragging(true);
        setDragStart({ x: e.clientX - panelPos.x, y: e.clientY - panelPos.y });
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragging) setPanelPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      }}
      onPointerUp={(e) => {
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      <span>{selectedNode.data.blockType}</span>
{/* This is the header of the inspector panel, it will show the type of the selected node and a close button, we also added the functionality to drag the panel around the screen by clicking and dragging the header */}
<button
  onPointerDown={(e) => e.stopPropagation()}
  onClick={() => setSelectedId(null)}
>x</button>    </div>
    <div className="InspectorBody">
      <button onClick={deleteSelectedNode}>
  Delete block
      </button>
{Object.keys(selectedNode.data.properties || {}).map((key) => {
  const dropdownOptions = {
    role: ["Reasoning", "Generation", "Parsing", "ReasonAct"],
    mode: ["Editor", "Reviewer", "Executor"],
    tool: ["nmap", "curl", "nc", "hydra", "ssh", "sshpass", "mysql"],
    format: ["ptt", "text"],
    model: [
    "claude-opus-4-5",
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-haiku-4-5",
    "claude-fable-5",
    ],
    apiKey: ["ANTHROPIC_API_KEY"],

  };
  return (
    <div key={key}>
      <label>{key}</label>
      {(() => {
        
        const bt = selectedNode.data.blockType;
        const catalog = (bt === "Service" && key === "name") ? serviceCatalog
                      : (bt === "Vulnerability" && key === "name") ? vulnCatalog
                      : null;
        if (catalog) {
          const listId = `cat-${bt}-${selectedNode.id}`;
          const opts = Array.isArray(catalog) ? catalog : [];
          return (
            <>
              <input
                list={listId}
                value={selectedNode.data.properties[key] ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const hit = opts.find((c) => c && c.name === val);
                  if (hit) applyPreset(selectedNode.id, bt, hit);
                  else updateNodeProperty(selectedNode.id, key, val);
                }}
              />
              <datalist id={listId}>
                {opts.map((c, i) => (
                  <option key={c?.name ?? i} value={c?.name ?? ""}>
                    {c?.cve ? `${c.name} (${c.cve})` : (c?.name ?? "")}
                  </option>
                ))}
              </datalist>
            </>
          );
        }
        return dropdownOptions[key] ? (
          <select value={selectedNode.data.properties[key]}
            onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)}>
            <option value="">-- choose {key} --</option>
            {dropdownOptions[key].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : (
          <input value={selectedNode.data.properties[key]}
            onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)} />
        );
      })()}
    </div>
  );
})}
    </div>
  </div>
)}
      {dialog && (
  <div className="Dialog">
    {dialog.kind === "invalid" && (
      <>
        <p>Invalid connection: {dialog.reason}</p>
        <button onClick={() => setDialog(null)}>OK</button>
      </>
    )}
    {dialog.kind === "ambiguous" && (
      <>
        <p>What kind of connection is this?</p>
        <button onClick={() => {
          setActiveEdges((eds) => addEdge({ ...dialog.connection, data: { kind: "topology" } }, eds));
          setDialog(null);
        }}>Topology</button>
        <button onClick={() => {
          setActiveEdges((eds) => addEdge({ ...dialog.connection, data: { kind: "access" } }, eds));
          setDialog(null);
        }}>Access</button>
      </>
    )}
  </div>
)}
{expOpen && (
  <div
    className="Dialog"
    style={{
      resize: "both",           
      overflow: "auto",         //resizing 
      minWidth: 360,
      minHeight: 260,
      width: 640,
      height: 480,
      display: "flex",
      flexDirection: "column",
    }}
  >
    <button
      onClick={() => setExpOpen(false)}
      style={{ alignSelf: "flex-start", marginBottom: 8 }}
    >
      ×
    </button>

    <h3 style={{ marginTop: 0 }}>Run Experiment</h3>

    <div>
      <label>Environment </label>
      <select value={expEnvId} onChange={(e) => setExpEnvId(e.target.value)}>
        <option value="">-- choose --</option>
        {files.filter((f) => f.type === "environment").map((f) =>
          <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </div>

    <div>
      <label>Attacker </label>
      <select value={expAtkId} onChange={(e) => setExpAtkId(e.target.value)}>
        <option value="">-- choose --</option>
        {files.filter((f) => f.type === "attacker").map((f) =>
          <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </div>

    <div>
      <button disabled={!expEnvId || !expAtkId} onClick={runExperiment}>Run</button>
    </div>
    {expStage && <div>Status: {expStage}</div>}
    <pre
      style={{
        flex: 1,                 
        minHeight: 0,           
        overflow: "auto",        
        whiteSpace: "pre-wrap",  
        wordBreak: "break-word",
        textAlign: "left",
        background: "#0d0d0d",
        color: "#d0d0d0",
        padding: 8,
        margin: 0,
      }}
    >
      {expLines.join("\n")}
    </pre>
  </div>
)}
{/*tucked all of our buttons under orgnized dropdown menues on the tapbar */}
    <div className="Tapbar">
      {/* File */}
      <span className="Brand">Cyblocks</span>
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={() => toggleMenu("file")}>File ▾</button>
        {openMenu === "file" && (
          <div className="Menu">
            <button onClick={() => newFile("environment")}>New Environment</button>
            <button onClick={() => newFile("attacker")}>New Attacker</button>
          </div>
        )}
      </div>
      {/* Environment lifecycle */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={() => toggleMenu("env")}>Environment ▾</button>
        {openMenu === "env" && (
          <div className="Menu">
            <button onClick={() => { runEnvironment(); setOpenMenu(null); }}>Deploy Environment</button>
            <button onClick={() => { endExperiment(); setOpenMenu(null); }}>End Environment</button>
          </div>
        )}
      </div>

      {/* Attacker lifecycle */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={() => toggleMenu("attacker")}>Attacker ▾</button>
        {openMenu === "attacker" && (
          <div className="Menu">
            <button onClick={() => { runAttacker(); setOpenMenu(null); }}>Deploy Attacker</button>
            <button onClick={() => { quitAttacker(); setOpenMenu(null); }}>Quit Attacker</button>
          </div>
        )}
      </div>

      {/* Export */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={() => toggleMenu("export")}>Export ▾</button>
        {openMenu === "export" && (
          <div className="Menu">
            <button onClick={() => { exportEnv(); setOpenMenu(null); }}>Export Environment</button>
            {isAttackerFile && <button onClick={() => { exportAttack(); setOpenMenu(null); }}>Export Attack</button>}
          </div>
        )}
      </div>

      {/* Compile */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={() => toggleMenu("compile")}>Compile ▾</button>
        {openMenu === "compile" && (
          <div className="Menu">
            <button onClick={() => { compile("docker"); setOpenMenu(null); }}>Docker</button>
            {isAttackerFile && <button onClick={() => { compileAttack(); setOpenMenu(null); }}>Compile Attack</button>}
          </div>
        )}
      </div>
      {/* Demos */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button onClick={() => toggleMenu("demos")}>Demos ▾</button>
        {openMenu === "demos" && (
          <div className="Menu">
            <button onClick={() => { loadDemoEnvironment(); setOpenMenu(null); }}>Load 3-subnet Demo</button>
            <button onClick={() => { loadDemoSingleSubnet(); setOpenMenu(null); }}>Load Single-Subnet</button>
            <button onClick={() => { loadDemoSixHost(); setOpenMenu(null); }}>Load 6-Host Demo</button>
            <button onClick={() => { loadDemoAttack(); setOpenMenu(null); }}>Load Ooda Attack </button>

          </div>
        )}
      </div>
      {/* keept teh run and clear outside the menu to amke it eaiser to find them */}
      <button className="Primary" onClick={() => setExpOpen(true)}>▶ Run Experiment</button>
      <button className="Danger" onClick={() => setActiveNodes(() => [])}>Clear canvas</button>
    </div>

     <div className="Toolbar">
        {/* so each tap gets its own canves */}
        {files.map((file) => (
        <div key={file.id} className={file.id === activeId ? "Tab active" : "Tab"}>
        <button onClick={() => setActiveId(file.id)}>{file.name}</button>
        <button onClick={() => closeFile(file.id)}>x</button>
         </div>
        ))}
      </div>
    <div className="Main">
        <div className="Sidebar">
        Blocks
      {/*This will render a list of blocks in the sidebar,  react needs a key for each element in a list so we can track which elements have changed, been added or removed */}
      {blocks.map((block) => {
        //map the style of each kind of blocks 
        const aStyle = attackerBlockStyles[block];
        const eStyle = ENV_STYLES[block];
        const bg    = isAttackerFile ? aStyle?.accentColor : eStyle?.fill;
        const color = isAttackerFile ? aStyle?.textColor   : eStyle?.accent;
        const icon  = isAttackerFile ? aStyle?.icon        : eStyle?.icon;
        return (
          <div key={block} className="Block"
            style={{ background: bg, color, border: `1px solid ${color}` }}
            draggable
            onDragStart={(event) => { event.dataTransfer.setData("application/reactflow", block); }}>
            {icon} {block}
          </div>
        );
      })}
        </div>
        <div className="Canvas">
        {/*This part is mostly repsosnable for the drag and drop functionality on canves with React Flow*/}
        <ReactFlow nodes={nodes}  
        onNodesChange={(changes) => setActiveNodes((nds) => applyNodeChanges(changes, nds))} 
        edges={edges.map(styleEdge)}
        nodeTypes={{Host: HostNode,
                    Subnet: AllNodes,
                    Router: AllNodes,
                    Service: AllNodes,
                    Vulnerability: AllNodes,
                    Misconfiguration: AllNodes,
                    User: AllNodes,
                    File: AllNodes,
                    Start:     AttackerNode,
                    Stop:      AttackerNode,
                    Choice:    AttackerNode,
                    Human:     AttackerNode,
                    LLM:       AttackerNode,
                    Algorithm: AttackerNode,
                    DataFile:  AttackerNode,
                    Library:   AttackerNode,
                    Module:    AttackerNode, 
                    Condition: AttackerNode,
                    Parameter: AttackerNode,
                    Action:    AttackerNode,
                    Executor:  AttackerNode, 
        }}
        defaultEdgeOptions={{type: 'step'}}
        isValidConnection={(connection)=> {
   //need a specific handel for agents paramesters (its just data might make it noreml again)
                if (isAttackerFile) 
{   
    const s = connection.sourceHandle || "";
    const t = connection.targetHandle || "";
    const srcNode = nodes.find((n) => n.id === connection.source);

    // param-in is a valid target but only from a Parameter
    if (srcNode?.data.blockType === "Parameter") return t === "param-in";
    if (t === "param-in") return srcNode?.data.blockType === "Parameter";

    // everything else 
    const sourceIsOut = s.startsWith("cf-out") || s === "data-out";
    const targetIsIn  = t === "cf-in" || t === "data-in";
    if (!sourceIsOut || !targetIsIn) return false;

    return (s.startsWith("cf") ? "control" : "data") === (t.startsWith("cf") ? "control" : "data");
        }
        const sourceNode = nodes.find((n) => n.id === connection.source);
        // Each named handle only accepts one block type
        const handleAccepts = {
          "host-subnet":  "Subnet",
          "host-service": "Service",
          "host-router":  "Router",
          "host-file":    "File",
          "host-user":    "User",
        };

        if (connection.targetHandle && handleAccepts[connection.targetHandle]) {
          return sourceNode?.data.blockType === handleAccepts[connection.targetHandle];
        }

        // Everything else passes through connectionKind  which handles validation for them 
        return true;  
        }}
        onEdgesChange={(changes) => setActiveEdges((eds) => applyEdgeChanges(changes, eds))}
        onConnect={onConnect}
        onNodeClick={(event, node) => setSelectedId(node.id)}
        onNodeDragStop={onNodeDragStop}
        onDragOver={(event) => event.preventDefault()} //this will allow us to drop elements on the canvas, by default the browser does not allow dropping elements on a page, so we need to prevent the default behavior
        onDrop ={(event) => {
          event.preventDefault(); //this will prevent the default behavior of the browser when dropping an element, which is to open the element in a new tab
          const name = event.dataTransfer.getData("application/reactflow"); //this will get the data that we set when we started dragging the block, which is the name of the block
          const bounds = event.currentTarget.getBoundingClientRect();
          const position = { x: event.clientX - bounds.left, y:event.clientY - bounds.top };// need to calculate the position of the node based on the position of the mouse and the position of the canvas, because the position of the mouse is relative to the entire page, but we need the position of the node to be relative to the canvas
          let newNode;

            if (isAttackerFile) {
            const aStyle = attackerBlockStyles[name];
            const id = crypto.randomUUID();
            newNode = {
              id,
              type: name,
              position,
              data: {
                id,
                label: name,
                blockType: name,
                accentColor: aStyle?.accentColor,
                textColor: aStyle?.textColor,
                icon: aStyle?.icon,
                category: aStyle?.category,
                properties: { ...attackerBlockProperties[name] },
                ...(AGENT_CF.includes(name) && {
                  enabledCfOut: ["next"],
                  onToggleCfOut: toggleCfOut,
                }),
              },
            };
          } else {
      newNode = {
          id: crypto.randomUUID(),
          type: name,
          position,
          data: { label: makeLabel(name, ""), blockType: name, properties: { ...blockProperties[name] } },
        };
       } 
       setActiveNodes((current) => [...current, newNode]);
        }}
        >
          {/*This is the main canvas where we will add our nodes and edges, we will use the react flow library to handle the canvas and its functionality like zooming, panning and connecting nodes*/}
          {/*This will add a background to our canvas, we will customize in later steps*/}
          <Background
          color="#2a2f3d" gap={16}
           />

          {/*This will add controls to our canvas like zooming and panning, we will customize in later steps*/}
          <Controls />
          </ReactFlow>
        </div>

      </div>
    </div>
    </>
  )
}
export default App