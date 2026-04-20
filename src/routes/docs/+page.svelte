<script lang="ts">
    import { openPath, openUrl } from '@tauri-apps/plugin-opener';

    
</script>




<h1 class="mb-4 text-4xl font-bold tracking-tight text-heading md:text-5xl lg:text-6xl">Basic</h1>


<div class="grid grid-cols-3 gap-1">
    <div  class="col-span-2">    <p class="mb-6 text-lg font-normal text-body lg:text-xl sm:px-16 xl:px-48">To start get the latest control software</p></div>
    <button onclick={()=>{openUrl("https://github.com/CelestineOverflow/afterburner/releases")}}  class="btn btn-success">here</button>

</div>
<!-- svelte-ignore a11y_missing_attribute -->
<div>
    <p class="mb-6 text-lg font-normal text-body lg:text-xl sm:px-16 xl:px-48">To connect the device to the computer do as follows</p>
    <p class="mb-6 text-lg font-normal text-body lg:text-xl sm:px-16 xl:px-48">Physical Setup</p>
    <p class="mb-6 text-lg font-normal text-body lg:text-xl sm:px-16 xl:px-48">Software side Setup</p>
    <p class="mb-6 text-lg font-normal text-body lg:text-xl sm:px-16 xl:px-48">Click on connect</p>Q
    <img class="h-98 w-96 object-scale-down ..." src='photos\startup_image.png' />
    <p class="mb-6 text-lg font-normal text-body lg:text-xl sm:px-16 xl:px-48">Select the correct port</p>
    <img class="h-98 w-96 object-scale-down ..." src='photos\port.png' />
    <p class="mb-6 text-lg font-normal text-body lg:text-xl sm:px-16 xl:px-48">Succesfully connected</p>
    <img class="h-98 w-96 object-scale-down ..." src='photos\succesfully_connected.png' />
</div>

