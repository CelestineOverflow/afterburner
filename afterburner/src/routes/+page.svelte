<script lang="ts">
    import ForceChart from "../lib/ForceChart.svelte";
    import TemperatureChart from "$lib/TemperatureChart.svelte";
    import { temps } from "$lib/Serial.svelte";
</script>








<div class="grid grid-cols-2 gap-0">
  <div class="grid gap-6 md:grid-cols-2">
        {#each temps.controllers as _, i}
            <TemperatureChart
                label={`Controller ${i + 1}`}
                source={temps}
                currentPath={`controllers.${i}.current`}
                targetPath={`controllers.${i}.target`} />
        {/each}
    </div>
    <ForceChart/>
</div>