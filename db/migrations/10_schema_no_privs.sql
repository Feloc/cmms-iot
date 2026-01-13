--
-- PostgreSQL database dump
--

-- Dumped from database version 15.10
-- Dumped by pg_dump version 15.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: timescaledb; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "timescaledb" WITH SCHEMA "public";


--
-- Name: timeseries; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "timeseries";


--
-- Name: AssetCriticality; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."AssetCriticality" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH'
);


--
-- Name: AssetStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."AssetStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'DECOMMISSIONED'
);


--
-- Name: AssignmentRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."AssignmentRole" AS ENUM (
    'TECHNICIAN',
    'SUPERVISOR'
);


--
-- Name: AssignmentState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."AssignmentState" AS ENUM (
    'ACTIVE',
    'REMOVED'
);


--
-- Name: AttachmentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."AttachmentType" AS ENUM (
    'IMAGE',
    'VIDEO',
    'AUDIO',
    'DOCUMENT'
);


--
-- Name: DeviceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."DeviceStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'MAINTENANCE'
);


--
-- Name: DeviceType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."DeviceType" AS ENUM (
    'ARDUINO_NANO_33_IOT',
    'GENERIC_MCU',
    'EDGE_GATEWAY'
);


--
-- Name: EventStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."EventStatus" AS ENUM (
    'OPEN',
    'ACK',
    'CLOSED'
);


--
-- Name: ImportStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."ImportStatus" AS ENUM (
    'PENDING',
    'COMMITTED',
    'EXPIRED',
    'FAILED'
);


--
-- Name: MeasurementPhase; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."MeasurementPhase" AS ENUM (
    'BEFORE',
    'AFTER',
    'OTHER'
);


--
-- Name: NoticeCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."NoticeCategory" AS ENUM (
    'INCIDENT',
    'MAINT_LOG',
    'CONSUMABLE_CHANGE',
    'INSPECTION',
    'OTHER'
);


--
-- Name: NoticeSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."NoticeSource" AS ENUM (
    'RULE',
    'MANUAL',
    'IMPORT'
);


--
-- Name: NoticeStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."NoticeStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."Role" AS ENUM (
    'ADMIN',
    'TECH',
    'VIEWER'
);


--
-- Name: RuleKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."RuleKind" AS ENUM (
    'THRESHOLD',
    'ROC',
    'WINDOW_AVG'
);


--
-- Name: ServiceOrderType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."ServiceOrderType" AS ENUM (
    'ALISTAMIENTO',
    'DIAGNOSTICO',
    'PREVENTIVO',
    'CORRECTIVO',
    'ENTREGA',
    'OTRO'
);


--
-- Name: Severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."Severity" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);


--
-- Name: WorkLogSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."WorkLogSource" AS ENUM (
    'MANUAL',
    'IMPORT',
    'IOT'
);


--
-- Name: WorkOrderKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."WorkOrderKind" AS ENUM (
    'WORK_ORDER',
    'SERVICE_ORDER'
);


--
-- Name: WorkOrderPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."WorkOrderPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);


--
-- Name: WorkOrderStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."WorkOrderStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'ON_HOLD',
    'COMPLETED',
    'CANCELED',
    'CLOSED',
    'SCHEDULED'
);


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: _compressed_hypertable_2; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_compressed_hypertable_2" (
);


--
-- Name: telemetry; Type: TABLE; Schema: timeseries; Owner: -
--

CREATE TABLE "timeseries"."telemetry" (
    "tenant_id" "text" NOT NULL,
    "device_id" "text" NOT NULL,
    "ts" timestamp with time zone NOT NULL,
    "metric" "text" NOT NULL,
    "value_double" double precision,
    "value_bool" boolean,
    "value_text" "text",
    "unit" "text",
    "quality" "text",
    "attrs" "jsonb"
);


--
-- Name: _direct_view_3; Type: VIEW; Schema: _timescaledb_internal; Owner: -
--

CREATE VIEW "_timescaledb_internal"."_direct_view_3" AS
 SELECT "telemetry"."tenant_id",
    "telemetry"."device_id",
    "telemetry"."metric",
    "public"."time_bucket"('00:05:00'::interval, "telemetry"."ts") AS "bucket",
    "count"(*) AS "n",
    "min"("telemetry"."value_double") AS "v_min",
    "max"("telemetry"."value_double") AS "v_max",
    "avg"("telemetry"."value_double") AS "v_avg",
    "public"."last"("telemetry"."value_double", "telemetry"."ts") AS "v_last"
   FROM "timeseries"."telemetry"
  WHERE ("telemetry"."value_double" IS NOT NULL)
  GROUP BY "telemetry"."tenant_id", "telemetry"."device_id", "telemetry"."metric", ("public"."time_bucket"('00:05:00'::interval, "telemetry"."ts"));


--
-- Name: _hyper_1_11_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_hyper_1_11_chunk" (
    CONSTRAINT "constraint_7" CHECK ((("ts" >= '2025-12-14 00:00:00+00'::timestamp with time zone) AND ("ts" < '2025-12-15 00:00:00+00'::timestamp with time zone)))
)
INHERITS ("timeseries"."telemetry");


--
-- Name: _hyper_1_1_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_hyper_1_1_chunk" (
    CONSTRAINT "constraint_1" CHECK ((("ts" >= '2025-09-30 00:00:00+00'::timestamp with time zone) AND ("ts" < '2025-10-01 00:00:00+00'::timestamp with time zone)))
)
INHERITS ("timeseries"."telemetry");


--
-- Name: _hyper_1_4_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_hyper_1_4_chunk" (
    CONSTRAINT "constraint_3" CHECK ((("ts" >= '1970-01-02 00:00:00+00'::timestamp with time zone) AND ("ts" < '1970-01-03 00:00:00+00'::timestamp with time zone)))
)
INHERITS ("timeseries"."telemetry");


--
-- Name: _hyper_1_6_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_hyper_1_6_chunk" (
    CONSTRAINT "constraint_4" CHECK ((("ts" >= '1970-01-01 00:00:00+00'::timestamp with time zone) AND ("ts" < '1970-01-02 00:00:00+00'::timestamp with time zone)))
)
INHERITS ("timeseries"."telemetry");


--
-- Name: _hyper_1_7_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_hyper_1_7_chunk" (
    CONSTRAINT "constraint_5" CHECK ((("ts" >= '1970-02-19 00:00:00+00'::timestamp with time zone) AND ("ts" < '1970-02-20 00:00:00+00'::timestamp with time zone)))
)
INHERITS ("timeseries"."telemetry");


--
-- Name: _hyper_1_8_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_hyper_1_8_chunk" (
    CONSTRAINT "constraint_6" CHECK ((("ts" >= '2105-01-14 00:00:00+00'::timestamp with time zone) AND ("ts" < '2105-01-15 00:00:00+00'::timestamp with time zone)))
)
INHERITS ("timeseries"."telemetry");


--
-- Name: _materialized_hypertable_3; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_materialized_hypertable_3" (
    "tenant_id" "text",
    "device_id" "text",
    "metric" "text",
    "bucket" timestamp with time zone NOT NULL,
    "n" bigint,
    "v_min" double precision,
    "v_max" double precision,
    "v_avg" double precision,
    "v_last" double precision
);


