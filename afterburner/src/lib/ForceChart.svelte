<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import Chart from "chart.js/auto";
    import { force } from "./Serial.svelte";
    let canvas: HTMLCanvasElement;
    let chart: Chart<"line", number[], number>;
    const MAX_POINTS = 100;
    const labels: string[] = Array(MAX_POINTS).fill("");
    const values: number[] = Array(MAX_POINTS).fill(0);
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
        if (chart && force.current !== undefined) {
            labels.push(""); // add new timestamp
            values.push(force.current); // add new force value
            if (labels.length > MAX_POINTS) {
                labels.shift(); // keep buffer size
                values.shift();
            }
            chart.update("none"); // redraw without animation
        }
    });
    onDestroy(() => chart?.destroy());
</script>


<div class="card bg-base-100 w-96 shadow-sm">
  <div class="card-body">
    <h2 class="card-title">Force</h2>
      <canvas bind:this={canvas}></canvas>
  </div>
</div>