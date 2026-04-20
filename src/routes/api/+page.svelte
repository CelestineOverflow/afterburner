<script>
   import { listen } from "@tauri-apps/api/event";
   import { onMount } from "svelte";
   import Prism from "prismjs";
   import "prismjs/components/prism-python";
   let code = `import requests
api_link = "http://localhost:8080/send"
def set_temperature(target):
   response = requests.post(api_link, json={"type":"set_target_temperature","value":target})
   print(response.status_code)
   print(response.json())
def enable_heater(isActive):
   response = requests.post(api_link, json=({ "type": "enable_heater", "value": isActive }))
   print(response.status_code)
   print(response.json())
def set_loadcell_zero():
   response = requests.post(api_link, json=({ "type": "set_loadcell_zero"}))
   print(response.status_code)
   print(response.json())
def set_loadcell_multiplier(multiplier):
   response = requests.post(api_link, json=({ "type": "set_loadcell_multiplier", "value": multiplier }))
   print(response.status_code)
   print(response.json())
set_temperature(70)`;
   let data_received = $state("");
   onMount(async () => {
       const unlisten = await listen("external-data", (event) => {
           console.log("Received external data:", event.payload);
           data_received = JSON.stringify(event.payload, null, 2);
       });
   });
</script>
<div class="flex flex-col gap-4 p-4">
<div class="rounded-lg bg-zinc-900 border border-zinc-700 p-3">
<p class="text-xs text-zinc-500 mb-1 font-mono">http latest data</p>
<pre class="text-sm text-emerald-400 font-mono whitespace-pre-wrap break-all">{data_received || "waiting…"}</pre>
</div>
<div class="rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden">
<div class="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
<span class="text-xs text-zinc-400 font-mono">example.py</span>
</div>
<pre class="p-4 text-sm font-mono overflow-x-auto"><code class="language-python">{@html Prism.highlight(code, Prism.languages.python, "python")}</code></pre>
</div>
</div>
<style>
   /* Minimal dark Prism overrides */
   :global(.token.keyword) { color: #c792ea; }
   :global(.token.function) { color: #82aaff; }
   :global(.token.string) { color: #c3e88d; }
   :global(.token.number) { color: #f78c6c; }
   :global(.token.builtin) { color: #ffcb6b; }
   :global(.token.punctuation) { color: #89ddff; }
   :global(.token.operator) { color: #89ddff; }
   :global(.token.comment) { color: #546e7a; font-style: italic; }
   pre { color: #d4d4d8; margin: 0; }
</style>