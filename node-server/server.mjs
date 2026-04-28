import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { SerialPort } from "serialport";
import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import cors from "cors";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { DutController, DutState } from "./dut-controller.js";

const FIRMWARE_REPO = "CelestineOverflow/afterburner_firmware";
extendZodWithOpenApi(z);
const app = express();
app.use(cors());
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
const port = 3000;

// ---- shared state ----
const serial = {
  connected: false,
  latest: "",
  port: null,
  latest_json: {},
};
let buffer = "";
const power_meter_data = { voltage_mv: 0, current_ma: 0, power_mw: 0 };
const temperature_data = { temperature: 0.0 };
const loadcell_data = { loadcell: 0 };
const pid_values = { p: 0.0, d: 0.0, i: 0.0 };
const pid_status_data = {
  type: "",
  target_temperature: 0,
  heater_enabled: false,
  pwm_duty: 0,
};
const firmware_data = { version: "", idf_version: "", build_time: "", build_date: "", project_name: "" };
let serialState = { connected: false, path: null, baudRate: null };

// ==================== Schemas ====================
const TemperatureSchema = z
  .object({ temperature: z.number() })
  .openapi("Temperature");
const LoadcellSchema = z
  .object({ loadcell: z.number() })
  .openapi("Loadcell");
const PowerMeterSchema = z
  .object({
    voltage_mv: z.number(),
    current_ma: z.number(),
    power_mw: z.number(),
  })
  .openapi("PowerMeter");
const PidValuesSchema = z
  .object({ p: z.number(), i: z.number(), d: z.number() })
  .openapi("PidValues");
const PidStatusSchema = z
  .object({
    type: z.string(),
    target_temperature: z.number(),
    heater_enabled: z.boolean(),
    pwm_duty: z.number(),
  })
  .openapi("PidStatus");
const SerialStateSchema = z
  .object({
    connected: z.boolean(),
    path: z.string().nullable(),
    baudRate: z.number().nullable(),
    error: z.string().optional(),
  })
  .openapi("SerialState");
const PortInfoSchema = z
  .object({
    path: z.string(),
    manufacturer: z.string().nullable(),
    serialNumber: z.string().nullable(),
    vendorId: z.string().nullable(),
    productId: z.string().nullable(),
  })
  .openapi("PortInfo");
const AckSchema = z
  .object({ ok: z.boolean(), error: z.string().optional() })
  .openapi("Ack");
const ApiErrorSchema = z
  .object({ ok: z.boolean(), error: z.string() })
  .openapi("ApiError");
const ConnectRequestSchema = z
  .object({
    path: z.string().openapi({ example: "/dev/ttyACM0" }),
    baudRate: z
      .number()
      .int()
      .positive()
      .optional()
      .openapi({ example: 115200 }),
  })
  .openapi("ConnectRequest");

// DUT-specific schemas
const DutFaultSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    atMs: z.number(),
  })
  .nullable()
  .openapi("DutFault");
const DutStateSchema = z
  .object({
    mode: z.string().openapi({ example: "ACTIVE" }),
    target: z.number().nullable(),
    last_reading: z.number().nullable(),
    last_update_ms: z.number().nullable(),
    age_ms: z.number().nullable(),
    heater_setpoint: z.number(),
    fault: DutFaultSchema,
  })
  .openapi("DutState");
const DutReadingSchema = z
  .object({
    value: z.number().openapi({ example: 65.4, description: "DUT temperature in °C" }),
    ts: z.number().int().optional().openapi({ description: "Optional client timestamp (ms epoch)" }),
  })
  .openapi("DutReading");
const DutReadingAckSchema = z
  .object({
    ok: z.boolean(),
    accepted: z.boolean(),
    reason: z.string().optional(),
  })
  .openapi("DutReadingAck");

