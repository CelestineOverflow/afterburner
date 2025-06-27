<script lang="ts">
    import Chart from "chart.js/auto";
    import { SerialPort } from "tauri-plugin-serialplugin";
    import { onMount } from "svelte";
    let canvas: HTMLCanvasElement;
    let ctx;

    let chartValues = [20, 10, 5, 2, 20, 30, 45];
    let chartLabels = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
    ];
    onMount(async () => {


    // List available ports
    const ports = await SerialPort.available_ports();
    console.log("Available ports:", ports);
    });
    
</script>

<canvas bind:this={canvas}></canvas>

<div class="grid grid-cols-4 gap-4">
    <div>01</div>
    <!-- ... -->
    <div>09</div>
</div>
<button class="btn">Connect to Serial</button>
