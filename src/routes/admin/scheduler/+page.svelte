<script lang="ts">
  import { onMount } from 'svelte';
  import { getRunpodSchedulerConfig, updateRunpodSchedulerConfig, type RunpodSchedulerConfig, type SchedulerEndpoint } from '$lib/api/client';

  let config: RunpodSchedulerConfig | null = null;
  let status: SchedulerStatus | null = null;
  let loading = true;
  let saving = false;
  let error: string | null = null;
  let successMessage: string | null = null;

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const TIMEZONES = [
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'UTC'
  ];

  onMount(async () => {
    await loadConfig();
  });

  async function loadConfig() {
    loading = true;
    error = null;
    successMessage = null;
    try {
      const result = await getRunpodSchedulerConfig();
      config = result.config;
      status = result.status;
    } catch (err) {
      console.error('Error loading scheduler config:', err);
      error = err instanceof Error ? err.message : 'Failed to load scheduler configuration';
    } finally {
      loading = false;
    }
  }

  async function saveConfig() {
    if (!config) return;

    saving = true;
    error = null;
    successMessage = null;

    try {
      const result = await updateRunpodSchedulerConfig(config);
      successMessage = result.message || 'Configuration saved successfully';
      status = result.status;
      
      // Reload to get any server-side validation
      setTimeout(() => {
        loadConfig();
      }, 1000);
    } catch (err) {
      console.error('Error saving scheduler config:', err);
      error = err instanceof Error ? err.message : 'Failed to save scheduler configuration';
    } finally {
      saving = false;
    }
  }

  function addEndpoint() {
    if (!config) return;
    config.endpoints.push({
      id: '',
      name: '',
      schedule: {}
    });
  }

  function removeEndpoint(index: number) {
    if (!config) return;
    config.endpoints = config.endpoints.filter((_, i) => i !== index);
  }

  function addScheduleDay(endpointIndex: number, day: string) {
    if (!config) return;
    const endpoint = config.endpoints[endpointIndex];
    if (!endpoint.schedule[day]) {
      endpoint.schedule[day] = [];
    }
    endpoint.schedule[day].push({
      start: '08:00',
      stop: '18:00',
      workersMin: 1,
      workersMax: 6
    });
    // Trigger reactivity
    endpoint.schedule = { ...endpoint.schedule };
  }

  function removeScheduleDay(endpointIndex: number, day: string, scheduleIndex: number) {
    if (!config) return;
    const endpoint = config.endpoints[endpointIndex];
    if (endpoint.schedule[day]) {
      endpoint.schedule[day] = endpoint.schedule[day].filter((_, i) => i !== scheduleIndex);
      if (endpoint.schedule[day].length === 0) {
        delete endpoint.schedule[day];
      }
      // Trigger reactivity
      endpoint.schedule = { ...endpoint.schedule };
    }
  }

  function getScheduleDays(endpoint: SchedulerEndpoint): string[] {
    return Object.keys(endpoint.schedule);
  }
</script>

