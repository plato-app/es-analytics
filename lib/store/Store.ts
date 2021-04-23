import { Readable } from "stream";

/** An abstract storage layer for data */
export abstract class Store {

	/** Store the contents of a readable stream with a given key */
	public abstract put(key: string, stream: Readable): Promise<void>;

}
