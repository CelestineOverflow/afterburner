import { EventEmitter } from "node:events";

// ---- thresholds (tune to taste) ----
const DUT_SOFT_TIMEOUT_MS = 5_000;     // -> STALE_WARN
const DUT_HARD_TIMEOUT_MS = 15_000;    // -> STALE_FAULT
const DUT_MIN_C = -50;
const DUT_MAX_C = 250;
const DUT_MAX_STEP_C = 20;             // max delta between consecutive samples
const DUT_MAX_REJECTS = 5;             // consecutive rejects -> SENSOR_FAULT

const HEATER_FLOOR_C = 25;             // ambient fallback
const HEATER_CEILING_C = 200;          // hard clamp on what we tell the heater
const SETPOINT_SLEW_C_PER_S = 5;       // limit on how fast we change setpoint

const TICK_HZ = 1;                     // outer loop runs at 1 Hz
const RUNAWAY_WINDOW_MS = 90_000;      // 90 s sliding window for runaway checks
const RUNAWAY_MIN_GAP_C = 5;           // target-actual must exceed this to count
const RUNAWAY_MAX_SLOPE_C_PER_S = 0.05;// "not rising" threshold
const COLD_RISE_SLOPE_C_PER_S = 0.1;   // "DUT rising while heater off" threshold

// ---- states ----
export const DutState = Object.freeze({
  IDLE: "IDLE",
  ARMED: "ARMED",
  ACTIVE: "ACTIVE",
  STALE_WARN: "STALE_WARN",
  STALE_FAULT: "STALE_FAULT",
  RUNAWAY_FAULT: "RUNAWAY_FAULT",
  SENSOR_FAULT: "SENSOR_FAULT",
});

const FAULT_STATES = new Set([
  DutState.STALE_FAULT,
  DutState.RUNAWAY_FAULT,
  DutState.SENSOR_FAULT,
]);

// ---- tiny PID with integral clamp ----
class Pid {
  constructor({ kp = 2.0, ki = 0.05, kd = 0.0, iMin = -50, iMax = 50 } = {}) {
    this.kp = kp; this.ki = ki; this.kd = kd;
    this.iMin = iMin; this.iMax = iMax;
    this.integral = 0;
    this.lastErr = 0;
    this.lastTs = null;
  }
  reset() { this.integral = 0; this.lastErr = 0; this.lastTs = null; }
  step(setpoint, measured, tsMs) {
    const err = setpoint - measured;
    let dt = 0;
    if (this.lastTs != null) dt = Math.max(0, (tsMs - this.lastTs) / 1000);
    if (dt > 0) {
      this.integral += err * dt;
      if (this.integral > this.iMax) this.integral = this.iMax;
      if (this.integral < this.iMin) this.integral = this.iMin;
    }
    const deriv = dt > 0 ? (err - this.lastErr) / dt : 0;
    this.lastErr = err;
    this.lastTs = tsMs;
    return this.kp * err + this.ki * this.integral + this.kd * deriv;
  }
}

export class DutController extends EventEmitter {
  constructor({ writeCommand, getHeaterEnabled, getPidStatus } = {}) {
    super();
    this.writeCommand = writeCommand;
    this.getHeaterEnabled = getHeaterEnabled ?? (() => false);
    this.getPidStatus = getPidStatus ?? (() => ({ pwm_duty: 0 }));

    this.state = DutState.IDLE;
    this.target = null;
    this.lastReading = null;       // { value, ts }
    this.history = [];             // [{value, ts}, ...] within window
    this.consecutiveRejects = 0;
    this.fault = null;             // { code, message, atMs }
    this.lastSetpoint = HEATER_FLOOR_C;
    this.lastSetpointTs = Date.now();
    this.pid = new Pid();

    this._tick = this._tick.bind(this);
    this._tickHandle = setInterval(this._tick, 1000 / TICK_HZ);
  }

  destroy() {
    clearInterval(this._tickHandle);
    this._tickHandle = null;
  }

  // ---- public API ----
  async setEnabled(on) {
    if (on) {
      if (FAULT_STATES.has(this.state)) {
        throw new Error(`Cannot enable: in fault state ${this.state}. Reset first.`);
      }
      if (this.state === DutState.IDLE) {
        this.pid.reset();
        this.history = [];
        this.consecutiveRejects = 0;
        this._transition(DutState.ARMED, "DUT control enabled");
        await this._pushSetpoint(HEATER_FLOOR_C, "armed");
      }
    } else {
      // Disable: drop to IDLE and ramp setpoint to floor.
      if (this.state !== DutState.IDLE) {
        this._transition(DutState.IDLE, "DUT control disabled");
        await this._pushSetpoint(HEATER_FLOOR_C, "idle");
      }
    }
  }

