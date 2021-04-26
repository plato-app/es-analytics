import { join } from "path";
import * as tape from "tape";
import { Collector, StoreFS } from "..";

/** Game event associated with a specific user */
type GameUserEvent = {
	event_time: Date;
	event_type: string;
	game_id: string;
	psession_id: string;
	user_id: string;
}

/** Game creation event */
type GameSessionCreate = {
	psession_id: string;
}

/** Overall analytics schema for games */
type GameSchema = {
	game_user_event: GameUserEvent;
	game_session_create: GameSessionCreate;
}

/** File system data store */
const store = new StoreFS(join(__dirname, "store"));

tape("AnalyticsCollector", async (t) => {
	const analytics = new Collector<GameSchema>(store, {
		columnTypes: {
			game_user_event: {
				psession_id: "uuid",
			},
			game_session_create: {
				psession_id: "uuid",
			},
		},
	});

	analytics.onFlush.receive((table, id, records) => t.comment(`Flush: table=${table}, id=${id}, records=${records}`));
	analytics.onError.receive((e) => t.fail(e.message));

	analytics.track("game_session_create", {
		psession_id: "abc123",
	});

	analytics.track("game_user_event", {
		event_time: new Date(),
		event_type: "join",
		game_id: "fourinarow",
		psession_id: "abc123",
		user_id: "xyz890",
	});

	analytics.track("game_user_event", {
		event_time: new Date(),
		event_type: "join",
		game_id: "crazy8",
		psession_id: "def456",
		user_id: "ghi789",
	});

	await analytics.stop();

	t.end();
});
