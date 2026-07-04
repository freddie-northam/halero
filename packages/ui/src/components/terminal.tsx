// An xterm.js terminal wired to Halero's /api/terminal/ws WebSocket. The
// server owns the PTY; this is a thin bridge: server data frames write to
// xterm, keystrokes and resizes go back as client frames. If the socket
// closes before it ever opened, the terminal is disabled or unreachable,
// so we show how to turn it on rather than a blank pane.

import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

type Status = "connecting" | "open" | "closed" | "unavailable";

const THEME = {
  background: "#0a0a0b",
  foreground: "#e4e4e7",
  cursor: "#ff5a5f",
  selectionBackground: "#3f3f46",
};

const wsUrl = (path: string, cols: number, rows: number): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const separator = path.includes("?") ? "&" : "?";
  return `${protocol}//${window.location.host}${path}${separator}cols=${cols}&rows=${rows}`;
};

export interface TerminalProps {
  /** WebSocket path to attach to; defaults to the Developer shell terminal. */
  readonly wsPath?: string;
}

export const Terminal = ({
  wsPath = "/api/terminal/ws",
}: TerminalProps = {}): ReactElement => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) {
      return;
    }
    const term = new XTerm({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(mount);
    fit.fit();

    const socket = new WebSocket(wsUrl(wsPath, term.cols, term.rows));
    let everOpened = false;

    const sendResize = (): void => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
        );
      }
    };

    socket.onopen = () => {
      everOpened = true;
      setStatus("open");
      fit.fit();
      sendResize();
      term.focus();
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as
        | { type: "data"; data: string }
        | { type: "exit"; code: number };
      if (message.type === "data") {
        term.write(message.data);
      } else {
        term.write(`\r\n\x1b[2m[process exited (${message.code})]\x1b[0m\r\n`);
      }
    };
    socket.onclose = () => {
      setStatus(everOpened ? "closed" : "unavailable");
    };

    const dataSub = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });

    const onWindowResize = (): void => {
      fit.fit();
      sendResize();
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      window.removeEventListener("resize", onWindowResize);
      dataSub.dispose();
      socket.close();
      term.dispose();
    };
  }, [wsPath]);

  return (
    <div className="overflow-hidden rounded-lg border bg-[#0a0a0b]">
      <div className="flex items-center justify-between border-b bg-black/20 px-3 py-1.5">
        <span className="font-mono text-white/60 text-xs">terminal</span>
        <span
          className={cn(
            "text-xs",
            status === "open" ? "text-emerald-400" : "text-white/40",
          )}
        >
          {status === "open"
            ? "connected"
            : status === "connecting"
              ? "connecting..."
              : status === "closed"
                ? "session ended"
                : "unavailable"}
        </span>
      </div>
      {status === "unavailable" ? (
        <div className="space-y-2 p-4 font-mono text-sm text-white/70">
          <p>The developer terminal is not enabled on this instance.</p>
          <p className="text-white/50">
            Set <code>HALERO_DEVELOPER_TERMINAL=1</code> and restart Halero. It
            only accepts connections from this machine.
          </p>
        </div>
      ) : (
        <div ref={mountRef} className="h-[480px] w-full p-2" />
      )}
    </div>
  );
};
