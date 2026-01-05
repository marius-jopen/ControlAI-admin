<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    getStatistics,
    type Statistics,
    type ImageStat,
  } from "$lib/api/client";

  let statistics: Statistics | null = null;
  let loading = true;
  let error: string | null = null;
  let activeTab: "overview" | "user" | "tool" = "overview";
  let timeRange: "week" | "month" | "3months" | "year" | "all" = "month";
  let heatmapRange: "3months" | "6months" | "year" | "all" = "year";

  // TradingView-style chart controls
  let chartGranularity: "hour" | "day" | "week" | "month" = "day";
  let chartRange: "1d" | "1w" | "1m" | "3m" | "1y" | "all" = "1m";
  let enabledTools: Set<string> = new Set();

  // Tool colors for the chart
  const toolColors: Record<string, string> = {
    "flux-fill-dev": "#FF6B6B",
    "flux-fill-pro": "#4ECDC4",
    "flux-schnell": "#45B7D1",
    "flux-dev": "#96CEB4",
    "flux-pro": "#FFEAA7",
    "flux-ultra": "#DDA0DD",
    "flux-realism": "#98D8C8",
    "stable-diffusion": "#F7DC6F",
    midjourney: "#BB8FCE",
    dalle: "#85C1E9",
    // Default colors for additional tools
    "default-1": "#FF9F43",
    "default-2": "#EE5A24",
    "default-3": "#A3CB38",
    "default-4": "#1289A7",
    "default-5": "#D980FA",
    "default-6": "#B53471",
    "default-7": "#006266",
    "default-8": "#5758BB",
  };

  // Multi-tool chart data structure
  type ChartDataPoint = {
    timestamp: string;
    label: string;
    tools: Record<string, number>;
  };
  let multiToolChartData: ChartDataPoint[] = [];
  let selectedTool: string = "all";
  let expandedTools: Set<string> = new Set();
  let expandedUserToolRows: Set<string> = new Set();
  let imageModal: ImageStat | null = null;
  let imageModalTool: string | null = null;
  const IMAGES_PER_PAGE = 50;
  let visibleCounts: Record<string, number> = {};
  let userToolImageCounts: Record<string, number> = {};
  let toolImageCounts: Record<string, number> = {};

  // Derived data for charts
  let dailyActivity: Record<string, number> = {};
  let toolDistribution: Array<{
    tool: string;
    count: number;
    percentage: number;
  }> = [];
  let topUsers: Array<{
    user_id: string;
    name: string;
    email: string;
    count: number;
  }> = [];
  let appDistribution: Array<{
    app: string;
    count: number;
    percentage: number;
  }> = [];
  let summaryStats = {
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    avgPerDay: 0,
    peakDay: { date: "", count: 0 },
    mostActiveUser: { name: "", count: 0 },
    mostActiveTool: { name: "", count: 0 },
  };

  // Handle window resize
  function handleResize() {
    updateChartDimensions();
  }

  onMount(async () => {
    await loadStatistics();
    // Update chart dimensions after load
    setTimeout(() => {
      updateChartDimensions();
    }, 100);
    
    window.addEventListener('resize', handleResize);
  });

  onDestroy(() => {
    window.removeEventListener('resize', handleResize);
  });

  async function loadStatistics() {
    loading = true;
    error = null;
    try {
      statistics = await getStatistics();
      if (statistics) {
        processData();
        expandedTools = new Set();
        visibleCounts = {};
        toolImageCounts = {};
        Object.keys(statistics.images_by_tool).forEach((tool) => {
          visibleCounts[tool] = IMAGES_PER_PAGE;
          toolImageCounts[tool] = IMAGES_PER_PAGE;
        });
      }
    } catch (err) {
      console.error("Error loading statistics:", err);
      error = err instanceof Error ? err.message : "Failed to load statistics";
    } finally {
      loading = false;
    }
  }

  function processData() {
    if (!statistics) return;

    // Collect all images
    const allImages: ImageStat[] = [];
    Object.values(statistics.images_by_tool).forEach((images) => {
      allImages.push(...images);
    });

    // Daily activity for heatmap
    dailyActivity = {};
    allImages.forEach((img) => {
      const date = new Date(img.created_at).toISOString().split("T")[0];
      dailyActivity[date] = (dailyActivity[date] || 0) + 1;
    });

    // Tool distribution
    const totalImages = statistics.total_images;
    toolDistribution = statistics.tool_stats.map((t) => ({
      tool: t.tool,
      count: t.count,
      percentage: Math.round((t.count / totalImages) * 100),
    }));

    // App distribution
    const appCounts: Record<string, number> = {};
    allImages.forEach((img) => {
      appCounts[img.app] = (appCounts[img.app] || 0) + 1;
    });
    appDistribution = Object.entries(appCounts)
      .map(([app, count]) => ({
        app,
        count,
        percentage: Math.round((count / totalImages) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Initialize enabled tools (all enabled by default)
    enabledTools = new Set(statistics.tool_stats.map((t) => t.tool));

    // Top users
    const userCounts: Record<
      string,
      { name: string; email: string; count: number }
    > = {};
    allImages.forEach((img) => {
      if (!userCounts[img.user_id]) {
        userCounts[img.user_id] = {
          name: img.user_name || img.user_email,
          email: img.user_email,
          count: 0,
        };
      }
      userCounts[img.user_id].count++;
    });
    topUsers = Object.entries(userCounts)
      .map(([user_id, data]) => ({ user_id, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Summary stats
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    summaryStats.today = allImages.filter(
      (img) =>
        new Date(img.created_at).toISOString().split("T")[0] === todayStr,
    ).length;

    summaryStats.thisWeek = allImages.filter(
      (img) => new Date(img.created_at) >= weekAgo,
    ).length;

    summaryStats.thisMonth = allImages.filter(
      (img) => new Date(img.created_at) >= monthAgo,
    ).length;

    // Average per day (last 30 days)
    const daysWithData = Object.keys(dailyActivity).length || 1;
    summaryStats.avgPerDay = Math.round(totalImages / daysWithData);

    // Peak day
    let peakDate = "";
    let peakCount = 0;
    Object.entries(dailyActivity).forEach(([date, count]) => {
      if (count > peakCount) {
        peakCount = count;
        peakDate = date;
      }
    });
    summaryStats.peakDay = { date: peakDate, count: peakCount };

    // Most active user
    if (topUsers.length > 0) {
      summaryStats.mostActiveUser = {
        name: topUsers[0].name,
        count: topUsers[0].count,
      };
    }

    // Most active tool
    if (toolDistribution.length > 0) {
      summaryStats.mostActiveTool = {
        name: toolDistribution[0].tool,
        count: toolDistribution[0].count,
      };
    }
  }

  // Generate heatmap data based on selected range
  function getHeatmapData(): Array<{
    date: string;
    count: number;
    weekday: number;
    week: number;
  }> {
    const data: Array<{
      date: string;
      count: number;
      weekday: number;
      week: number;
    }> = [];
    const today = new Date();
    const startDate = new Date(today);

    // Calculate days based on selected range
    let daysBack: number;
    switch (heatmapRange) {
      case "3months":
        daysBack = 90;
        break;
      case "6months":
        daysBack = 182;
        break;
      case "year":
        daysBack = 364;
        break;
      case "all":
        // Find the earliest date in dailyActivity
        const dates = Object.keys(dailyActivity).sort();
        if (dates.length > 0) {
          const earliest = new Date(dates[0]);
          daysBack = Math.ceil(
            (today.getTime() - earliest.getTime()) / (24 * 60 * 60 * 1000),
          );
        } else {
          daysBack = 364;
        }
        break;
      default:
        daysBack = 364;
    }

    startDate.setDate(startDate.getDate() - daysBack);

    // Find the start of the week for startDate
    const startWeekday = startDate.getDay();
    startDate.setDate(startDate.getDate() - startWeekday);

    let currentDate = new Date(startDate);
    let weekNum = 0;

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const weekday = currentDate.getDay();

      if (weekday === 0 && data.length > 0) {
        weekNum++;
      }

      data.push({
        date: dateStr,
        count: dailyActivity[dateStr] || 0,
        weekday,
        week: weekNum,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return data;
  }

  // Get number of weeks in heatmap based on range
  function getHeatmapWeeks(): number {
    switch (heatmapRange) {
      case "3months":
        return 14;
      case "6months":
        return 27;
      case "year":
        return 53;
      case "all":
        const dates = Object.keys(dailyActivity).sort();
        if (dates.length > 0) {
          const earliest = new Date(dates[0]);
          const today = new Date();
          const days = Math.ceil(
            (today.getTime() - earliest.getTime()) / (24 * 60 * 60 * 1000),
          );
          return Math.ceil(days / 7) + 2;
        }
        return 53;
      default:
        return 53;
    }
  }

  function getHeatmapColor(count: number): string {
    if (count === 0) return "#ebedf0";
    if (count <= 2) return "#9be9a8";
    if (count <= 5) return "#40c463";
    if (count <= 10) return "#30a14e";
    return "#216e39";
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatShortDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  // Timeline chart data
  function getTimelineData(): Array<{
    label: string;
    count: number;
    date: string;
  }> {
    if (!statistics) return [];

    const now = new Date();
    let startDate: Date;
    let groupBy: "day" | "week" | "month";

    switch (timeRange) {
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupBy = "day";
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        groupBy = "day";
        break;
      case "3months":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        groupBy = "week";
        break;
      case "year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        groupBy = "month";
        break;
      default:
        startDate = new Date(0);
        groupBy = "month";
    }

    const grouped: Record<string, number> = {};

    Object.entries(dailyActivity).forEach(([dateStr, count]) => {
      const date = new Date(dateStr);
      if (date < startDate) return;

      let key: string;
      if (groupBy === "day") {
        key = dateStr;
      } else if (groupBy === "week") {
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().split("T")[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }

      grouped[key] = (grouped[key] || 0) + count;
    });

    return Object.entries(grouped)
      .map(([date, count]) => ({
        label:
          groupBy === "month"
            ? new Date(date + "-01").toLocaleDateString("en-US", {
                month: "short",
                year: "2-digit",
              })
            : formatShortDate(date),
        count,
        date,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Get color for a tool
  function getToolColor(tool: string): string {
    if (toolColors[tool]) return toolColors[tool];
    // Assign a default color based on tool index
    const allTools = statistics?.tool_stats.map((t) => t.tool) || [];
    const index = allTools.indexOf(tool);
    const defaultKeys = Object.keys(toolColors).filter((k) =>
      k.startsWith("default-"),
    );
    return toolColors[defaultKeys[index % defaultKeys.length]] || "#888888";
  }

  // Toggle tool visibility in chart
  function toggleChartTool(tool: string) {
    enabledTools = new Set(enabledTools);
    if (enabledTools.has(tool)) {
      enabledTools.delete(tool);
    } else {
      enabledTools.add(tool);
    }
    enabledTools = new Set(enabledTools);
  }

  // Handle tool selection change from dropdown
  function handleToolSelectionChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedTools = new Set<string>();
    Array.from(select.selectedOptions).forEach((option) => {
      selectedTools.add(option.value);
    });
    enabledTools = selectedTools;
  }

  // Enable/disable all tools
  function toggleAllTools(enabled: boolean) {
    if (enabled && statistics) {
      enabledTools = new Set(statistics.tool_stats.map((t) => t.tool));
    } else {
      enabledTools = new Set();
    }
  }

  // Generate multi-tool chart data based on granularity and range
  function getMultiToolChartData(): ChartDataPoint[] {
    if (!statistics) return [];

    const now = new Date();
    let startDate: Date;

    // Determine date range
    switch (chartRange) {
      case "1d":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "1w":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "1m":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "3m":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }

    // Collect all images with their tools and timestamps
    const dataByTimestamp: Record<string, Record<string, number>> = {};
    const tools = statistics.tool_stats.map((t) => t.tool);

    // Process each tool's images
    Object.entries(statistics.images_by_tool).forEach(([tool, images]) => {
      images.forEach((img) => {
        const imgDate = new Date(img.created_at);
        // Only filter by date if not "all" range
        if (chartRange !== "all" && imgDate < startDate) return;

        let key: string;
        let label: string;

        switch (chartGranularity) {
          case "hour":
            key = `${imgDate.toISOString().split("T")[0]}T${String(imgDate.getHours()).padStart(2, "0")}:00`;
            label = imgDate.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
            break;
          case "day":
            key = imgDate.toISOString().split("T")[0];
            label = imgDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            break;
          case "week":
            const weekStart = new Date(imgDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            key = weekStart.toISOString().split("T")[0];
            label = `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
            break;
          case "month":
            key = `${imgDate.getFullYear()}-${String(imgDate.getMonth() + 1).padStart(2, "0")}`;
            label = imgDate.toLocaleDateString("en-US", {
              month: "short",
              year: "2-digit",
            });
            break;
          default:
            key = imgDate.toISOString().split("T")[0];
            label = imgDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
        }

        if (!dataByTimestamp[key]) {
          dataByTimestamp[key] = { __label__: label as unknown as number };
          tools.forEach((t) => (dataByTimestamp[key][t] = 0));
        }
        dataByTimestamp[key][tool] = (dataByTimestamp[key][tool] || 0) + 1;
      });
    });

    // Convert to array and sort
    return Object.entries(dataByTimestamp)
      .map(([timestamp, data]) => ({
        timestamp,
        label: String(data.__label__ || timestamp),
        tools: Object.fromEntries(
          Object.entries(data).filter(([k]) => k !== "__label__"),
        ) as Record<string, number>,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  // Helper functions from original code
  function toggleTool(tool: string) {
    expandedTools = new Set(expandedTools);
    if (expandedTools.has(tool)) {
      expandedTools.delete(tool);
    } else {
      expandedTools.add(tool);
    }
    expandedTools = new Set(expandedTools);
  }

  function loadMore(tool: string) {
    if (!statistics) return;
    const currentCount = visibleCounts[tool] || IMAGES_PER_PAGE;
    visibleCounts[tool] = currentCount + IMAGES_PER_PAGE;
    visibleCounts = visibleCounts;
  }

  function getVisibleImages(tool: string): ImageStat[] {
    if (!statistics) return [];
    const images = statistics.images_by_tool[tool] || [];
    const count = visibleCounts[tool] || IMAGES_PER_PAGE;
    return images.slice(0, count);
  }

  function hasMoreImages(tool: string): boolean {
    if (!statistics) return false;
    const images = statistics.images_by_tool[tool] || [];
    const count = visibleCounts[tool] || IMAGES_PER_PAGE;
    return images.length > count;
  }

  function getUserDisplayName(image: ImageStat): string {
    return image.user_name || image.user_email;
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
  }

  function getUserToolStats(): Array<{
    tool: string;
    user_id: string;
    user_email: string;
    user_name: string | null;
    count: number;
  }> {
    if (!statistics) return [];

    const userToolMap: Record<
      string,
      {
        tool: string;
        user_id: string;
        user_email: string;
        user_name: string | null;
        count: number;
      }
    > = {};

    Object.entries(statistics.images_by_tool).forEach(([tool, images]) => {
      images.forEach((image) => {
        const key = `${tool}::${image.user_id}`;
        if (!userToolMap[key]) {
          userToolMap[key] = {
            tool,
            user_id: image.user_id,
            user_email: image.user_email,
            user_name: image.user_name,
            count: 0,
          };
        }
        userToolMap[key].count++;
      });
    });

    return Object.values(userToolMap).sort((a, b) => b.count - a.count);
  }

  function toggleUserToolRow(tool: string, userId: string) {
    const key = `${tool}::${userId}`;
    expandedUserToolRows = new Set(expandedUserToolRows);
    if (expandedUserToolRows.has(key)) {
      expandedUserToolRows.delete(key);
    } else {
      expandedUserToolRows.add(key);
      if (!userToolImageCounts[key]) {
        userToolImageCounts[key] = IMAGES_PER_PAGE;
      }
    }
    expandedUserToolRows = new Set(expandedUserToolRows);
  }

  function isUserToolRowExpanded(tool: string, userId: string): boolean {
    return expandedUserToolRows.has(`${tool}::${userId}`);
  }

  function getUserToolImages(tool: string, userId: string): ImageStat[] {
    if (!statistics) return [];
    const images = statistics.images_by_tool[tool] || [];
    return images.filter((img) => img.user_id === userId);
  }

  function getVisibleUserToolImages(tool: string, userId: string): ImageStat[] {
    const key = `${tool}::${userId}`;
    const allImages = getUserToolImages(tool, userId);
    const count = userToolImageCounts[key] || IMAGES_PER_PAGE;
    return allImages.slice(0, count);
  }

  function hasMoreUserToolImages(tool: string, userId: string): boolean {
    const key = `${tool}::${userId}`;
    const allImages = getUserToolImages(tool, userId);
    const count = userToolImageCounts[key] || IMAGES_PER_PAGE;
    return allImages.length > count;
  }

  function loadMoreUserToolImages(tool: string, userId: string) {
    const key = `${tool}::${userId}`;
    const currentCount = userToolImageCounts[key] || IMAGES_PER_PAGE;
    userToolImageCounts[key] = currentCount + IMAGES_PER_PAGE;
    userToolImageCounts = userToolImageCounts;
  }

  function getVisibleToolImages(tool: string): ImageStat[] {
    if (!statistics) return [];
    const images = statistics.images_by_tool[tool] || [];
    const count = toolImageCounts[tool] || IMAGES_PER_PAGE;
    return images.slice(0, count);
  }

  function hasMoreToolImages(tool: string): boolean {
    if (!statistics) return false;
    const images = statistics.images_by_tool[tool] || [];
    const count = toolImageCounts[tool] || IMAGES_PER_PAGE;
    return images.length > count;
  }

  function loadMoreToolImages(tool: string) {
    const currentCount = toolImageCounts[tool] || IMAGES_PER_PAGE;
    toolImageCounts = {
      ...toolImageCounts,
      [tool]: currentCount + IMAGES_PER_PAGE,
    };
  }

  function openImageModal(image: ImageStat, tool: string) {
    imageModal = image;
    imageModalTool = tool;
  }

  function closeImageModal() {
    imageModal = null;
    imageModalTool = null;
  }

  function navigateToUser(userId: string, tool: string) {
    window.location.href = `/admin?userId=${encodeURIComponent(userId)}&tool=${encodeURIComponent(tool)}`;
  }

  $: timelineData = statistics ? getTimelineData() : [];
  $: maxTimelineValue = Math.max(...timelineData.map((d) => d.count), 1);
  $: heatmapData = statistics && heatmapRange ? getHeatmapData() : [];

  // Chart dimensions and state
  let chartContainer: HTMLDivElement | null = null;
  let chartWrapper: HTMLDivElement | null = null;
  let chartWidth = 1000;
  let chartHeight = 500;
  let hoveredPoint: {
    x: number;
    y: number;
    tooltipX: number;
    tooltipY: number;
    label: string;
    toolValues: Record<string, number>;
    color: string;
  } | null = null;

  // Update chart dimensions on mount and resize
  function updateChartDimensions() {
    if (chartWrapper) {
      const rect = chartWrapper.getBoundingClientRect();
      chartWidth = Math.max(800, rect.width - 40);
      chartHeight = 500;
    }
  }

  // Update chart dimensions when data or settings change
  $: if (chartWrapper) {
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
      updateChartDimensions();
    }, 0);
  }
  
  // Also update when chart data changes
  $: if (multiToolChartData.length > 0 && chartWrapper) {
    setTimeout(() => {
      updateChartDimensions();
    }, 0);
  }

  // Multi-tool chart reactive data - ensure it updates when dependencies change
  $: multiToolChartData = statistics && chartGranularity && chartRange
    ? getMultiToolChartData()
    : [];
  $: maxChartValue = Math.max(
    ...multiToolChartData.flatMap((d) =>
      Object.entries(d.tools)
        .filter(([tool]) => enabledTools.has(tool))
        .map(([, count]) => count),
    ),
    1,
  );
  $: allTools = statistics?.tool_stats.map((t) => t.tool) || [];

  // Get line points for a specific tool
  function getToolLinePoints(tool: string): string {
    if (multiToolChartData.length === 0) return "";
    
    const padding = 60;
    const chartAreaWidth = chartWidth - padding * 2;
    const chartAreaHeight = chartHeight - padding * 2;
    const stepX = chartAreaWidth / Math.max(multiToolChartData.length - 1, 1);
    
    return multiToolChartData
      .map((point, idx) => {
        const value = point.tools[tool] || 0;
        const x = padding + idx * stepX;
        const y = padding + chartAreaHeight - (value / maxChartValue) * chartAreaHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }

  // Get X-axis labels
  function getXAxisLabels(): string[] {
    if (multiToolChartData.length === 0) return [];
    const count = 6; // Show 6 labels
    const step = Math.max(1, Math.floor(multiToolChartData.length / (count - 1)));
    const labels: string[] = [];
    
    for (let i = 0; i < multiToolChartData.length; i += step) {
      labels.push(multiToolChartData[i].label);
    }
    // Always include the last label
    if (multiToolChartData.length > 0) {
      const lastLabel = multiToolChartData[multiToolChartData.length - 1].label;
      if (labels[labels.length - 1] !== lastLabel) {
        labels.push(lastLabel);
      }
    }
    return labels;
  }

  // Handle mouse move on chart
  function handleChartMouseMove(event: MouseEvent) {
    if (!chartContainer || !chartWrapper || multiToolChartData.length === 0) return;
    
    const wrapperRect = chartWrapper.getBoundingClientRect();
    const svgRect = chartContainer.getBoundingClientRect();
    
    // Get mouse position relative to SVG
    const mouseX = event.clientX - svgRect.left;
    const mouseY = event.clientY - svgRect.top;
    
    // Calculate SVG coordinates from viewBox
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    const scaleX = chartWidth / svgWidth;
    const scaleY = chartHeight / svgHeight;
    const svgX = mouseX * scaleX;
    const svgY = mouseY * scaleY;
    
    const padding = 60;
    const chartAreaWidth = chartWidth - padding * 2;
    const stepX = chartAreaWidth / Math.max(multiToolChartData.length - 1, 1);
    
    // Find closest data point
    const dataIndex = Math.round((svgX - padding) / stepX);
    const clampedIndex = Math.max(0, Math.min(dataIndex, multiToolChartData.length - 1));
    const point = multiToolChartData[clampedIndex];
    
    if (!point) return;
    
    // Find the tool with the highest value at this point
    let maxValue = 0;
    let maxTool = "";
    Object.entries(point.tools).forEach(([tool, value]) => {
      if (enabledTools.has(tool) && value > maxValue) {
        maxValue = value;
        maxTool = tool;
      }
    });
    
    if (maxTool) {
      const chartAreaHeight = chartHeight - padding * 2;
      const pointX = padding + clampedIndex * stepX;
      const pointY = padding + chartAreaHeight - (maxValue / maxChartValue) * chartAreaHeight;
      
      hoveredPoint = {
        x: pointX,
        y: pointY,
        tooltipX: event.clientX - wrapperRect.left,
        tooltipY: event.clientY - wrapperRect.top - 120,
        label: point.label,
        toolValues: point.tools,
        color: getToolColor(maxTool),
      };
    }
  }

  // Handle mouse leave
  function handleChartMouseLeave() {
    hoveredPoint = null;
  }
</script>

<div class="statistics-page">
  <div class="page-header">
    <h1>📊 Analytics Dashboard</h1>
    <button
      class="btn btn-secondary"
      on:click={loadStatistics}
      disabled={loading}
    >
      {loading ? "Loading..." : "🔄 Refresh"}
    </button>
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading statistics...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>❌ {error}</p>
      <button class="btn btn-primary" on:click={loadStatistics}>Retry</button>
    </div>
  {:else if statistics}
    <!-- Summary Cards -->
    <div class="summary-cards">
      <div class="summary-card">
        <div class="card-icon">📸</div>
        <div class="card-content">
          <div class="card-value">
            {statistics.total_images.toLocaleString()}
          </div>
          <div class="card-label">Total Images</div>
        </div>
      </div>
      <div class="summary-card">
        <div class="card-icon">📅</div>
        <div class="card-content">
          <div class="card-value">{summaryStats.today}</div>
          <div class="card-label">Today</div>
        </div>
      </div>
      <div class="summary-card">
        <div class="card-icon">📆</div>
        <div class="card-content">
          <div class="card-value">{summaryStats.thisWeek}</div>
          <div class="card-label">This Week</div>
        </div>
      </div>
      <div class="summary-card">
        <div class="card-icon">📊</div>
        <div class="card-content">
          <div class="card-value">{summaryStats.avgPerDay}</div>
          <div class="card-label">Avg/Day</div>
        </div>
      </div>
      <div class="summary-card highlight">
        <div class="card-icon">🏆</div>
        <div class="card-content">
          <div class="card-value">{summaryStats.peakDay.count}</div>
          <div class="card-label">
            Peak Day ({formatShortDate(summaryStats.peakDay.date)})
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs-container">
      <button
        class="tab-btn"
        class:active={activeTab === "overview"}
        on:click={() => (activeTab = "overview")}
      >
        📈 Overview
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === "user"}
        on:click={() => (activeTab = "user")}
      >
        👥 User Stats
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === "tool"}
        on:click={() => (activeTab = "tool")}
      >
        🛠️ Tool Stats
      </button>
    </div>

    {#if activeTab === "overview"}
      <!-- Activity Heatmap -->
      <section class="card">
        <div class="card-header">
          <div class="header-left">
            <h2>📅 Activity Heatmap</h2>
            <p class="card-subtitle">
              {#if heatmapRange === "3months"}
                Image generation activity over the past 3 months
              {:else if heatmapRange === "6months"}
                Image generation activity over the past 6 months
              {:else if heatmapRange === "year"}
                Image generation activity over the past year
              {:else}
                All-time image generation activity
              {/if}
            </p>
          </div>
          <div class="time-range-selector">
            <button
              class="range-btn"
              class:active={heatmapRange === "3months"}
              on:click={() => (heatmapRange = "3months")}>3 Months</button
            >
            <button
              class="range-btn"
              class:active={heatmapRange === "6months"}
              on:click={() => (heatmapRange = "6months")}>6 Months</button
            >
            <button
              class="range-btn"
              class:active={heatmapRange === "year"}
              on:click={() => (heatmapRange = "year")}>Year</button
            >
            <button
              class="range-btn"
              class:active={heatmapRange === "all"}
              on:click={() => (heatmapRange = "all")}>All</button
            >
          </div>
        </div>
        <div class="heatmap-container">
          <div class="heatmap-labels">
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
          </div>
          <div class="heatmap-grid">
            {#each { length: getHeatmapWeeks() } as _, weekIdx}
              <div class="heatmap-week">
                {#each { length: 7 } as _, dayIdx}
                  {@const cellData = heatmapData.find(
                    (d) => d.week === weekIdx && d.weekday === dayIdx,
                  )}
                  {#if cellData}
                    <div
                      class="heatmap-cell"
                      style="background-color: {getHeatmapColor(
                        cellData.count,
                      )}"
                      title="{cellData.date}: {cellData.count} images"
                    ></div>
                  {:else}
                    <div class="heatmap-cell empty"></div>
                  {/if}
                {/each}
              </div>
            {/each}
          </div>
          <div class="heatmap-legend">
            <span>Less</span>
            <div class="legend-cells">
              <div class="heatmap-cell" style="background-color: #ebedf0"></div>
              <div class="heatmap-cell" style="background-color: #9be9a8"></div>
              <div class="heatmap-cell" style="background-color: #40c463"></div>
              <div class="heatmap-cell" style="background-color: #30a14e"></div>
              <div class="heatmap-cell" style="background-color: #216e39"></div>
            </div>
            <span>More</span>
          </div>
        </div>
      </section>

      <!-- TradingView-Style Chart -->
      <section class="card chart-section">
        <div class="chart-header">
          <div class="chart-header-left">
            <h2>📈 Tool Usage Analytics</h2>
            <p class="chart-subtitle">Interactive tool usage over time</p>
          </div>
          <div class="chart-controls">
            <div class="control-group">
              <label class="control-label">Time Range:</label>
              <div class="time-range-selector">
                <button
                  class="range-btn"
                  class:active={chartRange === "1d"}
                  on:click={() => (chartRange = "1d")}>1D</button
                >
                <button
                  class="range-btn"
                  class:active={chartRange === "1w"}
                  on:click={() => (chartRange = "1w")}>1W</button
                >
                <button
                  class="range-btn"
                  class:active={chartRange === "1m"}
                  on:click={() => (chartRange = "1m")}>1M</button
                >
                <button
                  class="range-btn"
                  class:active={chartRange === "3m"}
                  on:click={() => (chartRange = "3m")}>3M</button
                >
                <button
                  class="range-btn"
                  class:active={chartRange === "1y"}
                  on:click={() => (chartRange = "1y")}>1Y</button
                >
                <button
                  class="range-btn"
                  class:active={chartRange === "all"}
                  on:click={() => (chartRange = "all")}>All</button
                >
              </div>
            </div>
            <div class="control-group">
              <label class="control-label">Granularity:</label>
              <div class="granularity-selector">
                <button
                  class="granularity-btn"
                  class:active={chartGranularity === "hour"}
                  on:click={() => (chartGranularity = "hour")}>Hour</button
                >
                <button
                  class="granularity-btn"
                  class:active={chartGranularity === "day"}
                  on:click={() => (chartGranularity = "day")}>Day</button
                >
                <button
                  class="granularity-btn"
                  class:active={chartGranularity === "week"}
                  on:click={() => (chartGranularity = "week")}>Week</button
                >
                <button
                  class="granularity-btn"
                  class:active={chartGranularity === "month"}
                  on:click={() => (chartGranularity = "month")}>Month</button
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Chart Container with Tool Selection -->
        <div class="chart-layout">
          <div class="chart-main">
            <div class="tradingview-chart-container">
          {#key `${chartRange}-${chartGranularity}`}
            {#if multiToolChartData.length > 0}
              <div
                class="chart-wrapper"
                bind:this={chartWrapper}
              >
              <svg
                class="chart-svg"
                viewBox="0 0 {chartWidth} {chartHeight}"
                preserveAspectRatio="xMidYMid meet"
                bind:this={chartContainer}
                on:mousemove={handleChartMouseMove}
                on:mouseleave={handleChartMouseLeave}
              >
                <!-- Grid lines -->
                {#each { length: 5 } as _, i}
                  {@const y = (i + 1) * (chartHeight / 6)}
                  <line
                    class="grid-line"
                    x1="0"
                    y1={y}
                    x2={chartWidth}
                    y2={y}
                  />
                {/each}

                <!-- Y-axis labels -->
                <g class="y-axis-labels">
                  {#each { length: 6 } as _, i}
                    {@const y = i * (chartHeight / 5)}
                    {@const value = Math.round(maxChartValue * (1 - i / 5))}
                    <text
                      class="axis-label"
                      x="5"
                      y={y + 5}
                      text-anchor="start"
                    >{value}</text>
                  {/each}
                </g>

                <!-- Tool lines -->
                {#each allTools as tool}
                  {#if enabledTools.has(tool)}
                    {@const points = getToolLinePoints(tool)}
                    {@const color = getToolColor(tool)}
                    {#if points.length > 0}
                      <polyline
                        class="chart-line"
                        points={points}
                        fill="none"
                        stroke={color}
                        stroke-width="2"
                        vector-effect="non-scaling-stroke"
                      />
                      <!-- Tool dots -->
                      {#each points.split(" ") as point, idx}
                        {@const [x, y] = point.split(",").map(Number)}
                        <circle
                          class="chart-dot"
                          cx={x}
                          cy={y}
                          r="3"
                          fill={color}
                          data-tool={tool}
                          data-index={idx}
                        />
                      {/each}
                    {/if}
                  {/if}
                {/each}

                <!-- Crosshair -->
                {#if hoveredPoint}
                  <line
                    class="crosshair-vertical"
                    x1={hoveredPoint.x}
                    y1="0"
                    x2={hoveredPoint.x}
                    y2={chartHeight}
                  />
                  <circle
                    class="crosshair-dot"
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r="5"
                    fill={hoveredPoint.color}
                    stroke="white"
                    stroke-width="2"
                  />
                {/if}
              </svg>

              <!-- X-axis labels -->
              <div class="x-axis-labels">
                {#each getXAxisLabels() as label, idx}
                  <span
                    class="x-axis-label"
                    style="left: {(idx / (getXAxisLabels().length - 1)) * 100}%"
                  >{label}</span>
                {/each}
              </div>

              <!-- Tooltip -->
              {#if hoveredPoint}
                <div
                  class="chart-tooltip"
                  style="left: {hoveredPoint.tooltipX}px; top: {hoveredPoint.tooltipY}px"
                >
                  <div class="tooltip-header">{hoveredPoint.label}</div>
                  {#each Object.entries(hoveredPoint.toolValues) as [tool, value]}
                    {#if enabledTools.has(tool) && value > 0}
                      <div class="tooltip-row">
                        <span
                          class="tooltip-color"
                          style="background-color: {getToolColor(tool)}"
                        ></span>
                        <span class="tooltip-tool">{tool}:</span>
                        <span class="tooltip-value">{value}</span>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
            {:else}
              <div class="empty-chart">No data for selected range</div>
            {/if}
          {/key}
            </div>
          </div>
          
          <!-- Tool Selection Sidebar -->
          <div class="tool-selection-sidebar">
            <div class="tool-selection-header-minimal">
              <span class="tool-selection-title">Tools</span>
              <span class="selected-count-minimal">{enabledTools.size}/{allTools.length}</span>
            </div>
            <select
              class="tool-dropdown-minimal"
              multiple
              size={Math.min(allTools.length, 12)}
              on:change={(e) => handleToolSelectionChange(e)}
            >
              {#each allTools as tool}
                {@const isEnabled = enabledTools.has(tool)}
                {@const count = statistics?.tool_stats.find((t) => t.tool === tool)?.count || 0}
                <option value={tool} selected={isEnabled}>
                  {tool} ({count.toLocaleString()})
                </option>
              {/each}
            </select>
            <div class="tool-selection-actions-minimal">
              <button
                class="btn-minimal"
                on:click={() => toggleAllTools(true)}>All</button
              >
              <button
                class="btn-minimal"
                on:click={() => toggleAllTools(false)}>None</button
              >
            </div>
          </div>
        </div>
      </section>

      <!-- Distribution Charts -->
      <div class="charts-grid">
        <!-- Tool Distribution -->
        <section class="card">
          <div class="card-header">
            <h2>🛠️ Tool Distribution</h2>
          </div>
          <div class="distribution-list">
            {#each toolDistribution as item}
              <div class="distribution-item">
                <div class="dist-info">
                  <span class="dist-name">{item.tool}</span>
                  <span class="dist-count">{item.count.toLocaleString()}</span>
                </div>
                <div class="dist-bar-bg">
                  <div class="dist-bar" style="width: {item.percentage}%"></div>
                </div>
                <span class="dist-percentage">{item.percentage}%</span>
              </div>
            {/each}
          </div>
        </section>

        <!-- App Distribution -->
        <section class="card">
          <div class="card-header">
            <h2>📱 App Distribution</h2>
          </div>
          <div class="distribution-list">
            {#each appDistribution as item}
              <div class="distribution-item">
                <div class="dist-info">
                  <span class="dist-name">{item.app}</span>
                  <span class="dist-count">{item.count.toLocaleString()}</span>
                </div>
                <div class="dist-bar-bg">
                  <div
                    class="dist-bar app-bar"
                    style="width: {item.percentage}%"
                  ></div>
                </div>
                <span class="dist-percentage">{item.percentage}%</span>
              </div>
            {/each}
          </div>
        </section>
      </div>

      <!-- Top Users -->
      <section class="card">
        <div class="card-header">
          <h2>🏅 Top Users</h2>
          <p class="card-subtitle">Most active content creators</p>
        </div>
        <div class="users-grid">
          {#each topUsers as user, idx}
            <div
              class="user-card"
              on:click={() => navigateToUser(user.user_id, "all")}
            >
              <div class="user-rank">#{idx + 1}</div>
              <div class="user-avatar">
                {user.name[0]?.toUpperCase() || "?"}
              </div>
              <div class="user-info">
                <div class="user-name">{user.name}</div>
                <div class="user-email">{user.email}</div>
              </div>
              <div class="user-count">{user.count.toLocaleString()} images</div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- User-Tool Analysis (existing code) -->
    {#if activeTab === "user"}
      <div class="analysis-section">
        <h2>User-Tool Analysis</h2>
        <p class="analysis-description">
          Overview of which users create images with which tools
        </p>
        <div class="analysis-table-container">
          <table class="analysis-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>User</th>
                <th>Images Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each getUserToolStats() as stat}
                {@const isExpanded = isUserToolRowExpanded(
                  stat.tool,
                  stat.user_id,
                )}
                <tr
                  class="analysis-row"
                  class:expanded={isExpanded}
                  on:click={() => navigateToUser(stat.user_id, stat.tool)}
                  role="button"
                  tabindex="0"
                  on:keydown={(e) =>
                    e.key === "Enter" &&
                    navigateToUser(stat.user_id, stat.tool)}
                >
                  <td class="tool-cell">
                    <span class="tool-badge">{stat.tool}</span>
                  </td>
                  <td class="user-cell">
                    <div class="table-user-info">
                      <div class="table-user-name">
                        {stat.user_name || stat.user_email}
                      </div>
                      <div class="table-user-email">{stat.user_email}</div>
                    </div>
                  </td>
                  <td class="count-cell">
                    <span class="count-value"
                      >{stat.count.toLocaleString()}</span
                    >
                  </td>
                  <td class="expand-cell">
                    <span class="expand-icon">{isExpanded ? "▼" : "▶"}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Tool Stats Gallery (existing code) -->
    {#if activeTab === "tool"}
      <div class="tool-stats-section">
        <h2>Tool Statistics</h2>
        <p class="analysis-description">Images generated by each tool</p>

        <div class="tools-gallery-container">
          {#each statistics.tool_stats as { tool, count }}
            {@const isExpanded = expandedTools.has(tool)}
            <div class="tool-gallery-section">
              <button
                class="tool-gallery-header"
                on:click={() => toggleTool(tool)}
              >
                <div class="tool-gallery-header-left">
                  <span class="tool-icon">{isExpanded ? "▼" : "▶"}</span>
                  <h3 class="tool-name">{tool}</h3>
                  <span class="tool-count">({count} images)</span>
                </div>
              </button>

              {#if isExpanded}
                {@const images = getVisibleToolImages(tool)}
                {@const allImages = statistics.images_by_tool[tool] || []}
                <div class="tool-gallery-content">
                  {#if images.length === 0}
                    <div class="empty-state">No images found</div>
                  {:else}
                    <div class="gallery-grid">
                      {#each images as image}
                        <div
                          class="gallery-item"
                          on:click={() => openImageModal(image, tool)}
                          title="Click to view full size"
                        >
                          <img
                            src={image.image_url}
                            alt="Generated"
                            loading="lazy"
                          />
                          <div class="gallery-overlay">
                            <div class="gallery-info">
                              <div class="gallery-date">
                                {formatDate(image.created_at)}
                              </div>
                              <div class="gallery-user">
                                {getUserDisplayName(image)}
                              </div>
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                    {#if hasMoreToolImages(tool)}
                      <div class="load-more-container">
                        <button
                          class="btn btn-secondary load-more-btn"
                          on:click={() => loadMoreToolImages(tool)}
                        >
                          Load More ({allImages.length - images.length} remaining)
                        </button>
                      </div>
                    {/if}
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Image Modal -->
{#if imageModal}
  <div class="modal-backdrop" on:click={closeImageModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeImageModal}>×</button>
      <div class="modal-body">
        <div class="modal-image-container">
          <img src={imageModal.image_url} alt="Full size" />
        </div>
        <div class="modal-info">
          <div class="modal-info-row">
            <strong>Tool:</strong>
            <span>{imageModalTool || "N/A"}</span>
          </div>
          <div class="modal-info-row">
            <strong>User:</strong>
            <span>{getUserDisplayName(imageModal)}</span>
          </div>
          <div class="modal-info-row">
            <strong>Email:</strong>
            <span>{imageModal.user_email}</span>
          </div>
          <div class="modal-info-row">
            <strong>Date:</strong>
            <span>{formatDate(imageModal.created_at)}</span>
          </div>
          {#if imageModal.batch_name}
            <div class="modal-info-row">
              <strong>Batch:</strong>
              <span>{imageModal.batch_name}</span>
            </div>
          {/if}
          <div class="modal-info-row">
            <strong>App:</strong>
            <span>{imageModal.app}</span>
          </div>
          <div class="modal-info-row">
            <strong>URL:</strong>
            <button
              type="button"
              class="url-button-modal"
              on:click={() => copyUrl(imageModal?.image_url || "")}
              title="Click to copy URL"
            >
              <span class="url-text-modal">{imageModal.image_url}</span>
              <span class="copy-hint">📋</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .statistics-page {
    padding: 24px;
    max-width: 1600px;
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

  /* Summary Cards */
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .summary-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .summary-card.highlight {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .summary-card.highlight .card-label {
    color: rgba(255, 255, 255, 0.8);
  }

  .card-icon {
    font-size: 32px;
  }

  .card-content {
    flex: 1;
  }

  .card-value {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.2;
  }

  .card-label {
    font-size: 13px;
    color: #6b7280;
    margin-top: 2px;
  }

  /* Tabs */
  .tabs-container {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    background: white;
    padding: 4px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    width: fit-content;
  }

  .tab-btn {
    padding: 10px 20px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    background: #f3f4f6;
    color: #1f2937;
  }

  .tab-btn.active {
    background: #2563eb;
    color: white;
  }

  /* Cards */
  .card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
  }

  .card-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .card-subtitle {
    font-size: 14px;
    color: #6b7280;
    margin: 4px 0 0 0;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Heatmap */
  .heatmap-container {
    overflow-x: auto;
  }

  .heatmap-labels {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 10px;
    color: #6b7280;
    margin-left: 0;
    height: 70px;
    justify-content: space-between;
    padding: 4px 0;
    position: absolute;
    left: 0;
  }

  .heatmap-grid {
    display: flex;
    gap: 3px;
    margin-left: 30px;
  }

  .heatmap-week {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .heatmap-cell {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .heatmap-cell:hover {
    transform: scale(1.2);
  }

  .heatmap-cell.empty {
    background: transparent;
  }

  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 11px;
    color: #6b7280;
    justify-content: flex-end;
  }

  .legend-cells {
    display: flex;
    gap: 2px;
  }

  /* Timeline Chart */
  .time-range-selector {
    display: flex;
    gap: 4px;
    background: #f3f4f6;
    padding: 4px;
    border-radius: 6px;
  }

  .range-btn {
    padding: 6px 12px;
    border: none;
    background: transparent;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .range-btn:hover {
    color: #1f2937;
  }

  .range-btn.active {
    background: white;
    color: #1f2937;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  /* TradingView-Style Chart */
  .chart-section {
    margin-bottom: 24px;
  }

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 20px;
  }

  .chart-header-left {
    flex: 1;
    min-width: 200px;
  }

  .chart-subtitle {
    font-size: 13px;
    color: #6b7280;
    margin: 4px 0 0 0;
  }

  .chart-controls {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .control-label {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .granularity-selector {
    display: flex;
    gap: 4px;
    background: #f3f4f6;
    padding: 4px;
    border-radius: 6px;
  }

  .granularity-btn {
    padding: 6px 12px;
    border: none;
    background: transparent;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .granularity-btn:hover {
    color: #1f2937;
  }

  .granularity-btn.active {
    background: white;
    color: #1f2937;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  /* Chart Layout */
  .chart-layout {
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }

  .chart-main {
    flex: 1;
    min-width: 0;
  }

  /* Tool Selection Sidebar */
  .tool-selection-sidebar {
    width: 220px;
    flex-shrink: 0;
    background: #f9fafb;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tool-selection-header-minimal {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .tool-selection-title {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .selected-count-minimal {
    font-size: 11px;
    color: #6b7280;
    background: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .tool-dropdown-minimal {
    width: 100%;
    padding: 6px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: white;
    font-size: 12px;
    color: #1f2937;
    cursor: pointer;
    font-family: inherit;
    flex: 1;
    min-height: 200px;
  }

  .tool-dropdown-minimal:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .tool-dropdown-minimal option {
    padding: 4px 6px;
    font-size: 11px;
  }

  .tool-dropdown-minimal option:checked {
    background: #eff6ff;
    color: #1e40af;
  }

  .tool-selection-actions-minimal {
    display: flex;
    gap: 6px;
  }

  .btn-minimal {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-minimal:hover {
    background: #f3f4f6;
    color: #1f2937;
  }

  /* Chart Container */
  .tradingview-chart-container {
    position: relative;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px;
    min-height: 600px;
  }

  .chart-wrapper {
    position: relative;
    width: 100%;
    height: 500px;
    overflow: visible;
    min-height: 500px;
  }

  .chart-svg {
    width: 100%;
    height: 100%;
    overflow: visible;
    display: block;
  }

  .grid-line {
    stroke: #e5e7eb;
    stroke-width: 1;
    stroke-dasharray: 2, 2;
  }

  .y-axis-labels {
    font-size: 11px;
    fill: #6b7280;
  }

  .axis-label {
    font-size: 11px;
    fill: #6b7280;
    font-weight: 500;
  }

  .chart-line {
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  .chart-dot {
    opacity: 0;
    transition: opacity 0.2s;
    cursor: pointer;
  }

  .chart-wrapper:hover .chart-dot {
    opacity: 0.6;
  }

  .chart-dot:hover {
    opacity: 1 !important;
    r: 5;
  }

  .crosshair-vertical {
    stroke: #9ca3af;
    stroke-width: 1;
    stroke-dasharray: 4, 4;
    pointer-events: none;
  }

  .crosshair-dot {
    pointer-events: none;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  }

  .x-axis-labels {
    position: absolute;
    bottom: 0;
    left: 60px;
    right: 60px;
    height: 30px;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
  }

  .x-axis-label {
    position: absolute;
    transform: translateX(-50%);
    font-size: 11px;
    color: #6b7280;
    white-space: nowrap;
  }

  /* Tooltip */
  .chart-tooltip {
    position: absolute;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 12px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    min-width: 200px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transform: translate(-50%, -100%);
    margin-top: -10px;
  }

  .tooltip-header {
    font-weight: 600;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .tooltip-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  .tooltip-color {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .tooltip-tool {
    flex: 1;
    color: rgba(255, 255, 255, 0.8);
  }

  .tooltip-value {
    font-weight: 600;
    color: white;
  }

  .empty-chart {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 500px;
    color: #9ca3af;
    font-size: 14px;
  }

  /* Distribution Charts */
  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 24px;
  }

  .distribution-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .distribution-item {
    display: grid;
    grid-template-columns: 1fr 200px 50px;
    align-items: center;
    gap: 12px;
  }

  .dist-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dist-name {
    font-weight: 500;
    color: #1f2937;
  }

  .dist-count {
    font-size: 13px;
    color: #6b7280;
  }

  .dist-bar-bg {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .dist-bar {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .dist-bar.app-bar {
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  }

  .dist-percentage {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    text-align: right;
  }

  /* Top Users */
  .users-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }

  .user-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: #f9fafb;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .user-card:hover {
    background: #f3f4f6;
    transform: translateY(-2px);
  }

  .user-rank {
    font-size: 14px;
    font-weight: 700;
    color: #9ca3af;
    min-width: 30px;
  }

  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 16px;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user-name,
  .table-user-name {
    font-weight: 500;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-email,
  .table-user-email {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-count {
    font-weight: 600;
    color: #667eea;
    white-space: nowrap;
  }

  /* Analysis Table */
  .analysis-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .analysis-section h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 8px 0;
  }

  .analysis-description {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 20px 0;
  }

  .analysis-table-container {
    overflow-x: auto;
  }

  .analysis-table {
    width: 100%;
    border-collapse: collapse;
  }

  .analysis-table th {
    text-align: left;
    padding: 12px 16px;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .analysis-row {
    cursor: pointer;
    transition: background 0.2s;
  }

  .analysis-row:hover {
    background: #f9fafb;
  }

  .analysis-row td {
    padding: 14px 16px;
    border-bottom: 1px solid #f3f4f6;
  }

  .tool-badge {
    display: inline-block;
    padding: 4px 10px;
    background: #e0e7ff;
    color: #3730a3;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .table-user-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .count-value {
    font-weight: 600;
    color: #1f2937;
  }

  .expand-icon {
    color: #9ca3af;
    font-size: 12px;
  }

  /* Tool Stats Section */
  .tool-stats-section {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .tool-stats-section h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 8px 0;
  }

  .tools-gallery-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 20px;
  }

  .tool-gallery-section {
    background: #f9fafb;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .tool-gallery-header {
    width: 100%;
    padding: 16px 20px;
    border: none;
    background: #f9fafb;
    cursor: pointer;
    transition: background 0.2s;
    text-align: left;
  }

  .tool-gallery-header:hover {
    background: #f3f4f6;
  }

  .tool-gallery-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tool-icon {
    color: #6b7280;
    font-size: 12px;
  }

  .tool-name {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .tool-count {
    font-size: 14px;
    color: #6b7280;
  }

  .tool-gallery-content {
    padding: 20px;
    background: white;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
  }

  .gallery-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    background: #f3f4f6;
    border: 2px solid transparent;
    transition: all 0.2s;
  }

  .gallery-item:hover {
    border-color: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .gallery-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .gallery-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
    padding: 12px;
    color: white;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .gallery-item:hover .gallery-overlay {
    opacity: 1;
  }

  .gallery-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gallery-date {
    font-weight: 500;
  }

  .gallery-user {
    opacity: 0.9;
    font-size: 10px;
  }

  .load-more-container {
    text-align: center;
    margin-top: 20px;
  }

  .load-more-btn {
    padding: 10px 24px;
  }

  .empty-state {
    text-align: center;
    padding: 40px;
    color: #9ca3af;
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

  .btn-secondary {
    background: white;
    border: 1px solid #e5e7eb;
    color: #374151;
  }

  .btn-secondary:hover {
    background: #f9fafb;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Loading/Error States */
  .loading-state,
  .error-state {
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

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal-content {
    position: relative;
    background: white;
    border-radius: 12px;
    padding: 20px;
    max-width: 95vw;
    max-height: 95vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  .modal-body {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    flex: 1;
    min-height: 0;
  }

  .modal-image-container {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    max-height: 85vh;
    overflow: hidden;
  }

  .modal-image-container img {
    max-width: 100%;
    max-height: 85vh;
    height: auto;
    width: auto;
    object-fit: contain;
    border-radius: 8px;
  }

  .modal-close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 40px;
    height: 40px;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    font-size: 30px;
    line-height: 1;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close:hover {
    background: rgba(0, 0, 0, 0.7);
  }

  .modal-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 300px;
    max-width: 400px;
    flex-shrink: 0;
  }

  .modal-info-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .modal-info-row strong {
    min-width: 80px;
    color: #6b7280;
    font-weight: 600;
  }

  .modal-info-row span {
    color: #1f2937;
  }

  .url-button-modal {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    border: none;
    background: transparent;
    padding: 0;
    text-align: left;
    font-family: monospace;
    font-size: 12px;
    flex: 1;
    min-width: 0;
  }

  .url-text-modal {
    color: #2563eb;
    text-decoration: underline;
    word-break: break-all;
    flex: 1;
    min-width: 0;
  }

  .copy-hint {
    opacity: 0.7;
  }

  @media (max-width: 768px) {
    .chart-layout {
      flex-direction: column;
    }

    .tool-selection-sidebar {
      width: 100%;
    }

    .modal-body {
      flex-direction: column;
    }

    .modal-image-container {
      max-height: 50vh;
    }

    .modal-image-container img {
      max-height: 50vh;
    }

    .modal-info {
      max-width: 100%;
      min-width: 0;
    }

    .charts-grid {
      grid-template-columns: 1fr;
    }

    .distribution-item {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .dist-bar-bg {
      width: 100%;
    }
  }
</style>
