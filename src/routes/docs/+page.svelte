<script>
    import { listen } from "@tauri-apps/api/event";
    import { onMount } from "svelte";
    import Prism from "prismjs";
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
    let language = "javascript";

    let data_recevied = $state("");
    onMount(async () => {
        const unlisten = await listen("external-data", (event) => {
            console.log("Received external data:", event.payload);
            data_recevied = JSON.stringify(event.payload);
        });
    });
</script>

<p>http latest data: {data_recevied}</p>

<div class="code">
    {@html Prism.highlight(code, Prism.languages[language], "python")}
</div>

<style>
    .code {
        white-space: pre-wrap;
    }
</style>
