# @plato/analytics

[![Node.js CI](https://github.com/plato-app/es-analytics/actions/workflows/node.yml/badge.svg)](https://github.com/plato-app/es-analytics/actions/workflows/node.yml) [![npm version](https://badge.fury.io/js/%40plato%2Fanalytics.svg)](https://badge.fury.io/js/%40plato%2Fanalytics)

Track custom analytics in [Node.js](https://nodejs.org/en/), and persist to long-term storage, such as a [data lake](https://en.wikipedia.org/wiki/Data_lake).

## Usage

Install via Yarn (or npm):

```sh
yarn add @plato/analytics
```

Define a schema, create a collector, and store events in S3:

```ts
import { Collector, StoreS3 } from "@plato/analytics";

// STEP 1: Create a schema for your data =======================================
// This will give you strong typing when calling .track

/** Demo analytics schema */
type ExampleSchema = {
	/** A table of user events associated with a resource */
	user_events: {
		/** The time at which the event occurred */
		event_time: Date;
		/** The type of event which occurred */
		event_type: string;
		/** A resource ID associated with this event */
		resource_id: string;
		/** A user ID who performed the event */
		user_id: string;
	};
};

// STEP 2: Create a long-term data store =======================================
// Batches of analytics data are sent to long term storage when they reach
// specified thresholds, or when the analytics collector is stopped

// Create S3 storage layer which writes data to a specified bucket
const store = new StoreS3("my_bucket");

// STEP 3: Create an analytics collector =======================================

// Create analytics collector respecting our DemoSchema
const analytics = new Collector<ExampleSchema>(store);

// Receive errors from the collector
analytics.onError.receive((e) => console.log(`ERROR: ${e.message}`));

// Receive flush notifications from the collector
analytics.onFlush.receive((info) => console.log(`FLUSH: ${JSON.stringify(info)}`));

// STEP 4: TRACK ALL THE THINGS! ===============================================

// Track a demo event, for example
analytics.track("user_events", {
	event_time: new Date(),
	event_type: "touch",
	resource_id: "9438b068-c25b-47a0-b0fe-e8acc6f80ace",
	user_id: "03d00e69-ea1e-4c39-ade6-803ff3f00e99",
});

// STEP 5: Stop the collector ==================================================

// Stop collecting and wait for graceful shutdown
await analytics.stop();
```

See the [API Reference](https://plato-app.github.io/es-signal/) for more information.

## Wildcard Tables

The collector supports wildcard table names, which share a schema. For example, let's say we required a set of tables with custom events for specific games. We would define the schema for these table as follows:

```ts
type ExampleWildcardSchema = {
	game_custom_event_$: { // <--- Notice the "$" wildcard token in the table name
		event_time: Date;
		event_type: string;
		event_value: string;
		session_id: string;
	};
}
```

When tracking events, supply a third parameter with the wildcard value, for example:

```ts
// Track a custom event for Pool
analytics.track("game_custom_event_$", {
	event_time: new Date(),
	event_type: "foo",
	event_value: "bar",
	session_id: "9438b068-c25b-47a0-b0fe-e8acc6f80ace",
}, "pool"); // <--- Notice the wildcard value

// Track a custom event for Bowling
analytics.track("game_custom_event_$", {
	event_time: new Date(),
	event_type: "foo",
	event_value: "bar",
	session_id: "9438b068-c25b-47a0-b0fe-e8acc6f80ace",
}, "bowling"); // <--- Same schema, different wildcard value
```

This will result in two separate tables of data: `game_custom_event_pool` and `game_custom_event_bowing` (yet both sharing the schema defined for `game_custom_event_$`).

## Specification

### Objects

Objects are files within a data lake (such as AWS S3). Each object uploaded to the data lake will conform to the following specifications:

1. Contain data for a single table adhering to the [defined CSV format](#csv-format)
1. Compressed with gzip
1. Object key names must conform to the following format: `YYYY/MM/DD/HH/{TABLE_NAME}/{GUID}.csv(.gz)`
	* `YYYY/MM/DD/HH` is the 4 digit year, 2 digit month, 2 digit day, and 2 digit hour of the UTC time when this object was created
	* `{TABLE_NAME}` must be unique across all data sources within this lake and contain only alphanumeric characters and underscores, e.g. `[a-zA-Z0-9_]`
	* Per convention, `{TABLE_NAME}` should contain a unique prefix indicating the data source, e.g. `game_*`
	* `{GUID}` is a Version 4 GUID

### CSV Format

CSV files uploaded to the data lake will adhere to the following specifications:

1. Conform to [RFC 4180 - Common Format for Comma-Separated Values](https://tools.ietf.org/html/rfc4180)
1. Contain only records for a single table
1. Column headers must be declared in the first non-comment line
1. Column headers must contain only alphanumeric characters (`[a-zA-Z0-9]`) and underscores (`_`)
1. Column types should be declared as a comment in the first line, with the following specifications:
	* Aside from the comment character (`#`), the types row must contain a comma-separated list of text values indicating the column's data type
	*	Valid data types are as follows:
		* `text`
		* `timestamp(z)`
		* `int`

#### Example CSV Data

```
#text,timestampz,int
session_id,end_time,end_reason
oiccvmz0cvuu-2my7wvf99enmi,2020-06-08T17:13:49.062Z,0
2slv18vtkjyl4-28nz20jhsdt3w,2020-06-08T17:13:49.112Z,2
2jk1eocbnkcys-2zffiy4q44z4o,2020-06-08T17:13:49.523Z,0
```
