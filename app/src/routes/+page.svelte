<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  let name = $state("");
  let greetMsg = $state("");

  async function greet(event: Event) {
    event.preventDefault();
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsg = await invoke("greet", { name });
  }

  let availible_port = $state("none");
  async function getAvailiblePorts(){
    console.log("presses");
    availible_port = await invoke("check_ports_available");
  }
</script>

<p>{availible_port}</p>
<button onclick={()=> getAvailiblePorts()}>sss</button>