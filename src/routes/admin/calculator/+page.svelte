<script lang="ts">
  import { onMount } from 'svelte';
  import { getAllPricingConfigs, getAllApps, type PricingConfig, type AppConfig } from '$lib/api/client';

  let pricingConfigs: PricingConfig[] = [];
  let apps: AppConfig[] = [];
  let loading = true;

  // Fixed monthly costs (editable)
  let fixedCosts: Array<{ name: string; amount: number }> = [
    { name: 'RunPod ComfyUI (GPU)', amount: 150 },
    { name: 'RunPod Deforum (GPU)', amount: 300 },
    { name: 'RunPod A1111 (GPU)', amount: 50 },
    { name: 'Server / Hosting', amount: 50 },
    { name: 'Other', amount: 0 }
  ];

  let profitTarget = 200;

  // Client contracts (editable)
  let clients: Array<{ name: string; monthlyRevenue: number; appId: string }> = [
    { name: 'IFM', monthlyRevenue: 1000, appId: 'ifm' },
    { name: 'Client 2', monthlyRevenue: 0, appId: '' }
  ];

  // Usage estimates per pricing config
  let usageEstimates: Record<string, number> = {};

  onMount(async () => {
    try {
      [pricingConfigs, apps] = await Promise.all([
        getAllPricingConfigs(),
        getAllApps()
      ]);
      pricingConfigs = pricingConfigs.filter(c => c.is_active);
      pricingConfigs.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));

      for (const config of pricingConfigs) {
        usageEstimates[config.id] = config.model === 'deforum' ? 5000 : 100;
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      loading = false;
    }
  });

  function getCreditsPerUnit(config: PricingConfig): number {
    if (config.fixed_credit_override != null && config.fixed_credit_override > 0) {
      return config.fixed_credit_override;
    }
    const markedUp = config.cost_per_unit_usd * (config.markup_multiplier || 1);
    return Math.max(1, Math.ceil(markedUp / 0.01));
  }

  function getOurCostPerUnit(config: PricingConfig): number {
    return config.cost_per_unit_usd;
  }

  function getRevenuePerUnit(config: PricingConfig): number {
    return getCreditsPerUnit(config) * 0.01;
  }

  function getMarginPerUnit(config: PricingConfig): number {
    return getRevenuePerUnit(config) - getOurCostPerUnit(config);
  }

  $: totalFixedCosts = fixedCosts.reduce((sum, c) => sum + c.amount, 0);
  $: totalClientRevenue = clients.reduce((sum, c) => sum + c.monthlyRevenue, 0);
  $: totalNeeded = totalFixedCosts + profitTarget;

  $: variableRevenue = pricingConfigs.reduce((sum, config) => {
    const usage = usageEstimates[config.id] || 0;
    return sum + usage * getRevenuePerUnit(config);
  }, 0);

  $: variableCost = pricingConfigs.reduce((sum, config) => {
    const usage = usageEstimates[config.id] || 0;
    return sum + usage * getOurCostPerUnit(config);
  }, 0);

  $: totalRevenue = totalClientRevenue + variableRevenue;
  $: totalCosts = totalFixedCosts + variableCost;
  $: netProfit = totalRevenue - totalCosts;
  $: coversTarget = netProfit >= profitTarget;

  function addFixedCost() {
    fixedCosts = [...fixedCosts, { name: '', amount: 0 }];
  }

  function removeFixedCost(index: number) {
    fixedCosts = fixedCosts.filter((_, i) => i !== index);
  }

  function addClient() {
    clients = [...clients, { name: '', monthlyRevenue: 0, appId: '' }];
  }

  function removeClient(index: number) {
    clients = clients.filter((_, i) => i !== index);
  }

  function formatEur(amount: number): string {
    return `€${amount.toFixed(2)}`;
  }
</script>

