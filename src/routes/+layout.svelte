<script lang="ts">
  import { onMount } from 'svelte';
  import { initAuth } from '$lib/auth/store';
  import '../app.css';

  onMount(() => {
    initAuth();
  });
</script>

<slot />

