import { Readable } from "stream";
import { S3 } from "aws-sdk";
import { Store } from "./Store";

/** AWS S3 storage layer */
export class StoreS3 extends Store {

	/** Destination bucket */
	private readonly bucket: string;

	/** AWS S3 interface */
	private readonly s3: S3;

	constructor(bucket: string) {
		super();
		this.bucket = bucket;
		this.s3 = new S3();
	}

	/** Upload an object into the bound S3 bucket */
	public put(key: string, stream: Readable): Promise<void> {
		return new Promise((resolve, reject) => {
			this.s3.putObject({
				Bucket: this.bucket,
				Key: key,
				Body: stream,
			}, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

}
