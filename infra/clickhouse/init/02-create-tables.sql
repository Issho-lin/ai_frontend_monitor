--
-- Core RUM events detail table
-- Partitioned by day, sorted for common query patterns
-- TTL 90 days per architecture spec §14.2
--

CREATE TABLE IF NOT EXISTS afm.rum_events
(
    event_id           String,
    project_id         LowCardinality(String),
    env                LowCardinality(String),
    event_type         LowCardinality(String),
    timestamp          DateTime64(3, 'Asia/Shanghai'),
    page_url           String,
    route              String,
    route_hash         String,
    release            String,
    session_id         String,
    user_id_hash       String,
    device_type        LowCardinality(String),
    os                 LowCardinality(String),
    browser            LowCardinality(String),
    network_type       LowCardinality(String),
    country            LowCardinality(String),
    metric_name        String,
    metric_value       Float64,
    api_route          String,
    resource_type      LowCardinality(String),
    resource_url       String,
    resource_size      UInt64,
    duration           Float64,
    status_code        UInt16,
    error_name         String,
    error_stack_hash   String,
    lcp_element        String,
    trace_id           String,
    sample_rate        Float32,
    sdk_version        LowCardinality(String),
    attributes         JSON
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (project_id, toStartOfMinute(timestamp), event_type, route, event_id)
TTL timestamp + INTERVAL 90 DAY
TO VOLUME 'default';

--
-- 1-minute aggregation materialized view (auto-populated from rum_events)
-- Uses SummingMergeTree to aggregate repeated (project_id, env, minute, ...) groups
--

CREATE MATERIALIZED VIEW IF NOT EXISTS afm.rum_metrics_1m
ENGINE = SummingMergeTree
ORDER BY (project_id, env, toStartOfMinute(timestamp), event_type, route, metric_name)
AS SELECT
    project_id,
    env,
    toStartOfMinute(timestamp) AS minute,
    event_type,
    route,
    metric_name,
    avg(metric_value) AS avg_value,
    quantile(0.5)(metric_value) AS p50_value,
    quantile(0.75)(metric_value) AS p75_value,
    quantile(0.95)(metric_value) AS p95_value,
    count() AS sample_count
FROM afm.rum_events
GROUP BY
    project_id, env, minute, event_type, route, metric_name;

--
-- 1-hour aggregation materialized view
--

CREATE MATERIALIZED VIEW IF NOT EXISTS afm.rum_metrics_1h
ENGINE = SummingMergeTree
ORDER BY (project_id, env, toStartOfHour(timestamp), event_type, route, metric_name)
AS SELECT
    project_id,
    env,
    toStartOfHour(timestamp) AS hour,
    event_type,
    route,
    metric_name,
    avg(metric_value) AS avg_value,
    quantile(0.5)(metric_value) AS p50_value,
    quantile(0.75)(metric_value) AS p75_value,
    quantile(0.95)(metric_value) AS p95_value,
    count() AS sample_count
FROM afm.rum_events
GROUP BY
    project_id, env, hour, event_type, route, metric_name;

--
-- Error aggregation table (AggregatingMergeTree for rollup summaries)
--

CREATE TABLE IF NOT EXISTS afm.rum_errors_grouped
(
    project_id         LowCardinality(String),
    env                LowCardinality(String),
    route              String,
    release            String,
    error_name         String,
    error_stack_hash   String,
    error_count        UInt64,
    affected_users     UInt64,
    first_seen         DateTime,
    last_seen          DateTime
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, error_stack_hash, release)
TTL last_seen + INTERVAL 90 DAY;

--
-- Resource aggregation table
--

CREATE TABLE IF NOT EXISTS afm.rum_resources_grouped
(
    project_id         LowCardinality(String),
    env                LowCardinality(String),
    route              String,
    resource_url       String,
    resource_type      LowCardinality(String),
    release            String,
    total_requests     UInt64,
    failed_requests    UInt64,
    avg_size           UInt64,
    avg_duration       Float64,
    first_seen         DateTime,
    last_seen          DateTime
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, resource_url, resource_type, release)
TTL last_seen + INTERVAL 90 DAY;

--
-- API aggregation table
--

CREATE TABLE IF NOT EXISTS afm.rum_api_grouped
(
    project_id         LowCardinality(String),
    env                LowCardinality(String),
    api_route          String,
    release            String,
    status_code        UInt16,
    total_requests     UInt64,
    error_requests     UInt64,
    avg_duration       Float64,
    p95_duration       Float64,
    first_seen         DateTime,
    last_seen          DateTime
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, api_route, release, status_code)
TTL last_seen + INTERVAL 90 DAY;
