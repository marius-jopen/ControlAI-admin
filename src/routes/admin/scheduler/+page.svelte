<script lang="ts">
    import { onMount } from "svelte";
    import { getSchedulerConfig, saveSchedulerConfig } from "$lib/api/client";

    interface TimeWindow {
        start: string;
        stop: string;
        workersMin: number;
        workersMax: number;
    }

    interface Endpoint {
        id: string;
        name: string;
        schedule: Record<string, TimeWindow[]>;
    }

    interface SchedulerConfig {
        timezone: string;
        manualOverride: boolean;
        endpoints: Endpoint[];
    }

    interface SchedulerStatus {
        enabled: boolean;
        manualOverride: boolean;
        now: string;
        currentDay: string;
        currentTime: string;
        isRunning: boolean;
        configLoaded: boolean;
        config: SchedulerConfig | null;
    }

    const DAYS = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ];

    let status: SchedulerStatus | null = null;
    let config: SchedulerConfig | null = null;
    let loading = true;
    let saving = false;
    let error: string | null = null;
    let successMessage: string | null = null;

    onMount(async () => {
        await loadConfig();
    });

    async function loadConfig() {
        loading = true;
        error = null;
        try {
            const data = await getSchedulerConfig();
            status = data;
            config = data.config || {
                timezone: "Europe/Berlin",
                manualOverride: false,
                endpoints: [],
            };
        } catch (e: any) {
            console.error("Failed to load scheduler config:", e);
            error = e.message || "Failed to load configuration";
        } finally {
            loading = false;
        }
    }

    async function handleSave() {
        if (!config) return;

        saving = true;
        error = null;
        successMessage = null;

        try {
            await saveSchedulerConfig(config);
            successMessage = "Configuration saved successfully!";
            await loadConfig(); // Refresh to get latest status
            setTimeout(() => (successMessage = null), 3000);
        } catch (e: any) {
            console.error("Failed to save scheduler config:", e);
            error = e.message || "Failed to save configuration";
        } finally {
            saving = false;
        }
    }

    function addEndpoint() {
        if (!config) return;
        config.endpoints = [
            ...config.endpoints,
            {
                id: "",
                name: "New Endpoint",
                schedule: {},
            },
        ];
    }

    function removeEndpoint(index: number) {
        if (!config) return;
        config.endpoints = config.endpoints.filter((_, i) => i !== index);
    }

    function addTimeWindow(endpointIndex: number, day: string) {
        if (!config) return;
        const endpoint = config.endpoints[endpointIndex];
        if (!endpoint.schedule[day]) {
            endpoint.schedule[day] = [];
        }
        endpoint.schedule[day] = [
            ...endpoint.schedule[day],
            {
                start: "08:00",
                stop: "18:00",
                workersMin: 1,
                workersMax: 5,
            },
        ];
        config = config; // Trigger reactivity
    }

    function removeTimeWindow(
        endpointIndex: number,
        day: string,
        windowIndex: number,
    ) {
        if (!config) return;
        const endpoint = config.endpoints[endpointIndex];
        endpoint.schedule[day] = endpoint.schedule[day].filter(
            (_, i) => i !== windowIndex,
        );
        if (endpoint.schedule[day].length === 0) {
            delete endpoint.schedule[day];
        }
        config = config; // Trigger reactivity
    }

    function copyToAllDays(endpointIndex: number, sourceDay: string) {
        if (!config) return;
        const endpoint = config.endpoints[endpointIndex];
        const sourceWindows = endpoint.schedule[sourceDay];
        if (!sourceWindows) return;

        for (const day of DAYS) {
            if (day !== sourceDay) {
                endpoint.schedule[day] = JSON.parse(
                    JSON.stringify(sourceWindows),
                );
            }
        }
        config = config; // Trigger reactivity
    }
</script>

