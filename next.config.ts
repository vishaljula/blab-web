import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// Auto-detect LAN IPs so any dev can test on their phone without
// hardcoding their specific IP address.
function getLocalIPs(): string[] {
  const nets = networkInterfaces();
  const ips: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getLocalIPs(),
};

export default nextConfig;
