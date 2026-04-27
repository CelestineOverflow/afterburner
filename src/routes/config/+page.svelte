<script lang="ts">
    import { onMount } from "svelte";
    import { ESPLoader, Transport } from "esptool-js";
    import { firmware_data } from "$lib/serial.svelte";
    // import { disconnect as sidecarDisconnect, serial } from "./serial.svelte";

    // ---- config ----
    const SERVER_URL = "http://localhost:3000";
    const REPO = "CelestineOverflow/afterburner_firmware";
    const MERGED_BIN_NAME = "afterburner-firmware-full.bin";
    const FLASH_BAUDRATE = 460800;
    const ROM_BAUDRATE = 115200;
    // The merged binary already has the right offsets baked in (bootloader at
    // 0x0, partition table at 0x8000, app at 0x10000), so writing it at 0x0
    // reproduces the exact flash layout the firmware expects.
    const FLASH_ADDRESS = 0x0;

    // ---- types ----
    type Asset = {
        name: string;
        browser_download_url: string;
        size: number;
    };
    type Release = {
        tag_name: string;
        name: string;
        published_at: string;
        body: string;
        html_url: string;
        prerelease: boolean;
        assets: Asset[];
    };

    // ---- state ----
    let releases = $state<Release[]>([]);
    let selectedTag = $state<string | null>(null);
    let loadingReleases = $state(false);
    let releasesError = $state<string | null>(null);

    let flashing = $state(false);
    let flashError = $state<string | null>(null);
    let flashDone = $state(false);
    let progress = $state<{ stage: string; pct: number } | null>(null);
    let log = $state<string[]>([]);

    const selectedRelease = $derived(
        releases.find((r) => r.tag_name === selectedTag) ?? null,
    );
    const mergedAsset = $derived(
        selectedRelease?.assets.find((a) => a.name === MERGED_BIN_NAME) ?? null,
    );
    const webSerialAvailable =
        typeof navigator !== "undefined" && "serial" in navigator;

    function appendLog(msg: string) {
        log = [...log, msg];
    }

    // ---- release fetching ----
    // The releases list comes straight from GitHub's API which DOES set CORS
    // headers, so this works in the browser. The redirect on the binary
    // download is what fails — that's why downloads go through the sidecar.
    async function fetchReleases() {
        loadingReleases = true;
        releasesError = null;
        try {
            const res = await fetch(
                `https://api.github.com/repos/${REPO}/releases?per_page=20`,
            );
            if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
            releases = await res.json();
            if (releases.length > 0 && !selectedTag) {
                const stable = releases.find((r) => !r.prerelease);
                selectedTag = (stable ?? releases[0]).tag_name;
            }
        } catch (e: any) {
            releasesError = e.message ?? String(e);
        } finally {
            loadingReleases = false;
        }
    }

    onMount(fetchReleases);

    // ---- helpers ----
    function fmtDate(iso: string) {
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    function fmtBytes(n: number) {
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1024 / 1024).toFixed(2)} MB`;
    }

    // esptool-js wants a "binary string" — each char is one byte (0–255).
    // Naive `String.fromCharCode(...bytes)` blows the call-stack on big files,
    // so chunk it.
    function bufferToBinaryString(buf: ArrayBuffer): string {
        const bytes = new Uint8Array(buf);
        const CHUNK = 0x8000;
        let result = "";
        for (let i = 0; i < bytes.length; i += CHUNK) {
            result += String.fromCharCode.apply(
                null,
                Array.from(bytes.subarray(i, i + CHUNK)),
            );
        }
        return result;
    }

    // The sidecar proxies GitHub release downloads so we sidestep the CORS
    // wall on the objects.githubusercontent.com redirect. Same merged-bin
    // ends up here either way.
    async function downloadFirmware(
        tag: string,
        filename: string,
    ): Promise<string> {
        const url = `${SERVER_URL}/api/firmware-download?tag=${encodeURIComponent(
            tag,
        )}&filename=${encodeURIComponent(filename)}`;
        const res = await fetch(url);
        if (!res.ok) {
            // Try to surface the sidecar's JSON error if it sent one
            try {
                const body = await res.json();
                throw new Error(body.error ?? `proxy ${res.status}`);
            } catch {
                throw new Error(`proxy ${res.status}`);
            }
        }
        return bufferToBinaryString(await res.arrayBuffer());
    }

    // ---- the flash flow ----
    async function flash() {
        if (!selectedRelease) return;
        if (!mergedAsset) {
            flashError = `release is missing ${MERGED_BIN_NAME}`;
            return;
        }
        if (!webSerialAvailable) {
            flashError =
                "Web Serial is not available in this webview. Tauri on Windows (WebView2) supports it; macOS/Linux do not.";
            return;
        }

        flashing = true;
        flashError = null;
        flashDone = false;
        log = [];
        progress = null;

        let transport: Transport | null = null;

        try {
            // 1. release the port from the sidecar so esptool can grab it
            // if (serial.connected) {
            //     appendLog("releasing serial port from sidecar…");
            //     try {
            //         await sidecarDisconnect();
            //     } catch (e) {
            //         appendLog(`(sidecar disconnect warning: ${e})`);
            //     }
            //     // give the OS a moment to actually free the COM handle
            //     await new Promise((r) => setTimeout(r, 500));
            // }

            // 2. user picks the port via the browser's port-picker
            appendLog("requesting serial port…");
            const port = await (navigator as any).serial.requestPort();

            // 3. open transport, run esptool stub, detect chip
            transport = new Transport(port, true);
            const loader = new ESPLoader({
                transport,
                baudrate: FLASH_BAUDRATE,
                romBaudrate: ROM_BAUDRATE,
                terminal: {
                    clean: () => {},
                    writeLine: (msg: string) => appendLog(msg),
                    write: () => {},
                },
            });

            progress = { stage: "connecting to chip", pct: 0 };
            const chip = await loader.main();
            appendLog(`detected chip: ${chip}`);

            // 4. fetch the firmware via the sidecar proxy
            progress = { stage: `downloading ${mergedAsset.name}`, pct: 0 };
            appendLog(
                `downloading ${mergedAsset.name} (${fmtBytes(mergedAsset.size)}) via sidecar…`,
            );
            const data = await downloadFirmware(
                selectedRelease.tag_name,
                mergedAsset.name,
            );

            // 5. write to flash. esptool-js handles erase + compress + verify.
            progress = { stage: "writing flash", pct: 0 };
            await loader.writeFlash({
                fileArray: [{ data, address: FLASH_ADDRESS }],
                flashSize: "2MB",
                flashMode: "dio",
                flashFreq: "80m",
                eraseAll: false,
                compress: true,
                reportProgress: (_fileIndex, written, total) => {
                    progress = {
                        stage: "writing flash",
                        pct: (written / total) * 100,
                    };
                },
            });

            // 6. hard-reset the chip
            progress = { stage: "resetting", pct: 100 };
            await loader.after();
            appendLog("✓ flash complete — device reset");
            flashDone = true;
        } catch (e: any) {
            flashError = e.message ?? String(e);
            appendLog(`✗ ${flashError}`);
        } finally {
            // always release the port so the sidecar can reclaim it
            try {
                await transport?.disconnect();
            } catch {}
            flashing = false;
        }
    }
</script>

<p>version: {firmware_data.version}</p>

<div class="flex flex-col gap-4 p-4">
    <!-- header + refresh -->
    <div class="flex items-center justify-between">
        <div>
            <h2 class="text-lg font-semibold text-zinc-100">Firmware</h2>
            <p class="text-xs text-zinc-500 font-mono">
                <a
                    href="https://github.com/{REPO}/releases"
                    target="_blank"
                    rel="noreferrer"
                    class="hover:text-emerald-400">github.com/{REPO}/releases</a
                >
            </p>
        </div>
        <button
            class="text-xs text-zinc-400 hover:text-emerald-400 font-mono px-3 py-1.5 border border-zinc-700 rounded hover:border-emerald-400 disabled:opacity-50"
            onclick={fetchReleases}
            disabled={loadingReleases}
        >
            {loadingReleases ? "refreshing…" : "refresh"}
        </button>
    </div>

    {#if releasesError}
        <div
            class="text-sm text-red-400 font-mono p-3 border border-red-900 bg-red-950/30 rounded"
        >
            {releasesError}
        </div>
    {/if}

    <!-- release picker -->
    <div class="rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden">
        <div class="px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
            <span class="text-xs text-zinc-400 font-mono">releases</span>
        </div>
        <div class="max-h-64 overflow-y-auto">
            {#each releases as r (r.tag_name)}
                {@const hasMerged = r.assets.some(
                    (a) => a.name === MERGED_BIN_NAME,
                )}
                <button
                    class="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-800/50 border-b border-zinc-800 last:border-b-0 {selectedTag ===
                    r.tag_name
                        ? 'bg-zinc-800/70'
                        : ''}"
                    onclick={() => (selectedTag = r.tag_name)}
                    disabled={flashing}
                >
                    <div class="flex items-center gap-3">
                        <span
                            class="text-sm font-mono {selectedTag ===
                            r.tag_name
                                ? 'text-emerald-400'
                                : 'text-zinc-200'}">{r.tag_name}</span
                        >
                        {#if r.prerelease}
                            <span
                                class="text-[10px] text-amber-400 border border-amber-700 rounded px-1.5 py-0.5 font-mono"
                                >pre</span
                            >
                        {/if}
                        {#if !hasMerged}
                            <span
                                class="text-[10px] text-red-400 border border-red-900 rounded px-1.5 py-0.5 font-mono"
                                >no merged bin</span
                            >
                        {/if}
                    </div>
                    <span class="text-xs text-zinc-500 font-mono"
                        >{fmtDate(r.published_at)}</span
                    >
                </button>
            {/each}
            {#if releases.length === 0 && !loadingReleases}
                <div class="px-3 py-4 text-sm text-zinc-500 font-mono">
                    no releases found
                </div>
            {/if}
        </div>
    </div>

    <!-- selected release detail + flash -->
    {#if selectedRelease}
        <div class="rounded-lg bg-zinc-900 border border-zinc-700 p-3">
            <div class="flex items-start justify-between mb-2">
                <div>
                    <p class="text-sm text-zinc-200 font-semibold">
                        {selectedRelease.name || selectedRelease.tag_name}
                    </p>
                    <p class="text-xs text-zinc-500 font-mono">
                        {fmtDate(selectedRelease.published_at)} · {selectedRelease
                            .assets.length} asset{selectedRelease.assets
                            .length === 1
                            ? ""
                            : "s"}
                    </p>
                </div>
                <button
                    class="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    onclick={flash}
                    disabled={flashing ||
                        !mergedAsset ||
                        !webSerialAvailable}
                >
                    {flashing ? "flashing…" : "flash device"}
                </button>
            </div>

            {#if !webSerialAvailable}
                <p
                    class="text-xs text-amber-400 font-mono mt-2 p-2 border border-amber-900 bg-amber-950/30 rounded"
                >
                    Web Serial unavailable — flashing requires a Chromium-based
                    webview (WebView2 on Windows).
                </p>
            {/if}

            {#if mergedAsset}
                <p class="text-xs text-zinc-500 font-mono mt-2">
                    will flash <span class="text-zinc-300"
                        >{mergedAsset.name}</span
                    >
                    ({fmtBytes(mergedAsset.size)}) at 0x0 — proxied through {SERVER_URL}
                </p>
            {/if}
        </div>
    {/if}

    <!-- progress + log -->
    {#if flashing || progress || log.length > 0 || flashDone || flashError}
        <div
            class="rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden"
        >
            <div
                class="px-3 py-1.5 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between"
            >
                <span class="text-xs text-zinc-400 font-mono">flash log</span>
                {#if flashDone}
                    <span class="text-xs text-emerald-400 font-mono">done</span>
                {:else if flashError}
                    <span class="text-xs text-red-400 font-mono">failed</span>
                {/if}
            </div>

            {#if progress}
                <div class="px-3 py-2 border-b border-zinc-800">
                    <div
                        class="flex items-center justify-between text-xs font-mono mb-1"
                    >
                        <span class="text-zinc-400">{progress.stage}</span>
                        <span class="text-zinc-500"
                            >{progress.pct.toFixed(0)}%</span
                        >
                    </div>
                    <div
                        class="h-1.5 bg-zinc-800 rounded-full overflow-hidden"
                    >
                        <div
                            class="h-full bg-emerald-500 transition-all duration-100"
                            style="width: {progress.pct}%"
                        ></div>
                    </div>
                </div>
            {/if}

            <pre
                class="p-3 text-xs font-mono text-zinc-400 max-h-64 overflow-auto whitespace-pre-wrap">{log.join(
                    "\n",
                ) || "—"}</pre>
        </div>
    {/if}
</div>