--
-- Name: _hyper_3_12_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_hyper_3_12_chunk" (
    CONSTRAINT "constraint_8" CHECK ((("bucket" >= '2025-12-08 00:00:00+00'::timestamp with time zone) AND ("bucket" < '2025-12-18 00:00:00+00'::timestamp with time zone)))
)
INHERITS ("_timescaledb_internal"."_materialized_hypertable_3");


--
-- Name: _hyper_3_2_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."_hyper_3_2_chunk" (
    CONSTRAINT "constraint_2" CHECK ((("bucket" >= '2025-09-29 00:00:00+00'::timestamp with time zone) AND ("bucket" < '2025-10-09 00:00:00+00'::timestamp with time zone)))
)
INHERITS ("_timescaledb_internal"."_materialized_hypertable_3");


--
-- Name: _partial_view_3; Type: VIEW; Schema: _timescaledb_internal; Owner: -
--

CREATE VIEW "_timescaledb_internal"."_partial_view_3" AS
 SELECT "telemetry"."tenant_id",
    "telemetry"."device_id",
    "telemetry"."metric",
    "public"."time_bucket"('00:05:00'::interval, "telemetry"."ts") AS "bucket",
    "count"(*) AS "n",
    "min"("telemetry"."value_double") AS "v_min",
    "max"("telemetry"."value_double") AS "v_max",
    "avg"("telemetry"."value_double") AS "v_avg",
    "public"."last"("telemetry"."value_double", "telemetry"."ts") AS "v_last"
   FROM "timeseries"."telemetry"
  WHERE ("telemetry"."value_double" IS NOT NULL)
  GROUP BY "telemetry"."tenant_id", "telemetry"."device_id", "telemetry"."metric", ("public"."time_bucket"('00:05:00'::interval, "telemetry"."ts"));


--
-- Name: compress_hyper_2_10_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."compress_hyper_2_10_chunk" (
    "_ts_meta_count" integer,
    "tenant_id" "text",
    "device_id" "text",
    "metric" "text",
    "_ts_meta_min_1" timestamp with time zone,
    "_ts_meta_max_1" timestamp with time zone,
    "ts" "_timescaledb_internal"."compressed_data",
    "value_double" "_timescaledb_internal"."compressed_data",
    "value_bool" "_timescaledb_internal"."compressed_data",
    "value_text" "_timescaledb_internal"."compressed_data",
    "unit" "_timescaledb_internal"."compressed_data",
    "quality" "_timescaledb_internal"."compressed_data",
    "attrs" "_timescaledb_internal"."compressed_data"
)
WITH ("toast_tuple_target"='128');
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "_ts_meta_count" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "tenant_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "device_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "metric" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "_ts_meta_min_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "_ts_meta_max_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "ts" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "value_double" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "value_bool" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "value_bool" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "value_text" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "value_text" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "unit" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "unit" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "quality" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "quality" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "attrs" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_10_chunk" ALTER COLUMN "attrs" SET STORAGE EXTENDED;


--
-- Name: compress_hyper_2_13_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."compress_hyper_2_13_chunk" (
    "_ts_meta_count" integer,
    "tenant_id" "text",
    "device_id" "text",
    "metric" "text",
    "_ts_meta_min_1" timestamp with time zone,
    "_ts_meta_max_1" timestamp with time zone,
    "ts" "_timescaledb_internal"."compressed_data",
    "value_double" "_timescaledb_internal"."compressed_data",
    "value_bool" "_timescaledb_internal"."compressed_data",
    "value_text" "_timescaledb_internal"."compressed_data",
    "unit" "_timescaledb_internal"."compressed_data",
    "quality" "_timescaledb_internal"."compressed_data",
    "attrs" "_timescaledb_internal"."compressed_data"
)
WITH ("toast_tuple_target"='128');
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "_ts_meta_count" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "tenant_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "device_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "metric" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "_ts_meta_min_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "_ts_meta_max_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "ts" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "value_double" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "value_bool" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "value_bool" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "value_text" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "value_text" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "unit" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "unit" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "quality" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "quality" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "attrs" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_13_chunk" ALTER COLUMN "attrs" SET STORAGE EXTENDED;


--
-- Name: compress_hyper_2_3_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."compress_hyper_2_3_chunk" (
    "_ts_meta_count" integer,
    "tenant_id" "text",
    "device_id" "text",
    "metric" "text",
    "_ts_meta_min_1" timestamp with time zone,
    "_ts_meta_max_1" timestamp with time zone,
    "ts" "_timescaledb_internal"."compressed_data",
    "value_double" "_timescaledb_internal"."compressed_data",
    "value_bool" "_timescaledb_internal"."compressed_data",
    "value_text" "_timescaledb_internal"."compressed_data",
    "unit" "_timescaledb_internal"."compressed_data",
    "quality" "_timescaledb_internal"."compressed_data",
    "attrs" "_timescaledb_internal"."compressed_data"
)
WITH ("toast_tuple_target"='128');
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "_ts_meta_count" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "tenant_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "device_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "metric" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "_ts_meta_min_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "_ts_meta_max_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "ts" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "value_double" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "value_bool" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "value_bool" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "value_text" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "value_text" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "unit" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "unit" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "quality" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "quality" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "attrs" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_3_chunk" ALTER COLUMN "attrs" SET STORAGE EXTENDED;


--
-- Name: compress_hyper_2_5_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."compress_hyper_2_5_chunk" (
    "_ts_meta_count" integer,
    "tenant_id" "text",
    "device_id" "text",
    "metric" "text",
    "_ts_meta_min_1" timestamp with time zone,
    "_ts_meta_max_1" timestamp with time zone,
    "ts" "_timescaledb_internal"."compressed_data",
    "value_double" "_timescaledb_internal"."compressed_data",
    "value_bool" "_timescaledb_internal"."compressed_data",
    "value_text" "_timescaledb_internal"."compressed_data",
    "unit" "_timescaledb_internal"."compressed_data",
    "quality" "_timescaledb_internal"."compressed_data",
    "attrs" "_timescaledb_internal"."compressed_data"
)
WITH ("toast_tuple_target"='128');
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "_ts_meta_count" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "tenant_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "device_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "metric" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "_ts_meta_min_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "_ts_meta_max_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "ts" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "value_double" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "value_bool" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "value_bool" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "value_text" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "value_text" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "unit" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "unit" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "quality" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "quality" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "attrs" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_5_chunk" ALTER COLUMN "attrs" SET STORAGE EXTENDED;


--
-- Name: compress_hyper_2_9_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE "_timescaledb_internal"."compress_hyper_2_9_chunk" (
    "_ts_meta_count" integer,
    "tenant_id" "text",
    "device_id" "text",
    "metric" "text",
    "_ts_meta_min_1" timestamp with time zone,
    "_ts_meta_max_1" timestamp with time zone,
    "ts" "_timescaledb_internal"."compressed_data",
    "value_double" "_timescaledb_internal"."compressed_data",
    "value_bool" "_timescaledb_internal"."compressed_data",
    "value_text" "_timescaledb_internal"."compressed_data",
    "unit" "_timescaledb_internal"."compressed_data",
    "quality" "_timescaledb_internal"."compressed_data",
    "attrs" "_timescaledb_internal"."compressed_data"
)
WITH ("toast_tuple_target"='128');
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "_ts_meta_count" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "tenant_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "device_id" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "metric" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "_ts_meta_min_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "_ts_meta_max_1" SET STATISTICS 1000;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "ts" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "value_double" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "value_bool" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "value_bool" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "value_text" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "value_text" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "unit" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "unit" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "quality" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "quality" SET STORAGE EXTENDED;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "attrs" SET STATISTICS 0;
ALTER TABLE ONLY "_timescaledb_internal"."compress_hyper_2_9_chunk" ALTER COLUMN "attrs" SET STORAGE EXTENDED;


