import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { getCharacter, getCharacterCreationBook } from "./characterApi";
import { tierForLevel } from "./characterSheet";
import styles from "./DruidBeastFormsPage.module.css";

const titleize = (input) =>
	String(input || "")
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

export default function DruidBeastFormsPage() {
	const { characterId } = useParams();
	const { user } = useAuth();
	const [character, setCharacter] = useState(null);
	const [book, setBook] = useState(null);
	const [state, setState] = useState({ loading: true, error: "" });

	useEffect(() => {
		Promise.all([
			getCharacter(characterId),
			getCharacterCreationBook().then((response) => response.content),
		])
			.then(([nextCharacter, nextBook]) => {
				setCharacter(nextCharacter);
				setBook(nextBook);
				setState({ loading: false, error: "" });
			})
			.catch((error) => setState({ loading: false, error: error.message }));
	}, [characterId]);

	const classInfo = useMemo(
		() => book?.classes?.find((item) => item.id === character?.class_id),
		[book, character],
	);
	const currentTier = tierForLevel(character?.level);
	const forms = (classInfo?.beast_forms || [])
		.filter((form) => Number(form.tier) <= currentTier)
		.sort(
			(left, right) =>
				Number(left.tier) - Number(right.tier) ||
				left.name.localeCompare(right.name),
		);

	if (state.loading) return <p className="muted">Loading beast forms...</p>;
	if (!character)
		return (
			<p className={styles.error}>{state.error || "Character not found."}</p>
		);
	if (character.class_id !== "druid") {
		return (
			<section className={styles.notice}>
				<p className="eyebrow">BEASTFORMS</p>
				<h2>Druid feature</h2>
				<p className="muted">
					Beast forms are available only to Druid characters.
				</p>
				<Link to={`/characters/${characterId}`} className={styles.button}>
					Back to character sheet
				</Link>
			</section>
		);
	}
	const isOwner = character.user_id === user?.id;

	return (
		<section className={styles.page}>
			<header className={styles.header}>
				<div>
					<Link to={`/characters/${characterId}`} className={styles.back}>
						Back to character sheet
					</Link>
					<p className="eyebrow">DRUID · BEASTFORMS</p>
					<h2>{character.name}'s beast forms</h2>
					<p className="muted">
						Level {character.level} · Tier {currentTier}. Forms above your tier
						are hidden until you advance.
					</p>
				</div>
				{isOwner && (
					<Link
						to={`/characters/${characterId}/edit`}
						className={styles.button}
					>
						Edit character
					</Link>
				)}
			</header>

			{forms.length === 0 ? (
				<section className={styles.empty}>
					<h3>No beast forms available</h3>
					<p className="muted">
						An administrator can add Druid beast forms in the book editor.
					</p>
				</section>
			) : (
				<div className={styles.grid}>
					{forms.map((form) => (
						<BeastFormCard
							form={form}
							featureLibrary={book.beast_features || []}
							key={form.id || form.name}
						/>
					))}
				</div>
			)}
		</section>
	);
}

function BeastFormCard({ form, featureLibrary }) {
	const attack = [form.attack_range, form.attack_trait, form.attack_damage]
		.filter(Boolean)
		.map((value, index) => (index === 0 ? titleize(value) : value))
		.join(" ");
	const features = [
		...(form.feature_ids || [])
			.map((id) => featureLibrary.find((item) => item.id === id))
			.filter(Boolean),
		...(form.features || []),
	];
	return (
		<article className={styles.card}>
			<header className={styles.cardHeader}>
				<div>
					<span className={styles.tier}>TIER {form.tier}</span>
					<h3>{form.name}</h3>
				</div>
				{form.examples?.length > 0 && (
					<p className={styles.examples}>{form.examples.join(", ")}</p>
				)}
			</header>
			<div className={styles.stats}>
				<Stat
					label="Trait"
					value={`${form.attack_trait || "—"} ${formatBonus(form.attack_bonus)}`}
				/>
				<Stat label="Evasion" value={formatBonus(form.evasion_bonus)} />
				<Stat label="Attack" value={attack || "—"} />
			</div>
			{form.advantages?.length > 0 && (
				<p className={styles.advantages}>
					<strong>Gain advantage on:</strong> {form.advantages.join(", ")}
				</p>
			)}
			{form.carrier && (
				<p className={styles.feature}>
					<strong>Carrier.</strong> {form.carrier}
				</p>
			)}
			{features.length > 0 && (
				<div className={styles.features}>
					{features.map((feature, index) => (
						<p
							className={styles.feature}
							key={feature.id || `${feature.name}-${index}`}
						>
							<strong>{feature.name}.</strong> {feature.text}
						</p>
					))}
				</div>
			)}
		</article>
	);
}

function Stat({ label, value }) {
	return (
		<div>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function formatBonus(value) {
	const number = Number(value) || 0;
	return number > 0 ? `+${number}` : String(number);
}
