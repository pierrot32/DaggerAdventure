import { useEffect, useRef, useState } from "react";
import Button from "../../components/Button/Button";
import * as adventureApi from "./adventureApi";
import styles from "./StoryPanel.module.css";

const statuses = ["planned", "active", "complete", "dropped"];
let applyKeySequence = 0;

function createApplyKey() {
	const randomUuid = globalThis.crypto?.randomUUID?.();
	return randomUuid || `apply-${Date.now().toString(36)}-${++applyKeySequence}`;
}

const emptyGoal = (goalType, position = 0) => ({
	character_id: "",
	goal_type: goalType,
	title: "",
	description: "",
	status: "planned",
	position,
});

const emptyItem = (position = 0) => ({
	title: "",
	description: "",
	status: "planned",
	position,
});

function statusLabel(status) {
	return status ? status.replace(/^./, (letter) => letter.toUpperCase()) : "Planned";
}

export default function StoryPanel({ adventureId, isCreator, user, description }) {
	const [story, setStory] = useState({ loading: true, error: "", data: null });
	const [characters, setCharacters] = useState([]);
	const [reloadToken, setReloadToken] = useState(0);
	const [mutationState, setMutationState] = useState({ saving: false, error: "", message: "" });
	const requestGeneration = useRef(0);
	const aiAvailable = isCreator && Boolean(user?.ai_generation_enabled || user?.access_level === "admin");

	useEffect(() => {
		const generation = ++requestGeneration.current;
		let active = true;
		setStory({ loading: true, error: "", data: null });
		const characterRequest = isCreator
			? adventureApi.listAdventureCharacters(adventureId)
			: Promise.resolve([]);
		Promise.all([adventureApi.getAdventureStory(adventureId), characterRequest])
			.then(([nextStory, nextCharacters]) => {
				if (!active || requestGeneration.current !== generation) return;
				setStory({ loading: false, error: "", data: nextStory });
				setCharacters(
					nextCharacters.map((character) => ({
						id: character.id,
						name: character.name,
					})),
				);
			})
			.catch((error) => {
				if (active && requestGeneration.current === generation)
					setStory({ loading: false, error: error.message, data: null });
			});
		return () => {
			active = false;
		};
	}, [adventureId, isCreator, reloadToken]);

	const retry = () => setReloadToken((value) => value + 1);
	const refreshAfterMutation = (message, generation) => {
		if (requestGeneration.current !== generation) return;
		setMutationState({ saving: false, error: "", message });
		setReloadToken((value) => value + 1);
	};
	const runMutation = async (operation, message) => {
		const generation = requestGeneration.current;
		setMutationState({ saving: true, error: "", message: "" });
		try {
			await operation();
			refreshAfterMutation(message, generation);
			return true;
		} catch (error) {
			if (requestGeneration.current === generation)
				setMutationState({ saving: false, error: error.message, message: "" });
			return false;
		}
	};
	const saveGoal = (goalId, payload) =>
		runMutation(
			() =>
				goalId
					? adventureApi.updateStoryGoal(adventureId, goalId, payload)
					: adventureApi.createStoryGoal(adventureId, payload),
				goalId ? "Goal updated." : "Goal added.",
		);
	const removeGoal = (goalId) => {
		if (!window.confirm("Remove this story goal?")) return;
		runMutation(
			() => adventureApi.deleteStoryGoal(adventureId, goalId),
			"Goal removed.",
		);
	};
	const saveMilestone = (milestoneId, payload) =>
		runMutation(
			() =>
				milestoneId
					? adventureApi.updateStoryMilestone(adventureId, milestoneId, payload)
					: adventureApi.createStoryMilestone(adventureId, payload),
				milestoneId ? "Milestone updated." : "Milestone added.",
		);
	const removeMilestone = (milestoneId) => {
		if (!window.confirm("Remove this milestone and its events?")) return;
		runMutation(
			() => adventureApi.deleteStoryMilestone(adventureId, milestoneId),
			"Milestone removed.",
		);
	};
	const saveEvent = (milestoneId, eventId, payload) =>
		runMutation(
			() =>
				eventId
					? adventureApi.updateStoryEvent(adventureId, eventId, payload)
					: adventureApi.createStoryEvent(adventureId, milestoneId, payload),
				eventId ? "Event updated." : "Event added.",
		);
	const removeEvent = (eventId) => {
		if (!window.confirm("Remove this story event?")) return;
		runMutation(() => adventureApi.deleteStoryEvent(adventureId, eventId), "Event removed.");
	};

	if (story.loading)
		return (
			<section className={styles.panel}>
				<p className="muted">Loading story plan...</p>
			</section>
		);
	if (story.error)
		return (
			<section className={styles.panel}>
				<p className={styles.error} role="alert">
					{story.error}
				</p>
				<Button type="button" variant="text" onClick={retry}>
					Retry story
				</Button>
			</section>
		);

	const plan = story.data || { description: description || "", goals: [], milestones: [] };
	return (
		<section className={styles.panel}>
			<div className={styles.heading}>
				<div>
					<p className="eyebrow">CAMPAIGN STORY</p>
					<h3>Story</h3>
				</div>
				{mutationState.message && <span className={styles.message} role="status">{mutationState.message}</span>}
			</div>
			{mutationState.error && <p className={styles.error} role="alert">{mutationState.error}</p>}
			<div className={styles.description}>
				<h4>Story direction</h4>
				{plan.description ? (
					<p>{plan.description}</p>
				) : (
					<p className="muted">No story description yet. The plan can begin with goals, milestones, or player hooks.</p>
				)}
			</div>
			{isCreator ? (
				<>
					<GoalWorkspace
						goals={plan.goals}
						characters={characters}
						saving={mutationState.saving}
						onSave={saveGoal}
						onDelete={removeGoal}
					/>
					<MilestoneWorkspace
						milestones={plan.milestones}
						saving={mutationState.saving}
						onSave={saveMilestone}
						onDelete={removeMilestone}
						onSaveEvent={saveEvent}
						onDeleteEvent={removeEvent}
					/>
					{aiAvailable && (
						<StoryGenerator
							adventureId={adventureId}
							characters={characters}
							onApplied={retry}
						/>
					)}
				</>
			) : (
				<PublicStory plan={plan} />
			)}
		</section>
	);
}