<div class="scheduler-page">
    <div class="page-header">
        <div class="header-content">
            <h1>🕐 RunPod Scheduler</h1>
            <p class="subtitle">
                Manage automated scaling rules for RunPod endpoints
            </p>
        </div>
        <div class="header-actions">
            <button
                class="btn btn-secondary"
                on:click={loadConfig}
                disabled={loading}
            >
                {loading ? "Loading..." : "↻ Refresh"}
            </button>
            <button
                class="btn btn-primary"
                on:click={handleSave}
                disabled={saving || !config}
            >
                {saving ? "Saving..." : "💾 Save Configuration"}
            </button>
        </div>
    </div>

    {#if error}
        <div class="alert alert-error">
            ⚠️ {error}
        </div>
    {/if}

    {#if successMessage}
        <div class="alert alert-success">
            ✅ {successMessage}
        </div>
    {/if}

    {#if loading}
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading scheduler configuration...</p>
        </div>
    {:else if config}
        <div class="content-grid">
            <!-- Status Card -->
            <section class="card status-card">
                <h2>Current Status</h2>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Scheduler</span>
                        <span
                            class="status-value"
                            class:running={status?.isRunning}
                            class:stopped={!status?.isRunning}
                        >
                            {status?.isRunning ? "🟢 Running" : "🔴 Stopped"}
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Config Loaded</span>
                        <span class="status-value"
                            >{status?.configLoaded ? "✅ Yes" : "❌ No"}</span
                        >
                    </div>
                    <div class="status-item">
                        <span class="status-label">Manual Override</span>
                        <span
                            class="status-value"
                            class:warning={status?.manualOverride}
                        >
                            {status?.manualOverride
                                ? "⚠️ Enabled"
                                : "✅ Disabled"}
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Server Time</span>
                        <span class="status-value time"
                            >{status?.currentTime || "--:--"}</span
                        >
                    </div>
                    <div class="status-item">
                        <span class="status-label">Server Day</span>
                        <span class="status-value"
                            >{status?.currentDay || "---"}</span
                        >
                    </div>
                </div>
            </section>

            <!-- Global Settings Card -->
            <section class="card">
                <h2>Global Settings</h2>
                <div class="settings-grid">
                    <div class="form-group">
                        <label for="timezone">Timezone</label>
                        <input
                            id="timezone"
                            type="text"
                            class="input"
                            bind:value={config.timezone}
                            placeholder="Europe/Berlin"
                        />
                    </div>
                    <div class="form-group checkbox-group">
                        <label class="checkbox-label">
                            <input
                                type="checkbox"
                                bind:checked={config.manualOverride}
                            />
                            <span>Manual Override</span>
                            <small
                                >When enabled, automatic scaling is disabled</small
                            >
                        </label>
                    </div>
                </div>
            </section>

            <!-- Endpoints Section -->
            <section class="card endpoints-section">
                <div class="section-header">
                    <h2>Endpoints ({config.endpoints.length})</h2>
                    <button
                        class="btn btn-secondary btn-sm"
                        on:click={addEndpoint}
                    >
                        + Add Endpoint
                    </button>
                </div>

                {#if config.endpoints.length === 0}
                    <div class="empty-state">
                        <p>
                            No endpoints configured. Click "Add Endpoint" to
                            create one.
                        </p>
                    </div>
                {/if}

                {#each config.endpoints as endpoint, epIndex}
                    <div class="endpoint-card">
                        <div class="endpoint-header">
                            <div class="endpoint-inputs">
                                <div class="form-group">
                                    <label>Endpoint ID</label>
                                    <input
                                        type="text"
                                        class="input input-sm"
                                        bind:value={endpoint.id}
                                        placeholder="e.g., bhqt4ptpkvtseb"
                                    />
                                </div>
                                <div class="form-group">
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        class="input input-sm"
                                        bind:value={endpoint.name}
                                        placeholder="e.g., Deforum"
                                    />
                                </div>
                            </div>
                            <button
                                class="btn btn-danger btn-sm"
                                on:click={() => removeEndpoint(epIndex)}
                            >
                                🗑️ Remove
                            </button>
                        </div>

                        <div class="schedule-section">
                            <h4>Schedule</h4>
                            <div class="days-grid">
                                {#each DAYS as day}
                                    <div class="day-card">
                                        <div class="day-header">
                                            <span class="day-name">{day}</span>
                                            <div class="day-actions">
                                                <button
                                                    class="btn-icon"
                                                    title="Copy to all days"
                                                    on:click={() =>
                                                        copyToAllDays(
                                                            epIndex,
                                                            day,
                                                        )}
                                                    disabled={!endpoint
                                                        .schedule[day]?.length}
                                                >
                                                    📋
                                                </button>
                                                <button
                                                    class="btn-icon"
                                                    title="Add time window"
                                                    on:click={() =>
                                                        addTimeWindow(
                                                            epIndex,
                                                            day,
                                                        )}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>

                                        <div class="time-windows">
                                            {#if endpoint.schedule[day]}
                                                {#each endpoint.schedule[day] as window, winIndex}
                                                    <div class="time-window">
                                                        <div
                                                            class="window-times"
                                                        >
                                                            <div
                                                                class="time-input-group"
                                                            >
                                                                <label
                                                                    >Start</label
                                                                >
                                                                <input
                                                                    type="time"
                                                                    class="input input-time"
                                                                    bind:value={
                                                                        window.start
                                                                    }
                                                                />
                                                            </div>
                                                            <span
                                                                class="time-separator"
                                                                >→</span
                                                            >
                                                            <div
                                                                class="time-input-group"
                                                            >
                                                                <label
                                                                    >Stop</label
                                                                >
                                                                <input
                                                                    type="time"
                                                                    class="input input-time"
                                                                    bind:value={
                                                                        window.stop
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                        <div
                                                            class="window-workers"
                                                        >
                                                            <div
                                                                class="worker-input-group"
                                                            >
                                                                <label
                                                                    >Min</label
                                                                >
                                                                <input
                                                                    type="number"
                                                                    class="input input-number"
                                                                    bind:value={
                                                                        window.workersMin
                                                                    }
                                                                    min="0"
                                                                    max="100"
                                                                />
                                                            </div>
                                                            <div
                                                                class="worker-input-group"
                                                            >
                                                                <label
                                                                    >Max</label
                                                                >
                                                                <input
                                                                    type="number"
                                                                    class="input input-number"
                                                                    bind:value={
                                                                        window.workersMax
                                                                    }
                                                                    min="0"
                                                                    max="100"
                                                                />
                                                            </div>
                                                            <button
                                                                class="btn-remove"
                                                                on:click={() =>
                                                                    removeTimeWindow(
                                                                        epIndex,
                                                                        day,
                                                                        winIndex,
                                                                    )}
                                                                title="Remove window"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    </div>
                                                {/each}
                                            {:else}
                                                <div class="no-schedule">
                                                    No schedule
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/each}
            </section>
        </div>
    {/if}
</div>

<style>
    .scheduler-page {
        max-width: 1400px;
        margin: 0 auto;
        padding: 24px;
    }

    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 16px;
    }

    .header-content h1 {
        font-size: 28px;
        font-weight: 700;
        color: #1f2937;
        margin-bottom: 4px;
    }

    .subtitle {
        color: #6b7280;
        font-size: 14px;
    }

    .header-actions {
        display: flex;
        gap: 12px;
    }

    /* Buttons */
    .btn {
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: 500;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
    }

    .btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }

    .btn-primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .btn-secondary {
        background: white;
        border: 1px solid #e5e7eb;
        color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
        background: #f9fafb;
    }

    .btn-danger {
        background: #fee2e2;
        color: #991b1b;
    }

    .btn-danger:hover:not(:disabled) {
        background: #fecaca;
    }

    .btn-sm {
        padding: 6px 12px;
        font-size: 13px;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-icon {
        width: 28px;
        height: 28px;
        border: 1px solid #e5e7eb;
        background: white;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .btn-icon:hover:not(:disabled) {
        background: #f3f4f6;
    }

    .btn-icon:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .btn-remove {
        width: 24px;
        height: 24px;
        border: none;
        background: #fee2e2;
        color: #991b1b;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
    }

    .btn-remove:hover {
        background: #fecaca;
    }

    /* Alerts */
    .alert {
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        font-size: 14px;
    }

    .alert-error {
        background: #fef2f2;
        color: #991b1b;
        border: 1px solid #fee2e2;
    }

    .alert-success {
        background: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;
    }

    /* Loading */
    .loading-state {
        text-align: center;
        padding: 60px 20px;
        color: #6b7280;
    }

    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #e5e7eb;
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* Cards */
    .card {
        background: white;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card h2 {
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 20px;
    }

    /* Status Card */
    .status-card {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    }

    .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
    }

    .status-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .status-label {
        font-size: 12px;
        font-weight: 500;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .status-value {
        font-size: 14px;
        font-weight: 600;
        color: #1f2937;
    }

    .status-value.running {
        color: #059669;
    }

    .status-value.stopped {
        color: #dc2626;
    }

    .status-value.warning {
        color: #d97706;
    }

    .status-value.time {
        font-family: monospace;
        font-size: 18px;
    }

    /* Forms */
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .form-group label {
        font-size: 12px;
        font-weight: 500;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .input {
        padding: 10px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        transition: border-color 0.2s;
    }

    .input:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .input-sm {
        padding: 8px 10px;
        font-size: 13px;
    }

    .input-time {
        width: 100px;
        padding: 6px 8px;
        font-size: 13px;
    }

    .input-number {
        width: 60px;
        padding: 6px 8px;
        font-size: 13px;
        text-align: center;
    }

    .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
    }

    .checkbox-group {
        display: flex;
        align-items: flex-start;
    }

    .checkbox-label {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
        width: 18px;
        height: 18px;
        margin-top: 2px;
    }

    .checkbox-label span {
        font-size: 14px;
        font-weight: 500;
        color: #1f2937;
    }

    .checkbox-label small {
        display: block;
        font-size: 12px;
        color: #6b7280;
        margin-top: 2px;
    }

    /* Endpoints Section */
    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }

    .section-header h2 {
        margin-bottom: 0;
    }

    .empty-state {
        text-align: center;
        padding: 40px;
        color: #6b7280;
        background: #f9fafb;
        border-radius: 8px;
    }

    .endpoint-card {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
    }

    .endpoint-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 20px;
        flex-wrap: wrap;
    }

    .endpoint-inputs {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        flex: 1;
    }

    .endpoint-inputs .form-group {
        min-width: 200px;
    }

    .schedule-section h4 {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 12px;
    }

    .days-grid {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 8px;
    }

    .day-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
        min-width: 180px;
        flex-shrink: 0;
    }

    .day-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid #f3f4f6;
    }

    .day-name {
        font-weight: 600;
        font-size: 14px;
        color: #1f2937;
    }

    .day-actions {
        display: flex;
        gap: 4px;
    }

    .time-windows {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .time-window {
        background: #f9fafb;
        border-radius: 6px;
        padding: 10px;
    }

    .window-times {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        margin-bottom: 8px;
    }

    .time-input-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .time-input-group label {
        font-size: 10px;
        color: #6b7280;
        text-transform: uppercase;
    }

    .time-separator {
        color: #9ca3af;
        font-size: 16px;
        padding-bottom: 6px;
    }

    .window-workers {
        display: flex;
        align-items: flex-end;
        gap: 8px;
    }

    .worker-input-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .worker-input-group label {
        font-size: 10px;
        color: #6b7280;
        text-transform: uppercase;
    }

    .no-schedule {
        color: #9ca3af;
        font-size: 13px;
        font-style: italic;
        text-align: center;
        padding: 12px;
    }
</style>
