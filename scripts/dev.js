const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { loadEnv } = require("../services/env");

loadEnv();

const REQUESTED_BACKEND_PORT = Number(process.env.PORT || 5000);
const REQUESTED_FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 3000);
const ROOT_DIR = process.cwd();
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const NEXT_CLI = path.join("node_modules", "next", "dist", "bin", "next");

const children = [];
let shuttingDown = false;

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const backendPort = await resolvePort(REQUESTED_BACKEND_PORT, "backend");
  const frontendPort = await resolvePort(REQUESTED_FRONTEND_PORT, "frontend");
  const backendUrl = `http://localhost:${backendPort}`;
  const frontendUrl = `http://localhost:${frontendPort}`;
  const commands = createCommands({ backendPort, frontendPort, backendUrl });

  console.log("Starting Business Analysis App");
  console.log(`Backend:  ${backendUrl}`);
  console.log(`Frontend: ${frontendUrl}`);
  console.log("Press Ctrl+C to stop both processes.\n");

  for (const item of commands) {
    start(item);
  }

  process.on("SIGINT", stopAll);
  process.on("SIGTERM", stopAll);
  process.on("message", (message) => {
    if (message === "shutdown") {
      stopAll();
    }
  });
}

function createCommands({ backendPort, frontendPort, backendUrl }) {
  return [
    {
      name: "api",
      command: process.execPath,
      args: ["index.js"],
      cwd: ROOT_DIR,
      env: {
        PORT: String(backendPort),
        MERCORA_DEMO_MODE: process.env.MERCORA_DEMO_MODE || "true"
      }
    },
    {
      name: "web",
      command: process.execPath,
      args: [NEXT_CLI, "dev", "--hostname", "0.0.0.0", "--port", String(frontendPort)],
      cwd: FRONTEND_DIR,
      env: {
        API_URL: backendUrl,
        NEXT_PUBLIC_API_URL: backendUrl
      }
    }
  ];
}

function start({ name, command, args, cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...env
    },
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: true
  });

  children.push(child);

  child.stdout.on("data", (chunk) => writePrefixed(name, chunk, false));
  child.stderr.on("data", (chunk) => writePrefixed(name, chunk, true));

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal || `code ${code}`;
    console.error(`\n${name} stopped unexpectedly (${reason}). Stopping the app.`);
    stopAll(1);
  });
}

function writePrefixed(name, chunk, isError) {
  const output = chunk.toString();
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const target = isError ? process.stderr : process.stdout;
    target.write(`[${name}] ${line}\n`);
  }
}

function stopAll(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

async function resolvePort(startPort, label) {
  const maxAttempts = 20;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;

    if (await canListen(port)) {
      if (port !== startPort) {
        console.log(`${label} port ${startPort} is unavailable, using ${port}.`);
      }

      return port;
    }
  }

  throw new Error(`No available ${label} port found from ${startPort} to ${startPort + maxAttempts - 1}.`);
}

function canListen(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }

      reject(error);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "0.0.0.0");
  });
}
