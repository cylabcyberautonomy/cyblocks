//hardcoded demo canvases loaded from the Demos menu.
//
// Each builder is PURE: given the pieces of App state it needs (passed in), it returns
// { nodes, edges } and touches nothing else. 

export const demoThreeSubnet = ({ makeLabel }) => {
  const box = () => ({});
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
      data: { label: makeLabel("Service", "struts-web"), blockType: "Service", properties: { name: "struts2", protocol: "tcp", port: "8080", version: "2.3.30" } } },
    { id: "vuln-struts", type: "Vulnerability", position: { x: 440, y: 540 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "apache-struts-cve-2017-5638"), blockType: "Vulnerability", properties: { name: "apache-struts-cve-2017-5638", CVE: "CVE-2017-5638", Description: "Struts2 RCE", severity: "Critical" } } },
    // --- Lateral movement: SSH on the Subnet-C file-host, weak creds, and the loot file ---
    { id: "svc-ssh", type: "Service", position: { x: 900, y: 400 }, style: box("Service"),
      data: { label: makeLabel("Service", "openssh-server"), blockType: "Service",properties: { name: "openssh-server", protocol: "tcp", port: "22", version: "8.9" } } },
    { id: "vuln-ssh", type: "Vulnerability", position: { x: 900, y: 540 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "weak-ssh-credentials"), blockType: "Vulnerability", properties: { name: "weak-ssh-credentials", CVE: "", Description: "Weak/reused root SSH password", severity: "High" } } },
    { id: "file-Marko", type: "File", position: { x: 1120, y: 400 }, style: box("File"),
      data: { label: makeLabel("File", "Marko.txt"), blockType: "File", properties: { name: "Marko.txt", path: "/root/Marko.txt", sensitivity: "very secret", contents: "flag{demo-secret}"} } },
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
    { id: "vulnW-svc", source: "vuln-struts", target: "svc-web", sourceHandle: "s-top", targetHandle: "t-bottom", data: { kind: "vulnerability" } },
    // Lateral movement: SSH service on the Subnet-C file-host, weak-creds vuln, and the loot file
    { id: "svcS-h",    source: "svc-ssh", target: "host-c1", targetHandle: "host-service", data: { kind: "service" } },
    { id: "vulnS-svc", source: "vuln-ssh", target: "svc-ssh", sourceHandle: "s-top", targetHandle: "t-bottom", data: { kind: "vulnerability" } },
    { id: "file-h",    source: "file-Marko", target: "host-c1", targetHandle: "host-file", data: { kind: "storage" } },
  ];
  return { nodes: demoNodes, edges: demoEdges };
};