function GoalWorkspace({ goals, characters, saving, onSave, onDelete }) {
	const [editingId, setEditingId] = useState("");
	const [newGoalType, setNewGoalType] = useState("");
	const gmGoals = goals.filter((goal) => goal.goal_type === "gm");
	const playerGoals = goals.filter((goal) => goal.goal_type === "player");
	const renderGroup = (title, items, goalType) => (
		<div className={styles.goalGroup}>
			<div className={styles.subheading}>
				<h4>{title}</h4>
				<button type="button" onClick={() => setNewGoalType(goalType)} disabled={saving}>
					Add {goalType === "player" ? "player hook" : "GM goal"}
				</button>
			</div>
			{items.length === 0 && <p className="muted">None yet.</p>}
			<div className={styles.itemList}>
				{items.map((goal) => (
					<article className={styles.item} key={goal.id}>
						{editingId === goal.id ? (
							<GoalForm
								initial={goal}
								characters={characters}
								goalType={goalType}
								saving={saving}
								onSave={async (payload) => {
									if (await onSave(goal.id, payload)) setEditingId("");
								}}
								onCancel={() => setEditingId("")}
							/>
							) : (
							<StoryItemSummary
								item={goal}
								meta={goal.character_name ? `Hook for ${goal.character_name}` : ""}
								onEdit={() => setEditingId(goal.id)}
								onDelete={() => onDelete(goal.id)}
								disabled={saving}
							/>
							)}
					</article>
				))}
			</div>
			{newGoalType === goalType && (
				<article className={styles.item}>
					<GoalForm
						initial={emptyGoal(goalType, goals.length)}
						characters={characters}
						goalType={goalType}
						saving={saving}
						onSave={async (payload) => {
							if (await onSave("", payload)) setNewGoalType("");
						}}
						onCancel={() => setNewGoalType("")}
					/>
				</article>
			)}
		</div>
	);
	return (
		<section className={styles.section}>
			<div className={styles.sectionHeading}>
				<div>
					<p className="eyebrow">STORY GOALS</p>
					<h4>What pulls the story forward</h4>
				</div>
				<span>{goals.length}</span>
			</div>
			{renderGroup("GM goals", gmGoals, "gm")}
			{renderGroup("Player hooks", playerGoals, "player")}
		</section>
	);
}