  setTarget(c) {
    if (typeof c !== "number" || !Number.isFinite(c)) {
      throw new Error("target must be a finite number");
    }
    if (c < DUT_MIN_C || c > DUT_MAX_C) {
      throw new Error(`target out of range [${DUT_MIN_C}, ${DUT_MAX_C}]`);
    }
    this.target = c;
    this.emit("state-changed", this.getState());
  }

  ingestReading(value, tsMs = Date.now()) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { accepted: false, reason: "non-finite" };
    }
    if (value < DUT_MIN_C || value > DUT_MAX_C) {
      this._registerReject(`out of range: ${value}`);
      return { accepted: false, reason: "out-of-range" };
    }
    if (this.lastReading) {
      const dtSec = (tsMs - this.lastReading.ts) / 1000;
      // Only enforce step limit if the previous sample is recent.
      if (dtSec >= 0 && dtSec < 5) {
        const step = Math.abs(value - this.lastReading.value);
        if (step > DUT_MAX_STEP_C) {
          this._registerReject(`step too large: ${step.toFixed(2)} °C in ${dtSec.toFixed(2)} s`);
          return { accepted: false, reason: "step-too-large" };
        }
      }
    }

    this.consecutiveRejects = 0;
    this.lastReading = { value, ts: tsMs };
    this.history.push({ value, ts: tsMs });
    this._trimHistory(tsMs);

    // First-good-reading transitions
    if (this.state === DutState.ARMED || this.state === DutState.STALE_WARN) {
      this._transition(DutState.ACTIVE, "fresh reading received");
    } else if (this.state === DutState.STALE_FAULT) {
      // Latched. Reading arrives but we stay faulted until reset.
    }

    this.emit("state-changed", this.getState());
    return { accepted: true };
  }

  resetFault() {
    if (!FAULT_STATES.has(this.state)) return;
    this.fault = null;
    this.pid.reset();
    this.history = [];
    this.consecutiveRejects = 0;
    this._transition(DutState.IDLE, "fault reset");
    // caller should re-enable explicitly
  }

  getState() {
    return {
      mode: this.state,
      target: this.target,
      last_reading: this.lastReading?.value ?? null,
      last_update_ms: this.lastReading?.ts ?? null,
      age_ms: this.lastReading ? Date.now() - this.lastReading.ts : null,
      heater_setpoint: this.lastSetpoint,
      fault: this.fault,
    };
  }

  // ---- internal ----
  _registerReject(reason) {
    this.consecutiveRejects += 1;
    if (this.consecutiveRejects >= DUT_MAX_REJECTS) {
      this._fault(DutState.SENSOR_FAULT, `sensor rejects: ${reason}`);
    }
  }

  _trimHistory(nowMs) {
    const cutoff = nowMs - RUNAWAY_WINDOW_MS;
    while (this.history.length && this.history[0].ts < cutoff) {
      this.history.shift();
    }
  }

  _transition(next, reason) {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.emit("transition", { from: prev, to: next, reason, atMs: Date.now() });
    this.emit("state-changed", this.getState());
  }

  _fault(code, message) {
    if (this.state === code) return;
    this.fault = { code, message, atMs: Date.now() };
    this._transition(code, message);
    // Latched fault: drop heater target to floor and disable heater.
    this._pushSetpoint(HEATER_FLOOR_C, `fault: ${code}`).catch(() => {});
    if (this.writeCommand) {
      this.writeCommand("enable_heater", false).catch(() => {});
    }
    this.emit("fault", this.fault);
  }

  async _pushSetpoint(desiredC, reason) {
    const now = Date.now();
    // Slew limit
    const dtSec = Math.max(0.001, (now - this.lastSetpointTs) / 1000);
    const maxStep = SETPOINT_SLEW_C_PER_S * dtSec;
    let next = desiredC;
    if (next > this.lastSetpoint + maxStep) next = this.lastSetpoint + maxStep;
    if (next < this.lastSetpoint - maxStep) next = this.lastSetpoint - maxStep;
    // Clamp
    if (next > HEATER_CEILING_C) next = HEATER_CEILING_C;
    if (next < HEATER_FLOOR_C) next = HEATER_FLOOR_C;

    if (Math.abs(next - this.lastSetpoint) < 0.05) return; // dead-band
    this.lastSetpoint = next;
    this.lastSetpointTs = now;

    if (this.writeCommand) {
      try {
        await this.writeCommand("set_target_temperature", next);
        this.emit("setpoint-pushed", { value: next, reason });
      } catch (e) {
        // Don't fault on a single write failure — serial may be momentarily
        // wedged. The next tick will retry.
        this.emit("setpoint-error", { error: e?.message ?? String(e) });
      }
    }
  }

  _slope() {
    // °C/s over the available window (linear fit endpoints). Cheap and good
    // enough for runaway detection.
    if (this.history.length < 2) return 0;
    const a = this.history[0];
    const b = this.history[this.history.length - 1];
    const dt = (b.ts - a.ts) / 1000;
    if (dt <= 0) return 0;
    return (b.value - a.value) / dt;
  }

  _checkRunaway(nowMs) {
    if (this.history.length < 5) return; // need some samples
    const windowSpanMs = this.history[this.history.length - 1].ts - this.history[0].ts;
    if (windowSpanMs < RUNAWAY_WINDOW_MS * 0.5) return; // need at least half window

    const slope = this._slope();
    const heaterEnabled = this.getHeaterEnabled();
    const pwm = this.getPidStatus()?.pwm_duty ?? 0;
    const gap = (this.target ?? 0) - (this.lastReading?.value ?? 0);

    // Pattern 1: heater pegged, DUT not rising despite a real gap.
    if (
      this.state === DutState.ACTIVE &&
      this.lastSetpoint >= HEATER_CEILING_C - 1 &&
      gap > RUNAWAY_MIN_GAP_C &&
      Math.abs(slope) < RUNAWAY_MAX_SLOPE_C_PER_S
    ) {
      this._fault(
        DutState.RUNAWAY_FAULT,
        `heater pegged but DUT not rising (slope=${slope.toFixed(3)} °C/s, gap=${gap.toFixed(1)} °C)`
      );
      return;
    }

    // Pattern 2: heater off / PWM ~0 but DUT climbing.
    if (!heaterEnabled || pwm < 5) {
      if (slope > COLD_RISE_SLOPE_C_PER_S) {
        this._fault(
          DutState.RUNAWAY_FAULT,
          `DUT rising while heater off (slope=${slope.toFixed(3)} °C/s, pwm=${pwm})`
        );
      }
    }
  }

  async _tick() {
    const now = Date.now();
    if (this.state === DutState.IDLE) return;
    if (FAULT_STATES.has(this.state)) return;

    // Watchdog
    if (this.lastReading) {
      const age = now - this.lastReading.ts;
      if (age > DUT_HARD_TIMEOUT_MS) {
        this._fault(DutState.STALE_FAULT, `no DUT reading for ${age} ms`);
        return;
      }
      if (age > DUT_SOFT_TIMEOUT_MS && this.state === DutState.ACTIVE) {
        this._transition(DutState.STALE_WARN, `no DUT reading for ${age} ms`);
      }
    } else if (this.state !== DutState.ARMED) {
      // Should not happen, but safe-guard.
      this._transition(DutState.ARMED, "no readings yet");
    }

    // If ARMED with no readings, hold floor.
    if (this.state === DutState.ARMED) {
      await this._pushSetpoint(HEATER_FLOOR_C, "armed-no-readings");
      return;
    }

    // STALE_WARN: hold last setpoint, don't update PID
    if (this.state === DutState.STALE_WARN) return;

    // ACTIVE: run outer PID
    if (this.state === DutState.ACTIVE && this.target != null && this.lastReading) {
      this._checkRunaway(now);
      if (FAULT_STATES.has(this.state)) return; // _checkRunaway may have faulted

      const desired = this.pid.step(this.target, this.lastReading.value, now);
      // pid output is interpreted as the heater target in °C, plus the DUT
      // target itself as a feed-forward floor. (At steady state we'll need the
      // heater hotter than the DUT, so this just biases things sensibly.)
      const heaterSetpoint = this.target + desired;
      await this._pushSetpoint(heaterSetpoint, "pid");
    }
  }
}
