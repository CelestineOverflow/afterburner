<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import Chart from "chart.js/auto";
	import { updateTemps /* setTargetTemp, disableChannel */ } from "./Serial.svelte";

	/** Props — unchanged ✅ */
	const {
		currentPath,
		targetPath,
		label = "Channel",
		maxPoints = 120,
		source
	}: {
		currentPath: string;
		targetPath: string;
		label?: string;
		maxPoints?: number;
		source: any;
	} = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart;
	const labels: (number | string)[] = Array(maxPoints).fill("");
	const curVals: number[] = Array(maxPoints).fill(NaN);
	const tgtVals: number[] = Array(maxPoints).fill(NaN);

	/* ───────────────────── UI state ───────────────────── */
	let newTarget = "";
	let disabled  = false;

	const get = (obj: any, path: string) =>
		path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

	function sendTarget() {
		const v = +newTarget;
		if (!Number.isFinite(v)) return;
		// setTargetTemp?.(v);
		newTarget = "";
	}
	function toggleDisable() {
		disabled = !disabled;
		// disableChannel?.(disabled);
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

		const interval = setInterval(updateTemps, 750);
		onDestroy(() => { clearInterval(interval); chart.destroy(); });
	});

	$effect(() => {
		if (!chart) return;
		const cur = +get(source, currentPath);
		const tgt = +get(source, targetPath);
		if (Number.isFinite(cur) && Number.isFinite(tgt)) {
			labels.push("");
			curVals.push(cur);
			tgtVals.push(tgt);
			if (labels.length > maxPoints) {
				labels.shift(); curVals.shift(); tgtVals.shift();
			}
			chart.update("none");
		}
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
				type="number"
				bind:value={newTarget}
				placeholder="Target °C"
				class="input input-sm input-bordered w-24"
			/>
			<button class="btn btn-sm btn-primary" on:click={sendTarget}>
				Set&nbsp;Target
			</button>
            <button
				class="btn btn-sm"
				class:selected={!disabled && 'btn-success'}
				class:btn-error={disabled}
				on:click={toggleDisable}
			>
				{disabled ? 'Enable' : 'Disable'}
			</button>
		</label>

	</div>
</div>

<style>
	/* Prevent runaway growth if someone drops giant content inside */
	.card-body { max-height: 22rem; }
</style>
