import { useEffect, useMemo, useState } from "react";
import Button from "../../components/Button/Button";
import { useAuth } from "../../hooks/useAuth";
import { ACCESS_LEVELS, hasAccessLevel } from "../../utils/permissions";
import { getCharacterCreationBook } from "../characters/characterApi";
import styles from "./EquipmentPage.module.css";

const armorGroup = "armor";
const groupLabels = {
	armor: "Armor",
	primary_weapons: "Primary weapons",
	secondary_weapons: "Secondary weapons",
	item: "Items",
	consumable: "Consumables",
};

function isMagicItem(item) {
	return (
		item?.is_magic === true ||
		(typeof item?.is_magic === "string" &&
			item.is_magic.toLowerCase() === "true")
	);
}

function canonicalGroup(group) {
	if (group === "items" || group === "item") return "item";
	if (group === "consumables" || group === "consumable") return "consumable";
	return group;
}

function recordEntries(value, fallbackGroup) {
	const group = canonicalGroup(fallbackGroup);
	if (Array.isArray(value))
		return value.flatMap((entry) => recordEntries(entry, group));
	if (!value || typeof value !== "object") return [];
	if (
		value.id ||
		value.name ||
		value.category ||
		value.description ||
		value.text
	)
		return [{ ...value, group }];
	return Object.entries(value).flatMap(([key, entries]) =>
		recordEntries(entries, canonicalGroup(key)),
	);
}

function loadEquipment(book) {
	const equipment = book?.equipment;
	const sources = [
		...recordEntries(equipment, "equipment"),
		...recordEntries(book?.items, "item"),
		...recordEntries(book?.consumables, "consumable"),
	];
	const seen = new Set();
	return sources
		.map((item, index) => {
			const group = item.group || "equipment";
			const key = `${group}-${item.id || item.name || index}`;
			return {
				...item,
				group,
				groupLabel: groupLabels[group] || item.category || group,
				key,
			};
		})
		.filter((item) => {
			if (seen.has(item.key)) return false;
			seen.add(item.key);
			return true;
		});
}

function displayRollValue(item) {
	const value = item.roll ?? item.range ?? item.table ?? item.value;
	if (value === undefined || value === null || value === "") return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function numericRange(value) {
	if (typeof value === "number" && Number.isFinite(value))
		return [value, value];
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	const range = normalized.match(
		/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)$/,
	);
	if (range) return [Number(range[1]), Number(range[2])];
	const dice = normalized.match(/^(?:1)?d(\d+)$/);
	if (dice) return [1, Number(dice[1])];
	if (/^\d+(?:\.\d+)?$/.test(normalized))
		return [Number(normalized), Number(normalized)];
	return null;
}

function rollRange(item) {
	const directValues = [item.roll, item.range, item.value];
	for (const value of directValues) {
		const range = numericRange(value);
		if (range && range[0] <= range[1]) return range;
		if (value && typeof value === "object") {
			const objectRange =
				numericRange(value.range ?? value.value ?? value.roll) ||
				(Number.isFinite(Number(value.min)) &&
				Number.isFinite(Number(value.max))
					? [Number(value.min), Number(value.max)]
					: null) ||
				(Number.isFinite(Number(value.from)) &&
				Number.isFinite(Number(value.to))
					? [Number(value.from), Number(value.to)]
					: null);
			if (objectRange && objectRange[0] <= objectRange[1]) return objectRange;
		}
	}
	if (
		item.table &&
		typeof item.table === "object" &&
		!Array.isArray(item.table)
	) {
		const ranges = Object.keys(item.table).map(numericRange).filter(Boolean);
		if (ranges.length > 0)
			return [
				Math.min(...ranges.map((range) => range[0])),
				Math.max(...ranges.map((range) => range[1])),
			];
	}
	return null;
}

function displayValue(value) {
	return value === undefined || value === null || value === "" ? "-" : value;
}

