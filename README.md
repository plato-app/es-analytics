# @plato/analytics

Track custom analytics in [Node.js](https://nodejs.org/en/), and persist to long-term storage, such as a [data lake](https://en.wikipedia.org/wiki/Data_lake).

## Quick Start

```ts
import { Collector, StoreS3 } from "@plato/analytics";

// STEP 1: Create a schema for your data =======================================
// This will give you strong typing when calling .track

/** Demo analytics schema */
type DemoSchema = {
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
// Batches of analytics data are sent to long term storage when they reach a
// specified threshold, or when the analytics collector is disposed

// Create S3 storage layer which writes data to a specified bucket
const store = new StoreS3("my_bucket");

// STEP 3: Create an analytics collector =======================================

// Create analytics collector respecting our DemoSchema
const analytics = new Collector<DemoSchema>(store);

// Receive errors from the collector
analytics.onError.receive((e) => console.log(`ERR: ${e.message}`));

// STEP 4: TRACK ALL THE THINGS! ===============================================

// Track a demo event, for example
analytics.track("user_events", {
	event_time: new Date(),
	event_type: "touch",
	resource_id: "9438b068-c25b-47a0-b0fe-e8acc6f80ace",
	user_id: "03d00e69-ea1e-4c39-ade6-803ff3f00e99",
});

// STEP 5: Stop the collector ==================================================

// Stop collecting wait for graceful shutdown
await analytics.stop();
```