--
-- Name: Alert; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Alert" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "assetCode" "text" NOT NULL,
    "sensor" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Asset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Asset" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "acquiredOn" timestamp(3) without time zone,
    "assetTopicPrefix" "text",
    "barcode" "text",
    "brand" "text",
    "categoryId" "text",
    "criticality" "public"."AssetCriticality" DEFAULT 'MEDIUM'::"public"."AssetCriticality" NOT NULL,
    "defaultRuleSetId" "text",
    "ingestKey" "text",
    "locationId" "text",
    "model" "text",
    "nominalPower" double precision,
    "nominalPowerUnit" "text",
    "parentAssetId" "text",
    "qrCodeData" "text",
    "serialNumber" "text",
    "slug" "text",
    "status" "public"."AssetStatus" DEFAULT 'ACTIVE'::"public"."AssetStatus" NOT NULL,
    "supplierId" "text",
    "customer" "text"
);

ALTER TABLE ONLY "public"."Asset" FORCE ROW LEVEL SECURITY;


--
-- Name: AssetEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."AssetEvent" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "assetId" "text" NOT NULL,
    "deviceId" "text",
    "ruleId" "text",
    "message" "text" NOT NULL,
    "severity" "public"."Severity" DEFAULT 'MEDIUM'::"public"."Severity" NOT NULL,
    "status" "public"."EventStatus" DEFAULT 'OPEN'::"public"."EventStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "closedAt" timestamp(3) without time zone
);


--
-- Name: AssetImportUpload; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."AssetImportUpload" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "originalName" "text" NOT NULL,
    "mimeType" "text" NOT NULL,
    "size" integer NOT NULL,
    "sha256" "text" NOT NULL,
    "storagePath" "text" NOT NULL,
    "status" "public"."ImportStatus" DEFAULT 'PENDING'::"public"."ImportStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone
);

ALTER TABLE ONLY "public"."AssetImportUpload" FORCE ROW LEVEL SECURITY;


--
-- Name: Attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Attachment" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "workOrderId" "text",
    "type" "public"."AttachmentType" NOT NULL,
    "filename" "text" NOT NULL,
    "mimeType" "text" NOT NULL,
    "size" integer NOT NULL,
    "url" "text" NOT NULL,
    "createdBy" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "assetId" "text",
    CONSTRAINT "attachment_owner_not_null_ck" CHECK ((("workOrderId" IS NOT NULL) OR ("assetId" IS NOT NULL)))
);

ALTER TABLE ONLY "public"."Attachment" FORCE ROW LEVEL SECURITY;


--
-- Name: CauseCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."CauseCode" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "assetType" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Device; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Device" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "public"."DeviceStatus" DEFAULT 'ACTIVE'::"public"."DeviceStatus" NOT NULL,
    "ingestKey" "text" NOT NULL,
    "assetId" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "lastSeenAt" timestamp(3) without time zone,
    "manufacturer" "text",
    "model" "text"
);


--
-- Name: InventoryItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."InventoryItem" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "qty" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Notice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Notice" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "source" "public"."NoticeSource" NOT NULL,
    "alertId" "text",
    "assetCode" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "category" "public"."NoticeCategory",
    "severity" "public"."Severity",
    "status" "public"."NoticeStatus" DEFAULT 'OPEN'::"public"."NoticeStatus" NOT NULL,
    "createdByUserId" "text" NOT NULL,
    "assignedToUserId" "text",
    "dueDate" timestamp(3) without time zone,
    "startedAt" timestamp(3) without time zone,
    "resolvedAt" timestamp(3) without time zone,
    "downtimeMin" integer,
    "tags" "text"[] DEFAULT ARRAY[]::"text"[],
    "attachments" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PmPlan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PmPlan" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "name" "text" NOT NULL,
    "intervalHours" integer,
    "checklist" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "defaultDurationMin" integer DEFAULT 60 NOT NULL,
    "description" "text"
);


--
-- Name: RemedyCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RemedyCode" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "assetType" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Rule" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "assetId" "text",
    "deviceId" "text",
    "kind" "public"."RuleKind" NOT NULL,
    "metric" "text" NOT NULL,
    "name" "text" NOT NULL,
    "params" "jsonb" NOT NULL,
    "severity" "public"."Severity" DEFAULT 'MEDIUM'::"public"."Severity" NOT NULL
);


--
-- Name: RuleState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RuleState" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "ruleId" "text" NOT NULL,
    "status" "text" DEFAULT 'NORMAL'::"text" NOT NULL,
    "lastChangeAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "data" "jsonb"
);


--
-- Name: ServiceOrderPart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ServiceOrderPart" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "workOrderId" "text" NOT NULL,
    "inventoryItemId" "text",
    "freeText" "text",
    "qty" double precision DEFAULT 1 NOT NULL,
    "notes" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: SymptomCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."SymptomCode" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "assetType" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Tenant" (
    "id" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."User" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "email" "text" NOT NULL,
    "password" "text" NOT NULL,
    "role" "public"."Role" DEFAULT 'ADMIN'::"public"."Role" NOT NULL,
    "name" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: WOAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."WOAssignment" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "workOrderId" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "role" "public"."AssignmentRole" DEFAULT 'TECHNICIAN'::"public"."AssignmentRole" NOT NULL,
    "state" "public"."AssignmentState" DEFAULT 'ACTIVE'::"public"."AssignmentState" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "note" "text"
);


--
-- Name: WorkLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."WorkLog" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "workOrderId" "text" NOT NULL,
    "userId" "text" NOT NULL,
    "startedAt" timestamp(3) without time zone NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "source" "public"."WorkLogSource" DEFAULT 'MANUAL'::"public"."WorkLogSource" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "note" "text"
);


--
-- Name: WorkMeasurement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."WorkMeasurement" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "workOrderId" "text" NOT NULL,
    "type" "text" NOT NULL,
    "valueNumeric" double precision,
    "valueText" "text",
    "unit" "text",
    "phase" "public"."MeasurementPhase" DEFAULT 'OTHER'::"public"."MeasurementPhase" NOT NULL,
    "takenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdByUserId" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: WorkNote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."WorkNote" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "workOrderId" "text" NOT NULL,
    "note" "text" NOT NULL,
    "addedByUserId" "text" NOT NULL,
    "addedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: WorkOrder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."WorkOrder" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "noticeId" "text",
    "assetCode" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "dueDate" timestamp(3) without time zone,
    "priority" "public"."WorkOrderPriority",
    "status" "public"."WorkOrderStatus" DEFAULT 'OPEN'::"public"."WorkOrderStatus" NOT NULL,
    "activityFinishedAt" timestamp(3) without time zone,
    "activityStartedAt" timestamp(3) without time zone,
    "arrivedAt" timestamp(3) without time zone,
    "checkInAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    "formData" "jsonb",
    "hasIssue" boolean DEFAULT false NOT NULL,
    "kind" "public"."WorkOrderKind" DEFAULT 'WORK_ORDER'::"public"."WorkOrderKind" NOT NULL,
    "pmPlanId" "text",
    "receiverSignature" "text",
    "serviceOrderType" "public"."ServiceOrderType",
    "takenAt" timestamp(3) without time zone,
    "technicianSignature" "text",
    "durationMin" integer DEFAULT 60
);