export default function EquipmentPage() {
	const { user } = useAuth();
	const [book, setBook] = useState(null);
	const [state, setState] = useState({ loading: true, error: "" });
	const [requestId, setRequestId] = useState(0);
	const [selectedTier, setSelectedTier] = useState("all");
	const [selectedGroup, setSelectedGroup] = useState("all");
	const [selectedMagic, setSelectedMagic] = useState("all");
	const [rolls, setRolls] = useState({});

	useEffect(() => {
		let active = true;
		setState({ loading: true, error: "" });
		getCharacterCreationBook()
			.then((response) => {
				if (!active) return;
				setBook(response?.content || null);
				setState({ loading: false, error: "" });
			})
			.catch((error) => {
				if (!active) return;
				setBook(null);
				setState({ loading: false, error: error.message });
			});
		return () => {
			active = false;
		};
	}, [requestId]);

	const equipment = useMemo(() => loadEquipment(book), [book]);
	const tiers = useMemo(
		() =>
			[
				...new Set(
					equipment.map((item) => Number(item.tier)).filter(Number.isFinite),
				),
			].sort((a, b) => a - b),
		[equipment],
	);
	const groups = useMemo(
		() => [...new Set(equipment.map((item) => item.group))],
		[equipment],
	);
	const filteredEquipment = useMemo(
		() =>
			equipment.filter(
				(item) =>
					(selectedTier === "all" ||
						Number(item.tier) === Number(selectedTier)) &&
					(selectedGroup === "all" || item.group === selectedGroup) &&
					(selectedMagic === "all" ||
						isMagicItem(item) === (selectedMagic === "magic")),
			),
		[equipment, selectedGroup, selectedMagic, selectedTier],
	);
	const hasEquipmentCatalog = Boolean(
		(book?.equipment && typeof book.equipment === "object") ||
			Array.isArray(book?.items) ||
			Array.isArray(book?.consumables),
	);
	const canRandomRoll = hasAccessLevel(user, ACCESS_LEVELS.ADVENTURE_MAKER);
	const rollItem = (item) => {
		const range = rollRange(item);
		if (!range || !canRandomRoll) return;
		const result =
			Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
		setRolls((current) => ({ ...current, [item.key]: result }));
	};

	if (state.loading) return <p className="muted">Loading equipment...</p>;

	if (state.error) {
		return (
			<section className={styles.notice}>
				<p className="eyebrow">EQUIPMENT CATALOG</p>
				<h2>Equipment could not be loaded</h2>
				<p className={styles.error} role="alert">
					{state.error}
				</p>
				<Button
					type="button"
					onClick={() => setRequestId((current) => current + 1)}
				>
					Retry loading equipment
				</Button>
			</section>
		);
	}

	if (!book || !hasEquipmentCatalog) {
		return (
			<section className={styles.notice}>
				<p className="eyebrow">EQUIPMENT CATALOG</p>
				<h2>No equipment book is available</h2>
				<p className="muted">
					An administrator needs to import a content book before equipment can
					be displayed.
				</p>
			</section>
		);
	}

	return (
		<section className={styles.page}>
			<header className={styles.heading}>
				<div>
					<p className="eyebrow">DAGGERHEART EQUIPMENT</p>
					<h2>Equipment catalog</h2>
					<p className="muted">
						Browse armor, weapons, items, and consumables from the current
						content book.
					</p>
				</div>
				<span className={styles.count}>
					{filteredEquipment.length}{" "}
					{filteredEquipment.length === 1 ? "entry" : "entries"}
				</span>
			</header>

			<div className={styles.toolbar}>
				<label>
					<span>Tier</span>
					<select
						value={selectedTier}
						onChange={(event) => setSelectedTier(event.target.value)}
					>
						<option value="all">All tiers</option>
						{tiers.map((tier) => (
							<option value={tier} key={tier}>
								Tier {tier}
							</option>
						))}
					</select>
				</label>
				<div className={styles.groupFilter} aria-label="Equipment type">
					<span>Type</span>
					<div className={styles.groupButtons}>
						<button
							type="button"
							className={selectedGroup === "all" ? styles.selected : ""}
							aria-pressed={selectedGroup === "all"}
							onClick={() => setSelectedGroup("all")}
						>
							All equipment
						</button>
						{groups.map((id) => (
							<button
								type="button"
								className={selectedGroup === id ? styles.selected : ""}
								aria-pressed={selectedGroup === id}
								onClick={() => setSelectedGroup(id)}
								key={id}
							>
								{groupLabels[id] || id}
							</button>
						))}
					</div>
				</div>
				<div className={styles.groupFilter} aria-label="Magic status">
					<span>Magic status</span>
					<div className={styles.groupButtons}>
						{[
							["all", "All"],
							["magic", "Magic"],
							["non-magic", "Non-magic"],
						].map(([value, label]) => (
							<button
								type="button"
								className={selectedMagic === value ? styles.selected : ""}
								aria-pressed={selectedMagic === value}
								onClick={() => setSelectedMagic(value)}
								key={value}
							>
								{label}
							</button>
						))}
					</div>
				</div>
			</div>

			{filteredEquipment.length === 0 ? (
				<div className={styles.empty}>
					<h3>No matching equipment</h3>
					<p className="muted">
						Try another tier, equipment type, or magic status.
					</p>
					<Button
						type="button"
						variant="text"
						onClick={() => {
							setSelectedTier("all");
							setSelectedGroup("all");
							setSelectedMagic("all");
						}}
					>
						Clear filters
					</Button>
				</div>
			) : (
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th scope="col">Name</th>
								<th scope="col">Category</th>
								<th scope="col">Description</th>
								<th scope="col">Source</th>
								<th scope="col">Tier</th>
								<th scope="col">Details / roll</th>
							</tr>
						</thead>
						<tbody>
							{filteredEquipment.map((item) => {
								const isArmor = item.group === armorGroup;
								const isMagic = isMagicItem(item);
								return (
									<tr key={item.key}>
										<th scope="row" data-label="Name">
											<strong>{item.name || "Unnamed equipment"}</strong>
											<span className={styles.itemMeta}>{item.groupLabel}</span>
											{isMagic && <span className={styles.magic}>Magic</span>}
										</th>
										<td data-label="Category">
											{displayValue(item.category || item.groupLabel)}
										</td>
										<td data-label="Description" className={styles.feature}>
											{displayValue(item.description || item.text)}
										</td>
										<td data-label="Source">
											{displayValue(item.source || item.source_url)}
										</td>
										<td data-label="Tier">{displayValue(item.tier)}</td>
										<td data-label="Details / roll">
											{isArmor
												? `Thresholds ${displayValue(item.thresholds)} · Armor ${displayValue(item.armor_score)}`
												: item.group === "item" || item.group === "consumable"
													? displayValue(item.feature)
													: `${displayValue(item.trait)} · ${displayValue(item.range)} · ${displayValue(item.damage)} · ${displayValue(item.burden)}${item.feature ? ` · ${item.feature}` : ""}`}
											{displayRollValue(item) && (
												<span className={styles.rollValue}>
													Supplied roll: {displayRollValue(item)}
												</span>
											)}
											{rollRange(item) && canRandomRoll && (
												<Button
													type="button"
													variant="text"
													onClick={() => rollItem(item)}
												>
													Roll
													{rolls[item.key] !== undefined
														? `: ${rolls[item.key]}`
														: ""}
												</Button>
											)}
											{rollRange(item) && !canRandomRoll && (
												<span className={styles.rollHint}>
													GM roll available
												</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
