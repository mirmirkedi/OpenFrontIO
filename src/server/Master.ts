import cluster from "cluster";
import crypto from "crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { GameEnv } from "../core/configuration/Config";
import { logger } from "./Logger";
import { MapPlaylist } from "./MapPlaylist";
import { MasterLobbyService } from "./MasterLobbyService";
import { setNoStoreHeaders } from "./NoStoreHeaders";
import { renderAppShell } from "./RenderHtml";
import { ServerEnv } from "./ServerEnv";
import { applyStaticAssetCacheControl } from "./StaticAssetCache";

const playlist = new MapPlaylist();
let lobbyService: MasterLobbyService;

const app = express();
const server = http.createServer(app);

const log = logger.child({ comp: "m" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (_req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json());

// Serve the shared app shell for the root document.
app.use(async (req, res, next) => {
  if (req.path === "/") {
    try {
      await renderAppShell(
        res,
        path.join(__dirname, "../../static/index.html"),
      );
    } catch (error) {
      log.error("Error rendering index.html:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    next();
  }
});

app.use(
  express.static(path.join(__dirname, "../../static"), {
    maxAge: "1y", // Set max-age to 1 year for all static assets
    setHeaders: (res) => {
      applyStaticAssetCacheControl(
        res.setHeader.bind(res),
        res.req.originalUrl,
      );
    },
  }),
);

app.set("trust proxy", 3);
app.use(
  rateLimit({
    windowMs: 1000, // 1 second
    max: 20, // 20 requests per IP per second
  }),
);

app.use("/api", (_req, res, next) => {
  setNoStoreHeaders(res);
  next();
});

// Start the master process
export async function startMaster() {
  if (!cluster.isPrimary) {
    throw new Error(
      "startMaster() should only be called in the primary process",
    );
  }

  log.info(`Primary ${process.pid} is running`);
  log.info(`Setting up ${ServerEnv.numWorkers()} workers...`);

  lobbyService = new MasterLobbyService(playlist, log);

  const INSTANCE_ID =
    ServerEnv.env() === GameEnv.Dev
      ? "DEV_ID"
      : crypto.randomBytes(4).toString("hex");
  process.env.INSTANCE_ID = INSTANCE_ID;

  log.info(`Instance ID: ${INSTANCE_ID}`);

  // Fork workers
  for (let i = 0; i < ServerEnv.numWorkers(); i++) {
    const worker = cluster.fork({
      WORKER_ID: i,
      INSTANCE_ID,
    });

    lobbyService.registerWorker(i, worker);
    log.info(`Started worker ${i} (PID: ${worker.process.pid})`);
  }

  // Handle worker crashes
  cluster.on("exit", (worker, code, signal) => {
    const workerId = (worker as any).process?.env?.WORKER_ID;
    if (workerId === undefined) {
      log.error(`worker crashed could not find id`);
      return;
    }

    const workerIdNum = parseInt(workerId);
    lobbyService.removeWorker(workerIdNum);

    log.warn(
      `Worker ${workerId} (PID: ${worker.process.pid}) died with code: ${code} and signal: ${signal}`,
    );
    log.info(`Restarting worker ${workerId}...`);

    // Restart the worker with the same ID
    const newWorker = cluster.fork({
      WORKER_ID: workerId,
      INSTANCE_ID,
    });

    lobbyService.registerWorker(workerIdNum, newWorker);
    log.info(
      `Restarted worker ${workerId} (New PID: ${newWorker.process.pid})`,
    );
  });

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  server.listen(PORT, () => {
    log.info(`Master HTTP server listening on port ${PORT}`);
  });
}

app.all("/api/*", (req, res) => {
  if (req.path === "/api/health") {
    const ready = lobbyService?.isHealthy() ?? false;
    if (ready) {
      res.json({ status: "ok" });
    } else {
      res.status(503).json({ status: "unavailable" });
    }
    return;
  }

  // Extract gameID if present in path, e.g. /api/game/ABCDEF/listing
  const gameMatch = req.path.match(/^\/api\/game\/([a-zA-Z0-9_-]+)/);
  const targetWorkerId = gameMatch
    ? ServerEnv.workerIndex(gameMatch[1])
    : Math.floor(Math.random() * ServerEnv.numWorkers());
  const targetPort = ServerEnv.workerPortByIndex(targetWorkerId);

  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body;
  const bodyData = hasBody ? JSON.stringify(req.body) : undefined;
  const headers: http.OutgoingHttpHeaders = {
    ...req.headers,
    host: `127.0.0.1:${targetPort}`,
  };
  if (bodyData) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(bodyData).toString();
  }

  const proxyReq = http.request(
    {
      port: targetPort,
      host: "127.0.0.1",
      path: req.originalUrl,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    log.error(`API proxy error on ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: "Failed to forward request to worker" });
  });

  if (bodyData) {
    proxyReq.write(bodyData);
  }
  proxyReq.end();
});

// Forward WebSocket upgrade connections to the matching worker
server.on("upgrade", (req, socket, head) => {
  const match = req.url?.match(/^\/w(\d+)(\/.*)?$/);
  if (match) {
    const workerIndex = parseInt(match[1], 10);
    const targetPort = ServerEnv.workerPortByIndex(workerIndex);
    const targetPath = req.url ?? "/";

    const proxyReq = http.request({
      port: targetPort,
      host: "127.0.0.1",
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${targetPort}`,
      },
    });

    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      let rawHeaders = `HTTP/1.1 101 Switching Protocols\r\n`;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) rawHeaders += `${key}: ${v}\r\n`;
        } else if (value !== undefined) {
          rawHeaders += `${key}: ${value}\r\n`;
        }
      }
      rawHeaders += `\r\n`;
      socket.write(rawHeaders);
      if (proxyHead && proxyHead.length) socket.write(proxyHead);
      if (head && head.length) proxySocket.write(head);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });

    proxyReq.on("error", (err) => {
      log.error(`WebSocket upgrade proxy error for worker ${workerIndex}:`, err);
      socket.destroy();
    });

    proxyReq.end();
  } else {
    socket.destroy();
  }
});

// SPA fallback route
app.get("/{*splat}", async function (_req, res) {
  try {
    const htmlPath = path.join(__dirname, "../../static/index.html");
    await renderAppShell(res, htmlPath);
  } catch (error) {
    log.error("Error rendering SPA fallback:", error);
    res.status(500).send("Internal Server Error");
  }
});
