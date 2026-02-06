<script>
    import { listen } from "@tauri-apps/api/event";
    import { onMount } from "svelte";

    onMount(async ()=>{
        const unlisten = await listen("external-data", (event) => {
        console.log("Received external data:", event.payload);
        // event.payload will be your JSON object { message: "...", ... }
    });
    })
</script>

<fieldset
    class="fieldset bg-base-100 border-base-300 rounded-box w-64 border p-4"
>
    <legend class="fieldset-legend">Afterburner options</legend>
    <label class="label">
        <input type="checkbox" checked="checked" class="toggle" />
        Disable No Force Protection
    </label>
</fieldset>
