<script>
    import { listen } from "@tauri-apps/api/event";
    import { onMount } from "svelte";

    let data_recevied = $state("");
    onMount(async ()=>{
        const unlisten = await listen("external-data", (event) => {
        console.log("Received external data:", event.payload);
        data_recevied = JSON.stringify(event.payload);
    });
    })
</script>

<p>http latest data: {data_recevied}</p>