export const demoSingleSubnet = ({ makeLabel }) => {
  const box = () => ({});

  const demoNodes = [
    { id: "subnet-A", type: "Subnet", position: { x: 300, y: 40 }, style: box("Subnet"),
      data: { label: makeLabel("Subnet", "A"), blockType: "Subnet", properties: { name: "A", CIDR: "172.20.0.0/24" } } },
    { id: "host-landing", type: "Host", position: { x: 160, y: 220 },
      data: { label: makeLabel("Host", "landing"), blockType: "Host", properties: { name: "landing", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },
    { id: "host-target", type: "Host", position: { x: 440, y: 220 },
      data: { label: makeLabel("Host", "target"), blockType: "Host", properties: { name: "target", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },
    // Service name MUST be "ftp" to match the catalog; vuln name MUST be "anonymous-ftp-access".
    { id: "svc-ftp", type: "Service", position: { x: 440, y: 400 }, style: box("Service"),
      data: { label: makeLabel("Service", "ftp"), blockType: "Service", properties: { name: "ftp", protocol: "ftp", port: "21", version: "vsftpd (anon)" } } },
    { id: "vuln-ftp", type: "Vulnerability", position: { x: 440, y: 540 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "anonymous-ftp-access"), blockType: "Vulnerability", properties: { name: "anonymous-ftp-access", CVE: "", Description: "Anonymous FTP read access", severity: "medium" } } },
    // The FTP recipe does NOT create a secret — this File block supplies it, and the path must be under /srv/ftp.
    { id: "file-flag", type: "File", position: { x: 640, y: 400 }, style: box("File"),
      data: { label: makeLabel("File", "secret.txt"), blockType: "File", properties: { name: "secret.txt", path: "/srv/ftp/secret.txt", sensitivity: "secret", contents: "flag{single-subnet-ftp}" } } },
  ];
  const demoEdges = [
    { id: "a-landing", source: "subnet-A", target: "host-landing", targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "a-target",  source: "subnet-A", target: "host-target",  targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "svcF-h",    source: "svc-ftp",  target: "host-target",  targetHandle: "host-service", data: { kind: "service" } },
    { id: "vulnF-svc", source: "vuln-ftp", target: "svc-ftp", sourceHandle: "s-top", targetHandle: "t-bottom", data: { kind: "vulnerability" } },
    { id: "file-h",    source: "file-flag", target: "host-target", targetHandle: "host-file",    data: { kind: "storage" } },
  ];
  return { nodes: demoNodes, edges: demoEdges };
};




// Six-host flat single-subnet demo: 1 empty landing host (attacker attaches here)
// + 5 vulnerable hosts, one distinct service/vuln/secret each. Same node/edge schema
// as loadDemoSingleSubnet, so buildEnv -> buildDockerDsl -> backend works unchanged.
export const demoSixHost = ({ makeLabel }) => {
  const box = () => ({});

  const demoNodes = [
    // --- Subnet (flat, single L2 domain: attacker reaches all hosts directly) ---
    { id: "subnet-A", type: "Subnet", position: { x: 600, y: 40 }, style: box("Subnet"),
      data: { label: makeLabel("Subnet", "A"), blockType: "Subnet", properties: { name: "A", CIDR: "172.20.0.0/24" } } },

    // --- Host 6: empty landing host. The attacker container attaches to this subnet.
    //     No service / no vuln -- it exposes nothing. ---
    { id: "host-landing", type: "Host", position: { x: 80, y: 220 },
      data: { label: makeLabel("Host", "landing"), blockType: "Host", properties: { name: "landing", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },

    // --- Host 1: FTP anonymous access ---
    { id: "host-ftp", type: "Host", position: { x: 300, y: 220 },
      data: { label: makeLabel("Host", "ftp-host"), blockType: "Host", properties: { name: "ftp-host", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },
    { id: "svc-ftp", type: "Service", position: { x: 300, y: 380 }, style: box("Service"),
      data: { label: makeLabel("Service", "ftp"), blockType: "Service", properties: { name: "ftp", protocol: "ftp", port: "21", version: "vsftpd (anon)" } } },
    { id: "vuln-ftp", type: "Vulnerability", position: { x: 300, y: 520 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "anonymous-ftp-access"), blockType: "Vulnerability", properties: { name: "anonymous-ftp-access", CVE: "", Description: "Anonymous FTP read access", severity: "medium" } } },
    // Anon FTP serves from /srv/ftp -- the secret file MUST live under it.
    { id: "file-ftp", type: "File", position: { x: 300, y: 660 }, style: box("File"),
      data: { label: makeLabel("File", "ftp-secret.txt"), blockType: "File", properties: { name: "ftp-secret.txt", path: "/srv/ftp/secret.txt", sensitivity: "secret", contents: "flag{ftp-anon}" } } },
    // --- Host 2: weak SSH credentials (root:equifax) ---
    { id: "host-ssh", type: "Host", position: { x: 520, y: 220 },
      data: { label: makeLabel("Host", "ssh-host"), blockType: "Host", properties: { name: "ssh-host", image: "ubuntu:22.04", RAM: "512m", disk: "1g" } } },
    { id: "svc-ssh", type: "Service", position: { x: 520, y: 380 }, style: box("Service"),
      data: { label: makeLabel("Service", "openssh-server"), blockType: "Service", properties: { name: "openssh-server", protocol: "ssh", port: "22", version: "OpenSSH" } } },
    { id: "vuln-ssh", type: "Vulnerability", position: { x: 520, y: 520 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "weak-ssh-credentials"), blockType: "Vulnerability", properties: { name: "weak-ssh-credentials", CVE: "", Description: "Weak/reused root SSH password (root:equifax)", severity: "high" } } },
    // SSH lands as root -> /root is readable.
{ id: "file-ssh", type: "File", position: { x: 520, y: 660 }, style: box("File"),
  data: { label: makeLabel("File", "ssh-secret.txt"), blockType: "File", properties: { name: "ssh-secret.txt", path: "/root/secret.txt", sensitivity: "secret", contents: "flag{ssh-weak-creds}" } } },
    // --- Host 3: Shellshock (CVE-2014-6271). VULN IS IMAGE-REALIZED: host image MUST be
    //     vulnerables/cve-2014-6271, else bash is patched and there is no vuln. ---
    { id: "host-shellshock", type: "Host", position: { x: 740, y: 220 },
      data: { label: makeLabel("Host", "shellshock-host"), blockType: "Host", properties: { name: "shellshock-host", image: "vulnerables/cve-2014-6271", RAM: "512m", disk: "1g" } } },
    { id: "svc-http", type: "Service", position: { x: 740, y: 380 }, style: box("Service"),
      data: { label: makeLabel("Service", "http"), blockType: "Service", properties: { name: "http", protocol: "http", port: "80", version: "Apache mod_cgi" } } },
    { id: "vuln-shellshock", type: "Vulnerability", position: { x: 740, y: 520 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "shellshock-cve-2014-6271"), blockType: "Vulnerability", properties: { name: "shellshock-cve-2014-6271", CVE: "CVE-2014-6271", Description: "Bash Shellshock via Apache mod_cgi", severity: "critical" } } },
    // CGI RCE runs as the web user -> secret must be readable by it. /var/www at default perms works.
{ id: "file-shellshock", type: "File", position: { x: 740, y: 660 }, style: box("File"),
  data: { label: makeLabel("File", "shellshock-secret.txt"), blockType: "File", properties: { name: "shellshock-secret.txt", path: "/var/www/secret.txt", sensitivity: "secret", contents: "flag{shellshock}" } } },
    // --- Host 4: MySQL blank root password. Flag is a DB row (recipe self-inserts) -> NO File block. ---
    { id: "host-mysql", type: "Host", position: { x: 960, y: 220 },
      data: { label: makeLabel("Host", "mysql-host"), blockType: "Host", properties: { name: "mysql-host", image: "ubuntu:22.04", RAM: "1g", disk: "1g" } } },
    { id: "svc-mysql", type: "Service", position: { x: 960, y: 380 }, style: box("Service"),
      data: { label: makeLabel("Service", "mysql"), blockType: "Service", properties: { name: "mysql", protocol: "tcp", port: "3306", version: "MariaDB" } } },
    { id: "vuln-mysql", type: "Vulnerability", position: { x: 960, y: 520 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "mysql-no-root-password"), blockType: "Vulnerability", properties: { name: "mysql-no-root-password", CVE: "", Description: "MySQL blank root password", severity: "high" } } },

    // --- Host 5: Struts2 RCE (CVE-2017-5638). Flag self-planted at /root/struts_secret.txt -> NO File block.
    //     Image MUST be tomcat:8-jre8 so the showcase WAR is served on :8080. ---
    { id: "host-struts", type: "Host", position: { x: 1180, y: 220 },
      data: { label: makeLabel("Host", "struts-host"), blockType: "Host", properties: { name: "struts-host", image: "tomcat:8-jre8", RAM: "512m", disk: "1g" } } },
    { id: "svc-struts", type: "Service", position: { x: 1180, y: 380 }, style: box("Service"),
      data: { label: makeLabel("Service", "struts2"), blockType: "Service", properties: { name: "struts2", protocol: "http", port: "8080", version: "Apache Struts 2.3.30" } } },
    { id: "vuln-struts", type: "Vulnerability", position: { x: 1180, y: 520 }, style: box("Vulnerability"),
      data: { label: makeLabel("Vulnerability", "apache-struts-cve-2017-5638"), blockType: "Vulnerability", properties: { name: "apache-struts-cve-2017-5638", CVE: "CVE-2017-5638", Description: "Struts2 Jakarta Multipart RCE", severity: "critical" } } },
  ];

  const demoEdges = [
    // Every host sits in subnet A (topology)
    { id: "a-landing",    source: "subnet-A", target: "host-landing",    targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "a-ftp",        source: "subnet-A", target: "host-ftp",        targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "a-ssh",        source: "subnet-A", target: "host-ssh",        targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "a-shellshock", source: "subnet-A", target: "host-shellshock", targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "a-mysql",      source: "subnet-A", target: "host-mysql",      targetHandle: "host-subnet", data: { kind: "topology" } },
    { id: "a-struts",     source: "subnet-A", target: "host-struts",     targetHandle: "host-subnet", data: { kind: "topology" } },

    // Service -> host
    { id: "svcF-h", source: "svc-ftp",    target: "host-ftp",        targetHandle: "host-service", data: { kind: "service" } },
    { id: "svcS-h", source: "svc-ssh",    target: "host-ssh",        targetHandle: "host-service", data: { kind: "service" } },
    { id: "svcH-h", source: "svc-http",   target: "host-shellshock", targetHandle: "host-service", data: { kind: "service" } },
    { id: "svcM-h", source: "svc-mysql",  target: "host-mysql",      targetHandle: "host-service", data: { kind: "service" } },
    { id: "svcT-h", source: "svc-struts", target: "host-struts",     targetHandle: "host-service", data: { kind: "service" } },

    // Vuln -> service: attach to the service BOTTOM handle (t-bottom), leaving the vuln TOP (s-top).
    { id: "vF-s", source: "vuln-ftp",        target: "svc-ftp",    sourceHandle: "s-top", targetHandle: "t-bottom", data: { kind: "vulnerability" } },
    { id: "vS-s", source: "vuln-ssh",        target: "svc-ssh",    sourceHandle: "s-top", targetHandle: "t-bottom", data: { kind: "vulnerability" } },
    { id: "vH-s", source: "vuln-shellshock", target: "svc-http",   sourceHandle: "s-top", targetHandle: "t-bottom", data: { kind: "vulnerability" } },
    { id: "vM-s", source: "vuln-mysql",      target: "svc-mysql",  sourceHandle: "s-top", targetHandle: "t-bottom", data: { kind: "vulnerability" } },
    { id: "vT-s", source: "vuln-struts",     target: "svc-struts", sourceHandle: "s-top", targetHandle: "t-bottom", data: { kind: "vulnerability" } },

    // File -> host (only ftp / ssh / shellshock; struts + mysql self-plant)
    { id: "fF-h", source: "file-ftp",        target: "host-ftp",        targetHandle: "host-file", data: { kind: "storage" } },
    { id: "fS-h", source: "file-ssh",        target: "host-ssh",        targetHandle: "host-file", data: { kind: "storage" } },
    { id: "fH-h", source: "file-shellshock", target: "host-shellshock", targetHandle: "host-file", data: { kind: "storage" } },
  ];

  return { nodes: demoNodes, edges: demoEdges };
};


// Attacker demo: rebuilds the ReasonAct/OODA single-agent loop from the exported contract
// Reuses the real block UUIDs so buildAttack() returns a contract identical to the export
export const demoOodaAttack = ({ attackerBlockStyles, attackerBlockProperties, AGENT_CF, toggleCfOut }) => {
  // Build a node exactly the way onDrop does, so schema/handles line up.
  const mkNode = (id, name, position, props = {}, opts = {}) => {
    const aStyle = attackerBlockStyles[name];
    const node = {
      id, type: name, position,
      data: {
        id, label: name, blockType: name,
        accentColor: aStyle?.accentColor, textColor: aStyle?.textColor,
        icon: aStyle?.icon, category: aStyle?.category,
        properties: { ...attackerBlockProperties[name], ...props },
        ...(AGENT_CF.includes(name) && {
          enabledCfOut: opts.cfOut ?? ["next"],
          onToggleCfOut: toggleCfOut,
        }),
      },
    };
    if (opts.parentId) { node.parentId = opts.parentId; node.data.parentId = opts.parentId; }
    return node;
  };

  // Real UUIDs from the export (keeps the compiled contract identical).
  const ID = {
    start: "52775186-7d4f-4550-9dca-9cde7d0c1b0e",
    choice: "15f43a3f-fcf8-4b88-a8d2-6a3519ecccc5",
    llm: "8a820746-50e9-43c8-92bc-383683c2e913",
    param: "b3aef90c-e6b6-49b0-ab1d-d813716ac6d0",
    stop: "285be571-a3e6-40e6-b1c0-f5576be6c0ca",
    nmap: "ff428f5e-557d-46d0-bcea-42ec9aeeaf88",
    curl: "78f328fb-6ac5-44e3-ab98-18b3ee363797",
    nc: "14f21b25-49c0-4856-8599-7fad96ecd2c3",
    hydra: "dd8f7566-e2fb-465e-bbbe-cb885723ddca",
    ssh: "b545dc78-b38a-49e8-b809-117101ce676f",
    sshpass: "d92a9604-d77f-40ef-83fc-d2e4f727ce2a",
    mysql: "fe5871f1-63f9-4e2d-80f9-9c5e7f0826cf",
    datafile: "4e86d841-ed2e-408c-a247-e8fe19957a74",
    executor: "c4c61365-9b25-4b58-abf7-3a128ccafa4c",
  };

  const choice = mkNode(ID.choice, "Choice", { x: 480, y: 360 });
  // Stamp the cradle size so the Choice draws its arms and wraps the seated LLM immediately.
  // These are approximate; they re-measure the moment you drag the LLM.
  choice.data.cradleW = 200;
  choice.data.cradleH = 60;

  const demoNodes = [
    mkNode(ID.start, "Start", { x: 80, y: 320 }),
    choice,                                                   // parent must precede its child
    mkNode(ID.llm, "LLM", { x: 92, y: 16 },                  // relative to the Choice
      { model: "claude-opus-4-8", apiKey: "ANTHROPIC_API_KEY" },
      { parentId: ID.choice, cfOut: ["next", "done"] }),     // emits both next and done
    mkNode(ID.param, "Parameter", { x: 480, y: 160 }, { role: "ReasonAct" }),
    mkNode(ID.stop, "Stop", { x: 1120, y: 520 }),
    mkNode(ID.nmap, "Action", { x: 240, y: 640 }, { tool: "nmap" }),
    mkNode(ID.curl, "Action", { x: 420, y: 640 }, { tool: "curl" }),
    mkNode(ID.nc, "Action", { x: 600, y: 640 }, { tool: "nc" }),
    mkNode(ID.hydra, "Action", { x: 240, y: 800 }, { tool: "hydra" }),
    mkNode(ID.ssh, "Action", { x: 420, y: 800 }, { tool: "ssh" }),
    mkNode(ID.sshpass, "Action", { x: 600, y: 800 }, { tool: "sshpass" }),
    mkNode(ID.mysql, "Action", { x: 420, y: 940 }, { tool: "mysql" }),
    mkNode(ID.datafile, "DataFile", { x: 860, y: 560 }, { format: "text" }),
    mkNode(ID.executor, "Executor", { x: 1040, y: 300 }),
  ];

  // Control edges: cf-out-<label> -> cf-in.
  const ctrl = (id, from, fromLabel, to) => ({
    id, source: from, target: to,
    sourceHandle: `cf-out-${fromLabel}`, targetHandle: "cf-in",
  });
  // Data edges: data-out -> data-in (Parameter -> agent uses param-in).
  const data = (id, from, to, targetHandle = "data-in") => ({
    id, source: from, target: to,
    sourceHandle: "data-out", targetHandle,
  });

  const demoEdges = [
    // control flow
    ctrl("c-start-llm", ID.start, "next", ID.llm),
    ctrl("c-llm-stop", ID.llm, "done", ID.stop),
    ctrl("c-llm-exec", ID.llm, "next", ID.executor),
    ctrl("c-exec-llm", ID.executor, "next", ID.llm),
    // parameter feeds the agent
    data("d-param-llm", ID.param, ID.llm, "param-in"),
    // every tool writes into the Choice
    data("d-nmap-choice", ID.nmap, ID.choice),
    data("d-curl-choice", ID.curl, ID.choice),
    data("d-nc-choice", ID.nc, ID.choice),
    data("d-hydra-choice", ID.hydra, ID.choice),
    data("d-ssh-choice", ID.ssh, ID.choice),
    data("d-sshpass-choice", ID.sshpass, ID.choice),
    data("d-mysql-choice", ID.mysql, ID.choice),
    // transcript read/write
    data("d-llm-df", ID.llm, ID.datafile),
    data("d-df-exec", ID.datafile, ID.executor),
    data("d-exec-df", ID.executor, ID.datafile),
    // NOTE: no Choice -> LLM edge. The cradle (LLM.parentId === Choice) supplies that
    // data_connection via buildAttack's parent/child pass.
  ];

  return { nodes: demoNodes, edges: demoEdges };
};