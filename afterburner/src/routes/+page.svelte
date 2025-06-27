<script lang="ts">
  import { SerialPort } from "tauri-plugin-serialplugin";
  import { onMount } from "svelte";

  let available_ports: string[] = [];

  onMount(async () => {
    // List available ports and assign them to available_ports so they're rendered
    available_ports = Object.keys(await SerialPort.available_ports());
    console.log(available_ports);
  });

  let port: any;

  async function connect(path: string) {
    port = new SerialPort({
      path: path,
      baudRate: 115200,
    });

    try {
      await port.open();

      connected = true;
      await port.listen((data: any) => {
        console.log("Sensor reading:", data);
        port.disconnected(() => {
          console.log("Port disconnected");
          connected = false;
        });
      });
    } catch (error) {
      throw new Error(`Failed to open port: ${error}`);
    }
  }

  let connected = false;
</script>

<details class="dropdown">
  <summary class="btn m-1">Connect</summary>
  <ul
    class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    {#each available_ports as port}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_missing_attribute -->
      <li on:click={() => connect(port)}><a>{port}</a></li>
    {/each}
  </ul>
</details>

{#if connected}
  <div class="inline-grid *:[grid-area:1/1]">
    <div class="status status-success animate-ping"></div>
    <div class="status status-success"></div>
  </div>
   Device connected
{:else}
  <div class="inline-grid *:[grid-area:1/1]">
    <div class="status status-error animate-ping"></div>
    <div class="status status-error"></div>
  </div>
   Device not connected
{/if}
