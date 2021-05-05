import { join } from "path";
import * as tape from "tape";
import { Collector, StoreFS } from "..";

/** Test schema */
type TestSchema = {
	game_user_event: {
		event_time: Date;
		event_type: string;
		game_id: string;
		session_id: string;
		user_id: string;
	};
	game_session_create: {
		session_id: string;
	};
	game_custom_event_$: {
		event_time: Date;
		event_type: string;
		event_value: string;
		session_id: string;
	};
}

/** File system data store */
const store = new StoreFS(join(__dirname, "store"));

tape("Collector", async (t) => {
	const analytics = new Collector<TestSchema>(store, {
		columnTypes: {
			game_user_event: {
				session_id: "uuid",
			},
			game_session_create: {
				session_id: "uuid",
			},
		},
	});

	analytics.onError.receive((e) => t.fail(e.message));
	analytics.onFlush.receive((info) => t.comment(`FLUSH: ${JSON.stringify(info)}`));

	analytics.track("game_session_create", {
		session_id: "abc123",
	});

	analytics.track("game_user_event", {
		event_time: new Date(),
		event_type: "join",
		game_id: "fourinarow",
		session_id: "abc123",
		user_id: "xyz890",
	});

	analytics.track("game_user_event", {
		event_time: new Date(),
		event_type: "join",
		game_id: "crazy8",
		session_id: "def456",
		user_id: "ghi789",
	});

	analytics.track("game_custom_event_$", {
		event_time: new Date(),
		event_type: "foobar",
		event_value: "bazqux",
		session_id: "ace135",
	}, "pool");

	await analytics.stop();
	t.end();
});

tape("Collector 2", async (t) => {
	const analytics = new Collector<TestSchema>(store, {
		columnTypes: {
			game_user_event: {
				psession_id: "uuid",
			},
			game_session_create: {
				psession_id: "uuid",
			},
		},
		batchZip: false,
		batchRecordLimit: 10000,
	});

	analytics.onError.receive((e) => t.fail(e.message));
	analytics.onFlush.receive((info) => t.comment(`FLUSH: ${JSON.stringify(info)}`));

	await new Promise<void>((resolve) => {
		let count = 0;
		let done = false;
		const i = setInterval(async () => {
			if (done) { return; }
			analytics.track("game_user_event", {
				event_time: new Date(),
				event_type: "join",
				game_id: "fourinarow",
				session_id: "abc123",
				user_id: "xyz890",
			});
			if (++count >= 30000) {
				done = true;
				clearInterval(i);
				resolve();
			}
		}, 1);
	});

	await analytics.stop();
	t.end();
});
