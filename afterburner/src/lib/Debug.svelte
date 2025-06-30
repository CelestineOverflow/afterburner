<script>
    import { sendCommand, serial } from "./Serial.svelte";
    let text_output = "";
</script>

<div class="card bg-base-100 shadow-sm">
    <div class="card-body">
        {#if serial.latest}
            <p
                class="px-2 py-1 text-xs font-mono break-all text-base-content/80"
            >
                {serial.latest}
            </p>
        {/if}
        <h2
            class="card-title
"
        >
            Text Output
        </h2>
        <textarea
            class="textarea textarea-bordered w-full h-24"
            bind:value={text_output}
            placeholder="Type your command here..."
        ></textarea>
        <button
            class="btn btn-primary mt-2"
            on:click={() => {
                if (text_output.trim()) {
                    sendCommand(text_output.trim());
                    text_output = ""; // clear the input after sending
                }
            }}
        >
            Send Command
        </button>
    </div>
</div>