--
-- Name: WorkOrderPartUsed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."WorkOrderPartUsed" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "workOrderId" "text" NOT NULL,
    "inventoryItemId" "text",
    "freeText" "text",
    "qty" double precision NOT NULL,
    "unitCost" double precision,
    "totalCost" double precision,
    "createdByUserId" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: WorkOrderResolution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."WorkOrderResolution" (
    "id" "text" NOT NULL,
    "tenantId" "text" NOT NULL,
    "workOrderId" "text" NOT NULL,
    "symptomCodeId" "text",
    "symptomOther" "text",
    "causeCodeId" "text",
    "causeOther" "text",
    "rootCauseText" "text",
    "remedyCodeId" "text",
    "remedyOther" "text",
    "solutionSummary" "text",
    "preventiveRecommendation" "text",
    "resolvedByUserId" "text",
    "resolvedAt" timestamp(3) without time zone,
    "verifiedByUserId" "text",
    "verifiedAt" timestamp(3) without time zone,
    "verificationNotes" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: telemetry_5m; Type: VIEW; Schema: timeseries; Owner: -
--

CREATE VIEW "timeseries"."telemetry_5m" AS
 SELECT "_materialized_hypertable_3"."tenant_id",
    "_materialized_hypertable_3"."device_id",
    "_materialized_hypertable_3"."metric",
    "_materialized_hypertable_3"."bucket",
    "_materialized_hypertable_3"."n",
    "_materialized_hypertable_3"."v_min",
    "_materialized_hypertable_3"."v_max",
    "_materialized_hypertable_3"."v_avg",
    "_materialized_hypertable_3"."v_last"
   FROM "_timescaledb_internal"."_materialized_hypertable_3";


--
-- Name: v_telemetry; Type: VIEW; Schema: timeseries; Owner: -
--

CREATE VIEW "timeseries"."v_telemetry" WITH ("security_barrier"='true') AS
 SELECT "telemetry"."tenant_id",
    "telemetry"."device_id",
    "telemetry"."ts",
    "telemetry"."metric",
    "telemetry"."value_double",
    "telemetry"."value_bool",
    "telemetry"."value_text",
    "telemetry"."unit",
    "telemetry"."quality",
    "telemetry"."attrs"
   FROM "timeseries"."telemetry"
  WHERE ("telemetry"."tenant_id" = "current_setting"('app.tenant_id'::"text", true));


--
-- Name: v_telemetry_5m; Type: VIEW; Schema: timeseries; Owner: -
--

CREATE VIEW "timeseries"."v_telemetry_5m" WITH ("security_barrier"='true') AS
 SELECT "telemetry_5m"."tenant_id",
    "telemetry_5m"."device_id",
    "telemetry_5m"."metric",
    "telemetry_5m"."bucket",
    "telemetry_5m"."n",
    "telemetry_5m"."v_min",
    "telemetry_5m"."v_max",
    "telemetry_5m"."v_avg",
    "telemetry_5m"."v_last"
   FROM "timeseries"."telemetry_5m"
  WHERE ("telemetry_5m"."tenant_id" = "current_setting"('app.tenant_id'::"text", true));


--
-- Name: _hyper_1_11_chunk 11_6_telemetry_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY "_timescaledb_internal"."_hyper_1_11_chunk"
    ADD CONSTRAINT "11_6_telemetry_pkey" PRIMARY KEY ("tenant_id", "device_id", "ts", "metric");


--
-- Name: _hyper_1_1_chunk 1_1_telemetry_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY "_timescaledb_internal"."_hyper_1_1_chunk"
    ADD CONSTRAINT "1_1_telemetry_pkey" PRIMARY KEY ("tenant_id", "device_id", "ts", "metric");


--
-- Name: _hyper_1_4_chunk 4_2_telemetry_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY "_timescaledb_internal"."_hyper_1_4_chunk"
    ADD CONSTRAINT "4_2_telemetry_pkey" PRIMARY KEY ("tenant_id", "device_id", "ts", "metric");


--
-- Name: _hyper_1_6_chunk 6_3_telemetry_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY "_timescaledb_internal"."_hyper_1_6_chunk"
    ADD CONSTRAINT "6_3_telemetry_pkey" PRIMARY KEY ("tenant_id", "device_id", "ts", "metric");


--
-- Name: _hyper_1_7_chunk 7_4_telemetry_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY "_timescaledb_internal"."_hyper_1_7_chunk"
    ADD CONSTRAINT "7_4_telemetry_pkey" PRIMARY KEY ("tenant_id", "device_id", "ts", "metric");


--
-- Name: _hyper_1_8_chunk 8_5_telemetry_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY "_timescaledb_internal"."_hyper_1_8_chunk"
    ADD CONSTRAINT "8_5_telemetry_pkey" PRIMARY KEY ("tenant_id", "device_id", "ts", "metric");


--
-- Name: Alert Alert_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Alert"
    ADD CONSTRAINT "Alert_pkey" PRIMARY KEY ("id");


--
-- Name: AssetEvent AssetEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AssetEvent"
    ADD CONSTRAINT "AssetEvent_pkey" PRIMARY KEY ("id");


--
-- Name: AssetImportUpload AssetImportUpload_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AssetImportUpload"
    ADD CONSTRAINT "AssetImportUpload_pkey" PRIMARY KEY ("id");


--
-- Name: Asset Asset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Asset"
    ADD CONSTRAINT "Asset_pkey" PRIMARY KEY ("id");


--
-- Name: Attachment Attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Attachment"
    ADD CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id");


--
-- Name: CauseCode CauseCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."CauseCode"
    ADD CONSTRAINT "CauseCode_pkey" PRIMARY KEY ("id");


--
-- Name: Device Device_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Device"
    ADD CONSTRAINT "Device_pkey" PRIMARY KEY ("id");


--
-- Name: InventoryItem InventoryItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."InventoryItem"
    ADD CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id");


--
-- Name: Notice Notice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Notice"
    ADD CONSTRAINT "Notice_pkey" PRIMARY KEY ("id");


--
-- Name: PmPlan PmPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PmPlan"
    ADD CONSTRAINT "PmPlan_pkey" PRIMARY KEY ("id");


--
-- Name: RemedyCode RemedyCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RemedyCode"
    ADD CONSTRAINT "RemedyCode_pkey" PRIMARY KEY ("id");


--
-- Name: RuleState RuleState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RuleState"
    ADD CONSTRAINT "RuleState_pkey" PRIMARY KEY ("id");


--
-- Name: Rule Rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Rule"
    ADD CONSTRAINT "Rule_pkey" PRIMARY KEY ("id");


--
-- Name: ServiceOrderPart ServiceOrderPart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ServiceOrderPart"
    ADD CONSTRAINT "ServiceOrderPart_pkey" PRIMARY KEY ("id");


--
-- Name: SymptomCode SymptomCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."SymptomCode"
    ADD CONSTRAINT "SymptomCode_pkey" PRIMARY KEY ("id");


--
-- Name: Tenant Tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id");


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");


--
-- Name: WOAssignment WOAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WOAssignment"
    ADD CONSTRAINT "WOAssignment_pkey" PRIMARY KEY ("id");


--
-- Name: WorkLog WorkLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkLog"
    ADD CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id");


--
-- Name: WorkMeasurement WorkMeasurement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkMeasurement"
    ADD CONSTRAINT "WorkMeasurement_pkey" PRIMARY KEY ("id");


--
-- Name: WorkNote WorkNote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkNote"
    ADD CONSTRAINT "WorkNote_pkey" PRIMARY KEY ("id");


--
-- Name: WorkOrderPartUsed WorkOrderPartUsed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderPartUsed"
    ADD CONSTRAINT "WorkOrderPartUsed_pkey" PRIMARY KEY ("id");


--
-- Name: WorkOrderResolution WorkOrderResolution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderResolution"
    ADD CONSTRAINT "WorkOrderResolution_pkey" PRIMARY KEY ("id");


--
-- Name: WorkOrder WorkOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrder"
    ADD CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id");


--
-- Name: telemetry telemetry_pkey; Type: CONSTRAINT; Schema: timeseries; Owner: -
--

ALTER TABLE ONLY "timeseries"."telemetry"
    ADD CONSTRAINT "telemetry_pkey" PRIMARY KEY ("tenant_id", "device_id", "ts", "metric");


--
-- Name: _hyper_1_11_chunk_idx_tel_tenant_device_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_11_chunk_idx_tel_tenant_device_ts" ON "_timescaledb_internal"."_hyper_1_11_chunk" USING "btree" ("tenant_id", "device_id", "ts" DESC);


--
-- Name: _hyper_1_11_chunk_idx_tel_tenant_metric_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_11_chunk_idx_tel_tenant_metric_ts" ON "_timescaledb_internal"."_hyper_1_11_chunk" USING "btree" ("tenant_id", "metric", "ts" DESC);


--
-- Name: _hyper_1_11_chunk_telemetry_ts_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_11_chunk_telemetry_ts_idx" ON "_timescaledb_internal"."_hyper_1_11_chunk" USING "btree" ("ts" DESC);


--
-- Name: _hyper_1_1_chunk_idx_tel_tenant_device_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_1_chunk_idx_tel_tenant_device_ts" ON "_timescaledb_internal"."_hyper_1_1_chunk" USING "btree" ("tenant_id", "device_id", "ts" DESC);


--
-- Name: _hyper_1_1_chunk_idx_tel_tenant_metric_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_1_chunk_idx_tel_tenant_metric_ts" ON "_timescaledb_internal"."_hyper_1_1_chunk" USING "btree" ("tenant_id", "metric", "ts" DESC);


--
-- Name: _hyper_1_1_chunk_telemetry_ts_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_1_chunk_telemetry_ts_idx" ON "_timescaledb_internal"."_hyper_1_1_chunk" USING "btree" ("ts" DESC);


--
-- Name: _hyper_1_4_chunk_idx_tel_tenant_device_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_4_chunk_idx_tel_tenant_device_ts" ON "_timescaledb_internal"."_hyper_1_4_chunk" USING "btree" ("tenant_id", "device_id", "ts" DESC);


--
-- Name: _hyper_1_4_chunk_idx_tel_tenant_metric_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_4_chunk_idx_tel_tenant_metric_ts" ON "_timescaledb_internal"."_hyper_1_4_chunk" USING "btree" ("tenant_id", "metric", "ts" DESC);


--
-- Name: _hyper_1_4_chunk_telemetry_ts_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_4_chunk_telemetry_ts_idx" ON "_timescaledb_internal"."_hyper_1_4_chunk" USING "btree" ("ts" DESC);


--
-- Name: _hyper_1_6_chunk_idx_tel_tenant_device_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_6_chunk_idx_tel_tenant_device_ts" ON "_timescaledb_internal"."_hyper_1_6_chunk" USING "btree" ("tenant_id", "device_id", "ts" DESC);


--
-- Name: _hyper_1_6_chunk_idx_tel_tenant_metric_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_6_chunk_idx_tel_tenant_metric_ts" ON "_timescaledb_internal"."_hyper_1_6_chunk" USING "btree" ("tenant_id", "metric", "ts" DESC);


--
-- Name: _hyper_1_6_chunk_telemetry_ts_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_6_chunk_telemetry_ts_idx" ON "_timescaledb_internal"."_hyper_1_6_chunk" USING "btree" ("ts" DESC);


--
-- Name: _hyper_1_7_chunk_idx_tel_tenant_device_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_7_chunk_idx_tel_tenant_device_ts" ON "_timescaledb_internal"."_hyper_1_7_chunk" USING "btree" ("tenant_id", "device_id", "ts" DESC);


--
-- Name: _hyper_1_7_chunk_idx_tel_tenant_metric_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_7_chunk_idx_tel_tenant_metric_ts" ON "_timescaledb_internal"."_hyper_1_7_chunk" USING "btree" ("tenant_id", "metric", "ts" DESC);


--
-- Name: _hyper_1_7_chunk_telemetry_ts_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_7_chunk_telemetry_ts_idx" ON "_timescaledb_internal"."_hyper_1_7_chunk" USING "btree" ("ts" DESC);


--
-- Name: _hyper_1_8_chunk_idx_tel_tenant_device_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_8_chunk_idx_tel_tenant_device_ts" ON "_timescaledb_internal"."_hyper_1_8_chunk" USING "btree" ("tenant_id", "device_id", "ts" DESC);


--
-- Name: _hyper_1_8_chunk_idx_tel_tenant_metric_ts; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_8_chunk_idx_tel_tenant_metric_ts" ON "_timescaledb_internal"."_hyper_1_8_chunk" USING "btree" ("tenant_id", "metric", "ts" DESC);


--
-- Name: _hyper_1_8_chunk_telemetry_ts_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_1_8_chunk_telemetry_ts_idx" ON "_timescaledb_internal"."_hyper_1_8_chunk" USING "btree" ("ts" DESC);


--
-- Name: _hyper_3_12_chunk__materialized_hypertable_3_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_12_chunk__materialized_hypertable_3_bucket_idx" ON "_timescaledb_internal"."_hyper_3_12_chunk" USING "btree" ("bucket" DESC);


--
-- Name: _hyper_3_12_chunk__materialized_hypertable_3_device_id_bucket_i; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_12_chunk__materialized_hypertable_3_device_id_bucket_i" ON "_timescaledb_internal"."_hyper_3_12_chunk" USING "btree" ("device_id", "bucket" DESC);


--
-- Name: _hyper_3_12_chunk__materialized_hypertable_3_metric_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_12_chunk__materialized_hypertable_3_metric_bucket_idx" ON "_timescaledb_internal"."_hyper_3_12_chunk" USING "btree" ("metric", "bucket" DESC);


--
-- Name: _hyper_3_12_chunk__materialized_hypertable_3_tenant_id_bucket_i; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_12_chunk__materialized_hypertable_3_tenant_id_bucket_i" ON "_timescaledb_internal"."_hyper_3_12_chunk" USING "btree" ("tenant_id", "bucket" DESC);


--
-- Name: _hyper_3_12_chunk_idx_tel5m_tenant_metric_bucket; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_12_chunk_idx_tel5m_tenant_metric_bucket" ON "_timescaledb_internal"."_hyper_3_12_chunk" USING "btree" ("tenant_id", "device_id", "metric", "bucket" DESC);


--
-- Name: _hyper_3_2_chunk__materialized_hypertable_3_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_2_chunk__materialized_hypertable_3_bucket_idx" ON "_timescaledb_internal"."_hyper_3_2_chunk" USING "btree" ("bucket" DESC);


--
-- Name: _hyper_3_2_chunk__materialized_hypertable_3_device_id_bucket_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_2_chunk__materialized_hypertable_3_device_id_bucket_id" ON "_timescaledb_internal"."_hyper_3_2_chunk" USING "btree" ("device_id", "bucket" DESC);


--
-- Name: _hyper_3_2_chunk__materialized_hypertable_3_metric_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_2_chunk__materialized_hypertable_3_metric_bucket_idx" ON "_timescaledb_internal"."_hyper_3_2_chunk" USING "btree" ("metric", "bucket" DESC);


--
-- Name: _hyper_3_2_chunk__materialized_hypertable_3_tenant_id_bucket_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_2_chunk__materialized_hypertable_3_tenant_id_bucket_id" ON "_timescaledb_internal"."_hyper_3_2_chunk" USING "btree" ("tenant_id", "bucket" DESC);


--
-- Name: _hyper_3_2_chunk_idx_tel5m_tenant_metric_bucket; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_hyper_3_2_chunk_idx_tel5m_tenant_metric_bucket" ON "_timescaledb_internal"."_hyper_3_2_chunk" USING "btree" ("tenant_id", "device_id", "metric", "bucket" DESC);


--
-- Name: _materialized_hypertable_3_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_materialized_hypertable_3_bucket_idx" ON "_timescaledb_internal"."_materialized_hypertable_3" USING "btree" ("bucket" DESC);


--
-- Name: _materialized_hypertable_3_device_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_materialized_hypertable_3_device_id_bucket_idx" ON "_timescaledb_internal"."_materialized_hypertable_3" USING "btree" ("device_id", "bucket" DESC);


--
-- Name: _materialized_hypertable_3_metric_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_materialized_hypertable_3_metric_bucket_idx" ON "_timescaledb_internal"."_materialized_hypertable_3" USING "btree" ("metric", "bucket" DESC);


--
-- Name: _materialized_hypertable_3_tenant_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "_materialized_hypertable_3_tenant_id_bucket_idx" ON "_timescaledb_internal"."_materialized_hypertable_3" USING "btree" ("tenant_id", "bucket" DESC);


--
-- Name: compress_hyper_2_10_chunk_tenant_id_device_id_metric__ts_me_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "compress_hyper_2_10_chunk_tenant_id_device_id_metric__ts_me_idx" ON "_timescaledb_internal"."compress_hyper_2_10_chunk" USING "btree" ("tenant_id", "device_id", "metric", "_ts_meta_min_1" DESC, "_ts_meta_max_1" DESC);


--
-- Name: compress_hyper_2_13_chunk_tenant_id_device_id_metric__ts_me_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "compress_hyper_2_13_chunk_tenant_id_device_id_metric__ts_me_idx" ON "_timescaledb_internal"."compress_hyper_2_13_chunk" USING "btree" ("tenant_id", "device_id", "metric", "_ts_meta_min_1" DESC, "_ts_meta_max_1" DESC);


--
-- Name: compress_hyper_2_3_chunk_tenant_id_device_id_metric__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "compress_hyper_2_3_chunk_tenant_id_device_id_metric__ts_met_idx" ON "_timescaledb_internal"."compress_hyper_2_3_chunk" USING "btree" ("tenant_id", "device_id", "metric", "_ts_meta_min_1" DESC, "_ts_meta_max_1" DESC);


--
-- Name: compress_hyper_2_5_chunk_tenant_id_device_id_metric__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "compress_hyper_2_5_chunk_tenant_id_device_id_metric__ts_met_idx" ON "_timescaledb_internal"."compress_hyper_2_5_chunk" USING "btree" ("tenant_id", "device_id", "metric", "_ts_meta_min_1" DESC, "_ts_meta_max_1" DESC);


--
-- Name: compress_hyper_2_9_chunk_tenant_id_device_id_metric__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "compress_hyper_2_9_chunk_tenant_id_device_id_metric__ts_met_idx" ON "_timescaledb_internal"."compress_hyper_2_9_chunk" USING "btree" ("tenant_id", "device_id", "metric", "_ts_meta_min_1" DESC, "_ts_meta_max_1" DESC);


--
-- Name: idx_tel5m_tenant_metric_bucket; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX "idx_tel5m_tenant_metric_bucket" ON "_timescaledb_internal"."_materialized_hypertable_3" USING "btree" ("tenant_id", "device_id", "metric", "bucket" DESC);


--
-- Name: Alert_tenantId_assetCode_sensor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Alert_tenantId_assetCode_sensor_idx" ON "public"."Alert" USING "btree" ("tenantId", "assetCode", "sensor");


--
-- Name: AssetEvent_tenantId_assetId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssetEvent_tenantId_assetId_createdAt_idx" ON "public"."AssetEvent" USING "btree" ("tenantId", "assetId", "createdAt" DESC);


--
-- Name: AssetEvent_tenantId_status_severity_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssetEvent_tenantId_status_severity_createdAt_idx" ON "public"."AssetEvent" USING "btree" ("tenantId", "status", "severity", "createdAt" DESC);


--
-- Name: AssetImportUpload_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssetImportUpload_tenantId_createdAt_idx" ON "public"."AssetImportUpload" USING "btree" ("tenantId", "createdAt");


--
-- Name: Asset_tenantId_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Asset_tenantId_categoryId_idx" ON "public"."Asset" USING "btree" ("tenantId", "categoryId");


--
-- Name: Asset_tenantId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Asset_tenantId_code_key" ON "public"."Asset" USING "btree" ("tenantId", "code");


--
-- Name: Asset_tenantId_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Asset_tenantId_locationId_idx" ON "public"."Asset" USING "btree" ("tenantId", "locationId");


--
-- Name: Asset_tenantId_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Asset_tenantId_name_idx" ON "public"."Asset" USING "btree" ("tenantId", "name");


--
-- Name: Asset_tenantId_parentAssetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Asset_tenantId_parentAssetId_idx" ON "public"."Asset" USING "btree" ("tenantId", "parentAssetId");


--
-- Name: Attachment_tenantId_assetId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Attachment_tenantId_assetId_createdAt_idx" ON "public"."Attachment" USING "btree" ("tenantId", "assetId", "createdAt" DESC);


--
-- Name: Attachment_tenantId_workOrderId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Attachment_tenantId_workOrderId_createdAt_idx" ON "public"."Attachment" USING "btree" ("tenantId", "workOrderId", "createdAt" DESC);


--
-- Name: CauseCode_tenantId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CauseCode_tenantId_code_key" ON "public"."CauseCode" USING "btree" ("tenantId", "code");


--
-- Name: Device_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Device_code_key" ON "public"."Device" USING "btree" ("code");


--
-- Name: Device_ingestKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Device_ingestKey_key" ON "public"."Device" USING "btree" ("ingestKey");


--
-- Name: Device_tenantId_assetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Device_tenantId_assetId_idx" ON "public"."Device" USING "btree" ("tenantId", "assetId");


--
-- Name: InventoryItem_tenantId_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventoryItem_tenantId_sku_key" ON "public"."InventoryItem" USING "btree" ("tenantId", "sku");


--
-- Name: Notice_tenantId_assetCode_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notice_tenantId_assetCode_status_idx" ON "public"."Notice" USING "btree" ("tenantId", "assetCode", "status");


--
-- Name: Notice_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notice_tenantId_createdAt_idx" ON "public"."Notice" USING "btree" ("tenantId", "createdAt");


--
-- Name: Notice_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notice_tenantId_status_idx" ON "public"."Notice" USING "btree" ("tenantId", "status");


--
-- Name: PmPlan_tenantId_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PmPlan_tenantId_name_idx" ON "public"."PmPlan" USING "btree" ("tenantId", "name");


--
-- Name: PmPlan_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PmPlan_tenantId_name_key" ON "public"."PmPlan" USING "btree" ("tenantId", "name");


--
-- Name: RemedyCode_tenantId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RemedyCode_tenantId_code_key" ON "public"."RemedyCode" USING "btree" ("tenantId", "code");


--
-- Name: RuleState_ruleId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RuleState_ruleId_key" ON "public"."RuleState" USING "btree" ("ruleId");


--
-- Name: Rule_tenantId_metric_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Rule_tenantId_metric_enabled_idx" ON "public"."Rule" USING "btree" ("tenantId", "metric", "enabled");


--
-- Name: ServiceOrderPart_tenantId_workOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ServiceOrderPart_tenantId_workOrderId_idx" ON "public"."ServiceOrderPart" USING "btree" ("tenantId", "workOrderId");


--
-- Name: SymptomCode_tenantId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SymptomCode_tenantId_code_key" ON "public"."SymptomCode" USING "btree" ("tenantId", "code");


--
-- Name: Tenant_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Tenant_slug_key" ON "public"."Tenant" USING "btree" ("slug");


--
-- Name: User_tenantId_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_tenantId_email_key" ON "public"."User" USING "btree" ("tenantId", "email");


--
-- Name: WOAssignment_tenantId_userId_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WOAssignment_tenantId_userId_state_idx" ON "public"."WOAssignment" USING "btree" ("tenantId", "userId", "state");


--
-- Name: WOAssignment_tenantId_workOrderId_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WOAssignment_tenantId_workOrderId_state_idx" ON "public"."WOAssignment" USING "btree" ("tenantId", "workOrderId", "state");


--
-- Name: WorkLog_tenantId_userId_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkLog_tenantId_userId_startedAt_idx" ON "public"."WorkLog" USING "btree" ("tenantId", "userId", "startedAt");


--
-- Name: WorkLog_tenantId_workOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkLog_tenantId_workOrderId_idx" ON "public"."WorkLog" USING "btree" ("tenantId", "workOrderId");


--
-- Name: WorkMeasurement_tenantId_workOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkMeasurement_tenantId_workOrderId_idx" ON "public"."WorkMeasurement" USING "btree" ("tenantId", "workOrderId");


--
-- Name: WorkNote_tenantId_workOrderId_addedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkNote_tenantId_workOrderId_addedAt_idx" ON "public"."WorkNote" USING "btree" ("tenantId", "workOrderId", "addedAt");


--
-- Name: WorkOrderPartUsed_tenantId_workOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkOrderPartUsed_tenantId_workOrderId_idx" ON "public"."WorkOrderPartUsed" USING "btree" ("tenantId", "workOrderId");


--
-- Name: WorkOrderResolution_tenantId_workOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkOrderResolution_tenantId_workOrderId_idx" ON "public"."WorkOrderResolution" USING "btree" ("tenantId", "workOrderId");


--
-- Name: WorkOrderResolution_workOrderId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "WorkOrderResolution_workOrderId_key" ON "public"."WorkOrderResolution" USING "btree" ("workOrderId");


--
-- Name: WorkOrder_tenantId_assetCode_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkOrder_tenantId_assetCode_status_idx" ON "public"."WorkOrder" USING "btree" ("tenantId", "assetCode", "status");


--
-- Name: WorkOrder_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkOrder_tenantId_status_idx" ON "public"."WorkOrder" USING "btree" ("tenantId", "status");


--
-- Name: asset_tenant_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_tenant_location_idx" ON "public"."Asset" USING "btree" ("tenantId", "locationId");


--
-- Name: asset_tenant_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_tenant_name_idx" ON "public"."Asset" USING "btree" ("tenantId", "name");


--
-- Name: idx_Attachment_tenant_workorder_createdAt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Attachment_tenant_workorder_createdAt" ON "public"."Attachment" USING "btree" ("tenantId", "workOrderId", "createdAt" DESC);


--
-- Name: idx_device_tenant_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_device_tenant_asset" ON "public"."Device" USING "btree" ("tenantId", "assetId");


--
-- Name: uniq_open_worklog_tenant_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uniq_open_worklog_tenant_user" ON "public"."WorkLog" USING "btree" ("tenantId", "userId") WHERE ("endedAt" IS NULL);


--
-- Name: idx_tel_tenant_device_ts; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX "idx_tel_tenant_device_ts" ON "timeseries"."telemetry" USING "btree" ("tenant_id", "device_id", "ts" DESC);


--
-- Name: idx_tel_tenant_metric_ts; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX "idx_tel_tenant_metric_ts" ON "timeseries"."telemetry" USING "btree" ("tenant_id", "metric", "ts" DESC);


--
-- Name: telemetry_ts_idx; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX "telemetry_ts_idx" ON "timeseries"."telemetry" USING "btree" ("ts" DESC);


--
-- Name: _hyper_1_11_chunk ts_cagg_invalidation_trigger; Type: TRIGGER; Schema: _timescaledb_internal; Owner: -
--

CREATE TRIGGER "ts_cagg_invalidation_trigger" AFTER INSERT OR DELETE OR UPDATE ON "_timescaledb_internal"."_hyper_1_11_chunk" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."continuous_agg_invalidation_trigger"('1');


--
-- Name: _hyper_1_1_chunk ts_cagg_invalidation_trigger; Type: TRIGGER; Schema: _timescaledb_internal; Owner: -
--

CREATE TRIGGER "ts_cagg_invalidation_trigger" AFTER INSERT OR DELETE OR UPDATE ON "_timescaledb_internal"."_hyper_1_1_chunk" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."continuous_agg_invalidation_trigger"('1');


--
-- Name: _hyper_1_4_chunk ts_cagg_invalidation_trigger; Type: TRIGGER; Schema: _timescaledb_internal; Owner: -
--

CREATE TRIGGER "ts_cagg_invalidation_trigger" AFTER INSERT OR DELETE OR UPDATE ON "_timescaledb_internal"."_hyper_1_4_chunk" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."continuous_agg_invalidation_trigger"('1');


--
-- Name: _hyper_1_6_chunk ts_cagg_invalidation_trigger; Type: TRIGGER; Schema: _timescaledb_internal; Owner: -
--

CREATE TRIGGER "ts_cagg_invalidation_trigger" AFTER INSERT OR DELETE OR UPDATE ON "_timescaledb_internal"."_hyper_1_6_chunk" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."continuous_agg_invalidation_trigger"('1');


--
-- Name: _hyper_1_7_chunk ts_cagg_invalidation_trigger; Type: TRIGGER; Schema: _timescaledb_internal; Owner: -
--

CREATE TRIGGER "ts_cagg_invalidation_trigger" AFTER INSERT OR DELETE OR UPDATE ON "_timescaledb_internal"."_hyper_1_7_chunk" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."continuous_agg_invalidation_trigger"('1');


--
-- Name: _hyper_1_8_chunk ts_cagg_invalidation_trigger; Type: TRIGGER; Schema: _timescaledb_internal; Owner: -
--

CREATE TRIGGER "ts_cagg_invalidation_trigger" AFTER INSERT OR DELETE OR UPDATE ON "_timescaledb_internal"."_hyper_1_8_chunk" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."continuous_agg_invalidation_trigger"('1');


--
-- Name: _compressed_hypertable_2 ts_insert_blocker; Type: TRIGGER; Schema: _timescaledb_internal; Owner: -
--

CREATE TRIGGER "ts_insert_blocker" BEFORE INSERT ON "_timescaledb_internal"."_compressed_hypertable_2" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."insert_blocker"();


--
-- Name: _materialized_hypertable_3 ts_insert_blocker; Type: TRIGGER; Schema: _timescaledb_internal; Owner: -
--

CREATE TRIGGER "ts_insert_blocker" BEFORE INSERT ON "_timescaledb_internal"."_materialized_hypertable_3" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."insert_blocker"();


--
-- Name: telemetry ts_cagg_invalidation_trigger; Type: TRIGGER; Schema: timeseries; Owner: -
--

CREATE TRIGGER "ts_cagg_invalidation_trigger" AFTER INSERT OR DELETE OR UPDATE ON "timeseries"."telemetry" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."continuous_agg_invalidation_trigger"('1');


--
-- Name: telemetry ts_insert_blocker; Type: TRIGGER; Schema: timeseries; Owner: -
--

CREATE TRIGGER "ts_insert_blocker" BEFORE INSERT ON "timeseries"."telemetry" FOR EACH ROW EXECUTE FUNCTION "_timescaledb_functions"."insert_blocker"();


--
-- Name: Alert Alert_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Alert"
    ADD CONSTRAINT "Alert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AssetEvent AssetEvent_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AssetEvent"
    ADD CONSTRAINT "AssetEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AssetEvent AssetEvent_ruleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AssetEvent"
    ADD CONSTRAINT "AssetEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."Rule"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AssetEvent AssetEvent_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AssetEvent"
    ADD CONSTRAINT "AssetEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AssetImportUpload AssetImportUpload_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."AssetImportUpload"
    ADD CONSTRAINT "AssetImportUpload_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Asset Asset_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Asset"
    ADD CONSTRAINT "Asset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Attachment Attachment_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Attachment"
    ADD CONSTRAINT "Attachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Attachment Attachment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Attachment"
    ADD CONSTRAINT "Attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Attachment Attachment_workOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Attachment"
    ADD CONSTRAINT "Attachment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CauseCode CauseCode_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."CauseCode"
    ADD CONSTRAINT "CauseCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Device Device_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Device"
    ADD CONSTRAINT "Device_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Device Device_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Device"
    ADD CONSTRAINT "Device_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryItem InventoryItem_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."InventoryItem"
    ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Notice Notice_alertId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Notice"
    ADD CONSTRAINT "Notice_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "public"."Alert"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Notice Notice_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Notice"
    ADD CONSTRAINT "Notice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PmPlan PmPlan_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PmPlan"
    ADD CONSTRAINT "PmPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RemedyCode RemedyCode_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RemedyCode"
    ADD CONSTRAINT "RemedyCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RuleState RuleState_ruleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RuleState"
    ADD CONSTRAINT "RuleState_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."Rule"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RuleState RuleState_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RuleState"
    ADD CONSTRAINT "RuleState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Rule Rule_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Rule"
    ADD CONSTRAINT "Rule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Rule Rule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Rule"
    ADD CONSTRAINT "Rule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ServiceOrderPart ServiceOrderPart_inventoryItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ServiceOrderPart"
    ADD CONSTRAINT "ServiceOrderPart_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."InventoryItem"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ServiceOrderPart ServiceOrderPart_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ServiceOrderPart"
    ADD CONSTRAINT "ServiceOrderPart_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ServiceOrderPart ServiceOrderPart_workOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ServiceOrderPart"
    ADD CONSTRAINT "ServiceOrderPart_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SymptomCode SymptomCode_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."SymptomCode"
    ADD CONSTRAINT "SymptomCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: User User_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."User"
    ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: WOAssignment WOAssignment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WOAssignment"
    ADD CONSTRAINT "WOAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WOAssignment WOAssignment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WOAssignment"
    ADD CONSTRAINT "WOAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: WOAssignment WOAssignment_workOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WOAssignment"
    ADD CONSTRAINT "WOAssignment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkLog WorkLog_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkLog"
    ADD CONSTRAINT "WorkLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkLog WorkLog_workOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkLog"
    ADD CONSTRAINT "WorkLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkMeasurement WorkMeasurement_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkMeasurement"
    ADD CONSTRAINT "WorkMeasurement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkMeasurement WorkMeasurement_workOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkMeasurement"
    ADD CONSTRAINT "WorkMeasurement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkNote WorkNote_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkNote"
    ADD CONSTRAINT "WorkNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkNote WorkNote_workOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkNote"
    ADD CONSTRAINT "WorkNote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkOrderPartUsed WorkOrderPartUsed_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderPartUsed"
    ADD CONSTRAINT "WorkOrderPartUsed_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkOrderPartUsed WorkOrderPartUsed_workOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderPartUsed"
    ADD CONSTRAINT "WorkOrderPartUsed_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkOrderResolution WorkOrderResolution_causeCodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderResolution"
    ADD CONSTRAINT "WorkOrderResolution_causeCodeId_fkey" FOREIGN KEY ("causeCodeId") REFERENCES "public"."CauseCode"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkOrderResolution WorkOrderResolution_remedyCodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderResolution"
    ADD CONSTRAINT "WorkOrderResolution_remedyCodeId_fkey" FOREIGN KEY ("remedyCodeId") REFERENCES "public"."RemedyCode"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkOrderResolution WorkOrderResolution_symptomCodeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderResolution"
    ADD CONSTRAINT "WorkOrderResolution_symptomCodeId_fkey" FOREIGN KEY ("symptomCodeId") REFERENCES "public"."SymptomCode"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkOrderResolution WorkOrderResolution_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderResolution"
    ADD CONSTRAINT "WorkOrderResolution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkOrderResolution WorkOrderResolution_workOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrderResolution"
    ADD CONSTRAINT "WorkOrderResolution_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WorkOrder WorkOrder_noticeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrder"
    ADD CONSTRAINT "WorkOrder_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "public"."Notice"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkOrder WorkOrder_pmPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrder"
    ADD CONSTRAINT "WorkOrder_pmPlanId_fkey" FOREIGN KEY ("pmPlanId") REFERENCES "public"."PmPlan"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkOrder WorkOrder_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WorkOrder"
    ADD CONSTRAINT "WorkOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Asset; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."Asset" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssetImportUpload; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."AssetImportUpload" ENABLE ROW LEVEL SECURITY;

--
-- Name: Attachment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."Attachment" ENABLE ROW LEVEL SECURITY;

--
-- Name: Device; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."Device" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssetImportUpload asset_import_upload_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "asset_import_upload_tenant_isolation" ON "public"."AssetImportUpload" USING (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));


--
-- Name: Asset asset_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "asset_tenant_isolation" ON "public"."Asset" USING (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));


--
-- Name: Attachment attachment_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attachment_tenant_all" ON "public"."Attachment" USING (("tenantId" = "current_setting"('app.tenant_id'::"text", true))) WITH CHECK (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));


--
-- Name: Device device_tenant_insert_check; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "device_tenant_insert_check" ON "public"."Device" FOR INSERT WITH CHECK (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));


--
-- Name: Device device_tenant_isolation_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "device_tenant_isolation_all" ON "public"."Device" USING (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));


--
-- PostgreSQL database dump complete
--

