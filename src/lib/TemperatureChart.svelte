<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import Chart from "chart.js/auto";
	import { temperature_data } from "./Serial.svelte";

	let canvas: HTMLCanvasElement;
	let chart: Chart;
	
	const maxPoints = 1000; // Maximum number of points to display
	let labels: string[] = [];
	let curVals: number[] = [];
	let tgtVals: number[] = [];

	onMount(() => {
		const ctx = canvas.getContext("2d")!;
		chart = new Chart(ctx, {
			type: "line",
			data: {
				labels,
				datasets: [
					{
						label: "current",
						data: curVals,
						borderWidth: 2,
						pointRadius: 0,
						borderColor: "rgb(56 189 248)",
						backgroundColor: "rgba(56, 189, 248, 0.1)",
						fill: false
					}
				]
			},
			options: {
				responsive: true,
				animation: false,
				maintainAspectRatio: false,
				plugins: { 
					legend: { 
						labels: { color: "#fff" } 
					}
				},
				scales: {
					x: { 
						ticks: { color: "#fff" }, 
						grid: { color: "rgba(255,255,255,0.1)" } 
					},
					y: { 
						ticks: { color: "#fff" }, 
						grid: { color: "rgba(255,255,255,0.1)" },
						beginAtZero: false
					}
				}
			}
		});
	});

	// Continuously update chart when temperature_data_array changes
	$effect(() => {
		if (!chart ) return;

		// Get the latest data point from the array
		
		if (temperature_data) {
			// Add timestamp or index as label
			const timestamp = new Date().toLocaleTimeString();
			labels.push(timestamp);
			curVals.push(temperature_data.temperature);

            // Keep only the latest maxPoints points
            if (labels.length > maxPoints) {
                labels.shift();
                curVals.shift();
            }
            chart.update();

        }
    });

</script>

<div class="relative w-48 h-48 overflow-hidden bg-transparent">
	<canvas bind:this={canvas} class="absolute inset-0"></canvas>
</div>