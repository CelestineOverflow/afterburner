<script>
    import { override_force, pid_values, setP } from "$lib/Serial.svelte";
    import { listen } from "@tauri-apps/api/event";
    import { onMount } from "svelte";

    onMount(async ()=>{
        const unlisten = await listen("external-data", (event) => {
        console.log("Received external data:", event.payload);
        // event.payload will be your JSON object { message: "...", ... }
    });
    })
    let pFactor = $state("")
    let iFactor = $state("")
    let dFactor = $state("")
    let isActiveOverride = $state(false)
</script>

<fieldset
    class="fieldset bg-base-100 border-base-300 rounded-box w-64 border p-4"
>
    <legend class="fieldset-legend">Afterburner options</legend>
    <p>override: {isActiveOverride}</p>
    <label class="label">
        <input type="checkbox" class="toggle" bind:checked={isActiveOverride} onclick={()=>{override_force(isActiveOverride)}}/>
        Disable No Force Protection
    </label>
    <p>current P : {Number(pid_values.p).toFixed(4)} I : {Number(pid_values.i).toFixed(4)} D : {Number(pid_values.d).toFixed(4)}</p>

    <div class="flex flex-row"></div>
    <div class="flex flex-row">
        <input bind:value={pFactor} type="text" placeholder="Set PID P Factor" class="input" /> <button class="btn btn-outline">Set</button>
    </div>
    <div class="flex flex-row">
        <input bind:value={iFactor} type="text" placeholder="Set PID I Factor" class="input" /> <button class="btn btn-outline">Set</button>
    </div>
    <div class="flex flex-row">
        <input bind:value={dFactor} type="text" placeholder="Set PID D Factor" class="input" /> <button class="btn btn-outline">Set</button>
    </div>
</fieldset>
