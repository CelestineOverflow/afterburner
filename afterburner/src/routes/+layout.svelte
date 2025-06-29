
<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { SerialPort } from "tauri-plugin-serialplugin";
  import { serial, connect } from "$lib/Serial.svelte";
  import { disconnect } from "../lib/Serial.svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  let appWindow = null;
  let available_ports = $state<string[]>([]);
  let { children } = $props();

  onMount(async () => {
    available_ports = Object.keys(await SerialPort.available_ports());
    console.log("Available ports:", available_ports);
    appWindow = getCurrentWindow();

  });
</script>

<!-- ────────────────────────── NAVBAR ────────────────────────── -->
<div
  class="navbar bg-primary text-primary-content h-8 min-h-0 px-2 select-none"
  data-tauri-drag-region
>
  <!-- Brand -->
  <span class="text-sm font-semibold">Afterburner</span>

  <!-- Controls (no-drag) -->
  <div
    class="ml-auto flex items-center gap-2"
    style="-webkit-app-region: no-drag; pointer-events: auto;"
  >
    {#if serial.connected}
      <!-- CONNECTED: green button that disconnects on click -->
      <button
        on:click={disconnect}
        class="btn btn-xs gap-1 btn-success"
        aria-label="Disconnect"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8 17l4-4m0 0l4-4m-4 4v12"
          />
        </svg>
        Disconnect
      </button>
    {:else}
      <!-- DISCONNECTED: outline button opens port list; click on port item connects -->
      <details class="dropdown">
        <summary
          class="btn btn-xs gap-1 btn-outline"
          aria-label="Connect"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 2v6m6 6h6m-6 0a6 6 0 11-12 0 6 6 0 0112 0zm0 0v6"
            />
          </svg>
          Connect
        </summary>
        <ul
          class="p-2 menu dropdown-content z-10 bg-base-100 shadow rounded-box w-44"
        >
          {#if available_ports.length === 0}
            <li class="disabled"><span>No ports found</span></li>
          {:else}
            {#each available_ports as p}
              <li><a on:click={() => connect(p)}>{p}</a></li>
            {/each}
          {/if}
        </ul>
      </details>
    {/if}

    <!-- Status dot -->
    <span class="relative flex h-2 w-2">
      <span
        class="animate-ping absolute inline-flex h-full w-full rounded-full {serial.connected ? 'bg-success' : 'bg-error'} opacity-70"
      ></span>
      <span
        class="relative inline-flex rounded-full h-2 w-2 {serial.connected ? 'bg-success' : 'bg-error'}"
      ></span>
    </span>

    <!-- Window buttons -->
    <button
      class="btn btn-square btn-ghost btn-xs"
      aria-label="Minimize"
      on:click={() => appWindow?.minimize()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
      </svg>
    </button>
    <button
      class="btn btn-square btn-ghost btn-xs"
      aria-label="Maximize / Restore"
      on:click={() => appWindow?.toggleMaximize()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
      </svg>
    </button>
    <button
      class="btn btn-square btn-ghost btn-xs hover:bg-error"
      aria-label="Close"
      on:click={() => appWindow?.close()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M6 18L18 6" />
      </svg>
    </button>
  </div>
</div>

<!-- Latest serial data line -->
{#if serial.latest}
  <p class="px-2 py-1 text-xs font-mono break-all text-base-content/80">
    {serial.latest}
  </p>
{/if}

{@render children()}
