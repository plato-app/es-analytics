import { createWriteStream } from "fs";
import { dirname, join, resolve } from "path";
import { Readable } from "stream";
import * as mkdirp from "mkdirp";
import { Store } from "./Store";

/** Write a file from a Readable stream */
function writeFileStream(filePath: string, contents: Readable): Promise<void> {
	return new Promise((resolve) => {
		const file = createWriteStream(filePath);
		file.on("finish", resolve);
		contents.pipe(file);
	});
}

/**
 * File system storage layer
 * This store is primarily for testing
 */
export class StoreFS extends Store {

	/** Destination folder */
	private readonly repoPath: string;

	constructor(repoPath: string) {
		super();
		this.repoPath = resolve(repoPath);
	}

	/** Upload an object into the bound S3 bucket */
	public async put(key: string, stream: Readable): Promise<void> {
		// Ensure target path exists within our repo
		const dir = join(this.repoPath, dirname(key));
		await mkdirp(dir);

		// Write contents into destination file
		const filePath = join(this.repoPath, key);
		await writeFileStream(filePath, stream);
	}

}
