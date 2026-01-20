<script>
  import { onMount } from 'svelte';
  import { Transport, ESPLoader } from 'esptool-js';
  import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
  
  const GITHUB_REPO = 'CelestineOverflow/afterburner_firmware';
  let answer = $state('data');

  //https://github.com/CelestineOverflow/afterburner/releases/download/v0.1.6/latest.json

  let blob;

  async function download_latest_firmware() {
    const response = await tauriFetch(
      `https://github.com/CelestineOverflow/afterburner_firmware/releases/download/v1.0.2/afterburner-firmware.bin`,
      { method: 'GET' }
    );
    console.log(response);
    blob = new Blob([response.data], { type: 'application/octet-stream' });
    //url
  }
</script>
<p>{answer}</p>

<button onclick={download_latest_firmware}>
  Download Latest Firm ware
</button>