<div class="scheduler-page">
  <div class="page-header">
    <h1>⏰ RunPod Scheduler</h1>
    <button class="btn btn-secondary" on:click={loadConfig} disabled={loading || saving}>
      {loading ? 'Loading...' : '🔄 Refresh'}
    </button>
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading scheduler configuration...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>❌ {error}</p>
      <button class="btn btn-primary" on:click={loadConfig}>Retry</button>
    </div>
  {:else if config}
    {#if successMessage}
      <div class="success-message">
        ✅ {successMessage}
      </div>
    {/if}

    <!-- Status Panel -->
    {#if status}
      <div class="status-panel">
        <h2>📊 Scheduler Status</h2>
        <div class="status-grid">
          <div class="status-item">
            <span class="status-label">Status:</span>
            <span class="status-value" class:status-running={status.isRunning} class:status-stopped={!status.isRunning}>
              {status.isRunning ? '🟢 Running' : '🔴 Stopped'}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Manual Override:</span>
            <span class="status-value">
              {status.manualOverride ? '✅ Enabled' : '❌ Disabled'}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Config Loaded:</span>
            <span class="status-value">
              {status.configLoaded ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          {#if status.currentDay}
            <div class="status-item">
              <span class="status-label">Current Day:</span>
              <span class="status-value">{status.currentDay}</span>
            </div>
          {/if}
          {#if status.currentTime}
            <div class="status-item">
              <span class="status-label">Current Time:</span>
              <span class="status-value">{status.currentTime}</span>
            </div>
          {/if}
        </div>
        <p class="status-note">
          ℹ️ The scheduler checks the configuration file every 30 seconds. Changes will be applied automatically.
        </p>
      </div>
    {/if}

    <form on:submit|preventDefault={saveConfig}>
      <!-- Global Settings -->
      <div class="config-section">
        <h2>Global Settings</h2>
        
        <div class="form-group">
          <label for="timezone">Timezone</label>
          <select id="timezone" bind:value={config.timezone} class="select">
            {#each TIMEZONES as tz}
              <option value={tz}>{tz}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={config.manualOverride} />
            <span>Manual Override (disable automatic scheduling)</span>
          </label>
          <p class="help-text">When enabled, the scheduler will not automatically manage workers. You'll need to manage them manually in the RunPod UI.</p>
        </div>
      </div>

      <!-- Endpoints -->
      <div class="config-section">
        <div class="section-header">
          <h2>Endpoints</h2>
          <button type="button" class="btn btn-secondary" on:click={addEndpoint}>
            + Add Endpoint
          </button>
        </div>

        {#each config.endpoints as endpoint, endpointIndex}
          <div class="endpoint-card">
            <div class="endpoint-header">
              <div class="endpoint-fields">
                <div class="form-group">
                  <label>Endpoint ID</label>
                  <input 
                    type="text" 
                    bind:value={endpoint.id} 
                    placeholder="e.g., bhqt4ptpkvtseb"
                    class="input"
                    required
                  />
                </div>
                <div class="form-group">
                  <label>Name</label>
                  <input 
                    type="text" 
                    bind:value={endpoint.name} 
                    placeholder="e.g., Deforum"
                    class="input"
                    required
                  />
                </div>
              </div>
              <button 
                type="button" 
                class="btn btn-danger" 
                on:click={() => removeEndpoint(endpointIndex)}
              >
                Remove
              </button>
            </div>

            <div class="schedule-section">
              <h3>Schedule</h3>
              
              {#each DAYS as day}
                {@const scheduleDays = getScheduleDays(endpoint)}
                {@const hasSchedule = scheduleDays.includes(day)}
                {@const schedules = endpoint.schedule[day] || []}
                
                <div class="day-schedule">
                  <div class="day-header">
                    <span class="day-name">{day}</span>
                    {#if !hasSchedule}
                      <button 
                        type="button" 
                        class="btn btn-small" 
                        on:click={() => addScheduleDay(endpointIndex, day)}
                      >
                        + Add Schedule
                      </button>
                    {/if}
                  </div>

                  {#if hasSchedule}
                    <div class="schedules-list">
                      {#each schedules as schedule, scheduleIndex}
                        <div class="schedule-item">
                          <div class="schedule-fields">
                            <div class="form-group-small">
                              <label>Start</label>
                              <input 
                                type="time" 
                                bind:value={schedule.start} 
                                class="input input-small"
                                required
                              />
                            </div>
                            <div class="form-group-small">
                              <label>Stop</label>
                              <input 
                                type="time" 
                                bind:value={schedule.stop} 
                                class="input input-small"
                                required
                              />
                            </div>
                            <div class="form-group-small">
                              <label>Min Workers</label>
                              <input 
                                type="number" 
                                bind:value={schedule.workersMin} 
                                min="0"
                                class="input input-small"
                                required
                              />
                            </div>
                            <div class="form-group-small">
                              <label>Max Workers</label>
                              <input 
                                type="number" 
                                bind:value={schedule.workersMax} 
                                min="0"
                                class="input input-small"
                                required
                              />
                            </div>
                          </div>
                          <button 
                            type="button" 
                            class="btn btn-small btn-danger" 
                            on:click={() => removeScheduleDay(endpointIndex, day, scheduleIndex)}
                          >
                            Remove
                          </button>
                        </div>
                      {/each}
                      <button 
                        type="button" 
                        class="btn btn-small" 
                        on:click={() => addScheduleDay(endpointIndex, day)}
                      >
                        + Add Another
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Save Button -->
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : '💾 Save Configuration'}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .scheduler-page {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .page-header h1 {
    font-size: 28px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .config-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .config-section h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 20px 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 8px;
  }

  .form-group-small {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group-small label {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
  }

  .input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    transition: border-color 0.2s;
  }

  .input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .input-small {
    width: 120px;
  }

  .select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    background: white;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .help-text {
    font-size: 13px;
    color: #6b7280;
    margin-top: 8px;
  }

  .endpoint-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
    background: #f9fafb;
  }

  .endpoint-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .endpoint-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    flex: 1;
    margin-right: 16px;
  }

  .schedule-section {
    margin-top: 20px;
  }

  .schedule-section h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 16px;
  }

  .day-schedule {
    margin-bottom: 16px;
    padding: 12px;
    background: white;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
  }

  .day-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .day-name {
    font-weight: 600;
    color: #374151;
  }

  .schedules-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .schedule-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    background: #f9fafb;
    border-radius: 6px;
  }

  .schedule-fields {
    display: flex;
    gap: 12px;
    flex: 1;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #1f2937;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-small {
    padding: 6px 12px;
    font-size: 12px;
  }

  .success-message {
    background: #d1fae5;
    color: #065f46;
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 24px;
    font-weight: 500;
  }

  .status-panel {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .status-panel h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 16px 0;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .status-label {
    font-size: 12px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
  }

  .status-value {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .status-value.status-running {
    color: #059669;
  }

  .status-value.status-stopped {
    color: #dc2626;
  }

  .status-note {
    font-size: 13px;
    color: #6b7280;
    margin: 0;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
  }

  .loading-state,
  .error-state {
    padding: 60px 20px;
    text-align: center;
    color: #6b7280;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>

