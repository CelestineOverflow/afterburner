<script>
  import { onMount } from 'svelte';
  import { Transport, ESPLoader } from 'esptool-js';
  import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
  
  const GITHUB_REPO = 'CelestineOverflow/afterburner_firmware';
  
  let esploader = null;
  let transport = null;
  let device = null;
  let connected = false;
  let flashing = false;
  let terminalLines = [];
  let baudRate = 921600;

  const terminal = {
    clean() {
      terminalLines = [];
    },
    writeLine(data) {
      terminalLines = [...terminalLines, data];
      scrollTerminal();
    },
    write(data) {
      if (terminalLines.length === 0) {
        terminalLines = [data];
      } else {
        terminalLines[terminalLines.length - 1] += data;
        terminalLines = [...terminalLines];
      }
      scrollTerminal();
    }
  };

  function scrollTerminal() {
    setTimeout(() => {
      const terminalEl = document.querySelector('.terminal-content');
      if (terminalEl) {
        terminalEl.scrollTop = terminalEl.scrollHeight;
      }
    }, 10);
  }

  async function oneClickFlash() {
    terminal.clean();
    terminal.writeLine('⚡ ONE-CLICK FLASH');
    terminal.writeLine('');

    try {
      flashing = true;

      // Step 1: Fetch latest release from GitHub
      terminal.writeLine('📡 Fetching latest firmware...');
      const releaseResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
      );
      
      if (!releaseResponse.ok) {
        throw new Error('Failed to fetch release info');
      }
      
      const release = await releaseResponse.json();
      const version = release.tag_name;
      terminal.writeLine(`✓ Found version: ${version}`);

      // Step 2: Download firmware directly (Tauri bypasses CORS)
      terminal.writeLine('📦 Downloading firmware...');
      const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/${version}/afterburner-firmware-full.bin`;
      
      terminal.writeLine(`URL: ${downloadUrl}`);
      
      const firmwareResponse = await tauriFetch(downloadUrl, {
        method: 'GET'
      });

      if (!firmwareResponse.ok) {
        throw new Error(`Download failed: ${firmwareResponse.status}`);
      }

      // Use blob() instead of arrayBuffer()
      const blob = await firmwareResponse.blob();
      const firmwareData = await blob.arrayBuffer();
      terminal.writeLine(`✓ Downloaded ${(firmwareData.byteLength / 1024).toFixed(1)} KB`);

      // Step 3: Connect to device
      terminal.writeLine('🔌 Please select your ESP32-C6...');
      device = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x303a },
          { usbVendorId: 0x10c4 },
          { usbVendorId: 0x1a86 },
        ]
      });
      
      terminal.writeLine('✓ Port selected');
      terminal.writeLine('📡 Connecting...');
      
      transport = new Transport(device, true);
      esploader = new ESPLoader({
        transport,
        baudrate: baudRate,
        terminal,
      });
      
      const chip = await esploader.main();
      terminal.writeLine(`✓ Connected to ${chip}`);
      connected = true;

      // Step 4: Flash firmware
      terminal.writeLine('');
      terminal.writeLine(`🔥 Flashing ${version}...`);
      
      const flashOptions = {
        fileArray: [{
          data: firmwareData,
          address: 0x0
        }],
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const percent = ((written / total) * 100).toFixed(1);
          terminal.write(`\r⏳ Progress: ${percent}%`);
        },
      };

      await esploader.writeFlash(flashOptions);
      
      terminal.writeLine('');
      terminal.writeLine('✓ Flash complete!');
      terminal.writeLine('🔄 Resetting device...');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      await esploader.hardReset();
      
      terminal.writeLine('✓ Device reset');
      terminal.writeLine('');
      terminal.writeLine(`🎉 SUCCESS! ${version} installed`);

      // Cleanup
      await transport.disconnect();
      await transport.waitForUnlock(1500);
      connected = false;
      
    } catch (error) {
      terminal.writeLine('');
      terminal.writeLine(`❌ Error: ${error.message}`);
      console.error('Flash error:', error);
      
      // Cleanup on error
      if (transport && connected) {
        try {
          await transport.disconnect();
          await transport.waitForUnlock(1500);
        } catch (e) {
          console.error('Cleanup error:', e);
        }
        connected = false;
      }
    } finally {
      flashing = false;
    }
  }

  onMount(() => {
    terminal.writeLine('⚡ AFTERBURNER ONE-CLICK FLASHER');
    terminal.writeLine('');
    
    if (!('serial' in navigator)) {
      terminal.writeLine('❌ Web Serial not supported');
      terminal.writeLine('Please use Chrome, Edge, or Opera');
    } else {
      terminal.writeLine('✓ Ready to flash');
      terminal.writeLine('');
      terminal.writeLine('Click the button to:');
      terminal.writeLine('  1. Download latest firmware from GitHub');
      terminal.writeLine('  2. Connect to your ESP32-C6');
      terminal.writeLine('  3. Flash automatically');
    }
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Oxanium:wght@600;700;800&display=swap" rel="stylesheet">
</svelte:head>

<div class="flasher-container">
  <div class="header">
    <h1>AFTERBURNER FLASHER</h1>
    <div class="status-badge" class:flashing>
      {flashing ? '⚡ FLASHING' : '○ READY'}
    </div>
  </div>

  <div class="main-content">
    <div class="flash-section">
      <button 
        class="btn-mega" 
        on:click={oneClickFlash} 
        disabled={flashing}
      >
        {flashing ? '⚡ FLASHING...' : '⚡ FLASH LATEST FIRMWARE'}
      </button>
      
      <div class="info-box">
        <p>This will automatically:</p>
        <ul>
          <li>✓ Download latest firmware from GitHub</li>
          <li>✓ Connect to ESP32-C6</li>
          <li>✓ Flash complete image (bootloader + app + partitions)</li>
        </ul>
      </div>
    </div>

    <div class="terminal-section">
      <h2>CONSOLE</h2>
      <div class="terminal-content">
        {#each terminalLines as line}
          <div class="terminal-line">{line}</div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  :root {
    --bg-primary: #0a0e14;
    --bg-secondary: #131920;
    --bg-tertiary: #1a2129;
    --accent-primary: #00ff88;
    --accent-warning: #ffaa00;
    --text-primary: #e6e9ef;
    --text-secondary: #8c929e;
    --border-color: #2a3441;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .flasher-container {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--bg-primary) 0%, #0d1117 100%);
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    padding: 2rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 2px solid var(--border-color);
  }

  h1 {
    font-family: 'Oxanium', monospace;
    font-size: 2.5rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    background: linear-gradient(135deg, var(--accent-primary) 0%, #00ccff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: glow 2s ease-in-out infinite alternate;
  }

  @keyframes glow {
    from { filter: drop-shadow(0 0 5px rgba(0, 255, 136, 0.5)); }
    to { filter: drop-shadow(0 0 20px rgba(0, 255, 136, 0.8)); }
  }

  .status-badge {
    font-family: 'Oxanium', monospace;
    font-weight: 700;
    padding: 0.75rem 1.5rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    letter-spacing: 0.1em;
  }

  .status-badge.flashing {
    border-color: var(--accent-warning);
    background: rgba(255, 170, 0, 0.1);
    color: var(--accent-warning);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .main-content {
    display: grid;
    grid-template-columns: 450px 1fr;
    gap: 2rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  @media (max-width: 1200px) {
    .main-content {
      grid-template-columns: 1fr;
    }
  }

  .flash-section {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .btn-mega {
    width: 100%;
    padding: 2rem;
    font-family: 'Oxanium', monospace;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    background: linear-gradient(135deg, var(--accent-primary) 0%, #00ccff 100%);
    border: none;
    border-radius: 16px;
    color: var(--bg-primary);
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
    box-shadow: 0 12px 32px rgba(0, 255, 136, 0.4);
  }

  .btn-mega:hover:not(:disabled) {
    transform: translateY(-4px);
    box-shadow: 0 16px 48px rgba(0, 255, 136, 0.6);
  }

  .btn-mega:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .info-box {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .info-box p {
    color: var(--text-secondary);
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .info-box ul {
    list-style: none;
    padding: 0;
  }

  .info-box li {
    padding: 0.5rem 0;
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .terminal-section {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    min-height: 500px;
  }

  h2 {
    font-family: 'Oxanium', monospace;
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--text-secondary);
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color);
  }

  .terminal-content {
    flex: 1;
    background: #000000;
    border: 2px solid var(--border-color);
    border-radius: 8px;
    padding: 1rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    overflow-y: auto;
    color: var(--accent-primary);
    text-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
  }

  .terminal-line {
    margin-bottom: 0.25rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .terminal-content::-webkit-scrollbar {
    width: 8px;
  }

  .terminal-content::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.3);
  }

  .terminal-content::-webkit-scrollbar-thumb {
    background: var(--accent-primary);
    border-radius: 4px;
  }
</style>