// The Developer terminal's access gate. A terminal is arbitrary command
// execution, so the route is guarded by two independent conditions that
// must BOTH hold: the instance opted in (config.developerTerminal), and
// the request came from the loopback interface. Even a misconfigured,
// network-exposed instance with the flag on cannot serve a remote client.

/** Loopback iff 127.0.0.0/8, ::1, an IPv4-mapped loopback, or "localhost". */
export const isLoopbackAddress = (address: string | null): boolean => {
  if (address === null || address === "") {
    return false;
  }
  if (address === "localhost" || address === "::1") {
    return true;
  }
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
};

export interface TerminalGateConfig {
  readonly developerTerminal: boolean;
}

/** True only when the instance opted in AND the client is loopback. */
export const terminalRouteAllowed = (
  config: TerminalGateConfig,
  remoteAddress: string | null,
): boolean => config.developerTerminal && isLoopbackAddress(remoteAddress);