// ==================== Command registry ====================
const COMMANDS = {
  setTargetTemperature: {
    deviceType: "set_target_temperature",
    valueSchema: z
      .number()
      .openapi({ example: 220, description: "Target temperature in °C" }),
    socketEvent: "set-target-temperature",
    httpPath: "/target-temperature",
    summary: "Set the PID target temperature",
    onSent: (value) => {
      // If a manual heater target is set while DUT mode is engaged, the user
      // is taking over: bail out of DUT control rather than fighting them.
      if (dut && dut.getState().mode !== DutState.IDLE) {
        dut.setEnabled(false).catch(() => {});
        io.emit("error-notification", {
          title: "DUT control disabled",
          body: "Manual heater target set; DUT closed-loop control was turned off.",
        });
      }
    },
  },
  setP: {
    deviceType: "set_kp",
    valueSchema: z.number().openapi({ example: 1.5 }),
    socketEvent: "set-p",
    httpPath: "/pid/kp",
    summary: "Set the PID proportional gain",
  },
  setI: {
    deviceType: "set_ki",
    valueSchema: z.number().openapi({ example: 0.1 }),
    socketEvent: "set-i",
    httpPath: "/pid/ki",
    summary: "Set the PID integral gain",
  },
  setD: {
    deviceType: "set_kd",
    valueSchema: z.number().openapi({ example: 0.05 }),
    socketEvent: "set-d",
    httpPath: "/pid/kd",
    summary: "Set the PID derivative gain",
  },
  overrideForce: {
    deviceType: "override_force",
    valueSchema: z.boolean().openapi({ example: false }),
    socketEvent: "override-force",
    httpPath: "/override-force",
    summary: "Bypass the force-sensor gate",
  },
  enableHeater: {
    deviceType: "enable_heater",
    valueSchema: z.boolean().openapi({ example: true }),
    socketEvent: "enable-heater",
    httpPath: "/heater",
    summary: "Enable or disable the heater",
  },
  get_firmware_version: {
    deviceType: "get_firmware_version",
    valueSchema: null,
    socketEvent: "get-firmware-version",
    httpPath: "/firmware-version",
    summary: "Request the firmware version info (responds with 'firmware-version' event)",
  },
  setZeroPoint: {
    deviceType: "set_loadcell_zero",
    valueSchema: null,
    socketEvent: "set-zero-point",
    httpPath: "/loadcell/zero",
    summary: "Tare the load cell",
  },
  setMultiplier: {
    deviceType: "set_loadcell_multiplier",
    valueSchema: z.number().openapi({ example: 1.0 }),
    socketEvent: "set-multiplier",
    httpPath: "/loadcell/multiplier",
    summary: "Set the load cell calibration multiplier",
  },
};

// ---- port discovery ----
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
setInterval(async () => {
  if (portListSubscribers.size === 0) return;
  const ports = await listPorts();
  for (const id of portListSubscribers) {
    const s = io.sockets.sockets.get(id);
    if (s) s.emit("port-list", ports);
    else portListSubscribers.delete(id);
  }
}, 500);

// ---- inbound serial parsing ----
function handleParsedJson(latest_json) {
  if (latest_json.type === "error") {
    const errorMessage = latest_json.message || "Unknown error";
    io.emit("error-notification", {
      title: "⚠️ Afterburner Error",
      body: errorMessage,
    });
    console.error(`System error: ${errorMessage}`);
  }
  if ("voltage_mv" in latest_json) {
    power_meter_data.voltage_mv = latest_json.voltage_mv;
    power_meter_data.current_ma = latest_json.current_ma;
    power_meter_data.power_mw = latest_json.power_mw;
    io.emit("power-meter-data", { ...power_meter_data });
  }
  if ("temperature" in latest_json) {
    temperature_data.temperature = latest_json.temperature;
    io.emit("temperature-data", { ...temperature_data });
  }
  if ("loadcell_force" in latest_json) {
    loadcell_data.loadcell = latest_json.loadcell_force;
    io.emit("loadcell-data", { ...loadcell_data });
  }
  if (latest_json.type === "firmware_info") {
    firmware_data.version = latest_json.version;
    firmware_data.idf_version = latest_json.idf_version;
    firmware_data.build_time = latest_json.build_time;
    firmware_data.build_date = latest_json.build_date;
    firmware_data.project_name = latest_json.project_name;
    io.emit("firmware-info", { ...firmware_data });
  }
  if (latest_json.type === "pid_status") {
    pid_status_data.type = latest_json.type;
    pid_status_data.target_temperature = latest_json.target_temperature;
    pid_status_data.heater_enabled = latest_json.heater_enabled;
    pid_status_data.pwm_duty = latest_json.pwm_duty;
    pid_values.p = latest_json.kp;
    pid_values.i = latest_json.ki;
    pid_values.d = latest_json.kd;
    io.emit("pid-values", { ...pid_values });
    io.emit("pid-status", { ...pid_status_data });
  }
}

