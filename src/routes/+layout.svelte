<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { SerialPort } from "tauri-plugin-serialplugin-api";
  import { serial, connect } from "$lib/Serial.svelte";
  import { disconnect } from "../lib/Serial.svelte";
  import { getCurrentWindow, Window } from "@tauri-apps/api/window";
  import Updater from "$lib/Updater.svelte";

  let appWindow: Window | null = null;
  let available_ports = $state<string[]>([]);
  let { children } = $props();

  onMount(async () => {
    await refreshSerialList();
  });

  async function refreshSerialList() {
    available_ports = Object.keys(await SerialPort.available_ports()).sort();
    appWindow = getCurrentWindow();
    setTimeout(refreshSerialList, 500);
  }
</script>

<!-- ────────────────────────── NAVBAR ────────────────────────── -->
<div
  class="navbar fixed top-0 left-0 z-50 bg-primary text-primary-content h-8 min-h-0 px-2 select-none"
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
        onclick={disconnect}
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
        <summary class="btn btn-xs gap-1 btn-outline" aria-label="Connect">
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
          class="p-2 menu dropdown-content z-10 bg-base-100 shadow rounded-box w-44 text-white"
        >
          {#if available_ports.length === 0}
            <li class="disabled"><span>No ports found</span></li>
          {:else}
            {#each available_ports as p}
              <li><a onclick={() => connect(p)}>{p}</a></li>
            {/each}
          {/if}
        </ul>
      </details>
    {/if}

    <!-- Status dot -->
    <span class="relative flex h-2 w-2">
      <span
        class="animate-ping absolute inline-flex h-full w-full rounded-full {serial.connected
          ? 'bg-success'
          : 'bg-error'} opacity-70"
      ></span>
      <span
        class="relative inline-flex rounded-full h-2 w-2 {serial.connected
          ? 'bg-success'
          : 'bg-error'}"
      ></span>
    </span>

    <!-- Window buttons -->
    <button
      class="btn btn-square btn-ghost btn-xs"
      aria-label="Minimize"
      onclick={() => appWindow?.minimize()}
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
    <!-- <button
      class="btn btn-square btn-ghost btn-xs"
      aria-label="Maximize / Restore"
      onclick={() => appWindow?.toggleMaximize()}
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
    </button> -->
    <button
      class="btn btn-square btn-ghost btn-xs hover:bg-error"
      aria-label="Close"
      onclick={() => appWindow?.close()}
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
          d="M6 6l12 12M6 18L18 6"
        />
      </svg>
    </button>
  </div>
</div>

<Updater />

<main class="mt-8 px-4">
  {@render children()}
</main>

<div class="dock">
  <a href="/">
    <svg
      class="size-[1.2em]"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      ><g fill="currentColor" stroke-linejoin="miter" stroke-linecap="butt"
        ><polyline
          points="1 11 12 2 23 11"
          fill="none"
          stroke="currentColor"
          stroke-miterlimit="10"
          stroke-width="2"
        ></polyline><path
          d="m5,13v7c0,1.105.895,2,2,2h10c1.105,0,2-.895,2-2v-7"
          fill="none"
          stroke="currentColor"
          stroke-linecap="square"
          stroke-miterlimit="10"
          stroke-width="2"
        ></path><line
          x1="12"
          y1="22"
          x2="12"
          y2="18"
          fill="none"
          stroke="currentColor"
          stroke-linecap="square"
          stroke-miterlimit="10"
          stroke-width="2"
        ></line></g
      ></svg
    >
    <span class="dock-label">Dashboard</span>
  </a>

  <a href="/api">
    <svg
      class="size-[1.2em]"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      ><g fill="currentColor" stroke-linejoin="miter" stroke-linecap="butt"
        ><polyline
          points="3 14 9 14 9 17 15 17 15 14 21 14"
          fill="none"
          stroke="currentColor"
          stroke-miterlimit="10"
          stroke-width="2"
        ></polyline><rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="2"
          ry="2"
          fill="none"
          stroke="currentColor"
          stroke-linecap="square"
          stroke-miterlimit="10"
          stroke-width="2"
        ></rect></g
      ></svg
    >
    <span class="dock-label">api</span>
  </a>

    <a href="/docs">
    <svg
      class="size-[1.2em]"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      ><g fill="currentColor" stroke-linejoin="miter" stroke-linecap="butt"
        ><polyline
          points="3 14 9 14 9 17 15 17 15 14 21 14"
          fill="none"
          stroke="currentColor"
          stroke-miterlimit="10"
          stroke-width="2"
        ></polyline><rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="2"
          ry="2"
          fill="none"
          stroke="currentColor"
          stroke-linecap="square"
          stroke-miterlimit="10"
          stroke-width="2"
        ></rect></g
      ></svg
    >
    <span class="dock-label">docs
    </span>
  </a>

  <a href="/config">
    <svg
      class="size-[1.2em]"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      ><g fill="currentColor" stroke-linejoin="miter" stroke-linecap="butt"
        ><circle
          cx="12"
          cy="12"
          r="3"
          fill="none"
          stroke="currentColor"
          stroke-linecap="square"
          stroke-miterlimit="10"
          stroke-width="2"
        ></circle><path
          d="m22,13.25v-2.5l-2.318-.966c-.167-.581-.395-1.135-.682-1.654l.954-2.318-1.768-1.768-2.318.954c-.518-.287-1.073-.515-1.654-.682l-.966-2.318h-2.5l-.966,2.318c-.581.167-1.135.395-1.654.682l-2.318-.954-1.768,1.768.954,2.318c-.287.518-.515,1.073-.682,1.654l-2.318.966v2.5l2.318.966c.167.581.395,1.135.682,1.654l-.954,2.318,1.768,1.768,2.318-.954c.518.287,1.073.515,1.654.682l.966,2.318h2.5l.966-2.318c.581-.167,1.135-.395,1.654-.682l2.318.954,1.768-1.768-.954-2.318c.287-.518.515-1.073.682-1.654l2.318-.966Z"
          fill="none"
          stroke="currentColor"
          stroke-linecap="square"
          stroke-miterlimit="10"
          stroke-width="2"
        ></path></g
      ></svg
    >
    <span class="dock-label">Settings</span>
  </a>
</div>
