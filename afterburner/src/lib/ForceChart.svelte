<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import Chart from "chart.js/auto";
    import { serial } from "./Serial.svelte";
    let canvas: HTMLCanvasElement;
    let chart: Chart<"line", number[], number>;
    const MAX_POINTS = 100;
    const labels: number[] = Array(MAX_POINTS).fill(0); // init 100 slots
    const values: number[] = Array(MAX_POINTS).fill(0); // init 100 zeros
    onMount(() => {
        const ctx = canvas.getContext("2d")!;
        chart = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Force (N)",
                        data: values,
                        borderWidth: 2,
                        pointRadius: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                animation: false,
            },
        });
    });
    $effect(() => {
        const f = serial.latest_json?.force;
        if (chart && f !== undefined) {
            labels.push(Date.now()); // add new timestamp
            values.push(+f); // add new force value
            if (labels.length > MAX_POINTS) {
                labels.shift(); // keep buffer size
                values.shift();
            }
            chart.update("none"); // redraw without animation
        }
    });
    onDestroy(() => chart?.destroy());
</script>

<p><canvas bind:this={canvas}></canvas></p>