// ---- serial open/close ----
function openSerial(path, baudRate = 115200) {
  if (serial.port && serial.port.isOpen) {
    try { serial.port.close(); } catch {}
  }
  buffer = "";
  serial.port = new SerialPort({ path, baudRate, autoOpen: false });
  serial.port.open((err) => {
    if (err) {
      serialState = { connected: false, path: null, baudRate: null, error: err.message };
      serial.connected = false;
      broadcastSerialState();
      return;
    }
    // cdc?
    serial.port.set({ dtr: false, rts: false }, (err) => {
      if (err) {
        console.error("Failed to set DTR/RTS:", err);
      }
    });
    // delay 100ms
    setTimeout(() => {
      serial.port.set({ dtr: true, rts: true }, (err) => {
        if (err) {
          console.error("Failed to clear DTR/RTS:", err);
        }
      });
    }, 100);
    serial.connected = true;
    serialState = { connected: true, path, baudRate };
    broadcastSerialState();
    console.log(`serial opened: ${path} @ ${baudRate}`);
    // ask for the firmware version on connect so we can display it in the UI
    writeCommand("get_firmware_version", null).catch((e) => {
      console.error(`Failed to request firmware version: ${e?.message ?? String(e)}`);
    });
  });

  serial.port.on("data", (chunk) => {
    try {
      buffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        serial.latest = buffer.slice(0, idx).replace(/\r$/, "");
        const trimmed = serial.latest.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            serial.latest_json = JSON.parse(serial.latest);
            handleParsedJson(serial.latest_json);
          } catch {
            io.emit("serial-line", { raw: serial.latest });
          }
        } else if (trimmed.length > 0) {
          console.debug(`Non-JSON message: ${serial.latest}`);
          io.emit("serial-line", { raw: serial.latest });
        }
        buffer = buffer.slice(idx + 1);
      }
    } catch (error) {
      console.error(`Serial listener error: ${error}`);
    }
  });
  serial.port.on("close", () => {
    serial.connected = false;
    buffer = "";
    serialState = { connected: false, path: null, baudRate: null };
    broadcastSerialState();
    // If the device disappears while DUT mode is active, drop to IDLE so we
    // don't try to push setpoints to a closed port and so the user has to
    // explicitly re-engage when they reconnect.
    if (dut && dut.getState().mode !== DutState.IDLE) {
      dut.setEnabled(false).catch(() => {});
    }
    io.emit("error-notification", {
      title: "Afterburner",
      body: "Serial Disconnected",
    });
    console.log("serial closed");
  });
  serial.port.on("error", (err) => {
    console.error("serial error:", err.message);
    serialState = { connected: false, path: null, baudRate: null, error: err.message };
    serial.connected = false;
    broadcastSerialState();
  });
}
function closeSerial() {
  if (serial.port && serial.port.isOpen) {
    serial.port.close();
  } else {
    serial.connected = false;
    buffer = "";
    serialState = { connected: false, path: null, baudRate: null };
    broadcastSerialState();
  }
}

// ---- outbound: build a typed command, write it, drain, resolve ----
function writeCommand(type, value) {
  if (!serial.port || !serial.connected) {
    return Promise.reject(new Error("Serial port is not connected"));
  }
  const line = JSON.stringify({ type, value }) + "\n";
  return new Promise((resolve, reject) => {
    serial.port.write(line, (err) => {
      if (err) {
        console.error(`write failed: ${err.message}`);
        reject(err);
        return;
      }
      serial.port.drain((drainErr) => {
        if (drainErr) {
          console.error(`drain failed: ${drainErr.message}`);
          reject(drainErr);
        } else {
          console.debug(`sent: ${line.trimEnd()}`);
          resolve();
        }
      });
    });
  });
}

// ==================== DUT controller (outer loop) ====================
const dut = new DutController({
  writeCommand,
  getHeaterEnabled: () => pid_status_data.heater_enabled,
  getPidStatus: () => pid_status_data,
});

dut.on("state-changed", (s) => {
  io.emit("dut-state", s);
});
dut.on("transition", ({ from, to, reason }) => {
  console.log(`[dut] ${from} -> ${to}: ${reason}`);
});
dut.on("fault", (fault) => {
  console.error(`[dut] FAULT ${fault.code}: ${fault.message}`);
  io.emit("error-notification", {
    title: `⚠️ DUT ${fault.code}`,
    body: fault.message,
  });
});
dut.on("setpoint-error", ({ error }) => {
  console.warn(`[dut] setpoint write failed: ${error}`);
});

