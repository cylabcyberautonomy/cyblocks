
import './App.css'
import { ReactFlow, Background, Controls, applyNodeChanges , addEdge ,applyEdgeChanges} from '@xyflow/react' //so we can use the react flow components in our app like the canvas, background and controls
import '@xyflow/react/dist/style.css'
import { useState } from 'react'; //so we can manage the taps and switch between them 
//Buidling a simple UI for the app, with a tapbar, sidebar and main canves
//This is just a placeholder for now, we will add more functionality later
function App() {
const Eblocks = ["Host", "Router", "Service", "Vulnerability", "Misconfiguration", "Subnet", "User", "File"];
const Ablocks = ["Agent", "Tool"];
//Adding properties for for each block 
const blockProperties = {
  Host: { name: "", image: "", RAM: "", disk: "" },//deleted IP becuse its dervied at compilation 
  Router: { name: "", image: ""},
  Service: { name:"", Type: "", protocol: "", port: "", version: "" },
  Vulnerability: { Type: "", CVE: "", Description: "", severity: "" },
  Misconfiguration: { name: "", Description: "" },
  Subnet: { name: "", CIDR: "" },// CIDER is a notation for describing IP address ranges
  User:{name: "", password: "", privilege_level: ""},
  File:{name: "", path: "", sensitivity: ""}
};



//we need the first laod of the page to open an environment tap  so people acn drag and drop 
const initialFile = { id: crypto.randomUUID(), name: "Env 1", type: "environment", nodes: [], edges: [] };
const [panelPos, setPanelPos] = useState({ x: 320, y: 80 });
const [dragging, setDragging] = useState(false);
const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
const [files , setFiles] = useState([initialFile]); //this will allow us to manage the state of the files that we have uploaded, we will use this to show the list of files in the sidebar 
const [activeId, setActiveId] = useState(initialFile.id); //this will allow us to manage the state of the active file, we will use this to switch between different files and show different content based on the active file
const [menuOpen, setMenuOpen] = useState(false);// to choose which tab we want 
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
  setActiveNodes((nds) => nds.map((n) =>
    n.id === nodeId
      ? { ...n, data: { ...n.data, properties: { ...n.data.properties, [key]: value } } }
      : n
  ));
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
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  const result = connectionKind(source.data.blockType, target.data.blockType);
  if (result.status === "invalid") {
    setDialog({ kind: "invalid", reason: result.reason });
  } else if (result.status === "ambiguous") {
    setDialog({ kind: "ambiguous", connection });
  } else {
    setActiveEdges((eds) => addEdge(connection, eds));   // valid: add it, no stored kind (derived later)
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
  if (sourceType === "Host" && targetType === "Router")
    return { status: "valid", type: "topology" };
  if (sourceType === "Router" && targetType === "Router")
    return { status: "valid", type: "topology" };
  if (sourceType === "Host" && targetType === "Host")
    return { status: "ambiguous" };
  if (sourceType === "Host" && targetType === "Subnet")
    return { status: "valid", type: "topology" };
  if (sourceType === "Router" && targetType === "Subnet")
    return { status: "valid", type: "topology" }; 
  if (sourceType === "Subnet" && targetType === "Router")
    return { status: "valid", type: "topology" };
  if (sourceType === "Subnet" && targetType === "Host")
    return { status: "valid", type: "topology" };
  if (sourceType === "Router" && targetType === "Host")
    return { status: "valid", type: "topology" };
  if (sourceType === "Host" && targetType === "Service")
    return { status: "valid", type: "service" };
  if (sourceType === "Service" && (targetType === "Vulnerability" || targetType === "Misconfiguration"))
    return { status: "valid", type: "vulnerability" };
  if (sourceType === "User" && targetType === "Host")
  return { status: "valid", type: "account" }; 
  if (sourceType === "Host" && targetType === "User")
    return { status: "valid", type: "account" };
  if (sourceType === "File" && targetType === "Host")
    return { status: "valid", type: "storage" };  // file stored on host
  if (sourceType === "Host" && targetType === "File")
    return { status: "valid", type: "storage" };
  if (sourceType === "User" && targetType === "File")
    return { status: "valid", type: "access" };
  if (sourceType === "File" && targetType === "User")
    return { status: "valid", type: "access" };

  return { status: "invalid", reason: `A ${sourceType} can't connect to a ${targetType}.` };
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
//rather than using subnet name and id  for each host we just follow its edge to know which subnet it connect to 
const subnetOf = (hostId) => {
  for (const e of edges) {
    let otherId = null;
    if (e.source === hostId) otherId = e.target;
    else if (e.target === hostId) otherId = e.source;
    if (!otherId) continue;
    const other = findNode(otherId);
    if (other && other.data.blockType === "Subnet") return other;
  }
  return null;
};
//same thing for routers 
const networksOf = (routerId) => {
  const result = [];
  for (const e of edges) {
    let otherId = null;
    if (e.source === routerId) otherId = e.target;
    else if (e.target === routerId) otherId = e.source;
    if (!otherId) continue;
    const other = findNode(otherId);
    if (other && other.data.blockType === "Subnet") {
      result.push(other.data.properties.name);
    }
  }
  return result;
};

//we sill use hierachy structure for JSON file to match the examples from MHbench 
const compile = () => {
  const subnets = [];//we can have muliti subnets 
  const subnetCounts = {};  // subnet id -> how many hosts we've given an IP so far
  const hostBySubnet = {}; // each subnet can hvae more than one host  
 //looking for only subnet blcoks so we can initlize then fisrt and add them to the array 
  for (const node of nodes) {
    const p = node.data.properties || {};
    if (node.data.blockType === "Subnet") {
      subnets.push({ name: p.name, CIDR: p.CIDR });
      hostBySubnet[p.name] = [];  //we will find any host connected to this subnet and add it to this array 
    }
  }
  for (const node of nodes) {
    const p = node.data.properties || {};
    if (node.data.blockType === "Host") {
      const subnet = subnetOf(node.id);//which subnet is this host connected to 
      const subnetName = subnet ? subnet.data.properties.name : null;
      if (subnet && subnet.data.properties.CIDR) {
        const octets = subnet.data.properties.CIDR.split("/")[0].split(".");//we parse the CIDR to derive the IP base 
        const n = subnetCounts[subnet.id] || 0;
        octets[3] = String(10 + n);//because we only change the last filed 
        subnetCounts[subnet.id] = n + 1;//everytime these is an additiona host on teh same subnet so it gets n = 1 or icremented more 
        const host = { name: p.name, image: p.image, ip: octets.join("."), ram: p.RAM, disk: p.disk };//building the hsot object 
        if (subnetName && hostBySubnet[subnetName]) { 
          hostBySubnet[subnetName].push(host);//gets added to the subnet list 
        }
      }
    }
  }
  // Build the nested subnets array -with hosts inside-
  const nestedSubnets = subnets.map((subnet) => ({
    name: subnet.name,
    cidr: subnet.CIDR,  
    hosts: hostBySubnet[subnet.name] || [],
  }));

  // now handling differnt type of blcoks(services, vulnerabilities, misconfigurations, router)
  const services = [], vulnerabilities = [], misconfigurations = [];
  const routers = [], users= [], files = [];
  for (const node of nodes) {
    const p = node.data.properties || {};
    switch (node.data.blockType) {
      case "Service":
        services.push({ name: p.Type, type: p.Type, protocol: p.protocol, port: p.port, version: p.version });//set up the service object 
        break;
      case "Vulnerability":
        vulnerabilities.push({ name: p.Type, type: p.Type, cve: p.CVE, description: p.Description, severity: p.severity });
        break;
      case "Misconfiguration":
        misconfigurations.push({ name: p.name, description: p.Description });
        break;
      case "Router":
        routers.push({ name: p.name, image: p.image, networks: networksOf(node.id) });
        break;
      case "User":
        services.push({ name: p.name, type: "user", privilege_level: p.privilege_level, password: p.password });
        break;
      case "File":
       services.push({ name: p.name, type: "file", path: p.path, sensitivity: p.sensitivity });
        break;
    }
  }

  // creating subnet_connections from Router edges (Router -> Subnet)
  const subnetConnections = [];
  for (const edge of edges) {
    const source = findNode(edge.source);
    const target = findNode(edge.target);
    if (source && target) {
      const sourceType = source.data.blockType;
      const targetType = target.data.blockType;
      // Router -> Subnet or Subnet -> Router
      if ((sourceType === "Router" && targetType === "Subnet") || 
          (sourceType === "Subnet" && targetType === "Router")) {
        const routerNode = sourceType === "Router" ? source : target;
        const subnetNode = sourceType === "Subnet" ? source : target;
        const routerName = routerNode.data.properties.name;
        const subnetName = subnetNode.data.properties.name;
        subnetConnections.push({//setting up the object for the connction between routers and subnets 
          router: routerName,
          from_subnet: subnetName,
          to_subnet: null,
          bidirectional: true,
        });
      }
    }
  }

  // Creating a full connections array for all other edges
  const connections = [];
  for (const edge of edges) {
    const source = findNode(edge.source);
    const target = findNode(edge.target);
    if (!source || !target) continue;//not looking at the samee edge 
    const sourceType = source.data.blockType;
    const targetType = target.data.blockType;
    const label = edge.data?.kind || connectionKind(sourceType, targetType).type;
    
    // Skip Subnet/Router topology edges we already handled that in the previosu part 
    if ((sourceType === "Subnet" || sourceType === "Router") && 
        (targetType === "Subnet" || targetType === "Router")) {
      continue;
    }
    if ((sourceType === "Host" && targetType === "Subnet") ||
        (sourceType === "Subnet" && targetType === "Host")) {
      continue;  // Host->Subnet already captured in nested structure
    }
    const from = idName(source);
    const to = idName(target);
    connections.push({
      from,
      to,
      fromType: sourceType,
      toType: targetType,
      label,
    });
  }

  // craeting the final JSON
  const env = {
    name: activeFile.name,
    networks: [
      {
        name: activeFile.name,
        subnets: nestedSubnets,
      }
    ],
    //putting all our objects into one object for JSON
    subnet_connections: subnetConnections,
    services,
    vulnerabilities,
    misconfigurations,
    routers,
    users, 
    files,
    connections,
  };

  // Download JSON for now then it will just be given to backend 
  const text = JSON.stringify(env, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${activeFile.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
};



const loadDemoEnvironment = () => {
  const demoNodes = [
    // Subnets
    { id: "subnet-1", data: { label: "DMZ", blockType: "Subnet", properties: { name: "dmz", CIDR: "172.20.0.0/24" } }, position: { x: 100, y: 50 } },
    { id: "subnet-2", data: { label: "Internal", blockType: "Subnet", properties: { name: "internal", CIDR: "10.0.0.0/24" } }, position: { x: 400, y: 50 } },
    
    // Hosts
    { id: "host-1", data: { label: "web-server", blockType: "Host", properties: { name: "web-server", image: "nginx:latest", RAM: "512m", disk: "1g" } }, position: { x: 50, y: 200 } },
    { id: "host-2", data: { label: "db-server", blockType: "Host", properties: { name: "db-server", image: "mysql:8", RAM: "1g", disk: "2g" } }, position: { x: 350, y: 200 } },
    { id: "host-3", data: { label: "jump-host", blockType: "Host", properties: { name: "jump-host", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } }, position: { x: 650, y: 200 } },
    
    // Services
    { id: "svc-1", data: { label: "http-web", blockType: "Service", properties: { name: "http-web", Type: "web", protocol: "tcp", port: "80", version: "nginx-1.24" } }, position: { x: 50, y: 350 } },
    { id: "svc-2", data: { label: "mysql-db", blockType: "Service", properties: { name: "mysql-db", Type: "database", protocol: "tcp", port: "3306", version: "mysql-8.0" } }, position: { x: 350, y: 350 } },
    
    // Vulnerability
    { id: "vuln-1", data: { label: "sql-injection", blockType: "Vulnerability", properties: { Type: "sql-injection", CVE: "CVE-2024-12345", Description: "SQL injection in login form", severity: "High" } }, position: { x: 50, y: 450 } },
    
    // Users
    { id: "user-1", data: { label: "admin", blockType: "User", properties: { name: "admin", password: "admin123", privilege_level: "admin" } }, position: { x: 200, y: 500 } },
    { id: "user-2", data: { label: "john", blockType: "User", properties: { name: "john", password: "john123", privilege_level: "user" } }, position: { x: 500, y: 500 } },
    
    // Files
    { id: "file-1", data: { label: "config.json", blockType: "File", properties: { name: "config.json", path: "/etc/config.json", sensitivity: "confidential" } }, position: { x: 200, y: 600 } },
    { id: "file-2", data: { label: "secrets.txt", blockType: "File", properties: { name: "secrets.txt", path: "/home/admin/secrets.txt", sensitivity: "critical" } }, position: { x: 500, y: 600 } },
    
    // Router
    { id: "router-1", data: { label: "core-router", blockType: "Router", properties: { name: "core-router", image: "router-vm:latest" } }, position: { x: 400, y: 100 } },
  ];

  const demoEdges = [
    // Hosts to Subnets
    { id: "h1-s1", source: "host-1", target: "subnet-1", data: { kind: "topology" } },
    { id: "h2-s2", source: "host-2", target: "subnet-2", data: { kind: "topology" } },
    { id: "h3-s2", source: "host-3", target: "subnet-2", data: { kind: "topology" } },
    
    // Router to Subnets
    { id: "r-s1", source: "router-1", target: "subnet-1", data: { kind: "topology" } },
    { id: "r-s2", source: "router-1", target: "subnet-2", data: { kind: "topology" } },
    
    // Services to Hosts
    { id: "svc1-h1", source: "svc-1", target: "host-1" },
    { id: "svc2-h2", source: "svc-2", target: "host-2" },
    
    // Vulnerability to Service
    { id: "vuln-svc", source: "vuln-1", target: "svc-1" },
    
    // Users to Hosts
    { id: "u1-h1", source: "user-1", target: "host-1", data: { kind: "account" } },
    { id: "u2-h2", source: "user-2", target: "host-2", data: { kind: "account" } },
    
    // Files to Hosts
    { id: "f1-h1", source: "file-1", target: "host-1", data: { kind: "storage" } },
    { id: "f2-h2", source: "file-2", target: "host-2", data: { kind: "storage" } },
    
    // Host to Host (attack chain)
    { id: "h1-h2", source: "host-1", target: "host-3", data: { kind: "access" } },
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
      {Object.keys(selectedNode.data.properties || {}).map((key) => (
        <div key={key}>
          <label>{key}</label>
          <input
            value={selectedNode.data.properties[key]}
            onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)}
          />
        </div>
      ))}
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
    <button onClick={compile}>Compile</button>
    <button onClick={loadDemoEnvironment}>Load Demo</button>

    </div>
     <div className="Toolbar">
        {/* so each tap gets its own tab */}
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
        {blocks.map((block) => (
          <div key={block} className="Block" draggable onDragStart={(event) => {
            event.dataTransfer.setData("application/reactflow", block); //this will set the data that we will use to identify which block is being dragged, we will use this data to add the correct node to the canvas when the block is dropped
          }}>
            {block}
          </div>
        ))}
        </div>
        <div className="Canvas">
        Design Canvas
        {/*This part is mostly repsosnable for the drag and drop functionality on canves with React Flow*/}
        <ReactFlow nodes={nodes}  
        onNodesChange={(changes) => setActiveNodes((nds) => applyNodeChanges(changes, nds))} 
        edges={edges}
        onEdgesChange={(changes) => setActiveEdges((eds) => applyEdgeChanges(changes, eds))}
        onConnect={onConnect}
        onNodeClick={(event, node) => setSelectedId(node.id)}
        onDragOver={(event) => event.preventDefault()} //this will allow us to drop elements on the canvas, by default the browser does not allow dropping elements on a page, so we need to prevent the default behavior
        onDrop ={(event) => {
          event.preventDefault(); //this will prevent the default behavior of the browser when dropping an element, which is to open the element in a new tab
          const name = event.dataTransfer.getData("application/reactflow"); //this will get the data that we set when we started dragging the block, which is the name of the block
          const bounds = event.currentTarget.getBoundingClientRect();
          const position = { x: event.clientX - bounds.left, y:event.clientY - bounds.top };// need to calculate the position of the node based on the position of the mouse and the position of the canvas, because the position of the mouse is relative to the entire page, but we need the position of the node to be relative to the canvas
          const newNode = {//the new node that we will add to the canvas, it needs to have an id, a position and some data, we will use the name of the block as the label of the node
          id: crypto.randomUUID(),
          position, 
          data:  { label: name, blockType: name, properties: { ...blockProperties[name] } }//start stating the block type to help determine the kind of connection we have 
          };
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
