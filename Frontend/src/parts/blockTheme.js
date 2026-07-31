// Shared dark theme for environment blocks similar to attackerBlockStyles.
// Each type: its OWN dark fill + one bright accent (border, icon, tag, handles).
// Dark feel, distinct hue per category.
export const ENV_STYLES = {
  Host:             { fill: "#0f2337", accent: "#57a5ee", icon: "🖥️", category: "host" },
  Router:           { fill: "#171c30", accent: "#9098e2", icon: "📡", category: "router" },
  Service:          { fill: "#0e2318", accent: "#5fce8d", icon: "⚙️", category: "service" },
  Vulnerability:    { fill: "#2c1113", accent: "#f27074", icon: "🐞", category: "vuln" },
  Misconfiguration: { fill: "#2a2410", accent: "#f2b638", icon: "⚠️", category: "misconfig" },
  Subnet:           { fill: "#0f1a4d", accent: "#2241e0", icon: "🌐", category: "subnet" },
  User:             { fill: "#262511", accent: "#d8d264", icon: "👤", category: "user" },
  File:             { fill: "#1c1e1d", accent: "#adb2ab", icon: "📄", category: "file" },
};