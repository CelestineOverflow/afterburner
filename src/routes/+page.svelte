<script lang="ts">
    import {
        temperature_data,
        loadcell_data,
        power_meter_data,
    } from "$lib/Serial.svelte";
    
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
                ><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g
                    id="SVGRepo_tracerCarrier"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                ></g><g id="SVGRepo_iconCarrier">
                    <g>
                        <path
                            d="M50,82.3c7.6,0,13.8-6.2,13.8-13.8c0-4.4-2-8.4-5.5-11V26c0-2.2-0.9-4.3-2.4-5.9c-1.6-1.6-3.7-2.4-5.9-2.4 c-4.6,0-8.3,3.7-8.3,8.3v31.5c-3.4,2.6-5.5,6.6-5.5,11C36.2,76.1,42.4,82.3,50,82.3z M44.8,60.3l0.9-0.6V48.2H50v-4h-4.3v-1.8H50 v-4h-4.3v-1.8H50v-4h-4.3v-1.8H50v-4h-4.3V26c0-2.4,1.9-4.3,4.3-4.3c1.1,0,2.2,0.4,3,1.3c0.8,0.8,1.3,1.9,1.3,3v33.6l0.9,0.6 c2.8,1.8,4.5,4.9,4.5,8.2c0,5.4-4.4,9.8-9.8,9.8s-9.8-4.4-9.8-9.8C40.2,65.1,41.9,62.1,44.8,60.3z"
                        ></path>
                        <path
                            d="M50,76.6c4.5,0,8.1-3.6,8.1-8.1c0-3.8-2.6-6.9-6.1-7.8v-8.1h-4v8.1c-3.5,0.9-6.1,4.1-6.1,7.8C41.9,73,45.5,76.6,50,76.6z M50,64.4c2.3,0,4.1,1.8,4.1,4.1s-1.8,4.1-4.1,4.1s-4.1-1.8-4.1-4.1S47.7,64.4,50,64.4z"
                        ></path>
                    </g>
                </g></svg
            >
        </div>
        <div class="stat-title">Current Temperature</div>
        <div class="stat-value">
            {temperature_data.temperature.toFixed(2)} °C
        </div>
        <div class="stat-desc">
            target: {temperature_data.temperature.toFixed(2)} °C
        </div>
    </div>
    <button class="btn btn-soft btn-warning">Set Temperature</button>
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
        <div class="stat-title">Power Stat</div>
        <div class="stat-value text-success">
            power {(power_meter_data.power_mw * 0.001).toFixed(1)} w
        </div>
        <div class="stat-value text-success">
            voltage {(power_meter_data.voltage_mv * 0.001).toFixed(1)} v
        </div>
        <div class="stat-value text-success">
            current {(power_meter_data.current_ma * 0.001).toFixed(1)} a
        </div>
    </div>
</div>



<style>
    /* Apply Jost font to the entire component */
    div {
        font-family: "Jost", sans-serif;
    }

    /* Or apply to specific elements */
    .stat-title {
        font-family: "Jost", sans-serif;
    }

    .stat-value {
        font-family: "Jost", sans-serif;
        font-weight: 300; /* Jost supports 100-900 weights */
    }
</style>
