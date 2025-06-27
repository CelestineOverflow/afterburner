<script lang="ts">
    import Chart from "chart.js/auto";
    import { SerialPort } from "tauri-plugin-serialplugin";
    import { onMount } from "svelte";
    let available_ports: string[] = [];
    onMount(async () => {


    // List available ports
    const ports = await SerialPort.available_ports();
    console.log(ports[0].path);

    });
    
</script>

<details class="dropdown">
  <summary class="btn m-1">Connect</summary>
  <ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
    {#each available_ports as port}
        <li><a>{port}</a></li>
    {/each}
  </ul>
</details>