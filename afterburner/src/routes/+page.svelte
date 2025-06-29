<script lang="ts">
    import { onMount } from "svelte";
    import { SerialPort } from "tauri-plugin-serialplugin";
    import {
        isPermissionGranted,
        requestPermission,
    } from "@tauri-apps/plugin-notification";
    import { serial, connect } from "$lib/Serial.svelte"; // <- the new object
    import { disconnect } from "../lib/Serial.svelte";
    import ForceChart from "../lib/ForceChart.svelte";
    let available_ports: string[] = [];
    onMount(async () => {
        available_ports = Object.keys(await SerialPort.available_ports());
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
            permissionGranted = (await requestPermission()) === "granted";
        }
    });
</script>

{#if !serial.connected}
    <button
        class="btn btn-success"
        popovertarget="popover-1"
        style="anchor-name:--anchor-1"
    >
        Connect
    </button>
    <ul
        class="dropdown menu w-52 rounded-box bg-base-100 shadow-sm"
        popover
        id="popover-1"
        style="position-anchor:--anchor-1"
    >
        {#each available_ports as p}
            <li on:click={() => connect(p)}><a>{p}</a></li>
        {/each}
    </ul>
{:else}
    <button on:click={() => disconnect()} class="btn btn-error">
        Disconnect
    </button>
{/if}
{#if serial.connected}
    <div class="inline-grid *:[grid-area:1/1]">
        <div class="status status-success animate-ping"></div>
        <div class="status status-success"></div>
    </div>
    Device connected
{:else}
    <div class="inline-grid *:[grid-area:1/1]">
        <div class="status status-error animate-ping"></div>
        <div class="status status-error"></div>
    </div>
    Device not connected
{/if}
<p>{serial.latest}</p>
<ForceChart/>