// ==================== Socket.IO command handlers ====================
function registerCommandHandlers(socket) {
  for (const [, spec] of Object.entries(COMMANDS)) {
    socket.on(spec.socketEvent, async (value, ack) => {
      try {
        let payload;
        if (spec.valueSchema === null) {
          payload = true;
        } else {
          const result = spec.valueSchema.safeParse(value);
          if (!result.success) {
            throw new Error(`${spec.socketEvent}: ${result.error.issues[0].message}`);
          }
          payload = result.data;
        }
        await writeCommand(spec.deviceType, payload);
        if (typeof spec.onSent === "function") {
          try { spec.onSent(payload); } catch (e) {
            console.warn(`onSent for ${spec.socketEvent} threw: ${e?.message ?? e}`);
          }
        }
        if (typeof ack === "function") ack({ ok: true });
      } catch (e) {
        const msg = e?.message || String(e);
        console.error(`command ${spec.socketEvent} rejected from ${socket.id}: ${msg}`);
        if (typeof ack === "function") ack({ ok: false, error: msg });
      }
    });
  }

  // ---- DUT-specific socket handlers ----
  socket.on("dut-set-target", async (value, ack) => {
    try {
      const parsed = z.number().safeParse(value);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      dut.setTarget(parsed.data);
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e?.message ?? String(e) });
    }
  });

  socket.on("dut-enable", async (value, ack) => {
    try {
      const parsed = z.boolean().safeParse(value);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      await dut.setEnabled(parsed.data);
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e?.message ?? String(e) });
    }
  });

  socket.on("dut-reading", async (data, ack) => {
    try {
      const parsed = DutReadingSchema.safeParse(data);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { value, ts } = parsed.data;
      const result = dut.ingestReading(value, ts ?? Date.now());
      if (typeof ack === "function") ack({ ok: true, ...result });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, accepted: false, error: e?.message ?? String(e) });
    }
  });

  socket.on("dut-reset-fault", async (_value, ack) => {
    try {
      dut.resetFault();
      if (typeof ack === "function") ack({ ok: true });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e?.message ?? String(e) });
    }
  });
}

// ==================== OpenAPI registry + Express routes ====================
const apiRegistry = new OpenAPIRegistry();
const apiRouter = express.Router();

function registerHttpCommand(spec) {
  const bodySchema =
    spec.valueSchema === null ? null : z.object({ value: spec.valueSchema });
  const path = {
    method: "post",
    path: `/api${spec.httpPath}`,
    summary: spec.summary,
    tags: ["Commands"],
    responses: {
      200: {
        description: "Command accepted and written to device",
        content: { "application/json": { schema: AckSchema } },
      },
      400: {
        description: "Validation failed",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
      503: {
        description: "Serial port not connected",
        content: { "application/json": { schema: ApiErrorSchema } },
      },
    },
  };
  if (bodySchema) {
    path.request = {
      body: { content: { "application/json": { schema: bodySchema } } },
    };
  }
  apiRegistry.registerPath(path);
  apiRouter.post(spec.httpPath, async (req, res) => {
    try {
      let payload;
      if (bodySchema === null) {
        payload = true;
      } else {
        const result = bodySchema.safeParse(req.body ?? {});
        if (!result.success) {
          return res
            .status(400)
            .json({ ok: false, error: result.error.issues[0].message });
        }
        payload = result.data.value;
      }
      await writeCommand(spec.deviceType, payload);
      if (typeof spec.onSent === "function") {
        try { spec.onSent(payload); } catch (e) {
          console.warn(`onSent for ${spec.httpPath} threw: ${e?.message ?? e}`);
        }
      }
      res.json({ ok: true });
    } catch (e) {
      const msg = e?.message || String(e);
      const status = msg === "Serial port is not connected" ? 503 : 500;
      res.status(status).json({ ok: false, error: msg });
    }
  });
}

function registerStateGetter(path, summary, schema, getter, tag = "Telemetry") {
  apiRegistry.registerPath({
    method: "get",
    path: `/api${path}`,
    summary,
    tags: [tag],
    responses: {
      200: {
        description: "Latest known value",
        content: { "application/json": { schema } },
      },
    },
  });
  apiRouter.get(path, (req, res) => res.json(getter()));
}

for (const [, spec] of Object.entries(COMMANDS)) {
  registerHttpCommand(spec);
}

registerStateGetter("/temperature", "Get the latest temperature reading", TemperatureSchema, () => temperature_data);
registerStateGetter("/loadcell", "Get the latest load cell reading", LoadcellSchema, () => loadcell_data);
registerStateGetter("/power-meter", "Get the latest power meter reading", PowerMeterSchema, () => power_meter_data);
registerStateGetter("/pid-values", "Get the current PID gains", PidValuesSchema, () => pid_values);
registerStateGetter("/pid-status", "Get the current PID controller status", PidStatusSchema, () => pid_status_data);
registerStateGetter("/serial-state", "Get the current serial port connection state", SerialStateSchema, () => serialState, "Connection");
registerStateGetter("/firmware-info", "Get the firmware version info", z.object({ version: z.string(), idf_version: z.string(), build_time: z.string(), build_date: z.string(), project_name: z.string() }).openapi("FirmwareInfo"), () => firmware_data, "Firmware");

// ---- DUT routes ----
registerStateGetter("/dut/state", "Get the DUT closed-loop controller state", DutStateSchema, () => dut.getState(), "DUT");

apiRegistry.registerPath({
  method: "post",
  path: "/api/dut/target",
  summary: "Set the DUT target temperature (closed-loop)",
  tags: ["DUT"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            value: z.number().openapi({ example: 65, description: "Target DUT temperature in °C" }),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Target accepted", content: { "application/json": { schema: AckSchema } } },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
apiRouter.post("/dut/target", (req, res) => {
  const result = z.object({ value: z.number() }).safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.error.issues[0].message });
  }
  try {
    dut.setTarget(result.data.value);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message ?? String(e) });
  }
});

