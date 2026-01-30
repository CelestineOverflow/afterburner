<script lang="ts">
    import {
        temperature_data,
        loadcell_data,
        power_meter_data,
        pid_status_data,
        setTargetTemperature,
        enableHeater,
    } from "$lib/Serial.svelte";
    import TemperatureChart from "$lib/TemperatureChart.svelte";

    let targetTemp = $state(25.0);
    let isSubmitting = $state(false);

    async function handleSetTemperature() {
        if (targetTemp < 0 || targetTemp > 200) {
            alert("Temperature must be between 0°C and 200°C");
            return;
        }

        isSubmitting = true;
        try {
            await setTargetTemperature(targetTemp);
        } catch (error) {
            console.error("Failed to set temperature:", error);
            alert("Failed to set temperature. Check console for details.");
        } finally {
            isSubmitting = false;
        }
    }

    async function handleToggleHeater() {
        isSubmitting = true;
        try {
            await enableHeater(!pid_status_data.heater_enabled);
        } catch (error) {
            console.error("Failed to toggle heater:", error);
            alert("Failed to toggle heater. Check console for details.");
        } finally {
            isSubmitting = false;
        }
    }
</script>

<svelte:head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossorigin="anonymous"
    />
    <link
        href="https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,100..900;1,100..900&display=swap"
        rel="stylesheet"
    />
</svelte:head>

<div class="stats shadow stats-vertical">
    <!-- Temperature Display -->
    <div class="stat">
        <div class="stat-figure text-primary">
            <TemperatureChart />
        </div>
        <div class="stat-title text-lg">Current Temperature</div>
        <div class="stat-value text-4xl">
            {temperature_data.temperature.toFixed(2)} °C
        </div>
        <div class="stat-desc text-base">
            Target: {pid_status_data.target_temperature.toFixed(2)} °C
        </div>
        <div class="stat-desc">
            Heater: <span
                class={pid_status_data.heater_enabled
                    ? "text-success font-bold"
                    : "text-error"}
            >
                {pid_status_data.heater_enabled ? "Enabled" : "Disabled"}
            </span>
        </div>
    </div>

    <!-- Temperature Control -->
    <div class="stat">
        <div class="form-control gap-1">
            <label class="label py-1">
                <span class="label-text text-sm">Target Temperature</span>
                <span class="label-text-alt text-warning text-xs"
                    >⚠️ 0-200°C</span
                >
            </label>
            <div class="join w-full">
                <input
                    id="temp-input"
                    type="number"
                    class="input input-sm input-bordered join-item flex-1 min-w-0"
                    bind:value={targetTemp}
                    min="0"
                    max="200"
                    step="0.5"
                    placeholder="0-200°C"
                    disabled={isSubmitting}
                />
                <button
                    class="btn btn-sm btn-primary join-item"
                    onclick={handleSetTemperature}
                    disabled={isSubmitting}
                >
                    Set
                </button>
                <button
                    class="btn btn-sm join-item {pid_status_data.heater_enabled
                        ? 'btn-error'
                        : 'btn-success'}"
                    onclick={handleToggleHeater}
                    disabled={isSubmitting}
                >
                    {#if isSubmitting}
                        <span class="loading loading-spinner loading-xs"></span>
                    {:else if pid_status_data.heater_enabled}
                        Off
                    {:else}
                        On
                    {/if}
                </button>
            </div>
        </div>
    </div>
    

    <!-- Load Cell Display -->
    <div class="stat">
        <div class="stat-figure text-secondary">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                class="inline-block h-8 w-8 stroke-current"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                ></path>
            </svg>
        </div>
        <div class="stat-title">Force</div>
        <div class="stat-value text-secondary">{loadcell_data.loadcell}</div>
    </div>

    <!-- Power Monitor Display -->
    <div class="stat">
        <div class="stat-figure text-secondary">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                class="inline-block h-8 w-8 stroke-current"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                ></path>
            </svg>
        </div>
        <div class="stat-title">Power Statistics</div>
        <div class="stat-desc">
            Power: <span class="font-bold text-success"
                >{(power_meter_data.power_mw * 0.001).toFixed(2)} W</span
            >
        </div>
        <div class="stat-desc">
            Voltage: <span class="font-bold text-success"
                >{(power_meter_data.voltage_mv * 0.001).toFixed(2)} V</span
            >
        </div>
        <div class="stat-desc">
            Current: <span class="font-bold text-success"
                >{(power_meter_data.current_ma * 0.001).toFixed(3)} A</span
            >
        </div>
        <div class="stat-desc">
            PWM Duty: <span class="font-bold text-success"
                > {((pid_status_data.pwm_duty / 255) * 100).toFixed(1)} %</span
            >
        </div>
    </div>
</div>

<style>
    /* Apply Jost font to the entire component */
    div {
        font-family: "Jost", sans-serif;
    }

    .stat-title {
        font-family: "Jost", sans-serif;
        font-weight: 400;
    }

    .stat-value {
        font-family: "Jost", sans-serif;
        font-weight: 300;
    }

    .stat-desc {
        font-family: "Jost", sans-serif;
        font-weight: 300;
    }
</style>
