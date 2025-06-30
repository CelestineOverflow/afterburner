<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import Chart from "chart.js/auto";
    import { setHeater, setTemperature } from "./Serial.svelte";

	/** Props — unchanged ✅ */
	const {
		currentPath,
		targetPath,
		enabled,
		index,
		label = "Channel",
		maxPoints = 100,

	}: {
		currentPath: any;
		targetPath: any;
		enabled: boolean;
		index: number;
		label?: string;
		maxPoints?: number;
	} = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart;
	const labels: (number | string)[] = Array(maxPoints).fill("");
	const curVals: number[] = Array(maxPoints).fill(NaN);
	const tgtVals: number[] = Array(maxPoints).fill(NaN);

	/* ───────────────────── UI state ───────────────────── */
	let newTarget = $state("");
	let disabled  = $state(false);

	const get = (obj: any, path: string) =>
		path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

	function sendTarget() {
		// Convert input to a number if not between 0 and 250 console.error("Invalid target temperature");
		const numeric = parseFloat(newTarget);
		if (isNaN(numeric) || numeric < 0 || numeric > 250) {
			console.error("Invalid target temperature");
			return;
		}
		setTemperature(index, numeric);
	}
	function toggleDisable() {
		setHeater(index, !disabled);
	}

	onMount(() => {
		const ctx = canvas.getContext("2d")!;
		chart = new Chart(ctx, {
			type: "line",
			data: {
				labels,
				datasets: [
					{
						label: `current`,
						data: curVals,
						borderWidth: 2,
						pointRadius: 0,
						borderColor: "rgb(56 189 248)"
					},
					{
						label: ` target`,
						data: tgtVals,
						borderWidth: 2,
						pointRadius: 0,
						borderDash: [6, 3],
						borderColor: "rgb(244 63 94)"
					}
				]
			},
			options: {
				responsive: true,
				animation: false,
				maintainAspectRatio: false,
				plugins: { legend: { labels: { color: "#fff" } } },
				scales: {
					x: { ticks: { color: "#fff" }, grid: { color: "rgba(255,255,255,0.1)" } },
					y: { ticks: { color: "#fff" }, grid: { color: "rgba(255,255,255,0.1)" } }
				}
			}
		});
		// onDestroy(() => { clearInterval(interval); chart.destroy(); });
	});

	$effect(() => {
		if (!chart) return;
		labels.push("");
		curVals.push(currentPath);
		tgtVals.push(targetPath);
		if (labels.length > maxPoints) {
			labels.shift(); curVals.shift(); tgtVals.shift();
		}
		chart.update("none");
	});

	$effect(() => {
		disabled = enabled;
	});

</script>

<!-- ───────────────────── Card UI ───────────────────── -->
<div class="card bg-base-100 w-96 shadow-sm">
	<div class="card-body gap-4">
		<h2 class="card-title">{label}</h2>

		<!-- fixed-height chart wrapper -->
		<div class="relative w-full h-48 overflow-hidden">
			<canvas bind:this={canvas} class="absolute inset-0"></canvas>
		</div>

		<!-- target input + button -->
		<label class="flex items-center gap-2">
			<input
				type="text"
				bind:value={newTarget}
				placeholder="Target °C"
				class="input input-sm input-bordered w-24"
				onkeyup={(e) => {
					if (e.key === 'Enter') {
						sendTarget();
					}
				}}
			/>
			<button
				type="button"
				class="btn btn-sm btn-primary"
				onclick={sendTarget}
				
			>
				Set&nbsp;Target
			</button>
            <button
				class="btn btn-sm"
				class:selected={!disabled && 'btn-success'}
				class:btn-error={disabled}
				onclick={toggleDisable}
			>
				{disabled ? 'Disable' : 'Enable'}
			</button>
		</label>

	</div>
</div>

<style>
	/* Prevent runaway growth if someone drops giant content inside */
	.card-body { max-height: 22rem; }
</style>
