<script lang="ts">
    import {
        temperature_data,
        loadcell_data,
        power_meter_data,
        pid_status_data,
        setTargetTemperature,
        enableHeater,
    } from "$lib/Serial.svelte";

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
            <svg
                fill="#ffffff"
                width="64px"
                height="64px"
                viewBox="0 0 100 100"
                enable-background="new 0 0 100 100"
                id="Layer_1"
                version="1.1"
                xml:space="preserve"
                xmlns="http://www.w3.org/2000/svg"
                xmlns:xlink="http://www.w3.org/1999/xlink"
            >
                <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                <g
                    id="SVGRepo_tracerCarrier"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                ></g>
                <g id="SVGRepo_iconCarrier">
                    <g>
                        <path
                            d="M50,82.3c7.6,0,13.8-6.2,13.8-13.8c0-4.4-2-8.4-5.5-11V26c0-2.2-0.9-4.3-2.4-5.9c-1.6-1.6-3.7-2.4-5.9-2.4 c-4.6,0-8.3,3.7-8.3,8.3v31.5c-3.4,2.6-5.5,6.6-5.5,11C36.2,76.1,42.4,82.3,50,82.3z M44.8,60.3l0.9-0.6V48.2H50v-4h-4.3v-1.8H50 v-4h-4.3v-1.8H50v-4h-4.3v-1.8H50v-4h-4.3V26c0-2.4,1.9-4.3,4.3-4.3c1.1,0,2.2,0.4,3,1.3c0.8,0.8,1.3,1.9,1.3,3v33.6l0.9,0.6 c2.8,1.8,4.5,4.9,4.5,8.2c0,5.4-4.4,9.8-9.8,9.8s-9.8-4.4-9.8-9.8C40.2,65.1,41.9,62.1,44.8,60.3z"
                        ></path>
                        <path
                            d="M50,76.6c4.5,0,8.1-3.6,8.1-8.1c0-3.8-2.6-6.9-6.1-7.8v-8.1h-4v8.1c-3.5,0.9-6.1,4.1-6.1,7.8C41.9,73,45.5,76.6,50,76.6z M50,64.4c2.3,0,4.1,1.8,4.1,4.1s-1.8,4.1-4.1,4.1s-4.1-1.8-4.1-4.1S47.7,64.4,50,64.4z"
                        ></path>
                    </g>
                </g>
            </svg>
        </div>
        <div class="stat-title">Current Temperature</div>
        <div class="stat-value">
            {temperature_data.temperature.toFixed(2)} °C
        </div>
        <div class="stat-desc">
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
            <span class="label-text-alt text-warning text-xs">⚠️ 0-200°C</span>
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
                class="btn btn-sm join-item {pid_status_data.heater_enabled ? 'btn-error' : 'btn-success'}"
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