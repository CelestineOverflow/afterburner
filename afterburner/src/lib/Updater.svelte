<script lang="ts">
	/* — Tauri APIs (unchanged) — */
	import { check } from '@tauri-apps/plugin-updater';           // updater docs :contentReference[oaicite:0]{index=0}
	import { relaunch } from '@tauri-apps/plugin-process';
	import { onMount } from 'svelte';                            // lifecycle hook :contentReference[oaicite:1]{index=1}

	/* — runes-based reactivity — */
	let modal_text    = $state('');                              // $state docs :contentReference[oaicite:2]{index=2}
	let downloaded    = $state(0);
	let contentLength = $state(0);

	let progressPct = $derived(() =>                             // $derived docs :contentReference[oaicite:3]{index=3}
		contentLength ? Math.round((downloaded / contentLength) * 100) : 0
	);

	let modaltoggle: HTMLDialogElement;

	/** simple async sleep helper */
	const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));  // async-await delay pattern :contentReference[oaicite:4]{index=4}

	onMount(async () => {
		const update = await check();           // ask updater; may be null
		if (!update) return;

		modaltoggle.showModal();                // open <dialog> :contentReference[oaicite:5]{index=5}
		modal_text =
			`Found update ${update.version} from ${update.date} with notes: ${update.body}`;

		/* 💤 give users 5 seconds to read before download starts */
		await sleep(5_000);

		await update.downloadAndInstall(ev => { /* progress callback */  // Tauri issue & example :contentReference[oaicite:6]{index=6}
			switch (ev.event) {
				case 'Started':
					contentLength = ev.data.contentLength ?? 0;
					break;
				case 'Progress':
					downloaded += ev.data.chunkLength;
					break;
				case 'Finished':
					downloaded = contentLength;
					break;
			}
		});

		await relaunch();                       // restart app when done
	});
</script>

<!-- ---- Dialog markup (unchanged except for derived % bar) ---- -->
<dialog bind:this={modaltoggle} class="modal">
	<div class="modal-box space-y-4">
		<h3 class="text-lg font-bold">Update available</h3>

		<p>{modal_text}</p>

		{#if contentLength}
			<div class="w-full bg-base-300 rounded">
				<div
					class="h-4 bg-primary rounded transition-all duration-150"
					style="width: {progressPct}%"
					aria-valuenow={progressPct}
					aria-valuemin="0"
					aria-valuemax="100"
				/>
			</div>
			<p class="text-sm mt-1 text-right">{progressPct}%</p>
		{/if}
	</div>

	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
