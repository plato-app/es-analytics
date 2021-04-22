import * as tape from "tape";
import { Widget } from "..";

tape("Widget", (t) => {
	const widget = new Widget();
	t.ok(widget instanceof Widget);
	t.end();
});
