import { createWriteStream, createReadStream, promises } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { Writable, pipeline } from "stream";
import { createGzip } from "zlib";
import { Stringifier } from "csv-stringify";
import { v4 as uuidv4 } from "uuid";
import { Signal } from "@plato/signal";
import { Store } from "../store/Store";

/** A record within a table of data */
export type TableRecord = {
	[index: string]: string | number | boolean | Date;
}

/** Schema representing a collection of tables */
export type CollectorSchema = {
	[index: string]: TableRecord;
}

/** Map of column type overrides, indexed by table name */
export type TableColumnTypes = Record<string, Record<string, string>>;

/** Collector configuration */
export interface CollectorConfig {
	/** Column type overrides */
	columnTypes?: TableColumnTypes;
	/** Whether or not to gzip batch data */
	batchZip?: boolean;
	/** Threshold at which batches are automatically flushed */
	batchThreshold?: number;
}

/** A batch of records for a given table */
interface TableBatch {
	/** Unique batch ID */
	id: string;
	/** Buffer filename */
	filename: string;
	/** Table name */
	table: string;
	/** Pipeline head */
	pipeline: Writable;
	/** Number of records written to buffer */
	records: number;
	/** Emitted when the pipeline has finished */
	onFinish: Signal;
}

/** Await the end of a batch's pipeline */
function finishBatch(batch: TableBatch): Promise<void> {
	return new Promise((resolve, reject) => {
		batch.onFinish.receive((err: Error | null) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
		batch.pipeline.end();
	});
}

/** Infer column types from values */
function inferColumnType(value: unknown): string {
	if (value instanceof Date) {
		return "timestampz";
	} else if (typeof value === "number") {
		return "numeric";
	} else {
		return "text";
	}
}

/** Pre-process a record by converting object types into simple values */
function preprocessRecord(record: TableRecord): void {
	for (const field in record) {
		const value = record[field];
		if (value instanceof Date) {
			record[field] = value.toISOString();
		}
	}
}

/** Create a date based object prefix */
function createDatePrefix(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	const h = String(date.getUTCHours()).padStart(2, "0");
	return `${y}/${m}/${d}/${h}`;
}

/** Collects records for a collection of tables */
export class Collector<T extends CollectorSchema> {

	/** Emitted when a batch has been flushed successfully */
	public readonly onFlush = new Signal<(table: string, id: string, records: number) => void>();

	/** Emitted when an error has occurred */
	public readonly onError = new Signal<(e: Error) => void>();

	/** Pending record batches */
	private readonly batches = new Map<keyof T, TableBatch>();

	/** Long-term storage interface */
	private readonly store: Store;

	/** Column type overrides */
	private readonly columnTypes: TableColumnTypes | undefined;

	/** Whether or not to zip batches */
	private readonly batchZip: boolean;

	/** Record threshold before batches are automatically flushed */
	private readonly batchThreshold: number;

	/** Whether or not the collector is collecting data */
	private disabled = false;

	constructor(store: Store, config?: CollectorConfig) {
		this.store = store;
		this.columnTypes = config?.columnTypes;
		this.batchZip = config?.batchZip ?? true;
		this.batchThreshold = config?.batchThreshold ?? 1000;
	}

	/** Stop collecting and flush any pending data */
	public async stop(): Promise<void> {
		// Disable the collector
		// Subsequent calls to .track will be dropped and an error will be emitted
		this.disabled = true;

		// Finalize pending batches
		const queue: Promise<void>[] = [];
		for (const [, batch] of this.batches) {
			queue.push(this.flushBatch(batch));
		}

		// Wait for batches to finalize and emit any errors
		await Promise.allSettled(queue);
	}

	/** Track an event */
	public track(table: keyof T, record: T[keyof T]): void {
		// Ensure collection is enabled
		if (this.disabled) {
			this.onError.emit(new Error("Collector stopped"));
			return;
		}

		// Use existing batch pipeline, or create a new batch
		let batch = this.batches.get(table);
		if (batch === undefined) {
			batch = this.createBatch(table.toString(), record);
			this.batches.set(table, batch);
		}

		// TODO: Detect if batch is awaiting drain, and drop record

		// Write record to batch
		this.writeBatchRecord(batch, record);
	}

	/** Create a new batch of records */
	private createBatch(table: string, record: T[keyof T]): TableBatch {
		// Create a UUID for this table segment
		const id = uuidv4();

		// Create formatting stream at the head of the batch's pipeline
		const format = new Stringifier({
			header: true,
		});

		// Create file writer stream
		const filename = join(tmpdir(), `analytics-${id}.csv${this.batchZip ? ".gz" : ""}`);
		const file = createWriteStream(filename);

		// A reference to the stream by-passing the formatter
		let bypass: Writable = file;

		// Create pipeline
		// TODO: A more elegant way to compose a variable list of pipelines
		const finish = new Signal<(err: Error | null) => void>();
		const cb = (err: Error | null) => finish.emit(err);
		if (this.batchZip) {
			const gzip = createGzip();
			bypass = gzip;
			pipeline(format, gzip, file, cb);
		} else {
			pipeline(format, file, cb);
		}

		// Write custom headers directly to output stream
		this.writeBatchHeader(table, record, bypass);

		// Create batch
		return {
			id,
			filename,
			table,
			pipeline: format,
			records: 0,
			onFinish: finish,
		};
	}

	/** Write a new record to a batch */
	private writeBatchRecord(batch: TableBatch, record: TableRecord): void {
		// Pre-process record
		preprocessRecord(record);

		// Write record to pipeline
		if (!batch.pipeline.write(record)) {
			// TODO: handle drain
			console.log("AWAIT DRAIN FOR THIS BATCH ONLY");
		}

		// Increment record count and check for flush threshold
		if (++batch.records >= this.batchThreshold) {
			this.flushBatch(batch);
		}
	}

	/** Write batch headers to output stream */
	private writeBatchHeader(table: string, record: TableRecord, stream: Writable): void {
		// Gather data types for columns based upon supplied record
		const types: string[] = [];
		for (const field in record) {
			if (
				this.columnTypes !== undefined &&
				this.columnTypes[table] !== undefined &&
				this.columnTypes[table][field] !== undefined
			) {
				// Column type for this table is explicity defined
				types.push(this.columnTypes[table][field]);
			} else {
				// No column type specified, infer from field value
				types.push(inferColumnType(record[field]));
			}
		}
		stream.write(`#${types.join()}${"\n"}`);
	}

	/** End batch pipeline and send to long-term storage */
	private async flushBatch(batch: TableBatch): Promise<void> {
		try {
			// Remove batch from pending batches collection
			// The next incoming record for this table will trigger a new batch
			this.batches.delete(batch.table);

			// Wait for pipeline to finish
			await finishBatch(batch);

			// Send batch contents to long-term storage
			await this.storeBatch(batch);

			// Emit flush event
			this.onFlush.emit(batch.table, batch.id, batch.records);
		} catch (e) {
			this.onError.emit(e);
		} finally {
			await this.disposeBatch(batch);
		}
	}

	/** Store a batch in long-term storage */
	private storeBatch(batch: TableBatch): Promise<void> {
		// Compose object key, according to spec
		const now = new Date();
		const key = `${createDatePrefix(now)}/${batch.table}/${basename(batch.filename)}`;

		// Put batch content into long-term storage
		return this.store.put(key, createReadStream(batch.filename));
	}

	/** Dispose of a batch */
	private async disposeBatch(batch: TableBatch): Promise<void> {
		try {
			// Remove signal receivers
			batch.onFinish.purge();
			// Delete file buffer from disk
			await promises.unlink(batch.filename);
		} catch (e) {
			this.onError.emit(e);
		}
	}

}