<div class="calculator-page">
  <div class="calculator-header">
    <div>
      <h2>Pricing Calculator</h2>
      <p class="subtitle">Experiment with pricing to find the right balance between cost coverage and user value</p>
    </div>
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner-small"></div>
      <p>Loading pricing data...</p>
    </div>
  {:else}
    <!-- Summary Cards -->
    <div class="summary-row">
      <div class="summary-card">
        <span class="summary-label">Monthly Revenue</span>
        <span class="summary-value positive">{formatEur(totalRevenue)}</span>
        <span class="summary-sub">Clients + usage-based</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">Monthly Costs</span>
        <span class="summary-value negative">{formatEur(totalCosts)}</span>
        <span class="summary-sub">Fixed + variable API costs</span>
      </div>
      <div class="summary-card" class:profit={netProfit >= 0} class:loss={netProfit < 0}>
        <span class="summary-label">Net Profit</span>
        <span class="summary-value">{formatEur(netProfit)}</span>
        <span class="summary-sub">{coversTarget ? 'Covers your target' : `Need ${formatEur(profitTarget - netProfit)} more`}</span>
      </div>
      <div class="summary-card">
        <span class="summary-label">Profit Target</span>
        <span class="summary-value">{formatEur(profitTarget)}</span>
        <span class="summary-sub">{coversTarget ? 'Achieved' : 'Not yet'}</span>
      </div>
    </div>

    <div class="calculator-grid">
      <!-- LEFT: Costs -->
      <div class="calc-section">
        <h3>Monthly Fixed Costs</h3>
        <p class="section-desc">Infrastructure costs you pay regardless of usage</p>

        <div class="cost-list">
          {#each fixedCosts as cost, i}
            <div class="cost-row">
              <input type="text" class="input" bind:value={cost.name} placeholder="Cost name" />
              <div class="cost-input-wrap">
                <span class="cost-prefix">€</span>
                <input type="number" class="input input-amount" bind:value={cost.amount} min="0" step="10" />
              </div>
              <button class="btn-remove" on:click={() => removeFixedCost(i)} title="Remove">×</button>
            </div>
          {/each}
          <button class="btn-add" on:click={addFixedCost}>+ Add Cost</button>
        </div>

        <div class="cost-total">
          <span>Total Fixed Costs</span>
          <strong>{formatEur(totalFixedCosts)}</strong>
        </div>

        <div class="profit-target-section">
          <label>Your Monthly Profit Target</label>
          <div class="cost-input-wrap">
            <span class="cost-prefix">€</span>
            <input type="number" class="input input-amount" bind:value={profitTarget} min="0" step="50" />
          </div>
        </div>

        <div class="cost-total need-total">
          <span>Total Needed</span>
          <strong>{formatEur(totalNeeded)}</strong>
        </div>
      </div>

      <!-- RIGHT: Revenue -->
      <div class="calc-section">
        <h3>Client Revenue</h3>
        <p class="section-desc">Monthly payments from your clients</p>

        <div class="cost-list">
          {#each clients as client, i}
            <div class="cost-row">
              <input type="text" class="input" bind:value={client.name} placeholder="Client name" />
              <select class="input input-select" bind:value={client.appId}>
                <option value="">— no app —</option>
                {#each apps as app}
                  <option value={app.id}>{app.name}</option>
                {/each}
              </select>
              <div class="cost-input-wrap">
                <span class="cost-prefix">€</span>
                <input type="number" class="input input-amount" bind:value={client.monthlyRevenue} min="0" step="100" />
              </div>
              <button class="btn-remove" on:click={() => removeClient(i)} title="Remove">×</button>
            </div>
          {/each}
          <button class="btn-add" on:click={addClient}>+ Add Client</button>
        </div>

        <div class="cost-total">
          <span>Total Client Revenue</span>
          <strong class="positive-text">{formatEur(totalClientRevenue)}</strong>
        </div>

        <div class="budget-breakdown">
          <h4>Budget Breakdown</h4>
          <div class="breakdown-bar">
            {#if totalClientRevenue > 0}
              {@const costPct = Math.min(100, (totalFixedCosts / totalClientRevenue) * 100)}
              {@const profitPct = Math.min(100 - costPct, (profitTarget / totalClientRevenue) * 100)}
              {@const remainPct = Math.max(0, 100 - costPct - profitPct)}
              <div class="bar-segment bar-costs" style="width: {costPct}%">
                {#if costPct > 15}Costs{/if}
              </div>
              <div class="bar-segment bar-profit" style="width: {profitPct}%">
                {#if profitPct > 15}Profit{/if}
              </div>
              {#if remainPct > 0}
                <div class="bar-segment bar-surplus" style="width: {remainPct}%">
                  {#if remainPct > 15}Surplus{/if}
                </div>
              {/if}
            {/if}
          </div>
          <div class="breakdown-legend">
            <span class="legend-item"><span class="legend-dot costs"></span> Fixed costs: {formatEur(totalFixedCosts)}</span>
            <span class="legend-item"><span class="legend-dot profit"></span> Your profit: {formatEur(profitTarget)}</span>
            <span class="legend-item"><span class="legend-dot surplus"></span> Remaining: {formatEur(Math.max(0, totalClientRevenue - totalFixedCosts - profitTarget))}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- API Pricing Table -->
    <div class="calc-section full-width">
      <h3>Per-Generation Economics</h3>
      <p class="section-desc">Your live pricing configs — adjust estimated monthly usage to see impact on revenue</p>

      <table class="pricing-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Model</th>
            <th>Credits Charged</th>
            <th>Our Cost</th>
            <th>We Earn</th>
            <th>Margin</th>
            <th>Est. Monthly Usage</th>
            <th>Monthly Revenue</th>
            <th>Monthly API Cost</th>
            <th>Monthly Profit</th>
          </tr>
        </thead>
        <tbody>
          {#each pricingConfigs as config}
            {@const credits = getCreditsPerUnit(config)}
            {@const ourCost = getOurCostPerUnit(config)}
            {@const revenue = getRevenuePerUnit(config)}
            {@const margin = getMarginPerUnit(config)}
            {@const usage = usageEstimates[config.id] || 0}
            {@const monthlyRev = usage * revenue}
            {@const monthlyCost = usage * ourCost}
            {@const monthlyProfit = monthlyRev - monthlyCost}
            <tr>
              <td><span class="provider-badge">{config.provider}</span></td>
              <td class="model-cell">
                <span class="model-name">{config.display_name || config.model}</span>
                <span class="model-id">{config.model}</span>
              </td>
              <td class="num">{credits} cr</td>
              <td class="num">${ourCost.toFixed(4)}</td>
              <td class="num">{formatEur(revenue)}</td>
              <td class="num" class:positive-text={margin > 0} class:negative-text={margin < 0}>{formatEur(margin)}</td>
              <td>
                <input
                  type="number"
                  class="input input-sm input-usage"
                  bind:value={usageEstimates[config.id]}
                  min="0"
                  step="10"
                />
              </td>
              <td class="num positive-text">{formatEur(monthlyRev)}</td>
              <td class="num negative-text">{formatEur(monthlyCost)}</td>
              <td class="num" class:positive-text={monthlyProfit > 0} class:negative-text={monthlyProfit < 0}>
                {formatEur(monthlyProfit)}
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6"><strong>Totals</strong></td>
            <td></td>
            <td class="num"><strong class="positive-text">{formatEur(variableRevenue)}</strong></td>
            <td class="num"><strong class="negative-text">{formatEur(variableCost)}</strong></td>
            <td class="num"><strong class:positive-text={variableRevenue - variableCost > 0}>{formatEur(variableRevenue - variableCost)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Bottom Summary -->
    <div class="calc-section full-width final-summary">
      <h3>Monthly P&L Summary</h3>
      <div class="pnl-grid">
        <div class="pnl-row">
          <span>Client Revenue</span>
          <span class="positive-text">{formatEur(totalClientRevenue)}</span>
        </div>
        <div class="pnl-row">
          <span>Usage-Based Revenue (API markup)</span>
          <span class="positive-text">{formatEur(variableRevenue)}</span>
        </div>
        <div class="pnl-row pnl-total-revenue">
          <span><strong>Total Revenue</strong></span>
          <span class="positive-text"><strong>{formatEur(totalRevenue)}</strong></span>
        </div>
        <div class="pnl-divider"></div>
        <div class="pnl-row">
          <span>Fixed Costs (infrastructure)</span>
          <span class="negative-text">-{formatEur(totalFixedCosts)}</span>
        </div>
        <div class="pnl-row">
          <span>Variable Costs (API usage)</span>
          <span class="negative-text">-{formatEur(variableCost)}</span>
        </div>
        <div class="pnl-row pnl-total-costs">
          <span><strong>Total Costs</strong></span>
          <span class="negative-text"><strong>-{formatEur(totalCosts)}</strong></span>
        </div>
        <div class="pnl-divider"></div>
        <div class="pnl-row pnl-net" class:profit={netProfit >= 0} class:loss={netProfit < 0}>
          <span><strong>Net Profit</strong></span>
          <span><strong>{formatEur(netProfit)}</strong></span>
        </div>
        <div class="pnl-row">
          <span>Your target</span>
          <span>{formatEur(profitTarget)}</span>
        </div>
        <div class="pnl-row pnl-verdict" class:achieved={coversTarget} class:shortfall={!coversTarget}>
          <span>{coversTarget ? 'Target achieved' : 'Shortfall'}</span>
          <span>{coversTarget ? `+${formatEur(netProfit - profitTarget)} surplus` : `-${formatEur(profitTarget - netProfit)} short`}</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .calculator-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px;
  }

  .calculator-header {
    margin-bottom: 24px;
  }

  .calculator-header h2 {
    font-size: 28px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .subtitle {
    font-size: 14px;
    color: #6b7280;
  }

  .loading-state {
    text-align: center;
    padding: 60px;
    color: #6b7280;
  }

  .loading-spinner-small {
    width: 24px;
    height: 24px;
    border: 3px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 12px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Summary Cards */
  .summary-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .summary-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .summary-card.profit { border-left: 4px solid #10b981; }
  .summary-card.loss { border-left: 4px solid #ef4444; }

  .summary-label {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .summary-value {
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
    font-variant-numeric: tabular-nums;
  }

  .summary-value.positive { color: #10b981; }
  .summary-value.negative { color: #ef4444; }

  .summary-sub {
    font-size: 12px;
    color: #9ca3af;
  }

  /* Grid layout */
  .calculator-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }

  .calc-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .calc-section.full-width {
    margin-bottom: 24px;
  }

  .calc-section h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .section-desc {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 20px;
  }

  /* Cost list */
  .cost-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .cost-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .cost-row .input:first-child {
    flex: 1;
  }

  .cost-input-wrap {
    display: flex;
    align-items: center;
    gap: 0;
    position: relative;
  }

  .cost-prefix {
    position: absolute;
    left: 10px;
    font-size: 13px;
    color: #6b7280;
    z-index: 1;
  }

  .input-amount {
    width: 110px;
    padding-left: 24px !important;
  }

  .input-select {
    width: 140px;
  }

  .btn-remove {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
  }

  .btn-remove:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  .btn-add {
    background: none;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    padding: 8px;
    font-size: 13px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-add:hover {
    border-color: #3b82f6;
    color: #3b82f6;
    background: #eff6ff;
  }

  .cost-total {
    display: flex;
    justify-content: space-between;
    padding: 12px 16px;
    background: #f9fafb;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    margin-bottom: 16px;
  }

  .need-total {
    background: #fef3c7;
    color: #92400e;
  }

  .profit-target-section {
    margin-bottom: 16px;
  }

  .profit-target-section label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }

  /* Budget breakdown */
  .budget-breakdown {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  }

  .budget-breakdown h4 {
    font-size: 14px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 12px;
  }

  .breakdown-bar {
    display: flex;
    height: 32px;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .bar-segment {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: white;
    min-width: 2px;
    transition: width 0.3s;
  }

  .bar-costs { background: #ef4444; }
  .bar-profit { background: #3b82f6; }
  .bar-surplus { background: #10b981; }

  .breakdown-legend {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #6b7280;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }

  .legend-dot.costs { background: #ef4444; }
  .legend-dot.profit { background: #3b82f6; }
  .legend-dot.surplus { background: #10b981; }

  /* Pricing table */
  .pricing-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .pricing-table thead {
    background: #f9fafb;
  }

  .pricing-table th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid #e5e7eb;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .pricing-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
  }

  .pricing-table tbody tr:hover {
    background: #f9fafb;
  }

  .pricing-table tfoot {
    background: #f0f4ff;
  }

  .pricing-table tfoot td {
    border-top: 2px solid #e5e7eb;
    border-bottom: none;
    padding: 12px;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-family: monospace;
    font-size: 13px;
  }

  .provider-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #f3f4f6;
    color: #374151;
  }

  .model-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .model-name {
    font-weight: 500;
    color: #1f2937;
  }

  .model-id {
    font-size: 11px;
    font-family: monospace;
    color: #9ca3af;
  }

  .input-usage {
    width: 80px;
    text-align: right;
  }

  .positive-text { color: #10b981; }
  .negative-text { color: #ef4444; }

  /* P&L Summary */
  .final-summary {
    border: 2px solid #e5e7eb;
  }

  .pnl-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 500px;
  }

  .pnl-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 14px;
    color: #374151;
  }

  .pnl-total-revenue, .pnl-total-costs {
    padding: 8px 0;
    border-top: 1px solid #e5e7eb;
  }

  .pnl-divider {
    height: 1px;
    background: #e5e7eb;
    margin: 4px 0;
  }

  .pnl-net {
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 18px;
  }

  .pnl-net.profit { background: #d1fae5; color: #065f46; }
  .pnl-net.loss { background: #fee2e2; color: #991b1b; }

  .pnl-verdict {
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 13px;
  }

  .pnl-verdict.achieved { background: #d1fae5; color: #065f46; }
  .pnl-verdict.shortfall { background: #fef3c7; color: #92400e; }

  /* Shared input styles */
  .input {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    color: #1f2937;
    background: white;
    transition: border-color 0.15s;
  }

  .input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  .input-sm {
    padding: 6px 8px;
    font-size: 12px;
  }
</style>
