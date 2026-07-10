import './App.css'
import { ReactFlow, Background, Controls, applyNodeChanges , addEdge ,applyEdgeChanges} from '@xyflow/react' //so we can use the react flow components in our app like the canvas, background and controls
import '@xyflow/react/dist/style.css'
import { useState } from 'react'; //so we can manage the taps and switch between them 
import HostNode from './parts/HostNode';
import AllNodes from './parts/AllNodes';
import AttackerNode from './parts/AttackerNode';
//Buidling a simple UI for the app, with a tapbar, sidebar and main canves
//This is just a placeholder for now, we will add more functionality later
function App() {
const Eblocks = ["Host", "Router", "Service", "Vulnerability", "Misconfiguration", "Subnet", "User", "File"];
const Ablocks = ["Human", "LLM", "Algorithm", "Start", "Stop", "Choice", "DataFile", "Library", "Module", "Parameter", "Condition" ];
//Adding properties for for each block 
const blockProperties = {
  Host: { name: "", image: "", RAM: "", disk: "" },//deleted IP becuse its dervied at compilation 
  Router: { name: "", image: ""},
  Service: { name:"", Type: "", protocol: "", port: "", version: "" },
  Vulnerability: { Type: "", CVE: "", Description: "", severity: "" },
  Misconfiguration: { name: "", Description: "" },
  Subnet: { name: "", CIDR: "" },//CIDR is a notation for describing IP address ranges
  User:{name: "", password: "", privilege_level: ""},
  File:{name: "", path: "", sensitivity: ""}
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
};

const blockStyles = {
  Host:            { background: "#70a6cd", icon: "🖥️" },
  Router:          { background: "#5d658f",color: "#FFF", icon: "📡" },
  Service:         { background: "#6ea673",color: "#FFF", icon: "⚙️" },
  Vulnerability:   { background: "#ba3549",color: "#FFF", icon: "🐞" },
  Misconfiguration:{ background: "#c99222", color: "#FFF", icon: "⚠️" },
  Subnet:          { background: "#1b2b7a", color: "#FFF",icon: "🌐" },
  User:            { background: "#c7c569", color: "#FFF",icon: "👤" },
  File:            { background: "#737572",color: "#FFF", icon: "📄" },
  Agent:           { background: "#000000", color: "#FFF",icon: "🤖" },
  Tool:            { background: "#000000", color: "#FFF",icon: "🔧" },
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
};


//we need the first laod of the page to open an environment tap  so people acn drag and drop 
const initialFile = { id: crypto.randomUUID(), name: "Env 1", type: "environment", nodes: [], edges: [] };
const [panelPos, setPanelPos] = useState({ x: 320, y: 80 });
const [dragging, setDragging] = useState(false);
const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
const [files , setFiles] = useState([initialFile]); //this will allow us to manage the state of the files that we have uploaded, we will use this to show the list of files in the sidebar 
const [activeId, setActiveId] = useState(initialFile.id); //this will allow us to manage the state of the active file, we will use this to switch between different files and show different content based on the active file
const [menuOpen, setMenuOpen] = useState(false);// to choose which tab we want 
const [compileMenuOpen, setCompileMenuOpen] = useState(false);
const [selectedId, setSelectedId] = useState(null);
const activeFile = files.find((f) => f.id === activeId);
const nodes = activeFile ? activeFile.nodes : []; //this will get the nodes of the active file, if there is no active file it will return an empty array, we will use this to show the nodes on the canvas based on the active file
const selectedNode = nodes.find((n) => n.id === selectedId);
const edges = activeFile ? activeFile.edges : [];
const [dialog, setDialog] = useState(null); //state of the popup window for connction type 
//a helper function to help write any changes made to edge back to file 
const setActiveEdges = (updater) => {
  setFiles((files) => files.map((f) =>
    f.id === activeId ? { ...f, edges: updater(f.edges) } : f
  ));
};
//const [nodes, setNodes, onNodesChange] = useNodesState([]); //from react flow that allows us to manage the state of our nodes in the canvas, we will use this to add and remove nodes from the canvas
const blocks = activeFile?.type === "attacker" ? Ablocks : Eblocks;
const isAttackerFile = activeFile?.type === "attacker";

//const blocks = activeTap === "System" ? Eblocks : Ablocks;
//when we drag and drop we store the value of blocks into state and we return then after droping them 
//anything above the return are out state and helper functions and cacluated values that we will use in our app, 
//anything inside the return is what we will render on the page
const newFile = (type) => {
  const count = files.filter((f) => f.type === type).length + 1;
  const name = (type === "environment" ? "Env " : "Attacker ") + count;
  const file = { id: crypto.randomUUID(), name, type, nodes: [], edges: [] };
  setFiles((current) => [...current, file]);
  setActiveId(file.id);
  setMenuOpen(false);
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
const updateNodeProperty = (nodeId, key, value) => {
  setActiveNodes((nds) => nds.map((n) =>{
    if ( n.id !== nodeId) return n;

    const newProperties = { ...n.data.properties, [key]: value };

    const newLabel = (key ==="name"  || key === "Type")
      ? makeLabel(n.data.blockType,value)
      : n.data.label;

      return{
      ...n,
    data: { ...n.data, properties: newProperties, label: newLabel },
    };
  }));
};
//need a button where we can delete a specific node 
const deleteSelectedNode = () => {
  if (!selectedId) return;

  setActiveNodes((nds) =>
    nds.filter((node) => node.id !== selectedId)
  );

  setActiveEdges((eds) =>
    eds.filter((edge) =>
      edge.source !== selectedId && edge.target !== selectedId
    )
  );
  setSelectedId(null);
};
//THIS WILL NEED TO BE UPDATED IN THE FUTURE 
const onConnect = (connection) => {
 if (isAttackerFile) {
    setActiveEdges((eds) => addEdge(connection, eds));   // already validated by isValidConnection
    return;
  }
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  const result = connectionKind(source.data.blockType, target.data.blockType);
  if (result.status === "invalid") {
    setDialog({ kind: "invalid", reason: result.reason });
  } else if (result.status === "ambiguous") {
    setDialog({ kind: "ambiguous", connection });
  } else {
    setActiveEdges((eds) => addEdge(connection, eds));
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
  const icon = blockStyles[blockType]?.icon ?? "";
  return idValue ? `${icon} ${blockType}: ${idValue}` : `${icon} ${blockType}`;
};
//Compile the current canves file into a JSON file that can be used in the backend to prodcue a DSL 
//each block or node has a a specific id attched to it 
const findNode = (id) => nodes.find((n) => n.id === id);
//A helper function to get the name to be used in the DSL, for most blocks we will use the name property but for service and vulnerability we will use the type property to help differentiate between different services and vulnerabilities in the DSL
const idName = (node) => {
  const p = node.data.properties || {};
  if (node.data.blockType === "Service" || node.data.blockType === "Vulnerability")
    return p.Type;
  return p.name;
};
const buildEnv = () => {
  //building a normal env object that is flat so if we want to compile to docker we can use this env object or use it for openstack 
 const env = {
    name: activeFile.name,
    hosts: [], subnets: [], routers: [],
    services: [], vulnerabilities: [], misconfigurations: [],
    users: [], files: [],
    connections: [],
  };
  //loap through all of our nodes on the canves and see which kind of block are they so we can push them into our env object 
  for (const node of nodes) {
    const p = node.data.properties || {};
    switch (node.data.blockType) {
      case "Host":            env.hosts.push({ name: p.name, image: p.image, ram: p.RAM, disk: p.disk }); break;
      case "Subnet":          env.subnets.push({ name: p.name, cidr: p.CIDR }); break;
      case "Router":          env.routers.push({ name: p.name, image: p.image }); break;
      case "Service":         env.services.push({ name: p.Type, protocol: p.protocol, port: p.port, version: p.version }); break;
      case "Vulnerability":   env.vulnerabilities.push({ name: p.Type, cve: p.CVE, description: p.Description, severity: p.severity }); break;
      case "Misconfiguration":env.misconfigurations.push({ name: p.name, description: p.Description }); break;
      case "User":            env.users.push({ name: p.name, privilege_level: p.privilege_level, password: p.password }); break;
      case "File":            env.files.push({ name: p.name, path: p.path, sensitivity: p.sensitivity }); break;
    }
  }
  // write every connection or edges to the env object by defining the source and target 
  for (const edge of edges) {
    const source = findNode(edge.source);
    const target = findNode(edge.target);
    if (!source || !target) continue;
    const fromType = source.data.blockType;
    const toType = target.data.blockType;
    env.connections.push({
      from: idName(source),
      to: idName(target),
      fromType,
      toType,
      kind: edge.data?.kind || connectionKind(fromType, toType).type,
    });
  }
  return env;
}


// Compile the attacker canvas into the agreed contract JSON.
// Three outputs we need: blocks (id/name/propertise), control_connections (labeled), data_connections (read/write).
const buildAttack = () => {
  const startNode = nodes.find((n) => n.data.blockType === "Start");

  const blocks_on_canvas = nodes.map((node) => ({
    id:         node.id,                          //  routing id
    name:       node.data.blockType,                 // type of blcok
    properties: { ...(node.data.properties || {}) },
  }));

  // control edges route on the blcok id  
  const control_connections = [];
  const data_connections    = [];               
  const branchTypes = ["Choice", "Condition"];

  for (const edge of edges) {
    const sh     = edge.sourceHandle || "";
    const source = findNode(edge.source);
    const target = findNode(edge.target);
    if (!source || !target) continue;

    if (sh.startsWith("cf")) {
      // CONTROL channel: who runs next
      const label = sh.startsWith("cf-out-") ? sh.slice("cf-out-".length) : "next";
      const conn  = { from: edge.source, to: edge.target, label };
      if (branchTypes.includes(source.data.blockType)) conn.backend_decides = true;
      control_connections.push(conn);
    } else {
      // who can read/write the PTT/DataFile
      //a data edge gives access. source block type decides direction:
      // a DataFile/Parameter source is being READ; anything else writing INTO a data block is a WRITE.
      const dataBlocks = ["DataFile", "Parameter", "Library"];
      const access = dataBlocks.includes(source.data.blockType) ? "read" : "write";
      data_connections.push({ from: edge.source, to: edge.target, access });
    }
  }
  return {
    name:  activeFile.name,
    start: startNode ? startNode.id : null,
    blocks_on_canvas,
    control_connections,
    data_connections,                              
  };
};
const exportAttack = () => downloadJSON(`${activeFile.name}-attack.json`, buildAttack());
const exportEnv = () => downloadJSON(`${activeFile.name}-env.json`, buildEnv());
// Download JSON for now then it will just be given to backend --> this fucntion need to be declared fisrt so it can be used in the compile function 
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



const runAttack = async () => {
  const attack = buildAttack();          // already a JS object
  try {
    const res = await fetch("http://127.0.0.1:8000/run-attack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attack, target: envProject }),      // object -> text, here
    });
    const data = await res.json();
    if (!res.ok) { alert("Attack failed: " + (data.error || res.status)); return; }
    alert("Attack started: " + data.status);
  } catch (err) {
    alert("Could not reach backend at :8000 — is backend running?");
  }
};

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
// the Compile->Docker button and Run Environment reuse it. This IS our intermediary DSL.
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
//To have the ability to compile to differnt structures in the future
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



//  This function is called by our button to facilate the debloying and compiling to docker (connecting the frontend with the backend)
//  Flow: flat env (buildEnv) -> docker DSL (buildDockerDsl) -> backend /deploy (which compiles the
//  DSL to Dockerfiles/compose then deploys). We send the DSL, not the flat env, so the IDE owns the
//  flat->DSL transform and the backend just compiles+deploys what it's given.
const runEnvironment = async () => {
  const dsl = buildDockerDsl(buildEnv());
  try {
    const res = await fetch("http://127.0.0.1:8000/deploy", {//HTTP request to URL and wait for the backend to reply ( it waits for the whole deploying to finish)
      method: "POST",
      headers: { "Content-Type": "application/json" },//type of the file we are sending
      body: JSON.stringify(dsl)
    });
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

// End Experiment: tears down the running stack AND stops the docker backend (Colima on macOS /
// docker service on Linux). The backend lazily restarts on the next Run Environment.
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
//for our attacker continer 
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

//Just an example of an environmet to test compilation faster 
const loadDemoEnvironment = () => {
const s = blockStyles; 
  const box = (type) => ({ background: s[type].background, color: s[type].color });
  const demoNodes = [
    // --- Subnets ---
    { id: "subnet-A", type: "Subnet", position: { x: 80, y: 40 }, style: box("Subnet"),
      data: { label: makeLabel("Subnet", "A"), blockType: "Subnet", properties: { name: "A", CIDR: "172.20.0.0/24" } } },
    { id: "subnet-B", type: "Subnet", position: { x: 520, y: 40 }, style: box("Subnet"),
      data: { label: makeLabel("Subnet", "B"), blockType: "Subnet", properties: { name: "B", CIDR: "172.21.0.0/24" } } },
    { id: "subnet-C", type: "Subnet", position: { x: 980, y: 40 }, style: box("Subnet"),
      data: { label: makeLabel("Subnet", "C"), blockType: "Subnet", properties: { name: "C", CIDR: "172.22.0.0/24" } } },
    // --- Routers ---
    { id: "router-1", type: "Router", position: { x: 300, y: 40 }, style: box("Router"),
      data: { label: makeLabel("Router", "router-1"), blockType: "Router", properties: { name: "router-1", image: "frrouting/frr:latest" } } },
    { id: "router-2", type: "Router", position: { x: 760, y: 40 }, style: box("Router"),
      data: { label: makeLabel("Router", "router-2"), blockType: "Router", properties: { name: "router-2", image: "frrouting/frr:latest" } } },
    // --- Hosts: Equifax tiering. A = internet-facing perimeter (attacker origin), B = application
    //     tier (the Struts app, reached through router-1), C = segregated data tier (the loot).
    //     Names MUST be unique -- the name becomes the compose service slug.
    // Subnet A: a perimeter/DMZ host. The attacker starts on this subnet and routes inward to the
    // published app in Subnet B; this host itself exposes nothing vulnerable.
    { id: "host-a1", type: "Host", position: { x: 80, y: 220 },
      data: { label: makeLabel("Host", "dmz-host"), blockType: "Host", properties: { name: "dmz-host", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },
    // Subnet B holds two hosts (per the lab spec): the internet-facing app server -- Tomcat base so
    // the Struts2 showcase WAR the vuln drops into /usr/local/tomcat/webapps is served on :8080
    // (the live RCE foothold) -- plus "worker", a second internal host.
    { id: "host-b1", type: "Host", position: { x: 440, y: 220 },
      data: { label: makeLabel("Host", "app-server"), blockType: "Host", properties: { name: "app-server", image: "tomcat:8-jre8", RAM: "512m", disk: "1g" } } },
    { id: "host-b2", type: "Host", position: { x: 640, y: 220 },
      data: { label: makeLabel("Host", "worker"), blockType: "Host", properties: { name: "worker", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },
    // Subnet C: the segregated data tier -- the file host with the loot + a database host.
    { id: "host-c1", type: "Host", position: { x: 900, y: 220 },
      data: { label: makeLabel("Host", "file-host"), blockType: "Host", properties: { name: "file-host", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },
    { id: "host-c2", type: "Host", position: { x: 1100, y: 220 },
      data: { label: makeLabel("Host", "db-server"), blockType: "Host", properties: { name: "db-server", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },
    // --- Foothold: Struts2 web app on the Subnet-B app-server + its RCE vuln ---
    // "struts-web" is a logical service anchor (the app is served by the Tomcat base image, not an
    // apt package) -- it declares the exposed port and gives the vuln something to attach to.
    { id: "svc-web", type: "Service", position: { x: 440, y: 400 }, style: box("Service"),
      data: { label: makeLabel("Service", "struts-web"), blockType: "Service", properties: { name: "struts-web", Type: "struts-web", protocol: "tcp", port: "8080", version: "2.3.30" } } },
    { id: "vuln-struts", type: "Vulnerability", position: { x: 440, y: 540 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "apache-struts-cve-2017-5638"), blockType: "Vulnerability", properties: { Type: "apache-struts-cve-2017-5638", CVE: "CVE-2017-5638", Description: "Struts2 RCE", severity: "Critical" } } },
    // --- Lateral movement: SSH on the Subnet-C file-host, weak creds, and the loot file ---
    { id: "svc-ssh", type: "Service", position: { x: 900, y: 400 }, style: box("Service"),
      data: { label: makeLabel("Service", "openssh-server"), blockType: "Service", properties: { name: "ssh-c", Type: "openssh-server", protocol: "tcp", port: "22", version: "8.9" } } },
    { id: "vuln-ssh", type: "Vulnerability", position: { x: 900, y: 540 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "weak-ssh-credentials"), blockType: "Vulnerability", properties: { Type: "weak-ssh-credentials", CVE: "", Description: "Weak/reused root SSH password", severity: "High" } } },
    { id: "file-marko", type: "File", position: { x: 1120, y: 400 }, style: box("File"),
      data: { label: makeLabel("File", "Marko.txt"), blockType: "File", properties: { name: "Marko.txt", path: "/root/Marko.txt", sensitivity: "very secret" } } },
  ];
  const demoEdges = [
    // Each host sits in its subnet
    { id: "a-h1",  source: "subnet-A", target: "host-a1", targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "b-h1",  source: "subnet-B", target: "host-b1", targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "b-h2",  source: "subnet-B", target: "host-b2", targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "c-h1",  source: "subnet-C", target: "host-c1", targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "c-h2",  source: "subnet-C", target: "host-c2", targetHandle: "host-subnet", data: { kind: "topology" } },
    // Routers connect the subnets (A <-> B via router-1, B <-> C via router-2)
    { id: "r1-a", source: "router-1", target: "subnet-A", data: { kind: "topology" } },
    { id: "r1-b", source: "router-1", target: "subnet-B", data: { kind: "topology" } },
    { id: "r2-b", source: "router-2", target: "subnet-B", data: { kind: "topology" } },
    { id: "r2-c", source: "router-2", target: "subnet-C", data: { kind: "topology" } },
    // Foothold: Struts web service on the Subnet-B app-server, with its RCE vuln attached
    { id: "svcW-h",    source: "svc-web", target: "host-b1", targetHandle: "host-service", data: { kind: "service" } },
    { id: "vulnW-svc", source: "vuln-struts", target: "svc-web", data: { kind: "vulnerability" } },
    // Lateral movement: SSH service on the Subnet-C file-host, weak-creds vuln, and the loot file
    { id: "svcS-h",    source: "svc-ssh", target: "host-c1", targetHandle: "host-service", data: { kind: "service" } },
    { id: "vulnS-svc", source: "vuln-ssh", target: "svc-ssh", data: { kind: "vulnerability" } },
    { id: "file-h",    source: "file-marko", target: "host-c1", targetHandle: "host-file", data: { kind: "storage" } },
  ];
  setActiveNodes(() => demoNodes);
  setActiveEdges(() => demoEdges);
};

return ( 
<> 
      <div className="App">
      Cyblocks 
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
    role: ["Reasoning", "Generation", "Parsing"],
    mode: ["Editor", "Reviewer", "Executor"],
  };
  return (
    <div key={key}>
      <label>{key}</label>
      {dropdownOptions[key] ? (
        <select
          value={selectedNode.data.properties[key]}
          onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)}
        >
          <option value="">-- choose {key} --</option>
          {dropdownOptions[key].map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          value={selectedNode.data.properties[key]}
          onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)}
        />
      )}
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
    <div className="Tapbar">
      <button onClick={() => setMenuOpen(!menuOpen)}>File</button>
      {menuOpen && (
        <div className="Menu">
        <button onClick={() => { newFile("environment")}}>Environment</button>
        <button onClick={() => { newFile("attacker");}}>Attacker</button> 
          </div>
      )}
    <button onClick={() => setActiveNodes(() => [])}>Clear canvas</button>
    <button onClick={exportEnv}>Export Environment </button>
    {isAttackerFile && <button onClick={exportAttack}>Export Attack</button>}
    {isAttackerFile && <button onClick={compileAttack}>Compile Attack</button>}
    <div style={{ position: "relative", display: "inline-block" }}>
    <button onClick={() => setCompileMenuOpen(!compileMenuOpen)}>Compile ▾</button>
    {compileMenuOpen && (
      <div className="Menu">
        <button onClick={() => { compile("docker"); setCompileMenuOpen(false); }}> Docker</button>
      </div>
    )}
    </div>
    <button onClick={runEnvironment}>start Experiment</button>
    <button onClick={endExperiment}>End Experiment</button>
    <button onClick={runAttacker}>Deploy Attacker</button>
    <button onClick={quitAttacker}>Quit Attacker</button>
    <button onClick={loadDemoEnvironment}>Load Demo</button>
    </div>
     <div className="Toolbar">
        {/* so each tap gets its own canves */}
        {files.map((file) => (
        <div key={file.id} className="Tab">
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
            const style = isAttackerFile ? attackerBlockStyles[block] : blockStyles[block];
            const bg    = isAttackerFile ? style?.accentColor : style?.background;
            const color = isAttackerFile ? style?.textColor   : (style?.color ?? "#000");
            const icon  = style?.icon ?? "";
            return (
          <div key={block}
          className="Block" 
          style={{background: bg, color }}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/reactflow", block);
            }}>
           {icon} {block}
          </div>
            );
          })}
        </div>
        <div className="Canvas">
        Design Canvas
        {/*This part is mostly repsosnable for the drag and drop functionality on canves with React Flow*/}
        <ReactFlow nodes={nodes}  
        onNodesChange={(changes) => setActiveNodes((nds) => applyNodeChanges(changes, nds))} 
        edges={edges}
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
        }}
        defaultEdgeOptions={{type: 'step'}}
        isValidConnection={(connection)=> {
   //need a specific handel for agents paramesters 
                if (isAttackerFile) 
{
    const s = connection.sourceHandle || "";
    const t = connection.targetHandle || "";
    const srcNode = nodes.find((n) => n.id === connection.source);

    // param-in is a valid target, but only from a Parameter
    if (srcNode?.data.blockType === "Parameter") return t === "param-in";
    if (t === "param-in") return srcNode?.data.blockType === "Parameter";

    // everything else
    const sourceIsOut = s.startsWith("cf-out") || s === "data-out";
    const targetIsIn  = t === "cf-in" || t === "data-in";
    if (!sourceIsOut || !targetIsIn) return false;

    // and stay in one lane
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

        // Everything elsepasses through connectionKind  which handles validation for them 
        return true;  
        }}
        onEdgesChange={(changes) => setActiveEdges((eds) => applyEdgeChanges(changes, eds))}
        onConnect={onConnect}
        onNodeClick={(event, node) => setSelectedId(node.id)}
        onDragOver={(event) => event.preventDefault()} //this will allow us to drop elements on the canvas, by default the browser does not allow dropping elements on a page, so we need to prevent the default behavior
        onDrop ={(event) => {
          event.preventDefault(); //this will prevent the default behavior of the browser when dropping an element, which is to open the element in a new tab
          const name = event.dataTransfer.getData("application/reactflow"); //this will get the data that we set when we started dragging the block, which is the name of the block
          const bounds = event.currentTarget.getBoundingClientRect();
          const position = { x: event.clientX - bounds.left, y:event.clientY - bounds.top };// need to calculate the position of the node based on the position of the mouse and the position of the canvas, because the position of the mouse is relative to the entire page, but we need the position of the node to be relative to the canvas
          let newNode;

          if (isAttackerFile) {
            //style for the attacker 
            const aStyle = attackerBlockStyles[name];
            newNode = {
              id:       crypto.randomUUID(),
              type:     name,
              position,
              data: {
                label:       name,
                blockType:   name,
                accentColor: aStyle?.accentColor,
                textColor:   aStyle?.textColor,
                icon:        aStyle?.icon,
                category:    aStyle?.category,
                properties:  { ...attackerBlockProperties[name] },
              },
            };
          } else {
            const eStyle = blockStyles[name];
            newNode = {
              id:       crypto.randomUUID(),
              type:     name,
              position,
              data: {
                label:      makeLabel(name, ""),
                blockType:  name,
                properties: { ...blockProperties[name] },
              },
              ...(name !== "Host" && {
                style: { background: eStyle?.background, color: "#FFF" },
              }),
            };
          }
          setActiveNodes((current) => [...current, newNode]);
        }}
        >
          {/*This is the main canvas where we will add our nodes and edges, we will use the react flow library to handle the canvas and its functionality like zooming, panning and connecting nodes*/}
          {/*This will add a background to our canvas, we will customize in later steps*/}
          <Background />
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
