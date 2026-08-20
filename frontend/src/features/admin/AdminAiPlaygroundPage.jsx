import { useState } from "react";
import Button from "../../components/Button/Button";
import { generate } from "./aiApi";
import styles from "./AdminAiPlaygroundPage.module.css";

const starterPrompt =
	"Create three character names and a one-sentence backstory for each. Make them feel distinct and rooted in a strange coastal kingdom.";

export default function AdminAiPlaygroundPage() {
	const [prompt, setPrompt] = useState(starterPrompt);
	const [result, setResult] = useState("");
	const [error, setError] = useState(null);
	const [loading, setLoading] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		setLoading(true);
		setError(null);
		setResult("");
		try {
			const response = await generate(prompt);
			setResult(response.content);
		} catch (requestError) {
			setError(requestError.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<section>
			<p className="eyebrow">ADMINISTRATION / AI LAB</p>
			<h2>Character generation playground</h2>
			<p className="muted">
				Test the server-side GPT-5.6 Luna connection before generation tools
				appear in character creation.
			</p>
			<form className={styles.form} onSubmit={submit}>
				<label htmlFor="ai-prompt">Prompt</label>
				<textarea
					id="ai-prompt"
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					placeholder="Ask for a name, backstory, companion, or character hook..."
					maxLength={4000}
					rows={8}
				/>
				<div className={styles.actions}>
					<span className="muted">{prompt.length}/4000</span>
					<Button type="submit" disabled={loading || !prompt.trim()}>
						{loading ? "Generating..." : "Generate"}
					</Button>
				</div>
			</form>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{result && (
				<article className={styles.result}>
					<p className="eyebrow">RESPONSE</p>
					<div className={styles.content}>{result}</div>
				</article>
			)}
		</section>
	);
}
