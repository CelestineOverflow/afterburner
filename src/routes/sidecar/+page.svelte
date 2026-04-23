<script>
  import { onMount, onDestroy } from 'svelte';
  import { io } from 'socket.io-client';

  let socket;
  let serialState = $state({ connected: false, path: null, baudRate: null });
  let portList = $state([]);
  let subscribed = $state(false);
  let lines = $state([]);
  let baudRate = $state(115200);
  let streamEl;

  onMount(() => {
    socket = io('http://localhost:3000');

    socket.on('serial-state', (s) => {
      serialState = s;
      if (s.connected) {
        subscribed = false;
        portList = [];
      }
    });

    socket.on('port-list', (ports) => portList = ports);

    socket.on('serial-line', (line) => {
      lines = [...lines.slice(-199), line];
    });
  });

  onDestroy(() => socket?.disconnect());

  // auto-scroll stream on new lines
  $effect(() => {
    lines;
    if (streamEl) streamEl.scrollTop = streamEl.scrollHeight;
  });

  function toggleSubscribe() {
    if (subscribed) {
      socket.emit('unsubscribe-list-port');
      subscribed = false;
      portList = [];
    } else {
      socket.emit('subscribe-list-port');
      subscribed = true;
    }
  }

  function connect(path) {
    socket.emit('connect-serial', { path, baudRate });
  }

  function disconnect() {
    socket.emit('disconnect-serial');
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-200 font-mono text-sm">
  <div class="max-w-3xl mx-auto px-6 py-10 space-y-6">

    <header class="flex items-baseline justify-between border-b border-zinc-800 pb-4">
      <h1 class="text-zinc-100 tracking-tight">serial bridge</h1>
      <div class="flex items-center gap-2 text-xs">
        <span class="h-1.5 w-1.5 rounded-full {serialState.connected ? 'bg-emerald-400' : 'bg-zinc-600'}"></span>
        <span class="text-zinc-400">
          {serialState.connected ? `${serialState.path} @ ${serialState.baudRate}` : 'disconnected'}
        </span>
      </div>
    </header>

    {#if serialState.error}
      <div class="border border-red-900/60 bg-red-950/30 text-red-300 px-3 py-2 text-xs">
        {serialState.error}
      </div>
    {/if}

    {#if !serialState.connected}
      <section class="space-y-3">
        <div class="flex items-center gap-3 text-xs">
          <label class="flex items-center gap-2 text-zinc-500">
            baud
            <input
              type="number"
              bind:value={baudRate}
              class="w-24 bg-zinc-900 border border-zinc-800 px-2 py-1 text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </label>
          <button
            onclick={toggleSubscribe}
            class="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:text-zinc-100 text-zinc-300 transition-colors"
          >
            {subscribed ? 'stop scanning' : 'scan ports'}
          </button>
          {#if subscribed}
            <span class="text-zinc-600">scanning…</span>
          {/if}
        </div>

        {#if portList.length > 0}
          <ul class="border border-zinc-800 divide-y divide-zinc-800">
            {#each portList as p}
              <li class="flex items-center justify-between px-3 py-2 hover:bg-zinc-900/60">
                <div class="min-w-0">
                  <div class="text-zinc-200 truncate">{p.path}</div>
                  {#if p.manufacturer}
                    <div class="text-xs text-zinc-500 truncate">{p.manufacturer}</div>
                  {/if}
                </div>
                <button
                  onclick={() => connect(p.path)}
                  class="ml-4 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition-colors"
                >
                  connect
                </button>
              </li>
            {/each}
          </ul>
        {:else if subscribed}
          <div class="text-xs text-zinc-600 px-1">no ports found yet</div>
        {/if}
      </section>
    {:else}
      <section>
        <button
          onclick={disconnect}
          class="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:border-red-900/80 hover:text-red-300 text-xs text-zinc-300 transition-colors"
        >
          disconnect
        </button>
      </section>
    {/if}

    <section class="space-y-2">
      <div class="flex items-center justify-between text-xs text-zinc-500">
        <span>stream</span>
        <span>{lines.length} lines</span>
      </div>
      <pre
        bind:this={streamEl}
        class="bg-black border border-zinc-800 p-3 text-xs text-zinc-300 overflow-auto max-h-96 whitespace-pre-wrap"
      >{lines.map(l => JSON.stringify(l)).join('\n') || '—'}</pre>
    </section>

  </div>
</div>