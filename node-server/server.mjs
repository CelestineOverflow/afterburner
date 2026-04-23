import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});
const port = 3000;

// ---- serial state (single shared connection, broadcast to all clients) ----
let serial = null;
let parser = null;
let serialState = { connected: false, path: null, baudRate: null };

// sockets currently asking for the port list to be polled
const portListSubscribers = new Set();

function broadcastSerialState() {
  io.emit("serial-state", serialState);
}

async function listPorts() {
  try {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer ?? null,
      serialNumber: p.serialNumber ?? null,
      vendorId: p.vendorId ?? null,
      productId: p.productId ?? null,
    }));
  } catch {
    return [];
  }
}

// poll port list every 500ms, but only for currently subscribed sockets
setInterval(async () => {
  if (portListSubscribers.size === 0) return;
  const ports = await listPorts();
  for (const id of portListSubscribers) {
    const s = io.sockets.sockets.get(id);
    if (s) s.emit("port-list", ports);
    else portListSubscribers.delete(id);
  }
}, 500);

function openSerial(path, baudRate = 115200) {
  // close any existing connection first
  if (serial && serial.isOpen) {
    try { serial.close(); } catch {}
  }

  serial = new SerialPort({ path, baudRate, autoOpen: false });
  parser = serial.pipe(new ReadlineParser({ delimiter: "\n" }));

  serial.open((err) => {
    if (err) {
      serialState = { connected: false, path: null, baudRate: null, error: err.message };
      broadcastSerialState();
      return;
    }
    serialState = { connected: true, path, baudRate };
    broadcastSerialState();
    console.log(`serial opened: ${path} @ ${baudRate}`);
  });

  parser.on("data", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      io.emit("serial-line", JSON.parse(trimmed));
    } catch {
      // not valid json — forward as raw so client can still see it
      io.emit("serial-line", { raw: trimmed });
    }
  });

  serial.on("close", () => {
    serialState = { connected: false, path: null, baudRate: null };
    broadcastSerialState();
    console.log("serial closed");
  });

  serial.on("error", (err) => {
    console.error("serial error:", err.message);
    serialState = { connected: false, path: null, baudRate: null, error: err.message };
    broadcastSerialState();
  });
}

function closeSerial() {
  if (serial && serial.isOpen) {
    serial.close();
  } else {
    serialState = { connected: false, path: null, baudRate: null };
    broadcastSerialState();
  }
}

app.get("/", (req, res) => {
  res.send("serial bridge running");
});

io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);

  // send current state to the newly connected client
  socket.emit("serial-state", serialState);

  socket.on("subscribe-list-port", async () => {
    portListSubscribers.add(socket.id);
    // send one immediately so the client doesn't wait 500ms for the first list
    socket.emit("port-list", await listPorts());
  });

  socket.on("unsubscribe-list-port", () => {
    portListSubscribers.delete(socket.id);
  });

  socket.on("connect-serial", ({ path, baudRate } = {}) => {
    if (!path) return;
    // picking a port auto-stops port list polling for this client
    portListSubscribers.delete(socket.id);
    openSerial(path, baudRate || 115200);
  });

  socket.on("disconnect-serial", () => {
    closeSerial();
  });

  socket.on("disconnect", () => {
    portListSubscribers.delete(socket.id);
    console.log(`client disconnected: ${socket.id}`);
  });
});

httpServer.listen(port, () => {
  console.log(`server running on port ${port}`);
});