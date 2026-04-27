<script lang="ts">
    import { listen } from "@tauri-apps/api/event";
    import { onMount } from "svelte";
    import Prism from "prismjs";
    import "prismjs/components/prism-python";

    const SERVER_URL = "http://localhost:3000";

    let activeTab = $state<"python" | "docs" | "data">("python");
    let data_received = $state("");
    let pythonCode = $state("# fetching /openapi.json …");

    // ---- OpenAPI → Python generator ----
    // Walks the spec at runtime and emits a small client. Whenever you add
    // a command on the server, restart the sidecar and this regenerates.

    const PY_TYPES: Record<string, string> = {
        number: "float",
        integer: "int",
        boolean: "bool",
        string: "str",
    };

    function resolveRef(spec: any, schema: any): any {
        if (schema?.$ref) {
            const name = schema.$ref.split("/").pop();
            return spec.components?.schemas?.[name] ?? schema;
        }
        return schema;
    }

    function pyType(spec: any, s: any): string {
        return PY_TYPES[resolveRef(spec, s)?.type] ?? "any";
    }

    function camelToSnake(s: string): string {
        return s.replace(/([A-Z])/g, (_, c) => "_" + c.toLowerCase());
    }

    function pathToName(path: string): string {
        return path
            .replace(/^\/api\//, "")
            .replace(/[/-]/g, "_")
            .toLowerCase();
    }

    function generatePythonClient(spec: any): string {
        if (!spec?.paths) return "# no spec available";

        const base = spec.servers?.[0]?.url ?? SERVER_URL;
        const out: string[] = [
            `# Auto-generated from ${base}/openapi.json`,
            `# Regenerated every time this view loads — single source of truth is the server.`,
            "",
            "import requests",
            "",
            `BASE = "${base}"`,
            "",
        ];

        for (const [path, item] of Object.entries<any>(spec.paths)) {
            for (const [method, op] of Object.entries<any>(item)) {
                const name = pathToName(path);
                const summary: string | undefined = op.summary;

                if (method === "get") {
                    out.push(`def get_${name}():`);
                    if (summary) out.push(`    """${summary}"""`);
                    out.push(`    r = requests.get(f"{BASE}${path}")`);
                    out.push(`    r.raise_for_status()`);
                    out.push(`    return r.json()`);
                    out.push("");
                    continue;
                }

                if (method !== "post") continue;

                const bodySchema = resolveRef(
                    spec,
                    op.requestBody?.content?.["application/json"]?.schema
                );

                if (!bodySchema) {
                    // no payload — e.g. /loadcell/zero, /disconnect
                    out.push(`def ${name}():`);
                    if (summary) out.push(`    """${summary}"""`);
                    out.push(`    r = requests.post(f"{BASE}${path}")`);
                    out.push(`    r.raise_for_status()`);
                    out.push(`    return r.json()`);
                    out.push("");
                } else if (
                    bodySchema.properties?.value &&
                    Object.keys(bodySchema.properties).length === 1
                ) {
                    // {value: X} pattern — most commands fall here
                    const t = pyType(spec, bodySchema.properties.value);
                    out.push(`def set_${name}(value: ${t}):`);
                    if (summary) out.push(`    """${summary}"""`);
                    out.push(
                        `    r = requests.post(f"{BASE}${path}", json={"value": value})`
                    );
                    out.push(`    r.raise_for_status()`);
                    out.push(`    return r.json()`);
                    out.push("");
                } else if (bodySchema.properties) {
                    // structured body — e.g. /connect with {path, baudRate}
                    const required: string[] = bodySchema.required ?? [];
                    const props = Object.entries<any>(bodySchema.properties);

                    const params = props.map(([k, v]) => {
                        const t = pyType(spec, v);
                        const pyK = camelToSnake(k);
                        const resolved = resolveRef(spec, v);
                        if (required.includes(k)) return `${pyK}: ${t}`;
                        const dflt =
                            resolved.example !== undefined
                                ? JSON.stringify(resolved.example)
                                : "None";
                        return `${pyK}: ${t} = ${dflt}`;
                    });

                    const jsonBody =
                        "{" +
                        props
                            .map(([k]) => `"${k}": ${camelToSnake(k)}`)
                            .join(", ") +
                        "}";

                    out.push(`def ${name}(${params.join(", ")}):`);
                    if (summary) out.push(`    """${summary}"""`);
                    out.push(
                        `    r = requests.post(f"{BASE}${path}", json=${jsonBody})`
                    );
                    out.push(`    r.raise_for_status()`);
                    out.push(`    return r.json()`);
                    out.push("");
                }
            }
        }

        out.push("");
        out.push("# example");
        out.push('if __name__ == "__main__":');
        //out.push('    connect(path="/dev/ttyACM0")');
        out.push("    set_target_temperature(100)");
        out.push("    set_heater(True)");
        out.push("    print(get_temperature())");

        return out.join("\n");
    }

    function copyCode() {
        navigator.clipboard.writeText(pythonCode);
    }

    onMount(async () => {
        const unlisten = await listen("external-data", (event) => {
            console.log("Received external data:", event.payload);
            data_received = JSON.stringify(event.payload, null, 2);
        });

        try {
            const res = await fetch(`${SERVER_URL}/openapi.json`);
            const spec = await res.json();
            pythonCode = generatePythonClient(spec);
        } catch (e) {
            pythonCode = `# failed to fetch /openapi.json: ${e}\n# is the sidecar server running on ${SERVER_URL}?`;
        }

        return () => unlisten();
    });

    const tabs = [
        { id: "python", label: "Python client" },
        { id: "docs", label: "API docs" },
        { id: "data", label: "Latest event" },
    ] as const;
</script>

<div class="flex flex-col gap-4 p-4">
    <div class="flex gap-1 border-b border-zinc-700">
        {#each tabs as t}
            <button
                class="px-4 py-2 text-sm font-mono transition-colors {activeTab ===
                t.id
                    ? 'text-emerald-400 border-b-2 border-emerald-400 -mb-px'
                    : 'text-zinc-400 hover:text-zinc-200'}"
                onclick={() => (activeTab = t.id)}
            >
                {t.label}
            </button>
        {/each}
    </div>

    {#if activeTab === "python"}
        <div
            class="rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden"
        >
            <div
                class="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700"
            >
                <span class="text-xs text-zinc-400 font-mono"
                    >client.py — generated from /openapi.json</span
                >
                <button
                    class="text-xs text-zinc-400 hover:text-emerald-400 font-mono"
                    onclick={copyCode}
                >
                    copy
                </button>
            </div>
            <pre
                class="p-4 text-sm font-mono overflow-auto max-h-[70vh]"><code
                    class="language-python">{@html Prism.highlight(
                        pythonCode,
                        Prism.languages.python,
                        "python"
                    )}</code></pre>
        </div>
    {:else if activeTab === "docs"}
        <div
            class="rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden"
        >
            <div
                class="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700"
            >
                <span class="text-xs text-zinc-400 font-mono"
                    >{SERVER_URL}/docs</span
                >
                <a
                    href="{SERVER_URL}/docs"
                    target="_blank"
                    rel="noreferrer"
                    class="text-xs text-zinc-400 hover:text-emerald-400 font-mono"
                >
                    open in browser ↗
                </a>
            </div>
            <iframe
                src="{SERVER_URL}/docs"
                title="API documentation"
                class="w-full h-[70vh] bg-white"
            ></iframe>
        </div>
    {:else if activeTab === "data"}
        <div class="rounded-lg bg-zinc-900 border border-zinc-700 p-3">
            <p class="text-xs text-zinc-500 mb-1 font-mono">
                latest external-data event
            </p>
            <pre
                class="text-sm text-emerald-400 font-mono whitespace-pre-wrap break-all">{data_received ||
                    "waiting…"}</pre>
        </div>
    {/if}
</div>

<style>
    :global(.token.keyword) {
        color: #c792ea;
    }
    :global(.token.function) {
        color: #82aaff;
    }
    :global(.token.string) {
        color: #c3e88d;
    }
    :global(.token.number) {
        color: #f78c6c;
    }
    :global(.token.builtin) {
        color: #ffcb6b;
    }
    :global(.token.punctuation) {
        color: #89ddff;
    }
    :global(.token.operator) {
        color: #89ddff;
    }
    :global(.token.comment) {
        color: #546e7a;
        font-style: italic;
    }
    :global(.token.decorator) {
        color: #ffcb6b;
    }
    pre {
        color: #d4d4d8;
        margin: 0;
    }
</style>