apiRegistry.registerPath({
  method: "post",
  path: "/api/dut/enabled",
  summary: "Enable or disable DUT closed-loop control",
  tags: ["DUT"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ value: z.boolean().openapi({ example: true }) }),
        },
      },
    },
  },
  responses: {
    200: { description: "State changed", content: { "application/json": { schema: AckSchema } } },
    400: { description: "Validation failed or fault latched", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
apiRouter.post("/dut/enabled", async (req, res) => {
  const result = z.object({ value: z.boolean() }).safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.error.issues[0].message });
  }
  try {
    await dut.setEnabled(result.data.value);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message ?? String(e) });
  }
});

apiRegistry.registerPath({
  method: "post",
  path: "/api/dut/reading",
  summary: "Submit a DUT temperature reading from an external sensor",
  tags: ["DUT"],
  request: {
    body: { content: { "application/json": { schema: DutReadingSchema } } },
  },
  responses: {
    200: { description: "Reading processed (may have been rejected as implausible)", content: { "application/json": { schema: DutReadingAckSchema } } },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
apiRouter.post("/dut/reading", (req, res) => {
  const result = DutReadingSchema.safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.error.issues[0].message });
  }
  const { value, ts } = result.data;
  const r = dut.ingestReading(value, ts ?? Date.now());
  res.json({ ok: true, ...r });
});

apiRegistry.registerPath({
  method: "post",
  path: "/api/dut/reset",
  summary: "Reset a latched DUT fault (returns to IDLE)",
  tags: ["DUT"],
  responses: {
    200: { description: "Fault reset (or no-op if not in fault)", content: { "application/json": { schema: AckSchema } } },
  },
});
apiRouter.post("/dut/reset", (req, res) => {
  dut.resetFault();
  res.json({ ok: true });
});

apiRegistry.registerPath({
  method: "get",
  path: "/api/ports",
  summary: "List all available serial ports on the host",
  tags: ["Connection"],
  responses: {
    200: {
      description: "Array of detected serial ports",
      content: { "application/json": { schema: z.array(PortInfoSchema) } },
    },
  },
});
apiRouter.get("/ports", async (req, res) => {
  res.json(await listPorts());
});

apiRegistry.registerPath({
  method: "post",
  path: "/api/connect",
  summary: "Open the serial port to the device",
  tags: ["Connection"],
  request: {
    body: { content: { "application/json": { schema: ConnectRequestSchema } } },
  },
  responses: {
    200: {
      description: "Open requested (check /api/serial-state for the result)",
      content: { "application/json": { schema: AckSchema } },
    },
    400: {
      description: "Validation failed",
      content: { "application/json": { schema: ApiErrorSchema } },
    },
  },
});
apiRouter.post("/connect", (req, res) => {
  const result = ConnectRequestSchema.safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.error.issues[0].message });
  }
  openSerial(result.data.path, result.data.baudRate ?? 115200);
  res.json({ ok: true });
});