function GoalForm({ initial, characters, goalType, saving, onSave, onCancel }) {
	const [form, setForm] = useState(() => ({ ...initial, character_id: initial.character_id || "" }));
	const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
	return (
		<form className={styles.form} onSubmit={(event) => {
			event.preventDefault();
			onSave({ ...form, goal_type: goalType, position: Number(form.position) || 0, character_id: form.character_id || null });
		}}>
			<label>
				Title
				<input value={form.title} onChange={(event) => update("title", event.target.value)} maxLength={160} required />
			</label>
			<label>
				Description
				<textarea value={form.description} onChange={(event) => update("description", event.target.value)} maxLength={5000} rows="3" />
			</label>
			<div className={styles.formGrid}>
				<label>
					Status
					<select value={form.status} onChange={(event) => update("status", event.target.value)}>
						{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
					</select>
				</label>
				<label>
					Position
					<input type="number" min="0" max="10000" value={form.position} onChange={(event) => update("position", event.target.value)} />
				</label>
			</div>
			{goalType === "player" && (
				<label>
					Character hook
					<select value={form.character_id} onChange={(event) => update("character_id", event.target.value)}>
						<option value="">General player hook</option>
						{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
					</select>
				</label>
			)}
			<div className={styles.formActions}>
				<Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save goal"}</Button>
				<button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
			</div>
		</form>
	);
}

function MilestoneWorkspace({ milestones, saving, onSave, onDelete, onSaveEvent, onDeleteEvent }) {
	const [editingId, setEditingId] = useState("");
	const [newMilestone, setNewMilestone] = useState(false);
	return (
		<section className={styles.section}>
			<div className={styles.sectionHeading}>
				<div>
					<p className="eyebrow">MILESTONES</p>
					<h4>Beats the table can reach</h4>
				</div>
				<button type="button" onClick={() => setNewMilestone(true)} disabled={saving}>Add milestone</button>
			</div>
			{milestones.length === 0 && !newMilestone && <p className="muted">No milestones yet. Start with a turning point or destination.</p>}
			<div className={styles.milestones}>
				{milestones.map((milestone) => (
					<MilestoneCard
						key={milestone.id}
						milestone={milestone}
						editing={editingId === milestone.id}
						saving={saving}
						onEdit={() => setEditingId(milestone.id)}
						onCancel={() => setEditingId("")}
						onSave={async (payload) => { if (await onSave(milestone.id, payload)) setEditingId(""); }}
						onDelete={() => onDelete(milestone.id)}
						onSaveEvent={onSaveEvent}
						onDeleteEvent={onDeleteEvent}
					/>
				))}
			</div>
			{newMilestone && (
				<article className={styles.milestone}>
					<ItemForm
						initial={emptyItem(milestones.length)}
						kind="milestone"
						saving={saving}
						onSave={async (payload) => { if (await onSave("", payload)) setNewMilestone(false); }}
						onCancel={() => setNewMilestone(false)}
					/>
				</article>
			)}
		</section>
	);
}

function MilestoneCard({ milestone, editing, saving, onEdit, onCancel, onSave, onDelete, onSaveEvent, onDeleteEvent }) {
	const [editingEventId, setEditingEventId] = useState("");
	const [newEvent, setNewEvent] = useState(false);
	return (
		<article className={styles.milestone}>
			{editing ? (
				<ItemForm initial={milestone} kind="milestone" saving={saving} onSave={onSave} onCancel={onCancel} />
			) : (
				<>
					<StoryItemSummary item={milestone} onEdit={onEdit} onDelete={onDelete} disabled={saving} />
					<div className={styles.eventHeading}>
						<h5>Events</h5>
						<button type="button" onClick={() => setNewEvent(true)} disabled={saving}>Add event</button>
					</div>
					{milestone.events.length === 0 && !newEvent && <p className="muted">No events yet.</p>}
					<div className={styles.itemList}>
						{milestone.events.map((event) => (
							<article className={styles.event} key={event.id}>
								{editingEventId === event.id ? (
									<ItemForm
										initial={event}
										kind="event"
										saving={saving}
										onSave={async (payload) => { if (await onSaveEvent(milestone.id, event.id, payload)) setEditingEventId(""); }}
										onCancel={() => setEditingEventId("")}
									/>
								) : (
									<StoryItemSummary item={event} onEdit={() => setEditingEventId(event.id)} onDelete={() => onDeleteEvent(event.id)} disabled={saving} />
								)}
							</article>
						))}
					</div>
					{newEvent && (
						<article className={styles.event}>
							<ItemForm
								initial={emptyItem(milestone.events.length)}
								kind="event"
								saving={saving}
									onSave={async (payload) => { if (await onSaveEvent(milestone.id, "", payload)) setNewEvent(false); }}
								onCancel={() => setNewEvent(false)}
							/>
						</article>
					)}
				</>
			)}
		</article>
	);
}

function ItemForm({ initial, kind, saving, onSave, onCancel }) {
	const [form, setForm] = useState(() => initial);
	const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
	return (
		<form className={styles.form} onSubmit={(event) => {
			event.preventDefault();
			onSave({ ...form, position: Number(form.position) || 0 });
		}}>
			<label>
				{kind === "event" ? "Event title" : "Milestone title"}
				<input value={form.title} onChange={(event) => update("title", event.target.value)} maxLength={160} required />
			</label>
			<label>
				Description
				<textarea value={form.description} onChange={(event) => update("description", event.target.value)} maxLength={5000} rows="3" />
			</label>
			<div className={styles.formGrid}>
				<label>
					Status
					<select value={form.status} onChange={(event) => update("status", event.target.value)}>
						{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
					</select>
				</label>
				<label>
					Position
					<input type="number" min="0" max="10000" value={form.position} onChange={(event) => update("position", event.target.value)} />
				</label>
			</div>
			<div className={styles.formActions}>
				<Button type="submit" disabled={saving}>{saving ? "Saving..." : `Save ${kind}`}</Button>
				<button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
			</div>
		</form>
	);
}

function StoryItemSummary({ item, meta = "", onEdit, onDelete, disabled }) {
	return (
		<div className={styles.summary}>
			<div>
				<div className={styles.titleLine}>
					<strong>{item.title}</strong>
					<span className={styles.status}>{statusLabel(item.status)}</span>
				</div>
				{meta && <small>{meta}</small>}
				{item.description && <p>{item.description}</p>}
			</div>
			<div className={styles.inlineActions}>
				<button type="button" onClick={onEdit} disabled={disabled}>Edit</button>
				<button type="button" onClick={onDelete} disabled={disabled}>Remove</button>
			</div>
		</div>
	);
}

function PublicStory({ plan }) {
	const goals = plan.goals.filter((goal) => goal.goal_type === "player");
	return (
		<div className={styles.publicPlan}>
			<section className={styles.publicSection}>
				<h4>Player hooks</h4>
				{goals.length === 0 ? <p className="muted">No player-facing hooks have been added yet.</p> : goals.map((goal) => <article className={styles.publicItem} key={goal.id}><strong>{goal.title}</strong>{goal.character_name && <small>For {goal.character_name}</small>}{goal.description && <p>{goal.description}</p>}</article>)}
			</section>
			<section className={styles.publicSection}>
				<h4>Story beats</h4>
				{plan.milestones.length === 0 ? <p className="muted">No public story beats have been added yet.</p> : plan.milestones.map((milestone) => <article className={styles.publicItem} key={milestone.id}><div className={styles.titleLine}><strong>{milestone.title}</strong><span className={styles.status}>{statusLabel(milestone.status)}</span></div>{milestone.description && <p>{milestone.description}</p>}{milestone.events.map((event) => <div className={styles.publicEvent} key={event.id}><div className={styles.titleLine}><strong>{event.title}</strong><span className={styles.status}>{statusLabel(event.status)}</span></div>{event.description && <p>{event.description}</p>}</div>)}</article>)}
			</section>
		</div>
	);
}

function StoryGenerator({ adventureId, characters, onApplied }) {
	const [direction, setDirection] = useState("");
	const [focus, setFocus] = useState("");
	const [proposal, setProposal] = useState(null);
	const [applyKey, setApplyKey] = useState("");
	const [state, setState] = useState({ loading: false, applying: false, error: "" });
	const generate = async (event) => {
		event.preventDefault();
		setState({ loading: true, applying: false, error: "" });
		try {
			setProposal(await adventureApi.generateStory(adventureId, { prompt: direction, focus }));
			setApplyKey(createApplyKey());
			setState({ loading: false, applying: false, error: "" });
		} catch (error) {
			setState({ loading: false, applying: false, error: error.message });
		}
	};
	const apply = async () => {
		if (!proposal || !applyKey) return;
		setState({ loading: false, applying: true, error: "" });
		try {
			await adventureApi.applyStoryProposal(adventureId, applyKey, proposal);
			setProposal(null);
			setApplyKey("");
			setState({ loading: false, applying: false, error: "" });
			onApplied();
		} catch (error) {
			setState({ loading: false, applying: false, error: error.message });
		}
	};
	return (
		<section className={styles.generator}>
			<div className={styles.sectionHeading}>
				<div>
					<p className="eyebrow">AI STORY BUILDER</p>
					<h4>Draft from this frame and roster</h4>
				</div>
			</div>
		<form className={styles.generatorForm} onSubmit={generate}>
			<label>
				Direction
				<textarea value={direction} onChange={(event) => setDirection(event.target.value)} maxLength={2000} rows="3" placeholder="A pressure, relationship, or turn you want to explore" />
			</label>
			<label>
				Focus
				<input value={focus} onChange={(event) => setFocus(event.target.value)} maxLength={160} placeholder="For example: the first session" />
			</label>
			<Button type="submit" disabled={state.loading || state.applying}>{state.loading ? "Generating..." : "Generate story"}</Button>
		</form>
		{state.error && <p className={styles.error} role="alert">{state.error}</p>}
		{proposal && <ProposalReview proposal={proposal} setProposal={setProposal} characters={characters} applying={state.applying} onApply={apply} />}
	</section>
	);
}

function ProposalReview({ proposal, setProposal, characters, applying, onApply }) {
	const updateRootItem = (field, value) => setProposal((current) => ({ ...current, goal: { ...current.goal, [field]: value } }));
	const updatePlayerGoal = (index, field, value) => setProposal((current) => ({ ...current, player_goals: current.player_goals.map((goal, goalIndex) => goalIndex === index ? { ...goal, [field]: value } : goal) }));
	const updateMilestone = (index, field, value) => setProposal((current) => ({ ...current, milestones: current.milestones.map((milestone, milestoneIndex) => milestoneIndex === index ? { ...milestone, [field]: value } : milestone) }));
	const updateEvent = (milestoneIndex, eventIndex, field, value) => setProposal((current) => ({ ...current, milestones: current.milestones.map((milestone, currentMilestoneIndex) => currentMilestoneIndex === milestoneIndex ? { ...milestone, events: milestone.events.map((event, currentEventIndex) => currentEventIndex === eventIndex ? { ...event, [field]: value } : event) } : milestone) }));
	return (
		<div className={styles.proposal}>
			<div className={styles.proposalHeading}>
				<div>
					<h4>Review generated proposal</h4>
					<p className="muted">Edit this draft, then explicitly add it to the saved plan.</p>
				</div>
				<Button type="button" onClick={onApply} disabled={applying}>{applying ? "Adding..." : "Add proposal to story"}</Button>
			</div>
			{proposal.goal && <ProposalItem label="GM goal" item={proposal.goal} onChange={updateRootItem} />}
			{proposal.player_goals.map((goal, index) => <ProposalItem key={`goal-${index}`} label="Player hook" item={goal} characters={characters} onChange={(field, value) => updatePlayerGoal(index, field, value)} />)}
			{proposal.milestones.map((milestone, index) => <div className={styles.proposalMilestone} key={`milestone-${index}`}><h5>Milestone {index + 1}</h5><ProposalItem item={milestone} onChange={(field, value) => updateMilestone(index, field, value)} />{milestone.events.map((event, eventIndex) => <ProposalItem key={`event-${eventIndex}`} label="Event" item={event} onChange={(field, value) => updateEvent(index, eventIndex, field, value)} />)}</div>)}
		</div>
	);
}

function ProposalItem({ label, item, characters, onChange }) {
	return (
		<div className={styles.proposalItem}>
			{label && <strong>{label}</strong>}
			<label>
				Title
				<input value={item.title} onChange={(event) => onChange("title", event.target.value)} maxLength={160} />
			</label>
			<label>
				Description
				<textarea value={item.description} onChange={(event) => onChange("description", event.target.value)} maxLength={5000} rows="2" />
			</label>
			<div className={styles.formGrid}>
				<label>
					Status
					<select value={item.status} onChange={(event) => onChange("status", event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
				</label>
				{characters && <label>
					Character hook
					<select value={item.character_id || ""} onChange={(event) => onChange("character_id", event.target.value || null)}><option value="">General player hook</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select>
				</label>}
			</div>
		</div>
	);
}
