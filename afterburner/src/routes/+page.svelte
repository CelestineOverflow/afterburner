<script lang="ts">
    import Chart from "chart.js/auto";
    import { SerialPort } from "tauri-plugin-serialplugin";
    import { onMount } from "svelte";

    onMount(async () => {


    // List available ports
    const ports = await SerialPort.available_ports();
    console.log("Available ports:", ports);
    });
    
</script>

<button class="btn">Connect to Serial</button>
