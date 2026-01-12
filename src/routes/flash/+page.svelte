<script>
  import { onMount } from 'svelte';

  // Component state
  let esploader = null;
  let transport = null;
  let device = null;
  let chip = null;
  let connected = false;
  let flashing = false;
  let terminalLines = [];
  let firmwareFile = null;
  let bootloaderFile = null;
  let partitionsFile = null;
  let flashOffset = '0x10000';
  let bootloaderOffset = '0x1000';
  let partitionsOffset = '0x8000';
  let baudRate = 921600;
  let includeBootloader = false;
  let includePartitions = false;

  // Terminal implementation for esptool-js
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

  async function connectDevice() {
    try {
      terminal.writeLine('🔌 Requesting serial port...');
      
      // Request port from user
      device = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x303a }, // ESP32-C3/S3/C6 etc
          { usbVendorId: 0x10c4 }, // CP210x
          { usbVendorId: 0x1a86 }, // CH340
        ]
      });

      terminal.writeLine('✓ Port selected');
      terminal.writeLine('📡 Connecting to device...');

      // Import ESPLoader dynamically
      const ESPLoader = (await import('https://unpkg.com/esptool-js@0.4.0/bundle.js')).default;
      
      transport = new ESPLoader.Transport(device, true);
      esploader = new ESPLoader.ESPLoader({
        transport,
        baudrate: baudRate,
        terminal,
      });

      chip = await esploader.main();
      
      terminal.writeLine(`✓ Connected to ${chip}`);
      connected = true;
    } catch (error) {
      terminal.writeLine(`❌ Error: ${error.message}`);
      console.error(error);
    }
  }

  async function disconnectDevice() {
    try {
      if (transport) {
        await transport.disconnect();
        await transport.waitForUnlock(1500);
      }
      connected = false;
      esploader = null;
      transport = null;
      device = null;
      chip = null;
      terminal.writeLine('🔌 Disconnected');
    } catch (error) {
      terminal.writeLine(`❌ Disconnect error: ${error.message}`);
    }
  }

  async function flashFirmware() {
    if (!connected || !esploader) {
      terminal.writeLine('❌ Not connected to device');
      return;
    }

    if (!firmwareFile && !bootloaderFile && !partitionsFile) {
      terminal.writeLine('❌ Please select at least one file to flash');
      return;
    }

    try {
      flashing = true;
      terminal.writeLine('');
      terminal.writeLine('🔥 Starting flash process...');

      // Prepare file array
      const fileArray = [];
      
      if (includeBootloader && bootloaderFile) {
        const bootloaderData = await readFileAsArrayBuffer(bootloaderFile);
        fileArray.push({
          data: bootloaderData,
          address: parseInt(bootloaderOffset, 16)
        });
        terminal.writeLine(`📦 Bootloader: ${bootloaderFile.name} @ ${bootloaderOffset}`);
      }

      if (includePartitions && partitionsFile) {
        const partitionsData = await readFileAsArrayBuffer(partitionsFile);
        fileArray.push({
          data: partitionsData,
          address: parseInt(partitionsOffset, 16)
        });
        terminal.writeLine(`📦 Partitions: ${partitionsFile.name} @ ${partitionsOffset}`);
      }

      if (firmwareFile) {
        const firmwareData = await readFileAsArrayBuffer(firmwareFile);
        fileArray.push({
          data: firmwareData,
          address: parseInt(flashOffset, 16)
        });
        terminal.writeLine(`📦 Firmware: ${firmwareFile.name} @ ${flashOffset}`);
      }

      // Flash the files
      const flashOptions = {
        fileArray: fileArray,
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const percent = ((written / total) * 100).toFixed(1);
          terminal.write(`\r⏳ Flashing file ${fileIndex + 1}/${fileArray.length}: ${percent}%`);
        },
      };

      await esploader.writeFlash(flashOptions);
      
      terminal.writeLine('');
      terminal.writeLine('✓ Flash complete!');
      terminal.writeLine('🔄 Resetting device...');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      await esploader.hardReset();
      
      terminal.writeLine('✓ Device reset');
      terminal.writeLine('🎉 All done!');
      
    } catch (error) {
      terminal.writeLine('');
      terminal.writeLine(`❌ Flash error: ${error.message}`);
      console.error(error);
    } finally {
      flashing = false;
    }
  }

  async function eraseFlash() {
    if (!connected || !esploader) {
      terminal.writeLine('❌ Not connected to device');
      return;
    }

    if (!confirm('This will erase the entire flash memory. Continue?')) {
      return;
    }

    try {
      flashing = true;
      terminal.writeLine('');
      terminal.writeLine('🗑️  Erasing flash memory...');
      await esploader.eraseFlash();
      terminal.writeLine('✓ Flash erased');
    } catch (error) {
      terminal.writeLine(`❌ Erase error: ${error.message}`);
    } finally {
      flashing = false;
    }
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function handleFileInput(event, type) {
    const file = event.target.files[0];
    if (file) {
      switch(type) {
        case 'firmware':
          firmwareFile = file;
          break;
        case 'bootloader':
          bootloaderFile = file;
          break;
        case 'partitions':
          partitionsFile = file;
          break;
      }
    }
  }

  onMount(() => {
    terminal.writeLine('ESP32 Flasher initialized');
    terminal.writeLine('Ready to connect...');
    
    // Check if Web Serial is supported
    if (!('serial' in navigator)) {
      terminal.writeLine('');
      terminal.writeLine('❌ Web Serial API not supported in this browser');
      terminal.writeLine('Please use Chrome, Edge, or Opera');
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
    <h1>ESP32 FLASHER</h1>
    <div class="status-badge" class:connected class:flashing>
      {flashing ? '⚡ FLASHING' : connected ? '● CONNECTED' : '○ READY'}
    </div>
  </div>

  <div class="main-grid">
    <!-- Control Panel -->
    <div class="panel control-panel">
      <h2>CONNECTION</h2>
      
      <div class="control-group">
        <label for="baudrate">Baud Rate</label>
        <select id="baudrate" bind:value={baudRate} disabled={connected}>
          <option value={115200}>115200</option>
          <option value={460800}>460800</option>
          <option value={921600}>921600</option>
        </select>
      </div>

      <button 
        class="btn btn-primary" 
        on:click={connectDevice} 
        disabled={connected || flashing}
      >
        CONNECT DEVICE
      </button>

      <button 
        class="btn btn-secondary" 
        on:click={disconnectDevice} 
        disabled={!connected || flashing}
      >
        DISCONNECT
      </button>

      <div class="divider"></div>

      <h2>FIRMWARE FILES</h2>

      <div class="file-group">
        <label class="file-label">
          <input 
            type="checkbox" 
            bind:checked={includeBootloader}
            disabled={flashing}
          >
          Bootloader
        </label>
        <input 
          type="file" 
          accept=".bin" 
          on:change={(e) => handleFileInput(e, 'bootloader')}
          disabled={!includeBootloader || flashing}
        >
        <input 
          type="text" 
          bind:value={bootloaderOffset} 
          placeholder="0x1000"
          disabled={!includeBootloader || flashing}
          class="offset-input"
        >
        {#if bootloaderFile}
          <div class="file-info">📄 {bootloaderFile.name}</div>
        {/if}
      </div>

      <div class="file-group">
        <label class="file-label">
          <input 
            type="checkbox" 
            bind:checked={includePartitions}
            disabled={flashing}
          >
          Partition Table
        </label>
        <input 
          type="file" 
          accept=".bin" 
          on:change={(e) => handleFileInput(e, 'partitions')}
          disabled={!includePartitions || flashing}
        >
        <input 
          type="text" 
          bind:value={partitionsOffset} 
          placeholder="0x8000"
          disabled={!includePartitions || flashing}
          class="offset-input"
        >
        {#if partitionsFile}
          <div class="file-info">📄 {partitionsFile.name}</div>
        {/if}
      </div>

      <div class="file-group">
        <label class="file-label mandatory">
          Application Firmware *
        </label>
        <input 
          type="file" 
          accept=".bin" 
          on:change={(e) => handleFileInput(e, 'firmware')}
          disabled={flashing}
        >
        <input 
          type="text" 
          bind:value={flashOffset} 
          placeholder="0x10000"
          disabled={flashing}
          class="offset-input"
        >
        {#if firmwareFile}
          <div class="file-info">📄 {firmwareFile.name}</div>
        {/if}
      </div>

      <div class="divider"></div>

      <button 
        class="btn btn-flash" 
        on:click={flashFirmware} 
        disabled={!connected || flashing}
      >
        {flashing ? '⚡ FLASHING...' : '🔥 FLASH FIRMWARE'}
      </button>

      <button 
        class="btn btn-danger" 
        on:click={eraseFlash} 
        disabled={!connected || flashing}
      >
        🗑️ ERASE FLASH
      </button>
    </div>

    <!-- Terminal -->
    <div class="panel terminal-panel">
      <h2>CONSOLE OUTPUT</h2>
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
    --accent-danger: #ff3366;
    --accent-warning: #ffaa00;
    --text-primary: #e6e9ef;
    --text-secondary: #8c929e;
    --border-color: #2a3441;
    --shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
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
    animation: fadeIn 0.6s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
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
    text-shadow: 0 0 30px rgba(0, 255, 136, 0.3);
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
    transition: all 0.3s ease;
  }

  .status-badge.connected {
    border-color: var(--accent-primary);
    background: rgba(0, 255, 136, 0.1);
    color: var(--accent-primary);
    box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
  }

  .status-badge.flashing {
    border-color: var(--accent-warning);
    background: rgba(255, 170, 0, 0.1);
    color: var(--accent-warning);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(1.05); }
  }

  .main-grid {
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: 2rem;
    height: calc(100vh - 180px);
  }

  @media (max-width: 1200px) {
    .main-grid {
      grid-template-columns: 1fr;
      height: auto;
    }
  }

  .panel {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: var(--shadow);
    overflow: auto;
    animation: slideIn 0.6s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
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

  .control-group {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  select, input[type="text"] {
    width: 100%;
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.875rem;
    transition: all 0.3s ease;
  }

  select:hover:not(:disabled), 
  input[type="text"]:hover:not(:disabled) {
    border-color: var(--accent-primary);
  }

  select:focus, input[type="text"]:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(0, 255, 136, 0.1);
  }

  .btn {
    width: 100%;
    padding: 0.875rem;
    margin-top: 0.75rem;
    font-family: 'Oxanium', monospace;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    border: 2px solid;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
  }

  .btn-primary {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: var(--bg-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background: #00dd77;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 255, 136, 0.4);
  }

  .btn-secondary {
    background: transparent;
    border-color: var(--border-color);
    color: var(--text-secondary);
  }

  .btn-secondary:hover:not(:disabled) {
    border-color: var(--text-primary);
    color: var(--text-primary);
  }

  .btn-flash {
    background: linear-gradient(135deg, #ff6b00 0%, #ff3366 100%);
    border-color: #ff6b00;
    color: white;
    margin-top: 1rem;
  }

  .btn-flash:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(255, 107, 0, 0.4);
  }

  .btn-danger {
    background: transparent;
    border-color: var(--accent-danger);
    color: var(--accent-danger);
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--accent-danger);
    color: white;
  }

  .btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .divider {
    height: 1px;
    background: var(--border-color);
    margin: 1.5rem 0;
  }

  .file-group {
    margin-bottom: 1.5rem;
  }

  .file-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .file-label.mandatory::after {
    content: " *";
    color: var(--accent-danger);
  }

  input[type="checkbox"] {
    width: 1.2rem;
    height: 1.2rem;
    cursor: pointer;
  }

  input[type="file"] {
    width: 100%;
    padding: 0.5rem;
    margin-top: 0.5rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    cursor: pointer;
  }

  input[type="file"]:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .offset-input {
    margin-top: 0.5rem;
    font-size: 0.875rem;
  }

  .file-info {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(0, 255, 136, 0.1);
    border: 1px solid rgba(0, 255, 136, 0.3);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--accent-primary);
  }

  .terminal-panel {
    display: flex;
    flex-direction: column;
    min-height: 400px;
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

  /* Scrollbar styling */
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

  .terminal-content::-webkit-scrollbar-thumb:hover {
    background: #00dd77;
  }
</style>