apiRegistry.registerPath({
  method: "get",
  path: "/api/firmware-download",
  summary: "Download a firmware asset from a GitHub release (proxied)",
  tags: ["Firmware"],
  request: {
    query: z.object({
      tag: z.string().openapi({ example: "v1.0.3" }),
      filename: z
        .string()
        .openapi({ example: "afterburner-firmware-full.bin" }),
    }),
  },
  responses: {
    200: {
      description: "The binary file",
      content: {
        "application/octet-stream": {
          schema: { type: "string", format: "binary" },
        },
      },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: ApiErrorSchema } },
    },
    502: {
      description: "Upstream fetch failed",
      content: { "application/json": { schema: ApiErrorSchema } },
    },
  },
});
apiRouter.get("/firmware-download", async (req, res) => {
  const { tag, filename } = req.query;
  if (typeof tag !== "string" || typeof filename !== "string") {
    return res.status(400).json({
      ok: false,
      error: "tag and filename query params required",
    });
  }
  if (filename.includes("/") || filename.includes("..") || filename.includes("\\")) {
    return res.status(400).json({ ok: false, error: "invalid filename" });
  }
  const url = `https://github.com/${FIRMWARE_REPO}/releases/download/${encodeURIComponent(
    tag
  )}/${encodeURIComponent(filename)}`;
  try {
    const upstream = await fetch(url, { redirect: "follow" });
    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ ok: false, error: `upstream ${upstream.status}` });
    }
    res.setHeader("Content-Type", "application/octet-stream");
    const len = upstream.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ ok: false, error: e?.message ?? String(e) });
    } else {
      res.destroy();
    }
  }
});

apiRegistry.registerPath({
  method: "post",
  path: "/api/disconnect",
  summary: "Close the serial port",
  tags: ["Connection"],
  responses: {
    200: {
      description: "Close requested",
      content: { "application/json": { schema: AckSchema } },
    },
  },
});
apiRouter.post("/disconnect", (req, res) => {
  closeSerial();
  res.json({ ok: true });
});

// ==================== Generate the OpenAPI spec ====================
let openApiDocument;
try {
  openApiDocument = new OpenApiGeneratorV3(apiRegistry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Afterburner Bridge API",
      version: "1.1.0",
      description:
        "HTTP API for the Afterburner serial bridge. The same commands are also available over Socket.IO; this API is for external consumers (Python scripts, integrations) that prefer plain HTTP.",
    },
    servers: [{ url: `http://localhost:${port}`, description: "Local sidecar" }],
    tags: [
      { name: "Commands", description: "Write actions to the device" },
      { name: "Telemetry", description: "Read the latest sensor values" },
      { name: "Connection", description: "Manage the serial port itself" },
      { name: "DUT", description: "Closed-loop control using an external DUT temperature" },
    ],
  });
  const pathCount = Object.keys(openApiDocument.paths || {}).length;
  console.log(`openapi spec generated: ${pathCount} paths`);
} catch (e) {
  console.error("FAILED to generate OpenAPI document:", e);
  openApiDocument = {
    openapi: "3.0.3",
    info: { title: "Afterburner Bridge API (degraded)", version: "1.1.0" },
    paths: {},
  };
}

app.use("/api", apiRouter);
app.get("/openapi.json", (req, res) => res.json(openApiDocument));
app.get("/docs", (req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Afterburner Bridge API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
      });
    };
  </script>
</body>
</html>`);
});

// ==================== HTTP root + Socket.IO ====================
app.get("/", (req, res) => {
  res.send(`serial bridge running — docs at <a href="/docs">/docs</a>`);
});

io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);
  socket.emit("serial-state", serialState);
  socket.emit("dut-state", dut.getState());
  socket.on("subscribe-list-port", async () => {
    portListSubscribers.add(socket.id);
    socket.emit("port-list", await listPorts());
  });
  socket.on("unsubscribe-list-port", () => {
    portListSubscribers.delete(socket.id);
  });
  socket.on("connect-serial", ({ path, baudRate } = {}) => {
    if (!path) return;
    portListSubscribers.delete(socket.id);
    openSerial(path, baudRate || 115200);
  });
  socket.on("disconnect-serial", () => {
    closeSerial();
  });
  registerCommandHandlers(socket);
  socket.on("disconnect", () => {
    portListSubscribers.delete(socket.id);
    console.log(`client disconnected: ${socket.id}`);
  });
});

// Periodically broadcast DUT state so the UI's age_ms keeps updating even
// when no readings are arriving (so the watchdog UI stays honest).
setInterval(() => {
  io.emit("dut-state", dut.getState());
}, 1000);

httpServer.listen(port, () => {
  console.log(`server running on port ${port}`);
  console.log(`docs:        http://localhost:${port}/docs`);
  console.log(`openapi:     http://localhost:${port}/openapi.json`);
});
